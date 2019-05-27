/*
  BB strategy - okibcn 2018-01-03
 */
// helpers
var _ = require('lodash');
var log = require('../core/log.js');

var BB = require('./indicators/BB.js');

// let's create our own method
var method = {};
const BEAR = 'BEAR';
const BULL = 'BULL';
const INFINITE_FALL = 'FREEFALL';
const FLAT = 'FLAT';
const INNER = 'inner';
const OUTER = 'outer';
var util = require('../core/util');
var dirs = util.dirs();
const config = util.getConfig();
var CandleBatcher = require(dirs.core + 'candleBatcher');
const fs = require('fs');
const indicatorsPath = dirs.methods + 'indicators/';
const indicatorFiles = fs.readdirSync(indicatorsPath);
const Indicators = {};
_.each(indicatorFiles, function(indicator) {
  const indicatorName = indicator.split(".")[0];
  if (indicatorName[0] != "_")
    try {
      Indicators[indicatorName] = require(indicatorsPath + indicator);
    } catch (e) {
      log.error("Failed to load indicator", indicatorName);
    }
});
const allowedIndicators = _.keys(Indicators);

// prepare everything our method needs
method.init = function() {
  this.name = 'BB + SMA';
  this.debug = true;
  this.trend = {
    zone: 'none',  // none, top, high, low, bottom
    region: 'none', //inner, outer
    duration: 0,
    dir_duration: 0,
    direction: 'none',
    persisted: false,
    blockBuyOnTrend: undefined,
    blockSellOnTrend: undefined,
    probability: undefined
  };
  this.indicatorsCustom = [];
  this.batchers = [];
  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('bb', 'BB', this.settings.bbands);
  this.addIndicator('maSlow', 'SMA', this.settings.SMA_long||200);
  this.addIndicator('maFast', 'SMA', this.settings.SMA_short||50);
  this.addIndicator('maQuick', 'SMA', this.settings.SMA_shortest||10);

    // warn users
    if (this.requiredHistory < this.settings.SMA_long) {
    log.warn("*** WARNING *** Your Warmup period is lower then SMA_long. If Gekko does not download data automatically when running LIVE the strategy will default to BEAR-mode until it has enough data.");
    }
    if ( !this.settings.minProfit ) 
        this.settings.minProfit = 0.005;
    if ( this.settings.trailingStopLossPct == undefined ) 
        this.settings.trailingStopLossPct = 0.1; //Percentual de perda aceitável
    if ( this.settings.trailingStopLossPct > 0.5 ) 
        this.settings.trailingStopLossPct = 1-this.settings.trailingStopLossPct; //Inverte caso tenha sido informado incorretamente

    //Used for set a previous buy price when the process started bought
    this.buyPrice = this.settings.lastBuyPrice;

    if ( !this.settings.candles || !_.isArray(this.settings.candles) )
        this.settings.candles = [5,15,30,60,120,240];
    _.each( this.settings.candles, function(candleSize){
        if ( candleSize > config.tradingAdvisor.candleSize ){
            let batcher = new CandleBatcher(candleSize);
            batcher.on('candle', _candle => {
                const { id, ...candle } = _candle;
                this.updateCustom(candle, batcher.candleSize)
            });
            this.batchers.push( batcher );
            _.each(this.indicators, function(i,name){
                i.candleSize = candleSize;
                this.addIndicatorCustom(name + candleSize,
                                        i.type,
                                        i.settings,
                                        candleSize)
            }.bind(this));
        }
    }.bind(this) );
}

// for debugging purposes log the last
// calculated parameters.
method.log = function(candle) {
  var digits = 8;
  var BB = this.indicators.bb;
  let maSlow = this.indicators.maSlow.result,
      maFast = this.indicators.maFast.result,
      maQuick = this.indicators.maQuick.result;
    let gap = BB.upper.toFixed(digits) - BB.lower.toFixed(digits);
    let midUpper = this.indicators.bb.upper - gap/4; 
    let midLower = this.indicators.bb.lower + gap/4;
    let octUpper = this.indicators.bb.upper - gap/8; 
    let octLower = this.indicators.bb.lower + gap/8;
  //log.debug('______________________________________');
  log.debug('properties for candle ',this.age);
  log.debug('\t', '   start:', candle.start);
  log.debug('\t', '   price:', candle.close.toFixed(digits));
  log.debug('\t', 'Upper BB:', BB.upper.toFixed(digits));
  log.debug('\t', 'octUpper:', octUpper.toFixed(digits));
  log.debug('\t', 'midUpper:', midUpper.toFixed(digits));
  log.debug('\t', 'Mid   BB:', BB.middle.toFixed(digits));
  log.debug('\t', 'midLower:', midLower.toFixed(digits));
  log.debug('\t', 'octLower:', octLower.toFixed(digits));
  log.debug('\t', 'Lower BB:', BB.lower.toFixed(digits));
  //log.debug('\t', 'Band gap:', BB.upper.toFixed(digits) - BB.lower.toFixed(digits));
  log.debug('\t', ' maQuick:', maQuick.toFixed(digits)); 
  log.debug('\t', '  maFast:', maFast.toFixed(digits)); 
  log.debug('\t', '  maSlow:', maSlow.toFixed(digits)); 
  log.debug('\t', '   Trend:', maFast < maSlow? "BEAR":"BULL"); 
  if ( this.stopLossPoint )
    log.debug('\t', 'stopLoss:', this.stopLossPoint);
}

