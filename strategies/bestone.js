var _ = require ('lodash');
var log = require ('../core/log.js');
//var tulind = require('tulind');
// Configuration
var config = require ('../core/util.js').getConfig();

var async = require ('async');

// Let's create our own method
var method = {};


// Prepare everything our method needs
method.init = function () {

    this.name = 'bestone';

    // Keep state about the current trend
    // Here, on every new candle we use this
    // State object to check if we need to
    // Report it.
    this.trend = {
        direction: 'none',
        duration: 0,
        persisted: false,
        adviced: false
    };

    // How many candles do we need as a base
    // Before we can start giving advice?
    this.requiredHistory = config.tradingAdvisor.historySize;

    var customMACDSettings = {
        optInFastPeriod: this.settings.MACD_fast || 12,
        optInSlowPeriod: this.settings.MACD_slow || 26,
        optInSignalPeriod: this.settings.MACD_signal || 9
    };

    var customEMAshortSettings = {
        optInTimePeriod: this.settings.EMA_short || 9
    };

    var customEMAlongSettings = {
        optInTimePeriod: this.settings.EMA_long || 21
    };

    var customSTOCHSettings = {
        optInFastKPeriod: this.settings.STOCH_fastk || 9,
        optInSlowKPeriod: this.settings.STOCH_slowk || 3,
        optInSlowKMAType:this.settings.STOCH_slowkma ||  1,
        optInSlowDPeriod: this.settings.STOCH_slowd || 3,
        optInSlowDMAType: this.settings.STOCH_slowdma || 1
    };

    var customRSISettings = {
        optInTimePeriod: this.settings.RSI || 14
    };

    this.RSIhigh = this.settings.RSI_high || 70;
    this.RSIlow = this.settings.RSI_low || 30;

    this.addTulipIndicator('myMACD', 'macd', customMACDSettings);
    this.addTulipIndicator('myEMAshort', 'ema', customEMAshortSettings);
    this.addTulipIndicator('myEMAlong', 'ema', customEMAlongSettings);
    this.addTulipIndicator('myRSI', 'rsi', customRSISettings);
    this.addTulipIndicator('mySTOCH', 'stoch', customSTOCHSettings);
}

// What happens on every new candle?
method.update = function (candle) {
}

// For debugging purposes: log the last calculated
// EMAs and diff.
method.log = function () {
    //log.info (new Date().toLocaleString());
    //log.info ('calculated TULIND properties for candle:');
}

method.check = function (candle) {
    if (candle.close.length < this.requiredHistory) {
        // TODO: still needed?!
        return;
    }
    var macd = this.tulipIndicators.myMACD.result.macd;
    var rsi = this.tulipIndicators.myRSI.result.result;
    var emashort = this.tulipIndicators.myEMAshort.result.result;
    var emalong = this.tulipIndicators.myEMAlong.result.result;
    var stochK = this.tulipIndicators.mySTOCH.result.stochK;
    var stochD = this.tulipIndicators.mySTOCH.result.stochD;
//    log.info('\t', "macd format:",  tulind.indicators.macd);

/*
    log.info('\t', "macd:",  macd);
    log.info('\t', "rsi:",  rsi);
    log.info('\t', "stochK:", stochK);
    log.info('\t', "stochD:", stochD);
    log.info('\t', "emashort:", emashort);
    log.info('\t', "emalong:", emalong);
*/
    if (emashort > emalong && stochK > stochD && macd > 0.0 && rsi > this.RSIhigh) {

        // New trend detected
        if (this.trend.direction !== 'up')
        // Reset the state for the new trend
            this.trend = {
                duration: 0,
                persisted: false,
                direction: 'up',
                adviced: false
            };

        this.trend.duration ++;

        log.debug ('In uptrend since', this.trend.duration, 'candle (s)');

        if (this.trend.duration >= 1) this.trend.persisted = true;

        if (this.trend.persisted && !this.trend.adviced) {
            this.trend.adviced = true;
            this.advice ('long');
        } else this.advice ();

    } else if (emashort < emalong && stochK < stochD && macd < 0.0 && rsi < this.RSIlow) {

        // New trend detected
        if (this.trend.direction !== 'down')
        // Reset the state for the new trend
            this.trend = {
                duration: 0,
                persisted: false,
                direction: 'down',
                adviced: false
            };

        this.trend.duration ++;

        log.debug ('In downtrend since', this.trend.duration, 'candle (s)');

        if (this.trend.duration >= 1) this.trend.persisted = true;

        if (this.trend.persisted && !this.trend.adviced) {
            this.trend.adviced = true;
            this.advice ('short');
        } else this.advice ();

    } else {

        log.debug ('In no trend');
        this.advice ();
    }
}
module.exports = method;
