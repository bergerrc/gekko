var _ = require('lodash');
var util = require('gekko-core/util');
const config = util.getConfig();
var async = require('async');
var log = require('gekko-core/log');
const Firestore = require('@google-cloud/firestore');
var handle = require('./handle');
var dateformat = require('dateformat');
var firestoreUtil = require('./util');
var RateLimitQueue = require('./RateLimitQueue');
const stats = require('./functions/statistics');

var Reader = function() {
  _.bindAll(this);
  this.db = handle;
  this.queue = new RateLimitQueue(config.firestore.ratelimit);
  this.countCache = [];
}

// returns the furthest point (up to `from`) in time we have valid data from
Reader.prototype.mostRecentWindow = async function(from, to, next) {
  to = to.unix();
  from = from.unix();

  let conditions = [{field:'start',op:'<=', value: to},
                    {field:'start',op:'>=', value: from}];
  let options = {orderBy: 'start',
                 order: 'desc',
                 select: 'start'};

  var maxAmount = to - from + 1;
  try{
    let rows = await this.db.query(firestoreUtil.tablePath('candles'),conditions,options);
    if(rows.size === maxAmount) {
      // full history is available!
      return next({
        from: from,
        to: to
      });
    }
    if(rows.size === 0) {
      return next(false);
    }
    // we have at least one gap, figure out where
    var mostRecent = _.first(rows.docs).start;

    var gapIndex = _.findIndex(rows.docs, function(r, i) {
      return r.start !== mostRecent - i * 60;
    });

    // if there was no gap in the records, but
    // there were not enough records.
    if(gapIndex === -1) {
      var leastRecent = _.last(rows.docs).start;
      return next({
        from: leastRecent,
        to: mostRecent
      });
    }

    // else return mostRecent and the
    // the minute before the gap
    return next({
      from: rows.docs[ gapIndex - 1 ].start,
      to: mostRecent
    });
  }catch(err){
    log.error(err);
    return util.die('DB error while reading mostRecentWindow');
  }
}

Reader.prototype.tableExists = async function (name='candles', callback) {
  var tableRef = this.db.table( firestoreUtil.tablePath(name) );
  var snap = await tableRef.get();
  if ( callback ) 
    callback(null, !snap.empty);
  return !snap.empty;
}

Reader.prototype.get = async function(from, to, what, next) {
  let conditions = [{field:'start',op:'<=', value: to},
                    {field:'start',op:'>=', value: from}];
  let options = {orderBy: 'start',
                 order: 'asc'};
  if(what !== 'full' && what!=undefined && what !==''){
    options.select = what;
  }
  
  try{
    let res = await this.db.query(firestoreUtil.tablePath('candles'),conditions,options, next);
    return res.docs;
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

  var append = () =>{
    var cbWrapper = (err,data) =>{
      if ( err && callback ) callback(err);
      if ( callback ) callback(null, _.first(data).count);
      return _.isArray(data)? _.first(data).count: data;
    }
    //Add to queue to prevent rate_limit exceed
    return this.queue.append(
      async function countRows (rangeList) {
        let rangesCount = [];
        for (let i = 0; i < rangeList.length; i++) {
          const range = rangeList[i];
          let cond = [{field:'start',op:'>=', value: range[0]},
                      {field:'start',op:'<=', value: range[1]}];
          let rows = await this.db.query(firestoreUtil.tablePath('candles'),cond);
          rangesCount.push({ count: rows.size });
        }
        return rangesCount;
      }.bind(this), ranges )
      .then( (res,rej) => cbWrapper(rej, res) )
      .catch( (err)=>{
        log.error(err.message);
        return [{count:0}];
      });
  }

  return append();
}

Reader.prototype.countRanges = async function(fromOrRanges, toOrCallback, next) {
  const ranges = _.isArray(fromOrRanges) ? fromOrRanges : [[fromOrRanges,toOrCallback]];
  const callback = _.isFunction(toOrCallback) ? toOrCallback : next;

  ranges.forEach( r =>{
    let from = r[0];
    let to = r[1];
    if ( from <= 0 || to <= 0 || to < from || to <= (from-60) )
      return 0;
  });
  try{
    let rangesCount = [];
    let rows = await stats.query(firestoreUtil.tablePath('candles'),null,{orderBy:'max', order:'desc'});
    for (let j = 0; j < ranges.length; j++) {
      for (let i = 0; i < rows.size; i++) {
        let from = ranges[j][0];
        let to = ranges[j][1];
        const range = rows.docs[i];
        if (  ( range.data().min <= from && range.data().max >= to ) || 
              ( range.data().min >= from && range.data().min <= to && range.data().max >= to ) ||
              ( range.data().min <= from && range.data().max <= to && range.data().max >= from)  
        ){
          rangesCount.push({ count: range.data().count });
          continue;
        }
      }
    }
    if ( callback ) 
      callback(null, rangesCount.length? _.first(rangesCount).count: 0);
    return rangesCount;
  }catch(err){
    if ( callback ) 
      callback(err);
    log.error(err.message);
    return [{count:0}];
  }
}

Reader.prototype.countTotal = async function(callback) {
  try{
    let count = await stats.count( firestoreUtil.tablePath(name) );
    if ( callback ) 
      callback(null, count);
    return count;
  }catch( err ){
    log.error(err);
    return util.die('DB error while reading countTotal');
  }
}

Reader.prototype.getBoundry = async function(callback = ()=>{}, name='candles') {
  try{
    let options = {orderBy: 'min',
                   limit: 1};
    let optionsLast = {orderBy: 'max',
                       order: 'desc',
                       limit: 1};
/*
    var tableRef = this.db.table( firestoreUtil.tablePath(name) );
    var p = await Promise.all([
      tableRef.orderBy('start').limit(1).get(),
      tableRef.orderBy('start','desc').limit(1).get()
    ]);
    
    let response = {first: p[0].docs[0].data().start,
                    last: p[1].docs[0].data().start };
*/
    var p = await Promise.all([
      stats.query( firestoreUtil.tablePath(name), null, options ),
      stats.query( firestoreUtil.tablePath(name), null, optionsLast )
    ]);
    
    let response = {first: p[0].size? p[0].docs[0].data().min: 0,
                    last: p[1].size? p[1].docs[0].data().max: 0 };
    callback(null, response);
    return response;
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
  var reader = new module.exports;
  //console.log( await reader.countRanges( 'candles' ) );
//return;

  const BATCH_SIZE = 60; // minutes
  const MISSING_CANDLES_ALLOWED = 3; // minutes, per batch
  
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
        return iterator.to > first
      },
      next => {
        var from = iterator.from < first? first: iterator.from;
        var to = iterator.to;
        reader.countRanges(
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
        );

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
        log.info('from:',dateformat(new Date(range.from*1000),'dd/mm/yyyy HH:MM:ss'), 
                 'to:',dateformat(new Date(range.to*1000),'dd/mm/yyyy HH:MM:ss'));   
      });
  };
  main(done).then(null,err => done(err) )
}