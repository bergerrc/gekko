
//Credits to Tom Y.
//original source: https://gist.github.com/anonymous/d86a6f001df1c7d6261513ce6c2e3ad3#file-rate-queue-js
//Arhive: https://medium.com/@ty0h/a-rate-limit-queue-in-nodejs-es2017-b3cfd5a67912

const log = require('../../core/log'); //{};
//const util = require('util');
//log.debug = util.debuglog('rate-queue'); 
// const path = require('path'); const basename = path.basename(module.filename, path.extname(module.filename));

class RateLimitQueue {
  constructor(limit = 1, interval = 1000, maxPendingPromises = Infinity, maxQueuedPromises = Infinity) {
    Object.assign(this, {
      limit, interval,
      maxPendingPromises, maxQueuedPromises,
      _queue: [], _nr_running: 0, _runs: [],
    });
  }

  append(callback, ...args) {
    return new Promise((resolve, reject) => {
      if (this.queueLength >= this.maxQueuedPromises) {
        throw new Error(`Queue limit(${this.maxQueuedPromises}) reached`);
      }
      this._queue.push({ callback, args, resolve, reject });

      // the append or prepend can be called to queue in many times synchronously, here need to make sure schedule once only, to be efficient
      if (this.queueLength === 1) process.nextTick(this._dequeue.bind(this));
    });
  }
  prepend(callback, ...args) {
    return new Promise((resolve, reject) => {
      if (this.queueLength >= this.maxQueuedPromises) {
        throw new Error(`Queue limit(${this.maxQueuedPromises}) reached`);
      }
      this._queue.unshift({ callback, args, resolve, reject });
      if (this.queueLength === 1) process.nextTick(this._dequeue.bind(this));
    });
  }

  cancel() { this._cancel = true; }

  _dequeue(_sync_calls=0) {
    if (this.queueLength === 0) return;
    if (this._cancel) return;
    if (this._nr_running >= this.maxPendingPromises) return;

    const started = Date.now();
    // this._drop_before(started - this.interval);
    if (this.nr_runs(started) >= this.limit) {
      log.debug(new Date, 'here', this._runs.length, this.limit);
      const later = Math.max((this.earliest || started) + this.interval, started);
      if (later === this._last_scheduled_at) return; // don't do anything if to reschedule is same time
      // if (later === started && _sync_calls > 0) return; // has timer to continue
      // if (later-started >= 0 && later-(this._last_scheduled_at||0) > 0) {
      if (this.timer) {
        log.debug(new Date(started), `reschedule dequeue to ${later - started}ms later:`, new Date(later), '_sync_calls:', _sync_calls);
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => { delete this.timer; delete this._last_scheduled_at; this._dequeue(); }, later - started); // need to make sure use one timer only, to be efficient
      this._last_scheduled_at = later;
      return;
      // log.debug(new Date, 'later:', later, 'started:', started, '_last_scheduled_at:', this._last_scheduled_at);
    }

    const item = this._queue.shift();
    log.debug(new Date, `start run item:`, '_sync_calls:', _sync_calls, 'runs with last interval:', this._runs.length, this.nr_runs(started), this.limit);
    this._nr_running++;
    this._runs.push(+started);
    Promise.resolve(item.callback(...item.args)) // this user code could take time
      .then(item.resolve, item.reject)
      .then(() => { this._nr_running--; if (this.queueLength > 0) this._dequeue(); });

    if (this.queueLength > 0) {
      if (_sync_calls < 500) // the 500 is to give it some chance to run other IO callbacks; if limit is a big number greater than 500
        process.nextTick(this._dequeue.bind(this, _sync_calls+1)); // instead of recursive call could possibly cause stack-exhausted problem
      else // need once in every 500 times call by setImmediate or setTimeout(..., 0) for IO have a chance to process
        setTimeout(this._dequeue.bind(this), 0);
    }
  }

  get runningLength() { return this._nr_running; }
  get queueLength()   { return this._queue.length; }
  get earliest()      { return this._runs[ 0 ]; }
  get latest()        { return this._runs[ this._runs.length-1 ]; }

  nr_runs(value=Date.now()) { this._drop_before(value - this.interval); return this._runs.length; }
  _drop_before(value) {
    if (this._runs.length === 0) return;

    // TODO: because this._runs contains number in ascending order, can be improved to use binary search, from O(n) to O(log(n))
    log.debug(new Date, `clear all values < ${value} current length: ${this._runs.length}`, this.earliest, this.latest);
    // const cnt = this._runs.findIndex(ts => (ts > since));
    // let cnt = 0; while (cnt < this._runs.length && this._runs[cnt] < value) cnt++; if (cnt > 0) this._runs.splice(0, cnt);
    // while (this.earliest < value) this._runs.shift(); return;
    let low = 0 | 0, high = this._runs.length | 0, mid = (low+high) >> 1; // bitmask make these variables as 31bit integer, should be sufficient
    while (low < high) { // make idx stop at first (>= value) or the total length
      if (this._runs[mid] < value) low = Math.min(mid+1, high);
      else                         high = mid;
      mid = (low+high) >> 1;
      if (mid === low) { if (this._runs[mid] < value) mid++; break; }
    }
    if (mid > 0) this._runs.splice(0, mid);
    log.debug(new Date, `after splice all values, current length: ${this._runs.length}`, this.earliest, this.latest);
  }
}

module.exports = RateLimitQueue;

// https://cloud.google.com/bigquery/quotas#apirequests
//  100 requests per second

function colors(data) { console.dir(data, { depth: null, colors: true }); }

async function main() {
  const queue = new RateLimitQueue(10, 1e3); colors(queue);
  for (var i = 0; i < 30; i++) {
    // await waitPromise(1);
    queue.append(
      async (i, arg) => {
        const started = Date.now();
        const [ val ] = await waitPromise(100*i, i);
        // while (Date.now()-started < 100*val);
        console.log(new Date, `got val within the user callback: ${typeof val} ${val}`, arg); // , queue);
      }, i+1, "arg2");
  }

  console.log(new Date, `enqueued for ${i}:`); 
  colors(queue);
  const { runningLength, queueLength, earliest, latest, timeout } = queue; 
  colors({ r: runningLength, q: queueLength, e: new Date(earliest), l: new Date(latest), hastimer: (timeout!=null) });
}

async function waitPromise(timeout, ...values) {
  return new Promise(fulfilled => setTimeout(fulfilled, timeout, values));
}

if (require.main === module) {
  // colors(require); colors(module)
  main()
    .then(null, // colors,
          err => console.error(new Date, 'ERROR:', err))
}