method.trending = function(){
    let maSlow = this.indicators.maSlow.result,
    maFast = this.indicators.maFast.result,
    maQuick = this.indicators.maQuick.result,
    bb = this.indicators.bb;
    // NOTE: maFast will always be under maSlow if maSlow can't be calculated
    let pos = bb.bandWidth.length;
    if ( pos>1 && bb.bandWidth[pos-2] < bb.bandWidth[pos-1]*0.85 && maQuick < bb.middle && bb.bandWidth[pos-1] > bb.middle*0.03)
        return INFINITE_FALL;
    else
    if ( maFast > maSlow && bb.bandWidth[pos-1] < (maFast - maSlow))
        return BULL;
    else
    if ( maFast < maSlow && bb.bandWidth[pos-1] > (maSlow - maFast))
        return BEAR;
    /*else
    if ( maQuick < bb.middle 
        && (maFast < bb.upper && maFast > bb.middle)
        && (maSlow < bb.upper && maSlow > bb.middle))
        return INFINITE_FALL;
    */else
        return FLAT;
}

/*
Calculates the probability of persistence of the region in every candle size samples
*/
method.getProbability = function(region){

    var maFast = [this.indicators.maFast.result];
    var maSlow = [this.indicators.maSlow.result];
    var bb = [{lower: this.indicators.bb.lower, upper: this.indicators.bb.upper}];

    _.each(this.indicatorsCustom, function(i){
        if ( _.contains(i.name, 'maFast') )
            maFast.push(i.result);
        if ( _.contains(i.name, 'maSlow') )
            maSlow.push(i.result);
        if ( _.contains(i.name, 'bb') )
            bb.push({lower: i.lower, upper: i.upper});
    });
    let samplePct = 100/maFast.length;
    let totalPct = 0;
    for (let i = 0; i < maFast.length; i++) {
        if ( region == INNER ){
            if ( (( maFast[i] <= bb[i].upper ) && ( maFast[i] >= bb[i].lower )) 
                || (( maSlow[i] <= bb[i].upper ) && ( maSlow[i] >= bb[i].lower )))
                totalPct += samplePct;
        }else if ( region == OUTER ){
            if (  (( maFast[i] > bb[i].upper ) || ( maFast[i] < bb[i].lower )) 
                || (( maSlow[i] > bb[i].upper ) || ( maSlow[i] < bb[i].lower )) )
                totalPct += samplePct;
        }
    }
    return totalPct;
}

/* LONG */
method.long = function(limit, comment) {
    this.stopLossPoint = undefined;
    const _advice = {
        direction: 'long',
        trigger: { // ignored when direction is not "long"
            type: 'trailingStop',
            trailValue: 0
            // or:o
            // trailPercentage: 100
    }};

    if ( !this.lastTrade || this.nextOperation == 'buy' ){
        this.isTrading =  true;
        if ( this.settings.trailingStopLossPct == 0 )
            _advice.trigger = undefined;
        else{
            _advice.trigger.trailValue = this.trend.price * this.settings.trailingStopLossPct;
            this.stopLossPoint = this.trend.price - _advice.trigger.trailValue;
        }
        this.trend.direction = 'up';
        this.trend.dir_duration = 0;
        if ( limit )
            _advice.params = {"limit": limit};
        this.advice(_advice);
        log.info('Going long @'+this.trend.price + (comment?"-" + comment:"") + " stopLossPoint: "+this.stopLossPoint + ' at candle '+this.age);
    }else if ( this._currentDirection == 'long' && this.isTrading )
        log.info('Long since', this.trend.dir_duration, 'candle(s)');
    else 
        log.error('Asked long but can`t advice');
    this.trend.dir_duration++;
}

