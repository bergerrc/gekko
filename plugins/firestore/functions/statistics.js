const _ = require('lodash');
const {Firestore} = require('@google-cloud/firestore');
const StatisticsDoc = '--stats--';
const RangesTable = 'ranges';
const PendingTable = 'pending';
const dateformat = require('dateformat');
const settings = {projectId: process.env.GCLOUD_PROJECT,
                keyFilename: process.env.FIRESTORE_KEYFILENAME};

var Statistics = function (attachEventPath,db){
    const MAX_DIF = 180;
    var pendingObjects = [];

    this.getStatsTable = function( refOrPath ){
        var statTable;
        if ( typeof refOrPath === 'string' ){
            try{
                refOrPath = new Firestore(settings).doc(refOrPath);
            }catch ( err ){
                refOrPath = new Firestore(settings).collection(refOrPath);
            }
        }
        if ( refOrPath.parent.doc )
            statTable  = refOrPath.parent.doc(StatisticsDoc);
        else
            statTable  = refOrPath.doc(StatisticsDoc);
        return statTable;
    }

    this.count = async function( ref ){
        var statTable = this.getStatsTable( ref );
        var snap = await statTable.get();
        return snap.data().count;
    }
    
    this.update = async function( ref, increment=1 ){
        if ( !ref.parent )//
            ref = ref.ref;
        var statTable  = ref.parent.doc(StatisticsDoc);
        var pendingTable  = statTable.collection(PendingTable);
        if ( increment > 0 ){
            try{
                var id = parseInt(ref.id);
                pendingTable.doc(id.toString()).create({
                    refId: id,
                    refPath: ref.path,
                })
                .catch(err=> false) //ignore duplicates
                .then( res => res?
                    statTable.update({
                        //count: Firestore.FieldValue.increment(increment),
                        pendingCount: Firestore.FieldValue.increment(increment)
                    }, { merge: true })
                    :false
                );
            }catch(err){
                throw `Can't create pending document: ${ref.id}`; 
            }

            await statTable.collection(PendingTable).orderBy('refId').get().then(async snap=>{
                if ( !snap.empty )
                    pendingObjects = _.uniqWith( pendingObjects.concat( snap.docs ), (a,b)=> a.id==b.id);
                if ( pendingObjects.length ){
                    console.log(pendingObjects.length);
                    var last = parseInt( pendingObjects[pendingObjects.length-1].id );
                    if ( last % 100 == 0 ){
                        await deleteAllPending( pendingObjects );
                        updateRanges(statTable.collection(RangesTable), pendingObjects);                    
                        pendingObjects = [];
                    }
                }
            });
        }else{

        }
    }

    var deleteAllPending = async function(docs){
        const statTable = docs[0].ref.parent.parent;
        const batch = docs[0].ref.firestore.batch();
        docs.forEach(doc => {
            batch.delete( doc.ref );
            batch.update( statTable, {pendingCount: Firestore.FieldValue.increment(-1)}, {merge: true});
        });
        try{
            var res = await batch.commit();
            /*
            statTable.update({
                pendingCount: Firestore.FieldValue.increment(res.length * -1)
            }, { merge: true }); */
        }catch(err){
            console.log(err.message);
        }
    }

    var updateRanges = async function( rangesRef, pendings, increment=1 ){

        for( var j=0; j < pendings.length; j++ ){
            var refValue = parseInt( pendings[j].id );

            var ranges = await rangesRef.orderBy('min').get();
            ranges = ranges.docs? ranges.docs.filter( range =>{
                if ( range.data().max >= (refValue - MAX_DIF) &&
                     range.data().max < refValue )
                    return true; // After the max
                if ( range.data().min <= (refValue + MAX_DIF) &&
                    range.data().min > refValue )
                   return true; // Before the min
                if ( range.data().max >= refValue &&
                   range.data().min <= refValue )
                    return true; //In the middle
                if ( range.data().max >= refValue &&
                    range.data().min <= refValue )
                     return true; //In the middle
                 
                return false;
            }): [];
            /*
            var parallel = await Promise.all([
                rangesRef.where( 'max', '>=', refValue - MAX_DIF )
                        .where( 'max', '<=', refValue )
                        //.where( 'ranges_idx_minmax', '>=', refValue )
                        .orderBy('max').get(),
                rangesRef.where( 'min', '<=', refValue + MAX_DIF )
                        .where( 'min', '>', refValue  )
                        .orderBy('min').get()
            ]);*/
            //var ranges = _.uniqWith( parallel[0].concat( parallel[1] ), (a,b)=> a.id==b.id);            
            if ( !ranges.length ){ //If not found, create
                try{
                    var start = new Date(refValue*1000);
                    var rangeId = dateformat(start,'yyyymmddHHMM');
        
                    await rangesRef.doc(rangeId).create( {
                        min: refValue, 
                        max: refValue, 
                        count: 1,
                        created: new Date(refValue*1000),
                    } );
                    //console.log( `range: ${refValue}` );
                }catch(err){
                    continue;
                }
            }
            
            //If exists, check if max is greater than current, and increment
            if ( ranges.length ) {
                var min = ranges[0].data().min;
                var max = ranges[0].data().max;
                var count = ranges[0].data().count;
                if ( max >= refValue && min <= refValue ){ //in the middle
                    var merge = false;
                    for( var i=1; i < ranges.length; i++ ){
                        if ( ranges[i].data().max >= (refValue - MAX_DIF) ){
                            max = ranges[i].data().max;
                            increment = ranges[i].data().count;
                            await rangesRef.doc(ranges[i].id).delete();
                            merge = true;
                        }
                        if ( ranges[i].data().min <= (refValue + MAX_DIF) ){
                            max = ranges[i].data().max;
                            increment = ranges[i].data().count;
                            await rangesRef.doc(ranges[i].id).delete();
                            merge = true;
                        }
                    }
                    if ( !merge )
                        continue;
                }

                if ( max >= (refValue - MAX_DIF) && max < refValue ){ // After the max
                    max = refValue;
                    for( var i=1; i < ranges.length; i++ ){
                        max = ranges[i].data().max;
                        increment += ranges[i].data().count;
                        //Delete next range after merge
                        await rangesRef.doc(ranges[i].id).delete();
                    }    
                }
                if ( min <= (refValue + MAX_DIF) && min > refValue ){ // Before the min
                    min = refValue;
                    for( var i=1; i < ranges.length; i++ ){
                        max = ranges[i].data().max;
                        increment += ranges[i].data().count;
                        //Delete next range after merge
                        await rangesRef.doc(ranges[i].id).delete();
                    }
                }
                ranges[0].ref.set( {
                    min: min,
                    max: max,
                    count: Firestore.FieldValue.increment(increment),
                    updated: new Date(max*1000)
                }, {merge: true} );
            }
       }        
    }

    this.reset = async function( refCollection ){
        var statTable  = refCollection.doc(StatisticsDoc);
        var rangesRef = statTable.collection(RangesTable);
        var pendingTable  = statTable.collection(PendingTable);
        //delete all ranges
        var ranges = await rangesRef.get();
        ranges.forEach( r => r.ref.delete() );
        //delete all pendings
        var pendings = await pendingTable.get();
        pendings.forEach( r => r.ref.delete() );
        //set zeros
        statTable.update({
            count: 0,
            pendingCount: 0
        });
    }

    this.countAll = async function(refCollection){
        var statTable  = refCollection.doc(StatisticsDoc);
        var pendingTable  = statTable.collection(PendingTable);

        var items = await refCollection.orderBy('start').get();
        var pending = await pendingTable.get();
        statTable.update({
            count: items.size,
            pendingCount: pending.size
        }, { merge: true });
                
        await updateRanges(statTable.collection(RangesTable), items.docs);
    }

    this.query = async function (refOrPath, rangeStartOrConditions, optionsOrCallback, cb) {
        const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback :cb;
        const key = rangeStartOrConditions !== Object(rangeStartOrConditions) ? rangeStartOrConditions : undefined;
        const conditions = Array.isArray(rangeStartOrConditions) ? rangeStartOrConditions : undefined;
        //var keyPrefix = tablePath.split(PATH_SPLIT).pop().split('_').shift();
      
        try{
          const statTable = this.getStatsTable(refOrPath);
          var table = statTable.collection(RangesTable);
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
          if ( callback )
            callback(null, response.docs);
          return response;
        }catch(err){
          if ( callback )
            callback(err);
          else
            throw err;
        }
    }
    

    if ( attachEventPath && db )
        db.collection(pathStr).onSnapshot(this.update);
}

module.exports = new Statistics();

async function main(){
    const firestoreUtil = require('./../util');
    const settings = {projectId: process.env.GCLOUD_PROJECT,
                      keyFilename: process.env.FIRESTORE_KEYFILENAME};
    const client = new Firestore(settings);

    var stat = module.exports;
    //var tbName = [firestoreUtil.databasePath(), ['candles', ['usd','btc'].join('_')].join('_')].join(firestoreUtil.PATH_SPLIT)
  
    var ref=client.collection( firestoreUtil.tablePath('candles') );
    await stat.reset(ref);
    stat.countAll(ref);
}

if (require.main === module) {
    main();
}