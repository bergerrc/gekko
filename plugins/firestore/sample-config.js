const vm = require('vm');
const v8debug = vm.runInDebugContext('Debug');

var config = {};
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//                          GENERAL SETTINGS
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var debug = typeof v8debug === 'object';
config.debug = debug || process.env.NODE_ENV!== 'production'?true:false; // for additional logging / debugging

config.watch = {
  // see https://gekko.wizb.it/docs/introduction/supported_exchanges.html
  exchange: process.env.WATCH_EXCHANGE? process.env.WATCH_EXCHANGE: 'bitfinex', 
  currency: process.env.WATCH_CURRENCY? process.env.WATCH_CURRENCY: 'USD',
  asset: process.env.WATCH_ASSET? process.env.WATCH_ASSET: 'BTC'
}

config.adapter = 'firestore';

//Prepend credentials informed in .env file only for test run
process.env.FIRESTORE_KEYFILENAME = process.env.FIRESTORE_KEYFILENAME? '../../'+process.env.FIRESTORE_KEYFILENAME: '../../'+process.env.GOOGLE_APPLICATION_CREDENTIALS;
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.FIRESTORE_KEYFILENAME;

config.firestore = {
  path: 'plugins/firestore',
  version: 0.1,
  projectId: process.env.GCLOUD_PROJECT,
  rootCollection: process.env.FIRESTORE_ROOT_COLLECTION? process.env.FIRESTORE_ROOT_COLLECTION: 'gekko',
  keyFilename: process.env.FIRESTORE_KEYFILENAME? process.env.FIRESTORE_KEYFILENAME: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  //errorOnDuplicate: true,
  dependencies: [
  /*{module: "./plugins/firestore/@google-cloud/firestore",
                  version: "1.3.0"
  }*/
  ],
  ratelimit: process.env.FIRESTORE_RATELIMIT? parseInt(process.env.FIRESTORE_RATELIMIT): 100
}

config.candleWriter = {
  enabled: process.env.READONLY?false:true
}

module.exports = config;