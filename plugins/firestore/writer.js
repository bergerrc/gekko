var _ = require('lodash');
const util = require('../../core/util');
const log = require('../../core/log');
const config = util.getConfig();
var moment = require('moment');
const async = require('async');

var handle = require('./handle');
var RateLimitQueue = require('./RateLimitQueue');
var firestoreUtil = require('./util');

var Store = function(done, pluginMeta) {
  _.bindAll(this);
  this.done = done;
  this.db = handle;
  this.cache = [];
  this.batches = [];
  this.queue = new RateLimitQueue(config.firestore.ratelimit);
  done();
}

Store.prototype.writeCandles = function() {
  if(_.isEmpty(this.cache)){
    return;
  }
  //transform candle data and set only needed fields
  this.cache.forEach( (candle, i, self) => {
    let new_candle = _.merge(
      { start: undefined, open: undefined, high: undefined, low: undefined, 
        close: undefined, vwp: undefined, volume: undefined, trades: undefined },
      candle,
      { start: candle.start.unix? candle.start.unix(): candle.start, 
               vwp: parseFloat(candle.vwp.toFixed(8)), 
               volume: parseFloat(candle.volume.toFixed(8)) }
    );
    //if ( self.length > 1 )
    //  new_candle.insertId = i;  //id for insertAll method
    self[i] = new_candle;
  });
  //Add to queue to prevent rate_limit exceed
  let p = this.queue.append(

    function insertAll (rows) {
      return this.db.insert(firestoreUtil.tablePath('candles'), rows )
    }.bind(this), this.cache )

  .then( (rowsCount)=>{
    log.debug(`Inserted ${rowsCount} rows`);
    return rowsCount;
  })
  .catch( (err)=>{
    if ( err.name == "PartialFailureError" ){
      err.errors.forEach( e => {
        this.cache.push( e.row );  //Populate failed rows
      });
      log.error(`Failed ${err.errors.length} rows and added to queue`);
    }else
      throw err;
  });
  this.cache = [];
  return p;
}

Store.prototype.deleteCandles = function(rows) {
  //Add to queue to prevent rate_limit exceed
  var queue = new RateLimitQueue(1); //1 per second
  let p = queue.append(

    function deleteAll (rows) {
      return this.db.delete(firestoreUtil.tablePath('candles'), rows )
    }.bind(this), rows )

  .then( (rowsCount)=>{
    log.debug(`Deleted ${rowsCount} rows`);
    return rowsCount;
  })
  .catch( (err)=>{
      throw err;
  });
  return p;
}

var processCandle = function(candle, done) {
  this.cache.push(candle);
  if ( util.gekkoMode() !== "importer" ||  this.cache.length >= 100 ){
    this.batches.push( this.writeCandles() );
  }
  done();
};

var finalize = async function(done) {
  this.batches.push( this.writeCandles() );
  await Promise.all( this.batches );
  this.db = null;
  this.batches = null;
  this.queue.cancel();
  /**@TODO Set delay because it is finishing before the promises */
  setTimeout(
      done, 
      20000);
}

if(config.candleWriter.enabled) {
  Store.prototype.processCandle = processCandle;
  Store.prototype.finalize = finalize;
}

module.exports = Store;
/*
var latestTs = moment().startOf('minute');
new module.exports(done=>{}).processCandle(
  {
    start: latestTs,
    open: 1,
    high: 2,
    low: 3,
    close: 4,
    vwp: 5,
    volume: 6,
    trades: 7
  },
  (e,j)=>console.log( 'finished...' + JSON.stringify(j) )
);
*/