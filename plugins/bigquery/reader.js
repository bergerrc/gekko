var _ = require('lodash');
var util = require('../../core/util.js');
const config = util.getConfig();
var async = require('async');
var log = require(util.dirs().core + 'log');
const BigQuery = require('@google-cloud/bigquery');
var handle = require('./handle');
var dateformat = require('dateformat');
var bigqueryUtil = require('./util');
var RateLimitQueue = require('./RateLimitQueue');

var Reader = function() {
  _.bindAll(this);
  this.db = handle;
  this.queue = new RateLimitQueue(config.bigquery.ratelimit);
  this.countCache = [];
}

// returns the furthest point (up to `from`) in time we have valid data from
Reader.prototype.mostRecentWindow = async function(from, to, next) {
  to = to.unix();
  from = from.unix();
  const sql = `SELECT start from ${bigqueryUtil.dataset()}.${bigqueryUtil.table('candles')} \
  WHERE start <= ? AND start >= ? \
  ORDER BY start DESC`;
  let options = {params: [to, from]};

  var maxAmount = to - from + 1;
  try{
    let rows = await this.db.query( sql, options);
    if(rows.length === maxAmount) {
      // full history is available!
      return next({
        from: from,
        to: to
      });
    }
    if(rows.length === 0) {
      return next(false);
    }
    // we have at least one gap, figure out where
    var mostRecent = _.first(rows).start;

    var gapIndex = _.findIndex(rows, function(r, i) {
      return r.start !== mostRecent - i * 60;
    });

    // if there was no gap in the records, but
    // there were not enough records.
    if(gapIndex === -1) {
      var leastRecent = _.last(rows).start;
      return next({
        from: leastRecent,
        to: mostRecent
      });
    }

    // else return mostRecent and the
    // the minute before the gap
    return next({
      from: rows[ gapIndex - 1 ].start,
      to: mostRecent
    });
  }catch(err){
    log.error(err);
    return util.die('DB error while reading mostRecentWindow');
  }
}

Reader.prototype.tableExists = async function (name, next) {
  this.db.checkTable(bigqueryUtil.table(name))
  .then( 
    exists => next(null, exists) 
  );
}

Reader.prototype.get = async function(from, to, what, next) {
  if(what === 'full'){
    what = '*';
  }
  const sql = `SELECT ${what} from ${bigqueryUtil.dataset()}.${bigqueryUtil.table('candles')} \
  WHERE start <= ? AND start >= ? \
  ORDER BY start ASC`;

  let options = {params: [to, from]};
  //  {"name": "from","parameterType": {"type": "NUMERIC"},"parameterValue": {"value": from}},
  //  {"name": "to",  "parameterType": {"type": "NUMERIC"},"parameterValue": {"value": to}}]};
  
  try{
    let rows = await this.db.query( sql, options );
    next(null, rows);
  }catch( err ){
    log.error(err);
    return util.die('DB error while reading get');
  }
}

Reader.prototype.count = async function(fromOrRanges, toOrCallback, next) {
  const ranges = _.isArray(fromOrRanges) ? fromOrRanges : [[fromOrRanges,toOrCallback]];
  const callback = _.isFunction(toOrCallback) ? toOrCallback : next;

  ranges.forEach( r =>{
    let from = r[0];
    let to = r[1];
    if ( from <= 0 || to <= 0 || to < from || to <= (from-60) )
      return 0;
  });

  const sql = `SELECT COUNT(*) count from ${bigqueryUtil.dataset()}.${bigqueryUtil.table('candles')} \
  WHERE start >= ? AND start <= ?`;

  var append = () =>{
    var cbWrapper = (err,data) =>{
      if ( err && callback ) callback(err);
      if ( callback ) callback(null, _.first(data).count);
      return _.isArray(data)? _.first(data).count: data;
    }
    //Add to queue to prevent rate_limit exceed
    return this.queue.append(
      function countRows (rangeList) {
        if ( rangeList.length > 1 ){  //batch
          let params = rangeList.reduce( (range, n) => range.concat(n) );
          return this.db.unionAllStream( sql, params, cbWrapper );
        }else
          return this.db.query( sql, {params: rangeList[0]} );
      }.bind(this), ranges )
      .then( (res,rej) => cbWrapper(rej, res) )
      .catch( (err)=>{
        log.error(err.message);
        return [{count:0}];
      });
  }

  return append();
}

