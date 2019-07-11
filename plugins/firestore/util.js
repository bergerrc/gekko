var config = require('../../core/util').getConfig();
const PATH_SPLIT = '/';
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
 * Set config.firestore.database to use single db setup
 */
function useSingleRootCollection() {
    return !!config.firestore.rootCollection;
}

/**
 * firestore has tables in lowercase if you don't
 * escape their names. Which we don't and so let's
 * just lowercase them.
 */
function useLowerCaseTableNames() {
  return !config.firestore.noLowerCaseTableName;
}

module.exports = {
  PATH_SPLIT: PATH_SPLIT,
  settings: settings,

  // true if we have single db setup (see postrgesql.database config key)
  useSingleRootCollection: useSingleRootCollection,

  // returns DB name (depends on single db setup)
  databasePath: function () {
    var name = [config.firestore.rootCollection? config.firestore.rootCollection: 'gekko', 
                config.watch.exchange
                              .toLowerCase()
                              .replace(/\-/g,'')
               ].join(PATH_SPLIT);
    return name;
  },

  // returns table name which can be different if we use
  // single or multiple db setup.
  tablePath: function (name) {
    var fullName = [this.databasePath(), [name, settings.pair.join('_')].join('_')].join(PATH_SPLIT);
    return useLowerCaseTableNames() ? fullName.toLowerCase() : fullName;
  },

  startconstraint: function (name) {
    if (useSingleRootCollection()) {
      name = watch.exchange.replace(/\-/g,'') + '_' + name;
    }
    var fullName = [name, settings.pair.join('_')].join('_');
    return useLowerCaseTableNames() ? fullName.toLowerCase() + '_start_key' : fullName + '_start_key';
  },

  // firestore schema name. defaults to default_schema
  schema: function () {
    return config.firestore.schema ? config.firestore.schema : default_schema;
  }
}