/* SHORT */
method.short = function(limit, comment) {
    const _advice = {
        direction: 'short'
    };
    
    if ( !this.lastTrade || this.nextOperation == 'sell' ){
        this.isTrading =  true;
        this.trend.dir_duration = 0;
        this.trend.direction = 'down';
        this.stopLossPoint = undefined;
        if ( limit )
            _advice.params = {"limit": limit};
        this.advice(_advice);
        log.info('Going short @'+this.trend.price + (comment?"-" + comment:"")+ ' at candle '+this.age);
    }else if ( this._currentDirection == 'short' && this.isTrading )
        log.info('Short since', this.trend.dir_duration, 'candle(s)');
    else 
        log.error('Asked short but can`t advice');

    this.trend.dir_duration++;    
}

method.processTrade = function(trade){
    //super.processTrade(trade);
    if(trade){  
      this.isTrading =  false;
      if(trade.price == 0){
        log.debug("The price of the trade is zero. This trade is invalid most likely due to a cancel. ");
        log.debug("Going to ignore this trade info and proceed.");
        return;
      }  
      this.lastTrade =  trade;
      //Resetting
      if(trade.action == 'buy'){
        this.buyPrice = trade.price;
        this.nextOperation = 'sell';
        if ( this.trend.blockBuyOnTrend )
            log.debug( 'Unblocked to buy in trend '+this.trend.blockBuyOnTrend);
        this.trend.blockBuyOnTrend = undefined;
      }
      else if(trade.action == 'sell'){
        this.sellPrice = trade.price;
        this.nextOperation = 'buy';
        if ( this.trend.blockSellOnTrend )
            log.debug( 'Unblocked to sell in trend '+ this.trend.blockSellOnTrend);
        this.trend.blockSellOnTrend = undefined;
/*
        if ( (this.buyPrice/this.sellPrice-1) > this.settings.trailingStopLossPct*0.8 ) //Possibly ocurred stoploss
            this.trend.blockBuyOnTrend = this.trending();
*/
      }
      log.debug("\t","Order filled: ", trade.action, " @", trade.price);
    }

    //Wrapper baseTradingMethod overrided
    if(
        this._pendingTriggerAdvice &&
        trade.action === 'sell' &&
        this._pendingTriggerAdvice === trade.adviceId
      ) {
        // This trade came from a trigger of the previous advice,
        // update stored direction
        this._currentDirection = 'short';
        this._pendingTriggerAdvice = null;
        //Block Buys because of the trigger fired, until next trend
        this.trend.blockBuyOnTrend = this.trending();
        this.lastTrade.stopLoss = true;
      }
    
      this.onTrade(trade);
  }

  method.processTriggerFired = function(t){
    this.trend.blockBuyOnTrend = this.trending(); //Wait to buy only when trend changes
  }

method.checkStopLoss = function(price){
    //Quit if trigger attached to buy order
    if ( this._pendingTriggerAdvice )
        return false;
    if ( this.nextOperation == 'buy' )
        return false;
    
    if ( !this.stopLossPoint ) {
        let buyPrice = this.buyPrice;
        if ( this.nextOperation == undefined && !buyPrice )
            buyPrice = Math.max( this.indicators.maSlow.result,
                                this.indicators.maFast.result);
        this.stopLossPoint = buyPrice * (1 - this.settings.trailingStopLossPct);
    }
    if (this.stopLossPoint && price <= this.stopLossPoint){
        var lossValue = (buyPrice - price).toFixed(8);
        var lossPct = ((1 - price / buyPrice)*100).toFixed(2);
        this.short(`Stoploss fired! Loss detail: -${lossValue}(-${lossPct}%)`);
        log.info(`Blocked to go Long during Bear trends`);
        this.trend.blockBuyOnTrend = this.trending(); //Wait to buy only when trend changes
        return true;
    }   
    return false;
}

