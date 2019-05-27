// Everything is explained here:
// @link https://gekko.wizb.it/docs/commandline/plugins.html
const _ = require('lodash');
const vm = require('vm');
const v8debug = vm.runInDebugContext('Debug');
const util = require(process.cwd() + '/core/util');
const dateformat = require('dateformat');
const fs = require('fs');
const toml = require('toml');
const dirs = util.dirs();

var config = {};
var base = require(dirs.web + 'baseUIconfig');
_.merge(config, base);

const getTOML = function(fileName) {
  var raw = fs.readFileSync(fileName);
  return toml.parse(raw);
}
let configBuilder = require(dirs.tools + "configBuilder")(); 
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                          GENERAL SETTINGS
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var debug = typeof v8debug === 'object';
config.debug = debug || process.env.NODE_ENV!== 'production'?true:false; // for additional logging / debugging

//Override defaults with .ENV
config.headless = process.env.HEADLESS? process.env.HEADLESS: config.headless;
config.api.host = process.env.API_HOST? process.env.API_HOST: config.api.host;
config.api.port = process.env.PORT? parseInt(process.env.PORT): config.api.port;
config.api.timeout = process.env.API_TIMEOUT? parseInt(process.env.API_TIMEOUT): config.api.timeout;

config.ui.ssl = process.env.HOST_SSL? process.env.HOST_SSL: config.ui.ssl;
config.ui.host = process.env.HOST? process.env.HOST: config.ui.host;
config.ui.port = process.env.PORT? parseInt(process.env.PORT): config.ui.port;
config.ui.path = process.env.UI_PATH? process.env.UI_PATH: config.ui.path;

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                       CONFIGURING ADAPTER
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
config.candleWriter = {
  enabled: process.env.READONLY?false:true
}

config.adapter = process.env.ADAPTER? process.env.ADAPTER: config.adapter;

config.firestore = {
  path: 'plugins/firestore',
  version: 0.1,
  projectId: process.env.GCLOUD_PROJECT,
  rootCollection: process.env.FIRESTORE_ROOT_COLLECTION,
  keyFilename: process.env.FIRESTORE_KEYFILENAME? process.env.FIRESTORE_KEYFILENAME: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  //errorOnDuplicate: true,
  dependencies: [{
    module: "@google-cloud/firestore",
    version: "3.0.0"
  }],
  ratelimit: process.env.BIGQUERY_RATELIMIT? parseInt(process.env.BIGQUERY_RATELIMIT): 20
}


config.bigquery = {
  path: 'plugins/bigquery',
  version: 0.1,
  projectId: process.env.GCLOUD_PROJECT,
  datasetId: process.env.BIGQUERY_DATASET_ID,
  keyFilename: process.env.BIGQUERY_KEYFILENAME? process.env.BIGQUERY_KEYFILENAME: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  //preventDuplicatedTS: true,
  dependencies: [{
    module: "@google-cloud/bigquery",
    version: "3.0.0"
  }],
  ratelimit: process.env.BIGQUERY_RATELIMIT? parseInt(process.env.BIGQUERY_RATELIMIT): 20
}

config.sqlite = {
  path: 'plugins/sqlite',
  version: 0.1,
  dataDirectory: 'history',
  journalMode: require(dirs.web + 'isWindows.js') ? 'PERSIST' : 'WAL',
  dependencies: [{
    module: 'sqlite3',
    version: '3.1.4'
  }]
}

config.postgresql = {
  path: 'plugins/postgresql',
  version: 0.1,
  connectionString: process.env.POSTGRESQL_CONNECTION, 
  database: process.env.POSTGRESQL_DATABASE, 
  schema: 'public',
  dependencies: [{
    module: 'pg',
    version: '7.4.3'
  }]
}

// Mongodb adapter, requires mongodb >= 3.3 (no version earlier tested)
config.mongodb = {
  path: 'plugins/mongodb',
  version: 0.1,
  connectionString: process.env.MONGODB_CONNECTION, //'mongodb://mongodb/gekko', // connection to mongodb server
  dependencies: [{
    module: 'mongojs',
    version: '2.4.0'
  }]
}

if ( !process.env.WATCH_EXCHANGE ){
  let generalConfig = {};
  generalConfig.watch = configBuilder.watch;
  _.merge(config, generalConfig );
}
config.watch = {
  // see https://gekko.wizb.it/docs/introduction/supported_exchanges.html
  exchange: process.env.WATCH_EXCHANGE? process.env.WATCH_EXCHANGE: config.watch.exchange, //'bitfinex',
  currency: process.env.WATCH_CURRENCY? process.env.WATCH_CURRENCY: config.watch.currency, //'USD',
  asset: process.env.WATCH_ASSET? process.env.WATCH_ASSET: config.watch.asset //'BTC'
}
config.tradingAdvisor = {
  enabled: true,
  method: process.env.STRATEGY? process.env.STRATEGY: config.tradingAdvisor.method, //'BollingerBands_SMA3',
  candleSize: 5,
  historySize: 200
}

