/*
  The sticky order is an advanced order:
    - It is created at a limit price of X
      - if limit is not specified always at bbo.
      - if limit is specified the price is either limit or the bbo (whichever is more favorable)
    - it will readjust the order:
      - if outbid is true it will outbid the current bbo (on supported exchanges)
      - if outbid is false it will stick to current bbo when this moves
    - If the price moves away from the order it will "stick to" the top

  TODO:
    - native move
*/

const _ = require('lodash');
const async = require('async');
const events = require('events');
const moment = require('moment');
const errors = require('../exchangeErrors');
const BaseOrder = require('./order');
const states = require('./states');

class StickyOrder extends BaseOrder {
  constructor(api) {
    super(api);

    // global async lock
    this.sticking = false;
  }

  create(side, rawAmount, params = {}) {
    if(this.completed || this.completing) {
      return false;
    }

    this.side = side;

    this.amount = this.api.roundAmount(rawAmount);

    if(side === 'buy') {
      if(params.limit)
        this.limit = this.api.roundPrice(params.limit);
      else
        this.limit = Infinity;
    } else {
      if(params.limit)
        this.limit = this.api.roundPrice(params.limit);
      else
        this.limit = -Infinity;
    }

    this.status = states.SUBMITTED;
    this.emitStatus();

    this.orders = {};

    this.outbid = params.outbid && _.isFunction(this.api.outbidPrice);

    this.price = this.calculatePrice(this.data.ticker);

    this.createOrder();

    return this;
  }

  calculatePrice(ticker) {
    if(this.side === 'buy') {
      if(ticker.bid >= this.limit) {
        return this.limit;
      }

      if(!this.outbid) {
        return ticker.bid;
      }

      const outbidPrice = this.api.outbidPrice(ticker.bid, true);

      if(outbidPrice <= this.limit && outbidPrice < ticker.ask) {
        return outbidPrice;
      } else {
        return this.limit;
      }

    } else if(this.side === 'sell') {

      if(ticker.ask <= this.limit) {
        return this.limit;
      }

      if(!this.outbid) {
        return ticker.ask;
      }

      const outbidPrice = this.api.outbidPrice(ticker.ask, false);

      if(outbidPrice >= this.limit && outbidPrice > ticker.bid) {
        return outbidPrice;
      } else {
        return this.limit;
      }
    }
  }

  createOrder() {
    if(this.completed || this.completing) {
      return false;
    }

    const alreadyFilled = this.calculateFilled();

    this.submit({
      side: this.side,
      amount: this.api.roundAmount(this.amount - alreadyFilled),
      price: this.price,
      alreadyFilled
    });
  }

  handleCreate(err, id) {
    if(err) {
      console.log('handleCreate', err.message);
      throw err;
    }

    if(!id)
      console.log('BLUP! no id...');

    // potentailly clean up old order
    if(
      this.id &&
      this.orders[this.id] &&
      this.orders[this.id].filled === 0
    )
      delete this.orders[this.id];

    // register new order
    this.id = id;
    this.orders[id] = {
      price: this.price,
      filled: 0
    }

    this.emit('new order', this.id);

    this.status = states.OPEN;
    this.emitStatus();

    // remove lock
    this.sticking = false;

    // check whether we had an action pending
    if(this.cancelling)
      return this.cancel();

    if(this.movingLimit)
      return this.moveLimit();

    if(this.movingAmount)
      return this.moveAmount();

    // register check
    this.timeout = setTimeout(this.checkOrder, this.checkInterval);
  }

  checkOrder() {
    if(this.completed || this.completing) {
      return console.log(new Date, 'checkOrder called on completed/completing order..', this.completed, this.completing);
    }

    this.sticking = true;

    this.api.checkOrder(this.id, (err, result) => {
      if(err) {
        console.log(new Date, 'error creating:', err.message);
        throw err;
      }

      if(result.open) {
        if(result.filledAmount !== this.orders[this.id].filled) {
          this.orders[this.id].filled = result.filledAmount;
          this.emit('fill', this.calculateFilled());
        }

        // if we are already at limit we dont care where the top is
        // note: might be string VS float
        if(this.price == this.limit) {
          this.timeout = setTimeout(this.checkOrder, this.checkInterval);
          this.sticking = false;
          return;
        }

        this.api.getTicker((err, ticker) => {
          if(err)
            throw err;

          this.ticker = ticker;

          const bookSide = this.side === 'buy' ? 'bid' : 'ask';
          // note: might be string VS float
          if(ticker[bookSide] != this.price) {
            return this.move(this.calculatePrice(ticker));
          }

          this.timeout = setTimeout(this.checkOrder, this.checkInterval);
          this.sticking = false;
        });

        return;
      }

      if(!result.executed) {
        // not open and not executed means it never hit the book
        this.sticking = false;
        this.status = states.REJECTED;
        this.emitStatus();
        this.finish();
        return;
      }

      // order got filled!
      this.orders[this.id].filled = this.amount;
      this.sticking = false;
      this.emit('fill', this.amount);
      this.filled(this.price);

    });
  }

  // returns true if the order was fully filled
  // handles partial fills on cancels calls
  // on exchanges that support it.
  handleCancel(filled, data) {
    // it got filled before we could cancel
    if(filled) {
      this.orders[this.id].filled = this.amount;
      this.emit('fill', this.amount);
      this.filled(this.price);
      return true;
    }

    // if we have data on partial fills
    // check whether we had a partial fill
    if(_.isObject(data)) {
      let amountFilled = data.filled;

      if(!amountFilled && data.remaining) {
        const alreadyFilled = this.calculateFilled();
        const orderAmount = this.api.roundAmount(this.amount - alreadyFilled);
        amountFilled = this.api.roundAmount(orderAmount - data.remaining);
      }

      if(amountFilled > this.orders[this.id].filled) {
        this.orders[this.id].filled = amountFilled;
        this.emit('fill', this.calculateFilled());
      }
    }

    return false;
  }