/*
Return a value if can buy, otherwise null.
*/
method.canBuy = function(price, fn){
    if ( this.trending() == this.trend.blockBuyOnTrend && this.trend.probability<100)
        return false;
    let result = false;
    if ( this.nextOperation == 'buy' ) { 
        let sma = ( this.indicators.maSlow.result +
                    this.indicators.maFast.result)/2;
        //let maxPrice = this.sellPrice * (1-this.settings.minProfit);
        let maxPrice = undefined;
        //Identify if had stop loss and reset value to avg EMA. 
        if ( this.lastTrade.stopLoss ){ 
            maxPrice = sma;
        }

        if ( maxPrice ){
            result = price <= maxPrice || (this.trend.probability >= 80 && this.trend.zone=='bottom');
            if ( price <= maxPrice ){
                log.debug('max. price to buy:', maxPrice);
                if ( fn ) 
                    fn(result, {limit: maxPrice});
            }
        }else
            result = this.trend.probability >= 50 && this.trend.zone=='bottom';
        
        return result;
    }else 
        if ( !this.lastTrade ){
            let sma = ( this.indicators.maSlow.result +
                        this.indicators.maFast.result)/2;
            let maxPrice = (this.buyPrice? this.buyPrice: sma);///(1-this.settings.minProfit);
            result = price <= maxPrice || (this.trend.probability == 100 && this.trend.zone=='bottom');
            if ( price <= maxPrice ){
                log.debug('max. price to buy:', maxPrice);
                if ( fn ) 
                    fn(result, {limit: maxPrice});
            }
            return result;
        }

    return false; 
}

/*
Return a value if can sell, otherwise null
*/
method.canSell = function(price, fn){

    if ( this.trending() == this.trend.blockSellOnTrend && this.trend.probability < 100 && this.trending()!=INFINITE_FALL)
        return false;
    let result = false;
    if ( this.nextOperation == 'sell' ) {
        let minPrice = this.buyPrice /(1-this.settings.minProfit-this.lastTrade.feePercent*2/100);
        if ( this.trend.probability >= 90 && this.trend.probability < 100)  
            minPrice = this.buyPrice /(1-this.lastTrade.feePercent*2/100);
        
        result = price >= minPrice 
                || this.trending()==INFINITE_FALL
                || (this.trend.probability == 100 && this.trend.zone=='top'); //If 100%, sell without limit
        if ( price >= minPrice && this.trending()!=INFINITE_FALL){
            log.debug('min. price to sell:', minPrice);
            if ( fn ) 
                fn(result, {limit: minPrice});
        }
        if ( this.trending()==INFINITE_FALL )
            this.trend.blockBuyOnTrend = INFINITE_FALL;
        return result;
    }else 
    if ( !this.lastTrade ){ //sell first time
        let minPrice = ( this.indicators.maSlow.result +
                         this.indicators.maFast.result)/2; //sma
        if ( this.buyPrice )
            minPrice = this.buyPrice/(1-this.settings.minProfit);

        result = price >= minPrice || (this.trend.probability == 100 && this.trend.zone=='top'); //If 100%, sell without limit
        if ( price >= minPrice ){
            log.debug('min. price to sell:', minPrice);
            if ( fn ) 
                fn(result, {limit: minPrice});
        }
        return result;
    }
    return false; 
}

