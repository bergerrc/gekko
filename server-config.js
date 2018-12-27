// Everything is explained here:
// @link https://gekko.wizb.it/docs/commandline/plugins.html
const _ = require('lodash');

var config = {};
var base = require('./web/routes/baseConfig');
//var UIconfig = require('./web/vue/dist/UIconfig');

_.merge(config, base);
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                          GENERAL SETTINGS
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

//config.debug = true; // for additional logging / debugging
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                       CONFIGURING ADAPTER
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
config.candleWriter = {
  enabled: true
}
// configurable in the UIconfig
//config.adapter = UIconfig.adapter;
config.adapter = 'sqlite';

config.sqlite = {
  path: 'plugins/sqlite',
  version: 0.1,
  dataDirectory: 'history',
  journalMode: require('./web/isWindows.js') ? 'PERSIST' : 'WAL',
  dependencies: [{
    module: 'sqlite3',
    version: '3.1.4'
  }]
}

// Postgres adapter example config (please note: requires postgres >= 9.5):
config.postgresql = {
  path: 'plugins/postgresql',
  version: 0.1,
  connectionString: 'postgres://user:pass@localhost:5432', // if default port
  database: 'gekko', // if set, we'll put all tables into a single database.
  schema: 'public',
  dependencies: [{
    module: 'pg',
    version: '7.4.3'
  }]
}

config.watch = {
  // see https://gekko.wizb.it/docs/introduction/supported_exchanges.html
  exchange: 'bitfinex',
  currency: 'USD',
  asset: 'BTC'
}
config.tradingAdvisor = {
  enabled: true,
  method: 'BollingerBands_SMA3',
  candleSize: 30,
  historySize: 200
}

config.BollingerBands_SMA3 = {
  SMA_long: 200,
  SMA_short: 50,
  trailingStopLossPct: 0.1,
  minProfit: 0.02,
  candles: [5,15,30,45,60,90,120,240,480],
  bbands: {
    TimePeriod: 20,
    NbDevUp: 2,
    NbDevDn: 2
  }
};

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                       CONFIGURING TRADING ADVICE
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
config.backtestResultExporter = {
  enabled: true,
  writeToDisk: false,
  data: {
    stratUpdates: false,
    portfolioValues: true,
    stratCandles: false,
    roundtrips: true,
    trades: false
  }
}
config.backtest = {
  //  daterange: 'scan',
   daterange: {
     from: "2018-12-05 00:00:00",
     to: "2018-12-27 13:00:00"
  },
    batchSize: 50
  }

  config.importer = {
    daterange: {
      // NOTE: these dates are in UTC
     from: "2018-12-26 16:40:00",
     to: "2018-12-27 13:00:00"
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
  enabled: true,
  // Receive notifications for trades and warnings/errors related to trading
  emitTrades: true,
  emitPerformance: true,
  token: '725925143:AAGX6Qhpf0x1TrrwUPYEdau1eJlsK_w03ZY',
  botName: 'gekko1_bot'
};

module.exports = config;