  move(price) {
    if(this.completed || this.completing) {
      return false;
    }

    this.status = states.MOVING;
    this.emitStatus();

    this.api.cancelOrder(this.id, (err, filled, data) => {
      // it got filled before we could cancel
      if(this.handleCancel(filled, data)) {
        return;
      }

      // update to new price
      this.price = this.api.roundPrice(price);

      this.createOrder();
    });

    return true;
  }

  calculateFilled() {
    let totalFilled = 0;
    _.each(this.orders, (order, id) => totalFilled += order.filled);

    return totalFilled;
  }

  moveLimit(limit) {
    if(this.completed || this.completing) {
      return false;
    }

    if(!limit) {
      limit = this.moveLimitTo;
    }

    if(this.limit === this.api.roundPrice(limit)) {
      // effectively nothing changed
      return false;
    }

    if(
      this.status === states.INITIALIZING ||
      this.status === states.SUBMITTED ||
      this.status === states.MOVING ||
      this.sticking
    ) {
      this.moveLimitTo = limit;
      this.movingLimit = true;
      return;
    }

    this.limit = this.api.roundPrice(limit);

    clearTimeout(this.timeout);

    this.movingLimit = false;

    if(this.side === 'buy' && this.limit < this.price) {
      this.sticking = true;
      this.move(this.limit);
    } else if(this.side === 'sell' && this.limit > this.price) {
      this.sticking = true;
      this.move(this.limit);
    } else {
      this.timeout = setTimeout(this.checkOrder, this.checkInterval);
    }

    return true;
  }

  moveAmount(amount) {
    if(this.completed || this.completing)
      return false;

    if(!amount)
      amount = this.moveAmountTo;

    if(this.amount === this.api.roundAmount(amount))
      // effectively nothing changed
      return true;

    if(this.calculateFilled() > this.api.roundAmount(amount)) {
      // the amount is now below how much we have
      // already filled.
      this.filled();
      return false;
    }

    if(
      this.status === states.INITIALIZING ||
      this.status === states.SUBMITTED ||
      this.status === states.MOVING ||
      this.sticking
    ) {
      this.moveAmountTo = amount;
      this.movingAmount = true;
      return;
    }

    this.amount = this.api.roundAmount(amount - this.calculateFilled());

    if(this.amount < this.data.market.minimalOrder.amount) {
      if(this.calculateFilled()) {
        // we already filled enough of the order!
        this.filled();
        return false;
      } else {
        throw new Error("The amount " + this.amount + " is too small.");
      }
    }

    clearTimeout(this.timeout);

    this.movingAmount = false;
    this.sticking = true;

    this.api.cancelOrder(this.id, (err, filled, data) => {
      if(err) {
        throw err;
      }

      // it got filled before we could cancel
      if(this.handleCancel(filled, data)) {
        return;
      }

      this.createOrder();
    });

    return true;
  }

  cancel() {
    if(this.completed)
      return;

    if(
      this.status === states.SUBMITTED ||
      this.status === states.MOVING ||
      this.sticking
    ) {
      this.cancelling = true;
      return;
    }

    this.completing = true;
    clearTimeout(this.timeout);
    this.api.cancelOrder(this.id, (err, filled, data) => {
      if(err) {
        throw err;
      }

      this.cancelling = false;

      // it got filled before we could cancel
      if(this.handleCancel(filled, data)) {
        return;
      }

      this.status = states.CANCELLED;
      this.emitStatus();

      this.finish(false);
    })
  }

  createSummary(next) {
    if(!this.completed)
      console.log(new Date, 'createSummary BUT ORDER NOT COMPLETED!');

    if(!next)
      next = _.noop;

    const checkOrders = _.keys(this.orders)
      .map(id => next => {

        if(!this.orders[id].filled) {
          return next();
        }

        setTimeout(() => this.api.getOrder(id, next), this.timeout);
      });

    async.series(checkOrders, (err, trades) => {
      if(err) {
        return next(err);
      }

      let price = 0;
      let amount = 0;
      let date = moment(0);

      _.each(trades, trade => {
        if(!trade) {
          return;
        }

        // last fill counts
        date = moment(trade.date);
        price = ((price * amount) + (+trade.price * trade.amount)) / (+trade.amount + amount);
        amount += +trade.amount;
      });

      const summary = {
        price,
        amount,
        date,
        side: this.side,
        orders: trades.length
      }

      if(_.first(trades) && _.first(trades).fees) {
        summary.fees = {};

        _.each(trades, trade => {
          if(!trade) {
            return;
          }

          _.each(trade.fees, (amount, currency) => {
            if(!_.isNumber(summary.fees[currency])) {
              summary.fees[currency] = amount;
            } else {
              summary.fees[currency] += amount;
            }
          });
        });
      }

      if(_.first(trades) && _.first(trades).feePercent) {
        summary.feePercent = 0;
        let amount = 0;

        _.each(trades, trade => {
          if(!trade || !trade.feePercent) {
            return;
          }

          summary.feePercent = ((summary.feePercent * amount) + (+trade.feePercent * trade.amount)) / (+trade.amount + amount);
          amount += +trade.amount;
        });
      }

      this.emit('summary', summary);
      next(undefined, summary);
    });
  }
 
}

module.exports = StickyOrder;