method.check = function(candle) {
  let BB = this.indicators.bb;
  let maFast = this.indicators.maFast.result;
  let maSlow = this.indicators.maSlow.result;
  var price = candle.close;
  this.trend.price = price;
  let limit = undefined;
  let fn = (r,o)=>{limit = o.limit};

  if ( this.checkStopLoss() ) return;

  // price Zone detection
  var zone = 'none';
  if (price >= BB.upper) zone = 'top';
  if ((price < BB.upper) && (price >= BB.middle)) zone = 'high';
  if ((price > BB.lower) && (price < BB.middle)) zone = 'low';
  if (price <= BB.lower) zone = 'bottom';
  log.debug('current zone:  ',zone);

  var lastFastRegion = this.trend.maFastRegion;
  var lastSlowRegion = this.trend.maSlowRegion;
  if (  ( maFast <= BB.upper ) && ( maFast >= BB.lower ) )
      this.trend.maFastRegion=INNER;
  else if ( ( maFast > BB.upper ) || ( maFast < BB.lower ) )
      this.trend.maFastRegion=OUTER;
  
  if ( ( maSlow <= BB.upper ) && ( maSlow >= BB.lower ) )
      this.trend.maSlowRegion=INNER;
  else if ( ( maSlow > BB.upper ) || ( maSlow < BB.lower ) )
      this.trend.maSlowRegion=OUTER;

  var region = 'none';
  if ( this.trend.maFastRegion==this.trend.maSlowRegion )
      region = this.trend.maFastRegion;
  else {
      let fProb = this.getProbability(this.trend.maFastRegion);
      let sProb = this.getProbability(this.trend.maSlowRegion);
      if ( lastFastRegion!=this.trend.maFastRegion )//&& (fProb > sProb) ) 
          region = this.trend.maFastRegion;
      else if ( lastSlowRegion!=this.trend.maSlowRegion )//&& (sProb > fProb))
          region = this.trend.maSlowRegion;
      else
          region = this.trend.region;
  }

    // There is a zone change
    log.debug('last zone: ',this.trend.zone)
    log.debug('last region: ',this.trend.region)
    let probability = Math.round(this.getProbability(region)); 
    log.debug('Probability of '+region+': '+probability + '%')

    if ( this.trend.region == region ){
        // Ain't no region change
        log.debug('persisted');
        this.trend.duration++;
        this.trend.persisted = true;
        this.trend.probability = probability;
        let trend = this.trending();
        if ( this.lastTrade && this.lastTrade.action == 'buy' && trend==INFINITE_FALL && this.canSell(price) )
            this.short();
        else 
        if ( region == OUTER && this.lastTrade && this.lastTrade.action == 'buy' && this.canSell(price, fn)){
            this.short(limit);
        }else
        if ( region == INNER && this.lastTrade && this.lastTrade.action == 'sell' && this.canBuy(price, fn)) {
            this.long(limit);
        }else
            this.advice();
    }else{
        this.trend = {
            zone: zone,  // none, top, high, low, bottom
            region: region,
            duration: 0,
            dir_duration: this.trend.dir_duration,
            direction: this.trend.direction,
            persisted: false,
            price: price,
            blockBuyOnTrend: this.trend.blockBuyOnTrend,
            blockSellOnTrend: this.trend.blockSellOnTrend,
            probability: probability,
            maFastRegion: this.trend.maFastRegion,
            maSlowRegion: this.trend.maSlowRegion
        }
        // There is a region change
        log.debug('Getting into region: ',this.trend.region)

        if ( this.lastTrade && this.lastTrade.action == 'buy' && this.trending()==INFINITE_FALL && this.canSell(price) )
            this.short();
        else
        if ( region == OUTER && this.canSell(price, fn) ){
            this.short(limit);
        }/*else 
        if ( zone == "top" 
                && this.trending()==BULL
                && this.indicators.maFast.result < BB.lower
                && this.canBuy(price, fn) ){
            this.long(limit); //probably high up w/ force
        }*/else
        if ( region == INNER && this.canBuy(price, fn) ) {
            this.long(limit);
        }else
        /*if ( region == OUTER
            && zone == "bottom"
            && this.trending()==BEAR ){
            this.short();//probably high down w/ force
        }else*/
            this.advice();
    }
}

/*Receives every candle after indicators update, even without warmed up
method.update = function(candle) {
    _.each( this.batchers, function(batcher){
        batcher.write([candle]);
        batcher.flush();
    } );
}
*/

method.minorTick = function(candle) {
    _.each( this.batchers, function(batcher){
        batcher.write([candle]);
        batcher.flush();
    } );
}

method.updateCustom = function(candle, candleSize) {
    //log.info('emmited macro update ', candleSize, 'm');
    //log.info(candle);

    // update all indicators
    var price = candle[this.priceValue];
    var indicators = this.indicatorsCustom.filter( function(ind,i){ 
        return ind.candleSize==candleSize 
    } );
    _.each(indicators, function(i,name) {
    if(i.input === 'price')
        i.update(price);
    if(i.input === 'candle')
        i.update(candle);
    },this);
}

method.update = function(candle){
    let maSlow = this.indicators.maSlow,
    maFast = this.indicators.maFast,
    maQuick = this.indicators.maQuick,
    bb = this.indicators.bb;

    if ( bb.bandWidth == undefined ) 
        bb.bandWidth = [];
    bb.bandWidth.push( bb.upper-bb.lower );
};

method.addIndicator = function(name, type, parameters) {
    if(!_.contains(allowedIndicators, type))
      util.die('I do not know the indicator ' + type);
  
    if(this.setup)
      util.die('Can only add indicators in the init method!');
    let indicator = new Indicators[type](parameters);
    indicator.type = type;
    indicator.name = name;
    indicator.settings = indicator.settings||parameters;
    return this.indicators[name] = indicator;
    // some indicators need a price stream, others need full candles
  }

method.addIndicatorCustom = function(name, type, parameters, candleSize) {
    let indicator = new Indicators[type](parameters);
    indicator.type = type;
    indicator.name = name;
    indicator.settings = indicator.settings||parameters;
    indicator.candleSize = candleSize;
    return this.indicatorsCustom.push(indicator);
}

module.exports = method;