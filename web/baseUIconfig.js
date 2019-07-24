// Note: this file gets copied around, make sure you edit
// the UIconfig located at `gekko/web/vue/dist/UIconfig.js`.

// This config is used by both the frontend as well as the web server.
// see https://gekko.wizb.it/docs/installation/installing_gekko_on_a_server.html#Configuring-Gekko

const CONFIG = {
  headless: false,
  api: {
    host: '127.0.0.1',
    port: 3000,
    timeout: 120000 // 2 minutes
  },
  ui: {
    ssl: false,
    host: 'localhost',
    port: 3000,
    path: '/'
  },
  adapter: 'sqlite'
}
//Override defaults with environment variables
CONFIG.headless = process.env.HEADLESS? process.env.HEADLESS: CONFIG.headless;
CONFIG.api.host = process.env.API_HOST? process.env.API_HOST: CONFIG.api.host;
CONFIG.api.port = process.env.API_PORT? parseInt(process.env.API_PORT): CONFIG.api.port;
CONFIG.api.timeout = process.env.API_TIMEOUT? parseInt(process.env.API_TIMEOUT): CONFIG.api.timeout;

CONFIG.ui.ssl = process.env.HOST_SSL? process.env.HOST_SSL: CONFIG.ui.ssl;
CONFIG.ui.host = process.env.HOST? process.env.HOST: CONFIG.ui.host;
CONFIG.ui.port = process.env.PORT? parseInt(process.env.PORT): CONFIG.ui.port;
CONFIG.ui.path = process.env.UI_PATH? process.env.UI_PATH: CONFIG.ui.path;

CONFIG.adapter = process.env.ADAPTER? process.env.ADAPTER: CONFIG.adapter;

if(typeof window === 'undefined')
  module.exports = CONFIG;
else
  window.CONFIG = CONFIG;

//When called directly (standalone) it is copied in to the destination informed as argument 
if (require && require.main === module) {
  const fs = require('fs');
  var filename = __filename.split('.').slice(0, -1).join('.') +'-ui.js';
  if ( process.argv.length > 0 ){
    var program = require('commander');
    program.option('--copy <file>', 'Copy to file destination').parse(process.argv);
    if ( program.copy ){
      filename = program.copy;
      console.log(`Copying to ${filename}`);
    }else
      console.log(`File destination not informed, copying default to ${filename}`);
  }
  const jsPre  = "const CONFIG = ";
  const jsPost = ";\r\nif(typeof window === 'undefined') \
  module.exports = CONFIG; \
else \
  window.CONFIG = CONFIG;";
  fs.writeFileSync(filename, jsPre + JSON.stringify(CONFIG) + jsPost);
}