Reader.prototype.countTotal = async function(next) {
  const sql = `SELECT COUNT(*) as count from ${bigqueryUtil.dataset()}.${bigqueryUtil.table('candles')}`;
  try{
    let rows = await this.db.query( sql );
    next(null, _.first(rows).count);
  }catch( err ){
    log.error(err);
    return util.die('DB error while reading countTotal');
  }
}

Reader.prototype.getBoundry = async function(next = ()=>{}) {
  const sql = 
  `SELECT (
    SELECT start
    FROM ${bigqueryUtil.dataset()}.${bigqueryUtil.table('candles')}
    ORDER BY start LIMIT 1
  ) as first,
  (
    SELECT start
    FROM ${bigqueryUtil.dataset()}.${bigqueryUtil.table('candles')}
    ORDER BY start DESC
    LIMIT 1
  ) as last`;
  try{
    return this.db.query( sql )
    .then( rows =>{
      next(null, _.first(rows));
      return _.first(rows);
    });
  }catch( err ){
    log.error(err);
    return util.die('DB error while reading getBoundry');
  }
}

Reader.prototype.close = function() {
  //obsolete due to connection pooling
  //this.db.end();
}

module.exports = Reader;
/*
var future = moment().add(1, 'minute').unix();
var latestTs = moment().startOf('hour').unix();
new module.exports().get(
  latestTs,
  future,
  'full',
  (err,rows)=>console.log( JSON.stringify(rows) )
)
*/
async function main(done = ()=>{}){
  const BATCH_SIZE = 60; // minutes
  const MISSING_CANDLES_ALLOWED = 3; // minutes, per batch
  var reader = new module.exports;
  var batches = [];
  reader.getBoundry( async (err, res) =>{
    var first = res.first;
    var last = res.last;
    var iterator = {
      from: last - (BATCH_SIZE * 60),
      to: last
    }

    function finished () {
        
      if(!_.size(batches))
        util.die('Not enough data to work with (please manually set a valid `backtest.daterange`)..', true);

      // batches is now a list like
      // [ {from: unix, to: unix } ]
      
      var ranges = [ batches.shift() ];

      _.each(batches, batch => {
        var curRange = _.last(ranges);
        if(batch.to === curRange.from)
          curRange.from = batch.from;
        else
          ranges.push( batch );
      })
      ranges = ranges.reverse();
      _.map(ranges, r => {
        return {
          from: r.to,
          to: r.from
        }
      });
      return done(false, ranges, reader);
    }
/*
    let ranges = [];
    while (iterator.from > first) {
      ranges.push( [iterator.from, iterator.to] );
      iterator.from -= BATCH_SIZE * 60;
      iterator.to -= BATCH_SIZE * 60;
    }
    reader.count( ranges, (err,count) =>{
        var complete = count + MISSING_CANDLES_ALLOWED > BATCH_SIZE;
        if(complete)
          batches.push({
            to: to,
            from: from
          }) 
    }).then(finished);
    // loop through all candles we have
    // in batches and track whether they
    // are complete
*/
    async.whilst(
      () => {
        return iterator.from > first
      },
      next => {
        var from = iterator.from;
        var to = iterator.to;
        reader.count(
          from,
          iterator.to,
          (err, count) => {
            var complete = count + MISSING_CANDLES_ALLOWED > BATCH_SIZE;

            if(complete)
              batches.push({
                to: to,
                from: from
              });

            next();
          }
        ).then(count=>console.log(count));

        iterator.from -= BATCH_SIZE * 60;
        iterator.to -= BATCH_SIZE * 60;
      },
      finished
    );
  });
}

if (require.main === module) {
  var done = (err, ranges)=>{
    if (err)
      log.error('ERROR:', err);
    else
      ranges.forEach(range => {
        log.info('from:',dateformat(new Date(range.from*1000),'isoUtcDateTime'), 
                 'to:',dateformat(new Date(range.to*1000),'isoUtcDateTime'));   
      });
  };
  main(done).then(null,err => done(err) )
}