//Load strategy parameters from config dir
if ( process.env.STRATEGY ){
  let stratConfig = {};
  stratConfig[process.env.STRATEGY] = getTOML(dirs.config + 'strategies/' + process.env.STRATEGY + '.toml');
  
  _.merge(config, stratConfig );
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                       CONFIGURING TRADING ADVICE
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
config.backtestResultExporter = {
  enabled: false,
  writeToDisk: false,
  data: {
    stratUpdates: false,
    portfolioValues: true,
    stratCandles: false,
    roundtrips: true,
    trades: false
  }
}

var now = new Date();
var yesterday = new Date(Date.now()-3600*24*1000);

config.backtest = {
  //  daterange: 'scan',
   daterange: {
     from: process.env.BACKTEST_FROM? process.env.BACKTEST_FROM: dateformat(yesterday,'yyyy-mm-dd HH:MM:ss'), //"2019-04-01 00:00:00",
     to: process.env.BACKTEST_TO? process.env.BACKTEST_TO: dateformat(now,'yyyy-mm-dd HH:MM:ss') //"2019-04-20 00:00:00"
  },
    batchSize: 50
  }

  config.importer = {
    daterange: {
      // NOTE: these dates are in UTC
     from: process.env.IMPORT_FROM? process.env.IMPORT_FROM: dateformat(yesterday,'yyyy-mm-dd HH:MM:ss'), //"2019-04-22 00:00:00",
     to: process.env.IMPORT_TO? process.env.IMPORT_TO: dateformat(now,'yyyy-mm-dd HH:MM:ss')//"2019-04-25 00:00:00"
    }
  }
// settings for other strategies can be found at the bottom, note that only
// one strategy is active per gekko, the other settings are ignored.

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                       CONFIGURING PLUGINS
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// do you want Gekko to simulate the profit of the strategy's own advice?
config.paperTrader = {
  enabled: true,
  // report the profit in the currency or the asset?
  reportInCurrency: true,
  // start balance, on what the current balance is compared with
  simulationBalance: {
    // these are in the unit types configured in the watcher.
    asset: 0,
    currency: 1000,
  },
  // how much fee in % does each trade cost?
  feeMaker: 0.1,
  feeTaker: 0.1,
  feeUsing: 'maker',
  // how much slippage/spread should Gekko assume per trade?
  slippage: 0.05,
}

config.performanceAnalyzer = {
  enabled: true,
  riskFreeReturn: 5
}

config.eventLogger = {
  enabled: false,
  // optionally pass a whitelist of events to log, if not past
  // the eventLogger will log _all_ events.
  // whitelist: ['portfolioChange', 'portfolioValueChange']
}

config.telegrambot = {
  enabled: process.env.TELEGRAM_TOKEN?true:false,
  // Receive notifications for trades and warnings/errors related to trading
  emitTrades: true,
  emitPerformance: true,
  token: process.env.TELEGRAM_TOKEN,
  botName: process.env.TELEGRAM_BOTNAME
};
=======
/*config.telegrambot = {
  enabled: true,
  // Receive notifications for trades and warnings/errors related to trading
  emitTrades: true,
  emitPerformance: true,
  token: 'token',
  botName: 'botname'
};*/
>>>>>>> d38c2759c898f5e1c357fc35b2e4e3cbb44c0f8a

// Want Gekko to perform real trades on buy or sell advice?
// Enabling this will activate trades for the market being
// watched by `config.watch`.
config.trader = {
  enabled: process.env.TRADER_KEY?true:false,
  key: process.env.TRADER_KEY,
  secret: process.env.TRADER_SECRET,
  username: '', // your username, only required for specific exchanges.
  passphrase: '', // GDAX, requires a passphrase.
}

config['I understand that Gekko only automates MY OWN trading strategies'] = process.env.TRADER_KEY?true:false;

module.exports = config;

/*
if(typeof window !== 'undefined')
  window.CONFIG = config;
*/
if (require && require.main === module) {
  var filename = __filename.split('.').slice(0, -1).join('.') +'-ui.js';
  const jsPre  = "const CONFIG = ";
  const jsPost = ";\r\nif(typeof window === 'undefined') \
  module.exports = CONFIG; \
else \
  window.CONFIG = CONFIG;";
  fs.writeFileSync(filename, jsPre + JSON.stringify(config) + jsPost);
  console.log( filename );
}