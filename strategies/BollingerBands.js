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
  this.name = 'BB';
  this.nsamples = 0;
  this.trend = {
    zone: 'none',  // none, top, high, low, bottom
    duration: 0,
    persisted: false
  };

  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('bb', 'BB', this.settings.bbands);
  //console.log(this.settings.bbands);
}


// for debugging purposes log the last
// calculated parameters.
method.log = function(candle) {
  var digits = 8;
  var BB = this.indicators.bb;
  /*
  console.log('upper: ' + BB.upper);
  console.log('middle: ' + BB.middle);
  console.log('lower: ' + BB.lower);
  */
  //BB.lower; BB.upper; BB.middle are your line values 

log.debug('______________________________________');
  log.debug('calculated BB properties for candle ',this.nsamples);

  if (BB.upper>candle.close)  log.debug('\t', 'Upper BB:', BB.upper.toFixed(digits));
  if (BB.middle>candle.close) log.debug('\t', 'Mid   BB:', BB.middle.toFixed(digits));
  if (BB.lower>=candle.close) log.debug('\t', 'Lower BB:', BB.lower.toFixed(digits));
  log.debug('\t', 'price:', candle.close.toFixed(digits));
  if (BB.upper<=candle.close)  log.debug('\t', 'Upper BB:', BB.upper.toFixed(digits));
  if (BB.middle<=candle.close) log.debug('\t', 'Mid   BB:', BB.middle.toFixed(digits));
  if (BB.lower<candle.close)   log.debug('\t', 'Lower BB:', BB.lower.toFixed(digits));
  log.debug('\t', 'Band gap: ', BB.upper.toFixed(digits) - BB.lower.toFixed(digits));
}

method.check = function(candle) {
  var BB = this.indicators.bb;
  var price = candle.close;
  this.nsamples++;

  // price Zone detection
  var zone = 'none';
  if (price >= BB.upper) zone = 'top';
  if ((price < BB.upper) && (price >= BB.middle)) zone = 'high';
  if ((price > BB.lower) && (price < BB.middle)) zone = 'low';
  if (price <= BB.lower) zone = 'bottom';
  log.debug('current zone:  ',zone);
  

  if (this.trend.zone == zone){ 
    // Ain't no zone change
    log.debug('persisted');
  this.trend = {
    zone: zone,  // none, top, high, low, bottom
    duration: this.trend.duration+1,
    persisted: true
  }
 
  this.advice();
  }
  else {
    // There is a zone change
    log.debug('Leaving zone: ',this.trend.zone)
    if (zone == 'top') this.advice('short');
    if (zone == 'bottom') this.advice('long');
  if (zone == 'high') this.advice();
    if (zone == 'low') this.advice();
    if (zone == 'top') log.debug(   '>>>>>   SIGNALING ADVICE SHORT   <<<<<<<<<<<<');
    if (zone == 'bottom') log.debug('>>>>>   SIGNALING ADVICE LONG    <<<<<<<<<<<<');
    this.trend = {
    zone: zone,  // none, top, high, low, bottom
    duration: 0,
    persisted: false
    }
  }
}

module.exports = method;