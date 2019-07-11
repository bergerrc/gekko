const _ = require('lodash');

const util = require('../../core/util');
const config = util.getConfig();
const dirs = util.dirs();

const log = require(util.dirs().core + 'log');
const firestoreUtil = require('./util');
const adapter = config.firestore;
const TYPE_COLLECTION = "collection";
const TYPE_DOCUMENT = "document";
const PATH_SPLIT = firestoreUtil.PATH_SPLIT;
const {Firestore} = require('@google-cloud/firestore');
//const FirebaseAdmin = require('firebase-admin');

var Handle = function() {
  _.bindAll(this);
  const tablePath = firestoreUtil.tablePath('candles');
  const schema = firestoreUtil.schema();
  const options = {schema};
  const errorOnDuplicate = adapter.errorOnDuplicate;
  const settings = {projectId: adapter.projectId,
                    keyFilename: adapter.keyFilename};
  const client = new Firestore(settings);

  if ( process.env.FUNCTIONS_ENV === 'local') {
    const localFunctions = require('./functions');
    this.onTableItemCreate = localFunctions.onTableItemCreate? localFunctions.onTableItemCreate.run: undefined;
    this.onTableItemDelete = localFunctions.onTableItemDelete? localFunctions.onTableItemDelete.run: undefined;
  }

  var getChildren = function(path, ref){
    var children = [];
    if (!path)
      path = adapter.rootCollection;
    var pathStr = !Array.isArray(path)? path: path.join(PATH_SPLIT);
    var pathArr =  Array.isArray(path)? path: pathStr.split(PATH_SPLIT);

    const type = pathArr.length%2==0? TYPE_DOCUMENT: TYPE_COLLECTION;
    if ( type == TYPE_COLLECTION )
      children = client.collection(pathStr).listDocuments();
    if ( type == TYPE_DOCUMENT )
      children = client.doc(pathStr).listCollections();
    return children;
  }

  this.collections = async function(path) {
    if ( !path )
      return client.listCollections();

    var pathStr = !Array.isArray(path)? path: path.join(PATH_SPLIT);
    var pathArr =  Array.isArray(path)? path: pathStr.split(PATH_SPLIT);
    const type = pathArr.length%2==0? TYPE_DOCUMENT: TYPE_COLLECTION;
    if ( type!=TYPE_DOCUMENT )
      throw `Path informed '${path}' is not valid to get collections`;
    return getChildren(path);
  }

  // We need to check if the db exists first.
  // This requires connecting to the default
  // firestore database first. Your firestore
  // user will need appropriate rights.
  this.collection = function (_collectionPath) {
    if ( !_collectionPath )
      _collectionPath = adapter.rootCollection;
    var pathStr = !Array.isArray(_collectionPath)? _collectionPath: path.join(PATH_SPLIT);
    var pathArr =  Array.isArray(_collectionPath)? _collectionPath: pathStr.split(PATH_SPLIT);
    const type = pathArr.length%2==0? TYPE_DOCUMENT: TYPE_COLLECTION;
    if ( type == TYPE_COLLECTION)
      return client.collection(_collectionPath);
    else
      throw `Path informed '${_collectionPath}' is not a collection`;
  }
  
  this.tables = function (_collectionPath) {
    if ( !_collectionPath )
      _collectionPath = adapter.rootCollection;
    return this.collections(_collectionPath);
  }

  this.table = function (_tablePath) {
    if (!_tablePath)
      _tablePath = tablePath;
    //Tables must be in the third level
    if ( _tablePath.split(PATH_SPLIT).length==3 ){
      var table = this.collection(_tablePath);
      return table;
    }else
      throw `Path informed '${_tablePath}' is not a table`;
  }

  this.insert = async function(tablePath, rows){
    if ( !Array.isArray(rows) )
      rows = [rows];
    //var keyPrefix = tablePath.split(PATH_SPLIT).pop().split('_').shift();
    
    var batch = client.batch();
    const table = this.table(tablePath);
    var insertedRefs =[];
    for ( var i=0; i < rows.length; i++ ){
      if ( i % 500 == 0 ){
        batch.commit();
        batch = client.batch();
      }
      // Inserts a single row into a table
      var docRef = table.doc( rows[i].start.toString() );
      if ( errorOnDuplicate )
        batch.create( docRef, rows[i] );
      else
        batch.set( docRef, rows[i] );
      
      insertedRefs.push( docRef );
    }
    try{
      var res = await batch.commit();
    }catch( err ) {
      log.error( err.errors? `${err.name}: ${err.errors.length}/${rows.length}`: err.message );
      if ( err.response && err.response.insertErrors )
        err.response.insertErrors.forEach(line => {
          line.errors.forEach(fieldErr => {
            log.error( `Field '${fieldErr.location}': ${fieldErr.message}`);
          });
        });
      throw err;
    }
    if ( this.onTableItemCreate ){
      await Promise.all( 
        insertedRefs.map( async ref=> {
          var doc = await ref.get();
          return this.onTableItemCreate(doc, {params:[]});
        })
      );
    }
    return res.length; 
  }

  this.query = async function (tablePath, keyOrConditions, optionsOrCallback, cb) {
    const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback :cb;
    const key = keyOrConditions !== Object(keyOrConditions) ? keyOrConditions : undefined;
    const conditions = Array.isArray(keyOrConditions) ? keyOrConditions : undefined;
    //var keyPrefix = tablePath.split(PATH_SPLIT).pop().split('_').shift();
  
    try{
      var table = this.table(tablePath);
      let response = null;
      if ( key )
        response = table.doc(key.toString()).get();
      else if (conditions){
        conditions.forEach(cond=>{
          table = table.where( cond.field, cond.op, cond.value );
        });
        if ( options.select ){
          table = table.select(options.select);
        }
        if ( options.orderBy ){
          table = table.orderBy(options.orderBy, options.order? options.order: 'asc');
        }
        if ( options.limit ){
          table = table.limit(options.limit);
        }
        response = table.get();
      }else{
        if ( options.select ){
          table = table.select(options.select);
        }
        if ( options.orderBy ){
          table = table.orderBy(options.orderBy, options.order? options.order: 'asc');
        }
        if ( options.limit ){
          table = table.limit(options.limit);
        }
        response = table.get(); //All documents
      }
      if ( callback ){
        var snap = await response;
        callback(null, snap.docs.map(doc=>doc.data()));
      }
      return response;
    }catch(err){
      if ( callback )
        callback(err);
      else
        throw err;
    }
  }

  this.delete = async function(tablePath, rows){
    if ( !Array.isArray(rows) )
      rows = [rows];
    //var keyPrefix = tablePath.split(PATH_SPLIT).pop().split('_').shift();
    
    const table = this.table(tablePath);
    var p = Promise.resolve();
    for ( var j=0; j < rows.length/10; j++ ){
      var batch = client.batch();
      var deletedRefs = [];
      for ( var i=0; i < rows.length; i++ ){
        // Inserts a single row into a table
        var docRef = table.doc( rows[i].start.toString() );
        batch.delete( docRef, rows[i] );
        deletedRefs.push( docRef );
      }
      p = p.then(()=> batch.commit());
    }
    return p.then( (res)=> {
            if ( this.onTableItemDelete ){
              deletedRefs.map( async ref=> {
                var doc = await ref.get();
                this.onTableItemDelete(doc, {params:[]});
              });
            }
            return res.length; 
          })
          .catch( err=> {
            throw 'error on deleting row ' + err.message;
          });
  }

  this.setup = async function(){
    if ( !this.checkDependencies() )
      return;    

    try{
      let _collection = this.collection();
      log.debug(`firestore connection is ready, collection: ${_collection.id}`);

      try{
        let table = this.table();
        log.debug(`Table ${table.id} is ready`);
      }catch( err ) {
        util.die(`Can't access or create table ${tablePath}. err:`+err);
      };
    }catch(err){
      util.die(`Can't access or create collection ${collectionPath}. err:`+err)
    }
  }

  this.checkDependencies = function(){
    // verify the correct dependencies are installed
    const pluginHelper = require(dirs.core + 'pluginUtil');
    const pluginMock = {
      slug: 'firestore adapter',
      dependencies: adapter.dependencies
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

async function main(attempt){
  var fire = module.exports;
  var batches = [];
  var startBefore = Math.round(Date.now()/1000-1,0);
  var start = 1560125700 + attempt*60; //Math.round(Date.now()/60000,0)*60 + attempt*60; 
  var n = await fire.insert(firestoreUtil.tablePath('candles'),[{start: start }]);
  //var tbName = [firestoreUtil.databasePath(), ['candles', ['usd','btc'].join('_')].join('_')].join(PATH_SPLIT)
  //n = fire.insert(tbName,[{start: start+900 }]);
  //console.log(n);
  //[{field: 'start', op: ">",value: 1557609929}]
  return fire.query(firestoreUtil.tablePath('candles'),start);
}

if (require.main === module) {
  var counter = 0;
  //stats.reset();
  var exec = async (attempt) =>{
    try{
      var res = await main(attempt);
      if ( res && res.docs ){
        res.docs.forEach( i=>{
          console.log ( JSON.stringify( i.data() ) );
        })
      }else{
        console.log ( JSON.stringify((res && res.data)? res.data(): res ) );
      }
      //console.log('c:'+ ++counter);
    }catch(err){
      //do nothing
    }
  }
  var retry = function(retries, attempts=1){
    if ( attempts > retries ) return;
    exec(attempts);
    console.log('i:'+attempts);
    var timeout = setTimeout( retry, 1000, retries, ++attempts);
  }
  retry(60);
  setTimeout( retry, 90000, 60 );
  //stats.reset(firestoreUtil.tablePath('candles'));
}
