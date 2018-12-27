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

// prepare everything our method needs
method.init = function() {
  this.name = 'BB + SMA';
  this.debug = true;
  this.trend = {
    zone: 'none',  // none, top, high, low, bottom
    duration: 0,
    dir_duration: 0,
    direction: 'none',
    persisted: false,
    blockBuyOnTrend: undefined,
    blockSellOnTrend: undefined
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
    if ( !this.settings.minProfit ) 
        this.settings.minProfit = 0.005;
    if ( !this.settings.trailingStopLossPct ) 
        this.settings.trailingStopLossPct = 0.1; //Percentual de perda aceitável
    if ( this.settings.trailingStopLossPct > 0.5 ) 
        this.settings.trailingStopLossPct = 1-this.settings.trailingStopLossPct; //Inverte caso tenha sido informado incorretamente

    //Used for set a previous buy price when the process started bought
    this.buyPrice = this.settings.lastBuyPrice;
}

// for debugging purposes log the last
// calculated parameters.
method.log = function(candle) {
  var digits = 8;
  var BB = this.indicators.bb;
  let maSlow = this.indicators.maSlow.result,
      maFast = this.indicators.maFast.result;
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
  log.debug('\t', '  maFast:', maFast.toFixed(digits)); 
  log.debug('\t', '  maSlow:', maSlow.toFixed(digits)); 
  log.debug('\t', '   Trend:', maFast < maSlow? "BEAR":"BULL"); 
  if ( this.stopLossPoint )
    log.debug('\t', 'stopLoss:', this.stopLossPoint);
}

method.trending = function(){
    let maSlow = this.indicators.maSlow.result,
    maFast = this.indicators.maFast.result;
    // NOTE: maFast will always be under maSlow if maSlow can't be calculated
    return maFast < maSlow? BEAR: BULL;
}

/* LONG */
method.long = function(limit, comment) {
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
        _advice.trigger.trailValue = this.trend.price * this.settings.trailingStopLossPct;
        this.stopLossPoint = this.trend.price - _advice.trigger.trailValue;
        this.trend.direction = 'up';
        this.trend.dir_duration = 0;
        if ( limit )
            _advice.params = {"limit": limit};
        this.advice(_advice);
        log.info('Going long @'+this.trend.price + (comment?"-" + comment:"") + " stopLossPoint: "+this.stopLossPoint);
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
        log.info('Going short @'+this.trend.price + (comment?"-" + comment:""));
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
    if ( this.trending() == this.trend.blockBuyOnTrend )
        return false;
    let result = false;
    if ( this.nextOperation == 'buy' ) { 
        let maxPrice = this.sellPrice * (1-this.settings.minProfit);
        if ( this.buyPrice && this.buyPrice < maxPrice )
            maxPrice = this.buyPrice;
        //Identify if had stop loss and reset value to avg EMA. 
        if ( (this.buyPrice/this.sellPrice-1) > this.settings.trailingStopLossPct*0.8 ){ //Possibly ocurred stoploss
            maxPrice = ( this.indicators.maSlow.result,
                        this.indicators.maFast.result)/2;
        }
        let gap = this.indicators.bb.upper - this.indicators.bb.lower;
        let midUpper = this.indicators.bb.upper - gap/4; 
        let midLower = this.indicators.bb.lower + gap/4;
        let octUpper = this.indicators.bb.upper - gap/8; 
        let octLower = this.indicators.bb.lower + gap/8;

        //let trend = false;
        if ( this.trending() == BEAR ){
            result = (this.indicators.maFast.result > octUpper)
                    || ((this.indicators.maSlow.result > octUpper) && 
                    (this.indicators.maFast.result > (midUpper-gap/8)) )
                    ||(this.indicators.maFast.result > this.indicators.bb.upper);
            result = result && (price <= maxPrice);
        }else 
        if (this.trending() == BULL){
            result = (this.indicators.maFast.result < octLower)
                   || ((this.indicators.maSlow.result < this.indicators.bb.lower) && 
                    (this.indicators.maFast.result < octLower) )
                   ||(this.indicators.maFast.result < this.indicators.bb.lower);
                   //|| (this.buyPrice > 0 && this.buyPrice < midLower);
            //result = result && (price <= maxPrice);
            maxPrice = undefined;
            //@TODO 2018-11-27 22:56 (BUY) 2018-11-27T18:28 (SELL) - SUBIDA RAPIDA 
        }
        
        if ( result )
            log.debug('max. price to buy:', maxPrice);
        if ( fn ) 
            fn(result, {limit: maxPrice});
        return result;
    }else 
    if ( !this.lastTrade ){
        let gap = this.indicators.bb.upper - this.indicators.bb.lower;
        let midUpper = this.indicators.bb.upper - gap/4; 
        let midLower = this.indicators.bb.lower + gap/4;
        let octUpper = this.indicators.bb.upper - gap/8; 
        let octLower = this.indicators.bb.lower + gap/8;

        if ( this.trending() == BEAR ){
            return  (this.indicators.maFast.result > midUpper)
                    || (this.indicators.maSlow.result > octUpper && 
                    this.indicators.maFast.result > (midUpper-gap/8))
                    ||(this.indicators.maFast.result > this.indicators.bb.upper);
        }else 
        if (this.trending() == BULL){
            return (this.indicators.maFast.result < midLower)
                   || (this.indicators.maSlow.result < octLower && 
                    this.indicators.maFast.result < (midLower+gap/8) )
                   || (this.buyPrice > 0 && this.buyPrice < midLower)
                   ||(this.indicators.maFast.result < this.indicators.bb.lower);
        }
    }
    return false; 
}

/*
Return a value if can sell, otherwise null
*/
method.canSell = function(price, fn){

    if ( this.trending() == this.trend.blockSellOnTrend )
        return false;
    let result = false;
    if ( this.nextOperation == 'sell' ) {
        let minPrice = this.buyPrice/(1-this.settings.minProfit);

        let gap = this.indicators.bb.upper - this.indicators.bb.lower;
        let midUpper = this.indicators.bb.upper - gap/4; 
        let midLower = this.indicators.bb.lower + gap/4;
        let octUpper = this.indicators.bb.upper - gap/8; 
        let octLower = this.indicators.bb.lower + gap/8;
            
        if ( this.trending() == BEAR ){
            let result1 = (this.indicators.maFast.result > midUpper)
                    || ((this.indicators.maSlow.result > octUpper) && 
                        (this.indicators.maFast.result > (midUpper-gap/8)) )
                    ||(this.indicators.maFast.result > this.indicators.bb.upper);
            //if (result1)
            //    minPrice = this.buyPrice*(1-this.settings.minProfit);
                   
            let result2 = (this.indicators.maFast.result < midLower)
                    || ((this.indicators.maSlow.result < octLower) && 
                        (this.indicators.maFast.result < (midLower+gap/8)) )
                    ||(this.indicators.maFast.result < this.indicators.bb.lower);
            if (result2)
                minPrice = Math.max( this.buyPrice, minPrice-gap/2, (midUpper-gap/8) );
            result = (result1|| result2) && (price >= minPrice);
        }else 
        if (this.trending() == BULL){
            let result1 = (this.indicators.maFast.result > midUpper)
                    || ((this.indicators.maSlow.result > octUpper) && 
                        (this.indicators.maFast.result > (midUpper-gap/8)) )
                    ||(this.indicators.maFast.result > this.indicators.bb.upper);
            if (result1)
                minPrice = Math.max( minPrice+gap/2, (midLower+gap/8) );

            let result2 = (this.indicators.maFast.result < midLower)
                    || ((this.indicators.maSlow.result < octLower) && 
                        (this.indicators.maFast.result < (midLower+gap/8)) )
                    ||(this.indicators.maFast.result < this.indicators.bb.lower);
            /*if (result2)
                minPrice = this.buyPrice*(1-this.settings.minProfit);
            */
            result = (result1|| result2) && (price >= minPrice);
            //minPrice = undefined;
        }
        if ( result )
            log.debug('min. price to sell:', minPrice);
        if ( fn ) 
            fn(result, {limit: minPrice});
        return result;
    }else 
    if ( !this.lastTrade ){ //sell first time
        let sma = ( this.indicators.maSlow.result +
                    this.indicators.maFast.result)/2;
        let minPrice = (this.buyPrice? this.buyPrice: sma)/(1-this.settings.minProfit);
        log.debug('min. price to sell:', minPrice);
        let result = false;
        if ( this.buyPrice )
            result = price >= minPrice;
        else{
            let middle = this.indicators.bb.middle;
            result = ( price >= minPrice || (this.trending()==BULL && sma < middle));
        } 
        if ( fn ) 
            fn(result, {limit: minPrice});
        return result;
    }
    return false; 
}

method.check = function(candle) {
  let BB = this.indicators.bb;
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
  
  if (zone == "high" || zone =="low" ){ 
      if ( this.trend.zone == zone ){
        // Ain't no zone change
        log.debug('persisted');
        this.trend.duration++;
        this.trend.persisted = true;
        this.advice();
      }else if (zone =="low" 
                && this.trending()==BULL
                && this.indicators.maFast.result < BB.lower
                && this.canBuy(price, fn) ){
        this.long(limit); //probably high up w/ force
      }else if (zone =="high"
                && this.trending()==BEAR
                && this.indicators.maFast.result > BB.upper
                && this.canSell(price, fn) ){
        this.short(limit);//probably high down w/ force
      }else
        this.advice();
  }
  else {
    let duration = this.trend.duration;
    this.trend = {
        zone: zone,  // none, top, high, low, bottom
        duration: 0,
        dir_duration: this.trend.dir_duration,
        direction: this.trend.direction,
        persisted: false,
        price: price,
        blockBuyOnTrend: this.trend.blockBuyOnTrend,
        blockSellOnTrend: this.trend.blockSellOnTrend
    }
    // There is a zone change
    log.debug('Leaving zone: ',this.trend.zone)

    if ( zone == 'top' && this.canSell(price, fn) ){
        this.short(limit);
    }/*else 
    if ( zone == "top" 
            && this.trending()==BULL
            && this.indicators.maFast.result < BB.lower
            && this.canBuy(price, fn) ){
        this.long(limit); //probably high up w/ force
    }*/else
    if ( zone == 'bottom' && this.canBuy(price, fn) ) {
        this.long(limit);
    }else
    if ( zone == "bottom"
        && this.trending()==BEAR
        && this.indicators.maFast.result > BB.upper
        && this.canSell(price, fn) ){
        this.short(limit);//probably high down w/ force
    }else
        this.advice();
}

}

module.exports = method;