const _ = require('lodash');

const util = require('../../core/util.js');
const config = util.getConfig();
const dirs = util.dirs();

const log = require(util.dirs().core + 'log');
const bigqueryUtil = require('./util');
const adapter = config.bigquery;

const {BigQuery} = require('@google-cloud/bigquery');
//const mode = util.gekkoMode();

var Handle = function() {
  _.bindAll(this);
  const projectId = adapter.projectId;
  const datasetId = bigqueryUtil.dataset();
  const tableId = bigqueryUtil.table('candles');
  const schema = bigqueryUtil.schema();
  const options = {schema};
  const preventDuplicatedTS = adapter.preventDuplicatedTS;

  const client = new BigQuery({projectId});

  this.datasets = async function() {
    // Lists all datasets in the specified project
    const [datasets] = await client.getDatasets(projectId);
    return datasets;
  }
  
  this.tables = async function (datasetId) {
    // Lists all tables in the specified project
    //let ds = await client.dataset(datasetId);
    const [tables] = await client.dataset(datasetId).getTables();
    return tables;
  }
  
  // We need to check if the db exists first.
  // This requires connecting to the default
  // bigquery database first. Your bigquery
  // user will need appropriate rights.
  this.checkDataset = async function (datasetId) {
    let ds= await this.datasets();
    return ds.find(dataset => dataset.id==datasetId);
  }
  
  this.checkTable = async function (tableId) {
    let tb = await this.tables(datasetId);
    return tb.find(table => table.id==tableId);
  }

  this.insert = async function(tableId, rows){
    try{
      if ( preventDuplicatedTS && rows.length == 1){
        let res = await this.query(
        `SELECT 1 FROM ${datasetId}.${tableId} WHERE start = ?`,
        {params: [rows[0].start], maxResults: 1});

        if ( res.length > 0 ){
          log.error(`Duplicated timestamp: ${rows[0].start}`);
          return;
        }
      }
      // Inserts a single row into a table
      await client.dataset(datasetId)
                            .table(tableId)
                            .insert(rows.length? rows: rows[0] );

      log.debug(`Inserted rows: ${rows.length}`);
      return rows.length;
    }catch( err ){
        log.error( err.errors? `${err.name}: ${err.errors.length}/${rows.length}`: err.message );
        if ( err.response && err.response.insertErrors )
          err.response.insertErrors.forEach(line => {
            line.errors.forEach(fieldErr => {
              log.error( `Field '${fieldErr.location}': ${fieldErr.message}`);
            });
          });
      throw err;
    }
  }

  /**
   * Creates queries using UNION ALL between them
   * @sql same sentence used for all unions. Inform only the first
   * and method will create others.
   * @params optional. all the possible params used. Limited to 100
   * @returns {Stream}
   * 
   * @example 
   * client.unionAllStream('SELECT x, y FROM `connection.your_dataset.your_table`)
   *   .on('error', console.error)
   *   .on('data', function(row) {
   *    // row is a result from your query.
   *   })
   *   .on('end', function() {
   *   // All rows retrieved.
   *   });
   */
  this.unionAllStream = async function (sql, paramsOrCallback, cb) {
    const params = typeof paramsOrCallback === 'object' ? paramsOrCallback : {};
    const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback :cb;
    // Lists all datasets in the specified project
    let config = { priority: 'BATCH'
    };
    let paramsPerQuery = (sql.match(/\?/g) || []).length;
    if ( paramsPerQuery > 0 ){   
      config.params = params;
      if ( params.length % paramsPerQuery == 0  ){
        if ( paramsPerQuery != params.length ){
          let sqlArr = new Array( params.length / paramsPerQuery );
          sqlArr.fill(sql);
          sql = sqlArr.join(' UNION ALL ');
        }
      }else
        throw 'Number of params in the query are incorrect';
    }
    
    let stream = client.createQueryStream(sql, config);
    if ( callback ){
      stream.on('error', err=> callback(err));
      stream.on('data', data=> callback(null,data));
    }
    return stream;
  }

  this.query = async function (sql, optionsOrCallback, cb) {
    const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback :cb;
  
    options.query = sql;
    const [rows] = await client.query(options, callback);
    return rows;
  }

  this.setup = async function(){
    if ( !this.checkDependencies() )
      return;    

    try{
      let dataset = await this.checkDataset(datasetId);
      if ( !dataset ){
        [dataset] = await client.createDataset(datasetId);
        log.debug(`Dataset ${dataset.id} created`);
      }
      if ( dataset ){
        try{
          log.debug(`bigquery connection is ready, dataset: ${dataset.id}`);
          let table = await this.checkTable(tableId);
          if ( !table ){
            [table] = await dataset.createTable(tableId, options);
            log.debug(`Table ${table.id} created`);  
          }
          if ( table ){
            log.debug(`Table ${table.id} is ready`);
          }
        }catch( err ) {
          util.die(`Can't access or create table ${tableId}. err:`+err);
        };
      }
    }catch(err){
      util.die(`Can't access or create dataset ${datasetId}. err:`+err)
    }
  }

  this.checkDependencies = function(){
    // verify the correct dependencies are installed
    const pluginHelper = require(dirs.core + 'pluginUtil');
    const pluginMock = {
      slug: 'bigquery adapter',
      dependencies: config.bigquery.dependencies
    }

    const cannotLoad = pluginHelper.cannotLoad(pluginMock);
    if(cannotLoad) {
      util.die(cannotLoad);
      return false;
    }
    return true;
  }

  this.setup();
}

module.exports = new Handle();