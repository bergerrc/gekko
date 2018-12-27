var config = {};

config.trader = {
  enabled: false
}

config.watch = {
  exchange: 'bitfinex',
  currency: 'USD',
  asset: 'BTC'
}

config.importer = {
  daterange: {
    // NOTE: these dates are in UTC
    from: "2018-12-03 00:00:00",
    to: "2018-12-12 16:40:00"
  }
}
config.candleWriter = {
  enabled: true
}

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

module.exports = config;
