var _ = require('lodash');
var log = require('../core/log.js');
var util = require('../core/util.js');
var xls = require("xlsx");
var extend = require('extend');
var config = util.getConfig();
var candleWriterConfig = config.ciWriter;

var CandleWriter = function() {
    _.bindAll(this);
    this.candleCache = [];
    this.indicatorsCache = [];
    this.adviceCache = [];
}
  

  CandleWriter.prototype.processStratUpdate = function(updated, done) {
    this.indicatorsCache.push( updated );
    //done();
  };

  CandleWriter.prototype.processCandle = function(candle, done) {
    this.candleCache.push( candle );
    if (this.candleCache.length > 100) 
        this.write();
    done();
  };
  
  CandleWriter.prototype.processAdvice = function(advice) {
    if (advice.recommendation == 'soft') return;
    this.adviceCache.push( advice );
  };
  
  CandleWriter.prototype.finalize = function(advice, done) {
    this.write();
    //done();
  };
  

  CandleWriter.prototype.write = function(){
    
    _.merge(this.candleCache, this.indicatorsCache, this.adviceCache);
    /*
    var candles = [];
    _.each(this.candleCache, candle => {
        var mCandle = {
        time: moment().unix(),
        start: candle.start.unix(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        vwp: candle.vwp,
        volume: candle.volume,
        trades: candle.trades,
        pair: this.pair
        };
        candles.push(mCandle);
    });*/
    var wopts = { bookType:'xlsx', bookSST:false, type:'array' };
    var wb = xls.utils.book_new();
    var ws = xls.utils.json_to_sheet(this.candleCache);
    xls.utils.book_append_sheet(wb, ws, 'Results');
    xls.writeFile( wb, candleWriterConfig.sheetUrl, wopts);
    this.candleCache = [];
    /*
    var iterationFields = ["validator","testInstanceId","testSetId","testConfigId","testId","params","package","query"];
    for ( var idx = 0; idx < iterations.length; idx++ ){
        var iteration = iterations[idx];
        if ( iteration.testInstanceId > 999999 ){
            iterations.splice(idx,1);
            --idx;
            continue;
        }
        iteration.id = idx;
        iteration["params"] = {};
        Object.getOwnPropertyNames(iteration).forEach(function(field,idx){
            if ( iterationFields.indexOf(field)<0 ){
                iteration.params[field] = iteration[field];
                delete iteration[field];
            }
        }, this);
    };
    return iterations;
    */
    };
  module.exports = CandleWriter;