const _ = require('lodash');
const async = require('async');
const util = require('../../core/util');
const log = require('../../core/log');
const firestoreUtil = require('./util');
var handle = require('./handle');
var dateformat = require('dateformat');

module.exports = async done => {
  let markets = [];
  let rootCollections = [];
  // In single DB setup we don't need to go look into other DBs
  if ( firestoreUtil.useSingleRootCollection() ) 
    rootCollections.push( { path: firestoreUtil.databasePath() } );
  else
    rootCollections = await handle.collections();

  async.each(rootCollections, async (root, next) => {
    let tables = await handle.tables( root.path );
    tables.forEach(table => {
      let parts = table.id.split('_');
      //let first = parts.shift();
      /**
       * If using single database, we need to strip
       * exchange from table name. See here how tables
       * are named:
       *
       * - in single database setup: poloniex/poloniex/candles_usdt_btc
       * - in multi db setup:           gekko/poloniex/candles_usdt_btc
       */
      let exchangeName = _.last(root.path.split(firestoreUtil.PATH_SPLIT));
      markets.push({
        exchange: exchangeName,
        currency: parts[1],
        asset: _.last(parts)
      });
    });
    if ( next ) next();
  },
  // got all tables!
  err => {
    done(err, markets);
  }); 
}

async function main(done = ()=>{}){
  var os = require('os');
  var config = require('../../web/routes/baseConfig');
  var dateRangeScan = require('../../core/workers/dateRangeScan/parent');
  var scan = module.exports;
  scan((err, markets) => {
    //console.log( JSON.stringify( datasets ) );
    if(err)
      throw err;

      let numCPUCores = os.cpus().length;
      if(numCPUCores === undefined)
         numCPUCores = 1;
      async.eachLimit(markets, numCPUCores, (market, next) => {

      let marketConfig = _.clone(config);
      marketConfig.watch = market;

      var rangeScan = require('../../core/tools/dateRangeScanner');
      rangeScan(
        (err, ranges, reader) => {
          reader.close();
          market.ranges = ranges;
          next();
        }
      );

    }, err => {
      let resp = {datasets:[],
                  errors: []};
      markets.forEach(market => {
        if(market.ranges)
          resp.datasets.push(market);
        else
          resp.errors.push(market);
      })
      done(err, resp);
    })
  });

}

if (require.main === module) {
  var done = (err, resp)=>{
    if (err)
      log.error('ERROR:', err, 'details:',resp.errors);
    else
      resp.datasets.forEach(market => {
        market.ranges.forEach( range => {
          log.info('dataset:',[market.exchange, market.currency, market.asset].join('_'), 
            'from:',dateformat(new Date(range.from*1000),'isoUtcDateTime'), 

            'to:',dateformat(new Date(range.to*1000),'isoUtcDateTime'));
        });      
      });
  };
  main(done).then(null,err => done(err) )
}