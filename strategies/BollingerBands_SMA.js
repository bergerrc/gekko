/*
  BB strategy - okibcn 2018-01-03
 */
// helpers
var _ = require('lodash');
var log = require('../core/log.js');

var BB = require('./indicators/BB.js');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function() {
  this.name = 'BB + SMA';
  this.debug = true;
  this.nsamples = 0;
  this.trend = {
    zone: 'none',  // none, top, high, low, bottom
    duration: 0,
    dir_duration: 0,
    direction: 'none',
    persisted: false
  };

  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('bb', 'BB', this.settings.bbands);
  this.addIndicator('maSlow', 'SMA', this.settings.SMA_long);
  this.addIndicator('maFast', 'SMA', this.settings.SMA_short);

    // warn users
    if (this.requiredHistory < this.settings.SMA_long) {
    log.warn("*** WARNING *** Your Warmup period is lower then SMA_long. If Gekko does not download data automatically when running LIVE the strategy will default to BEAR-mode until it has enough data.");
    }
}


// for debugging purposes log the last
// calculated parameters.
method.log = function(candle) {
  var digits = 8;
  var BB = this.indicators.bb;

  log.debug('______________________________________');
  log.debug('calculated BB properties for candle ',this.nsamples);
  log.debug('\t', 'start:', candle.start);
  log.debug('\t', 'price:', candle.close.toFixed(digits));
  log.debug('\t', 'Upper BB:', BB.upper.toFixed(digits));
  log.debug('\t', 'Mid   BB:', BB.middle.toFixed(digits));
  log.debug('\t', 'Lower BB:', BB.lower.toFixed(digits));
  log.debug('\t', 'Band gap: ', BB.upper.toFixed(digits) - BB.lower.toFixed(digits));
}
/* LONG */
method.long = function(comment) {
    if (this.trend.direction !== 'up') // new trend? (only act on new trends)
    {
        var stopLossPct = (this.settings.trailingStopLossPct? this.settings.trailingStopLossPct: 0.8);
        var stopLossValue = this.trend.price * stopLossPct;
        this.trend.direction = 'up';
        this.trend.dir_duration = 0;
        this.trend.longPrice = this.trend.price;
        this.advice({
        direction: 'long', // or short
        trigger: { // ignored when direction is not "long"
            type: 'trailingStop',
            trailValue: stopLossValue
            // or:o
            // trailPercentage: 100
        }
        });
        if (this.debug) log.info('Going long @'+this.trend.price);
        console.log('Going long @'+this.trend.price + "-" + comment + " stopLoss "+stopLossValue);
    }
    if (this.debug) {
        this.trend.dir_duration++;
        log.info('Long since', this.trend.dir_duration, 'candle(s)');
    }
}

/* SHORT */
method.short = function(comment) {
    // new trend? (else do things)
    if (this.trend.direction !== 'down') {
        this.trend.dir_duration = 0;
        this.trend.direction = 'down';
        this.trend.longPrice = undefined;
        this.advice('short');
        if (this.debug) log.info('Going short @'+this.trend.price);
        console.log('Going short @'+this.trend.price + "-" + comment);
    }

    if (this.debug) {
        this.trend.dir_duration++;
        log.info('Short since', this.trend.dir_duration, 'candle(s)');
    }
}

method.check = function(candle) {
  let ind = this.indicators,
      maSlow = ind.maSlow.result,
      maFast = ind.maFast.result,
      BB = ind.bb;
  var price = candle.close;
  this.trend.price = price;
  this.nsamples++;

  // price Zone detection
  var zone = 'none';
  if (price >= BB.upper) zone = 'top';
  if ((price < BB.upper) && (price >= BB.middle)) zone = 'high';
  if ((price > BB.lower) && (price < BB.middle)) zone = 'low';
  if (price <= BB.lower) zone = 'bottom';
  log.debug('current zone:  ',zone);
  
  if (zone == "high" || zone =="low" ){ 
      if ( this.trend.zone == zone ){
        // Ain't no zone change
        log.debug('persisted');
        this.trend.duration++;
        this.trend.persisted = true;
      }
      this.advice();
  }
  else {
    let duration = this.trend.duration;
    this.trend = {
        zone: zone,  // none, top, high, low, bottom
        duration: 0,
        dir_duration: this.trend.dir_duration,
        direction: this.trend.direction,
        longPrice: this.trend.longPrice,
        persisted: false,
        price: price
    }

    // There is a zone change
    log.debug('Leaving zone: ',this.trend.zone)
    // BEAR TREND
    // NOTE: maFast will always be under maSlow if maSlow can't be calculated
    var minProfit = this.settings.minProfit? this.settings.minProfit: 0.005;
    var priceGtMin = this.trend.longPrice && this.trend.longPrice/(1-minProfit) <= price;
    if (maFast < maSlow) {
        if (zone == 'top' && priceGtMin) 
            this.short("Bear above "+BB.upper+ " open "+candle.open);
        if (zone == 'bottom') {
            let offset = Math.round( Math.pow( (1-(price / BB.lower))*100, 2)*10 );
            log.debug('offset candle(s): ',offset);
            if ( offset <= duration )
                this.long("Bear below "+BB.lower + " offset "+offset + " open "+candle.open);
        }    
    }else { // BULL TREND
        if (zone == 'top') {
            let offset = Math.round( Math.pow( (1-(price / BB.upper))*100, 2)*10 );
            log.debug('offset candle(s): ',offset);
            if ( offset <= duration  && priceGtMin )
                this.short("Bull above "+BB.upper + " offset "+offset+ " open "+candle.open);
        }
        if (zone == 'bottom') 
            this.long("Bear below "+BB.lower+ " open "+candle.open);
    }
}

}

module.exports = method;