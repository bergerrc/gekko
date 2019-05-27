var config = require('../../core/util.js').getConfig();
const default_schema = [
  {
    name: "start",
    type: "INTEGER",
    mode: "REQUIRED"
  },
  {
    name: "open",
    type: "NUMERIC",
    mode: "REQUIRED"
  },
  {
    name: "high",
    type: "NUMERIC",
    mode: "REQUIRED"
  },
  {
    name: "low",
    type: "NUMERIC",
    mode: "REQUIRED"
  },
  {
    name: "close",
    type: "NUMERIC",
    mode: "REQUIRED"
  },
  {
    name: "vwp",
    type: "NUMERIC",
    mode: "REQUIRED"
  },
  {
    name: "volume",
    type: "NUMERIC",
    mode: "REQUIRED"
  },
  {
    name: "trades",
    type: "INTEGER",
    mode: "REQUIRED"
  }
];
var watch = config.watch;
if(watch) {
  var settings = {
    exchange: watch.exchange,
    pair: [watch.currency, watch.asset]
  }
}

/**
 * Returns true if we use single database where
 * all our tables are stored. The default is to store
 * every exchange into it's own db.
 *
 * Set config.bigquery.database to use single db setup
 */
function useSingleDatabase() {
    return !!config.bigquery.datasetId;
}

/**
 * bigquery has tables in lowercase if you don't
 * escape their names. Which we don't and so let's
 * just lowercase them.
 */
function useLowerCaseTableNames() {
  return !config.bigquery.noLowerCaseTableName;
}

module.exports = {
  settings: settings,

  // true if we have single db setup (see postrgesql.database config key)
  useSingleDatabase: useSingleDatabase,

  // returns DB name (depends on single db setup)
  dataset: function () {
    return useSingleDatabase() ?
      config.bigquery.datasetId :
      config.watch.exchange.toLowerCase().replace(/\-/g,'');
  },

  // returns table name which can be different if we use
  // single or multiple db setup.
  table: function (name) {
    if (useSingleDatabase()) {
      name = watch.exchange.replace(/\-/g,'') + '_' + name;
    }
    var fullName = [name, settings.pair.join('_')].join('_');
    return useLowerCaseTableNames() ? fullName.toLowerCase() : fullName;
  },

  startconstraint: function (name) {
    if (useSingleDatabase()) {
      name = watch.exchange.replace(/\-/g,'') + '_' + name;
    }
    var fullName = [name, settings.pair.join('_')].join('_');
    return useLowerCaseTableNames() ? fullName.toLowerCase() + '_start_key' : fullName + '_start_key';
  },

  // bigquery schema name. defaults to default_schema
  schema: function () {
    return config.bigquery.schema ? config.bigquery.schema : default_schema;
  }
}
