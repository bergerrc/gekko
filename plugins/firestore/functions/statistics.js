const _ = require('lodash');
const admin = require('firebase-admin');
const StatisticsDoc = '--stats--';
const RangesTable = 'ranges';
const PendingTable = 'pending';
const dateformat = require('dateformat');
const MAX_DIF = 180;
/*var co = require('co');
const functions2 = require('./firestore');//
const settings = {projectId: process.env.GCLOUD_PROJECT,
    keyFilename: process.env.FIRESTORE_KEYFILENAME};
*/
var Statistics = function(){

    if ( !admin.apps || !admin.apps.length )
        admin.initializeApp();
    this.pendingObjects = [];
    this.pendingCount = 0;
    this.attempt = 0;
    this.counter = 0;

    if ( process.env.FUNCTIONS_ENV === 'local') {
        var functions = require('.');
        this.onPendingCreate = functions.onPendingCreate? functions.onPendingCreate.run: undefined;
        this.onPendingDelete = functions.onPendingDelete? functions.onPendingDelete.run: undefined;
        this.onRangeCreate = functions.onRangeCreate? functions.onRangeCreate.run: undefined;
        this.onRangeUpdate = functions.onRangeUpdate? functions.onRangeUpdate.run: undefined;
        this.onRangeDelete = functions.onRangeDelete? functions.onRangeDelete.run: undefined;
        this.onRangesLockCreate = functions.onRangesLockCreate? functions.onRangesLockCreate.run: undefined;
        this.onRangesLockDelete = functions.onRangesLockDelete? functions.onRangesLockDelete.run: undefined;
    }

    /*
    * Convert ref to path and reload through firebase-admin
    */
    const getRef = ( refOrPath )=>{
        var ref = null;
        if ( typeof refOrPath !== 'string' ){
            if ( !refOrPath.parent )
                refOrPath = refOrPath.ref.path;
            else
                refOrPath = refOrPath.path;
        }
        try{
            ref = admin.firestore().doc(refOrPath);
        }catch ( err ){
            ref = admin.firestore().collection(refOrPath);
        }
        return ref;
    }

    /*
    * Convert ref to path and reload through firebase-admin
    */
   const getSnapshot = ( refOrPath )=>{
        var snap = null;
        if ( typeof refOrPath !== 'string' ){
            if ( !refOrPath.parent )
                refOrPath = refOrPath.ref.path;
            else
                refOrPath = refOrPath.path;
        }
        try{
            snap = admin.firestore().doc(refOrPath).get();
        }catch ( err ){
            snap = admin.firestore().collection(refOrPath).get();
        }
        return snap;
    }

    const getStatsTable = ( refOrPath )=>{
        var statTable;
        if ( typeof refOrPath === 'string' ){
            try{
                refOrPath = admin.firestore().doc(refOrPath);
            }catch ( err ){
                refOrPath = admin.firestore().collection(refOrPath);
            }
        }
        if ( refOrPath.parent && refOrPath.parent.doc )
            statTable  = refOrPath.parent.doc(StatisticsDoc);
        else
            statTable  = refOrPath.doc(StatisticsDoc);
        return statTable;
    }

    const getRangesTable = ( refOrPath )=>{
        var rangeTable;
        if ( typeof refOrPath === 'string' ){
            try{
                refOrPath = admin.firestore().doc(refOrPath);
            }catch ( err ){
                refOrPath = admin.firestore().collection(refOrPath);
            }
        }
        if ( refOrPath.id.match('.*candles.*') ){  //Ref is candles table
            rangeTable = refOrPath.doc(StatisticsDoc).collection(RangesTable);
        }else if ( refOrPath.parent && 
                    refOrPath.parent.doc && 
                    refOrPath.parent.doc(StatisticsDoc).exists ){ //Ref is candles doc
            rangeTable = refOrPath.parent.doc(StatisticsDoc).collection(RangesTable);
        }else if ( refOrPath.parent && refOrPath.parent.id == RangesTable ){ //Ref is a range doc
            rangeTable = refOrPath.parent;
        }else if ( refOrPath.id == StatisticsDoc ){  //Ref is Stats Table
            rangeTable = refOrPath.collection(RangesTable);
        }else if ( refOrPath.id == PendingTable ){  //Ref is Pending Table
            rangeTable = refOrPath.parent.collection(RangesTable);
        }else if ( refOrPath.parent && refOrPath.parent.id == PendingTable ){  //Ref parent is Pending table
            rangeTable = refOrPath.parent.parent.collection(RangesTable);
        }else if ( refOrPath.id == RangesTable ){ //Ref is the own Range Table
            rangeTable = refOrPath;
        }else
            throw "RefOrPath are not in the ranges table structure";
        
        return rangeTable;
    }

    const getPendingTable = ( refOrPath )=>{
        var pendingTable;
        if ( typeof refOrPath === 'string' ){
            try{
                refOrPath = admin.firestore().doc(refOrPath);
            }catch ( err ){
                refOrPath = admin.firestore().collection(refOrPath);
            }
        }
        if ( refOrPath.id.match('.*candles.*') ){  //Ref is candles table
            pendingTable = refOrPath.doc(StatisticsDoc).collection(PendingTable);
        }else if ( refOrPath.parent && 
                    refOrPath.parent.doc && 
                    refOrPath.parent.doc(StatisticsDoc).exists ){ //Ref is candles doc
                pendingTable = refOrPath.parent.doc(StatisticsDoc).collection(PendingTable);
        }else if ( refOrPath.parent && refOrPath.parent.id == PendingTable ){ //Ref is a pending doc
            pendingTable = refOrPath.parent;
        }else if ( refOrPath.id == StatisticsDoc ){  //Ref is Stats Table
            pendingTable = refOrPath.collection(refOrPath);
        }else if ( refOrPath.parent && refOrPath.parent.id == RangesTable ){  //Ref is range doc
            pendingTable = refOrPath.parent.parent.collection(PendingTable);
        }else if ( refOrPath.id == PendingTable ){  //Ref is own Pending table
            pendingTable = refOrPath;
        }else
            throw "RefOrPath are not in the pending table structure";
        
        return pendingTable;
    }

    this.count = async ( refOrPath, options )=>{
        var ref = getRef(refOrPath);
        if ( options && options.onlyPhysical ){
            var candles  = await ref.get();
            return candles.size -1; //remove 1 because of --stats--
        }else{
            var statTable = getStatsTable( ref );
            var snap = await statTable.get();
            return snap.exists? snap.data().count: 0;
        }
    }

    this.countPendings = async ( refOrPath, options )=>{
        var ref = getRef(refOrPath);
        var statTable = getStatsTable( ref );
        if ( options && options.onlyPhysical ){
            var pendings  = await statTable.collection(PendingTable).get();
            return pendings.size;
        }else{
            var snap = await statTable.get();
            return snap.exists? snap.data().pendingCount: 0;
        }
    }

    this.countRanges = async ( refOrPath, options )=>{
        var ref = getRef(refOrPath);
        var statTable = getStatsTable( ref );
        var rangeTable = getRangesTable( ref );

        if ( options && options.onlyPhysical ){
            var ranges  = await rangeTable.where("count", ">",0).get();  //filter prevents --lock-- doc
            return ranges.size;
        }else{
            var snap = await statTable.get();
            return snap.isEmpty? 0: snap.data().rangeCount;
        }
    }

    this.countRangeCandles = async function(refOrPath, options){
        var ref = getRef(refOrPath);
        var statTable = getStatsTable( ref );
        var rangeTable = getRangesTable( ref );

        if ( options && options.onlyPhysical ){
            var ranges = await this.query(rangeTable, [{field: "count", op:">",value:0}]); //filter prevents --lock-- doc
            return ranges.docs.reduce( (prev, value)=> {
                value.count = prev.count + value.data().count;
                return value;
              }, { count: 0 }).count;
        }else{
            var snap = await statTable.get();
            return snap.isEmpty? 0: snap.data().rangeCandles;
        }
    }
    
    this.update = async ( refOrPath, increment=1 )=>{
        this.counter +=increment;
        var ref = getRef(refOrPath);
        
        var statTable  = ref.parent.doc(StatisticsDoc);
        if ( increment > 0 ){
            await statTable.update({
                count: admin.firestore.FieldValue.increment(increment)
            }, { merge: true });
            //Create a simple copy of the original document for future group in ranges
            var pendingTable  = statTable.collection(PendingTable);
            var id = parseInt(ref.id);
            var pendingDocRef = pendingTable.doc(id.toString());
            
            var p = pendingDocRef.create({
                refId: id,
                refPath: ref.path,
            }).catch( err => { //ignore duplicates
                return false;
            });
            if ( this.onPendingCreate )
                p.then( async write => {
                    var snap = await pendingDocRef.get();
                    return this.onPendingCreate( snap );
                });
            return p;
        }else if ( increment < 0 && statTable.exists ){
            //decrease count in negative increment
            return statTable.update({
                count: admin.firestore.FieldValue.increment(increment)
            }, { merge: true });
        }
    }

    var tries = 0;
    const canUpdateRanges = (ref)=>{
        var res = false;
        var msg = `tries: ${tries}\tpending: ${this.pendingCount}\tcount: ${this.counter}`;
        if (ref && ref.parent && ref.parent.id == PendingTable){
            ++tries;
            res = parseInt(ref.id)%3600==0; // it's hourly
        }else
            res = this.pendingCount >= 60;

        //console.log(msg + `\tcanUpdate:${res}`);
        return res;
    }

    const canJoinRanges = async (ref)=>{
        var snap = ref.get();
        let count = this.countRanges(ref);
        let candles = this.countRangeCandles(ref);
        var p = await Promise.all([snap, count, candles]);
        snap = p[0];
        count = p[1];
        candles = p[2];
        return !( candles/count > 1440 && count > 1 ) //check if have unless 1 day by ranges in average
    }

    /**
     * 
     * @param {*} fnIter - generation function
     * @param  {...any} args any args to pass to generator function
     */
    var iter = function ( fnIter, ...args ){
       // callback = callback? callback: arg=>arg;
        var iterator = fnIter.bind(this)( args ); 
        var n = iterator.next();
        return n.value;
    }

    var attempt = 0;
    this.movePends2Range = function* (args){
        var ref = args[0];  //PendingTable
        yield (async (ref)=>{
            /*if ( movingPendings ){
                missed++;
                return false;
            }*/
            await(async (ref)=>{
                //Get All pendings
                //console.log(`>>>>>>>>>>>>Get All pendings (${attempt})`);
                //movingPendings = true;
                var snap = await ref.orderBy('refId').get();
                if ( snap.empty ){//|| !canUpdateRanges(ref) ) {
                    //console.log(`<<<<<<<<<<<<<<Get All pendings (${attempt})`);
                    return false;
                }
                var snap2Refs = snap.docs.map(doc=>doc.ref);
                const p1 = deleteAll( snap2Refs ).then(()=>{
                    //console.log(`deleteAll (${attempt})`);
                });
                var p2 = Promise.resolve(true);
                if ( this.onPendingDelete ){
                    p2 = Promise.all(
                        snap.docs.map( async snap => {
                            //var snap = await ref.get();
                            return this.onPendingDelete( snap ); 
                        }))
                        .then(res=>{
                            //console.log(`onPendingDelete (${attempt})`);
                            this.pendingCount -= res.length;
                        });
                }
                const p3 = updateRanges( snap2Refs ).then(()=>{
                    //console.log(`<<<<<<<<<<<<<updateRanges OK (${attempt})`);
                });
                var finallyFn = async function (ref) {
                    //movingPendings = false;
                    attempt++;
                    var lockRef = getRangesTable(ref).doc('--lock--');
                    var lock = await lockRef.get();
                    return lockRef.delete()
                                .then( write => {
                                    if ( this.onRangesLockDelete )
                                        return this.onRangesLockDelete( lock );
                                });
                }.bind(this, ref);
                return Promise.all([p1,p2,p3]).then(finallyFn).catch(finallyFn);
        })(ref)})(ref);
    }

    /**
     * Process pending docs after a minimum count
     * @param {*} lastPendingRefOfPath 
     */
    this.afterPendingCreated = ( refOrPath )=>{
        ++this.pendingCount;
        var ref = getRef(refOrPath);
        if ( canUpdateRanges(ref) ){ 
            var lockRef = getRangesTable(ref).doc('--lock--');
            return lockRef.create({
                        status: 'updating'
                    })
                    .then( async write => {
                        if ( this.onRangesLockCreate ){
                            var snap = await lockRef.get();
                            return this.onRangesLockCreate( snap );
                        }
                    })
                    .catch( err => { //ignore if exist lock
                        return false;
                    });
        }
        return false;
    }

    /**
     * @private
     */
    const deleteAll = (refs)=>{
        if ( !refs.length ) return;
        const batch = refs[0].firestore.batch();
        refs.forEach(ref => {
            batch.delete( ref );
        });
        return batch.commit();
    }

    const updateRanges = async ( pendings )=>{
        var changes = [];
        var ref = pendings[pendings.length-1];
        var rangesRef = ref.parent.parent.collection(RangesTable);

        pendings.reduceRight( (prev, value, idx, arr) =>{
            if ( (prev.min - 60) == parseInt( value.id ) ){
                value.min = parseInt( value.id );
                value.max = prev.max;
                value.count = prev.count + 1;
                arr.splice(idx+1,1); //delete previous
            }else {
                value.min = value.max =parseInt( value.id );
                value.count = 1;
            }
            return value;
        }, { min: parseInt( ref.id )} );

        for( var j=0; j < pendings.length; j++ ){
            const pMin = pendings[j].min;
            const pMax = pendings[j].max;
            var pCount = pendings[j].count;

            var ranges = await rangesRef.orderBy('min').get();
            ranges = ranges.docs? ranges.docs.filter( range =>{
                if ( range.data().max >= (pMax - MAX_DIF) &&
                     range.data().max < pMax )
                    return true; // After the max
                if ( range.data().min <= (pMin + MAX_DIF) &&
                    range.data().min > pMin )
                   return true; // Before the min
                if ( range.data().max >= pMax &&
                   range.data().min <= pMin )
                    return true; //In the middle
                if ( (range.data().max >= pMax && range.data().min > pMin && range.data().min < pMax ) || 
                    (range.data().min <= pMin && range.data().max < pMax && range.data().max > pMin) )
                     return true; //Intersection
                return false;
            }): [];
         
            if ( !ranges.length ){ //If not found, create
                var start = new Date(pMin*1000);
                var rangeId = dateformat(start,'yyyymmddHHMM');
                var rangeData = {
                    min: pMin, 
                    max: pMax, 
                    count: pCount,
                    created: start,
                };
                var docRef = rangesRef.doc(rangeId);
                var promise = docRef.create(rangeData)
                .catch(err=>{    
                    console.log(err.message+ ' detail=> '+ JSON.stringify(rangeData) );
                });
                if ( this.onRangeCreate )
                    promise.then( async write =>{
                        var snap = await docRef.get();
                        return this.onRangeCreate( snap );
                    });
                changes.push(promise);
                continue;
            }
            
            //If exists, check if max is greater than current, and increment
            if ( ranges.length ) {
                var updated = false;
                for( var i=0; i < ranges.length; i++ ){
                    var min = ranges[i].data().min;
                    var max = ranges[i].data().max;
                    var count = ranges[i].data().count;

                    updated = ( max >= pMax && min <= pMin && max > min ); //in the middle
                    if ( (max >= pMax && min > pMin && min < pMax ) || 
                         (min <= pMin && max < pMax && max > pMin) ){ //intersection
                        if (max >= pMax){
                            pCount = pCount - (pMax - min)/60 -1;
                            min = pMin;
                        }else if (min <= pMin ){
                            pCount = pCount - (max - pMin)/60 -1;
                            max = pMax;
                        }
                        updated = true;
                    }
                    if ( max >= (pMax - MAX_DIF) && max < pMax ){ // After the max
                        max = pMax;
                        updated = true;
                    }
                    if ( min <= (pMin + MAX_DIF) && min > pMin ){ // Before the min
                        min = pMin;
                        updated = true;
                    }
                    if ( updated ){
                        var rangeRef = ranges[i].ref;
                        var rangeUpdate = rangeRef.set( {
                            min: min,
                            max: max,
                            count: admin.firestore.FieldValue.increment(pCount),
                            updated: new Date(max*1000)
                        }, {merge: true} );
                        if ( this.onRangeUpdate )
                            rangeUpdate.then( async write => {
                                var change = {
                                    before: ranges[i],
                                    after: await rangeRef.get()
                                };
                                return this.onRangeUpdate( change );
                            });
                        changes.push(rangeUpdate);
                        break;
                    }
                }
                if ( updated )
                    continue;
            }
       } 
       return Promise.all(changes);
    }

    this.afterRangesLocked = async ( snap )=>{
        this.rangesIsLocked = true;
        if ( snap.data && snap.data().status == 'updating' )
            return iter.bind(this)( this.movePends2Range, getPendingTable(snap.ref) ); //make it synchronous
        else if ( snap.data && snap.data().status == 'joining' )
            return this.joinRanges(snap);
    }

    this.afterRangesUnlocked = async ( snap )=>{
        this.rangesIsLocked = false;
        var ref = snap.ref;
        var lockRef = getRangesTable(ref).doc('--lock--');
        if ( canUpdateRanges(ref) ){
            return lockRef.create({
                        status: 'updating'
                    })
                    .then( async write => {
                        if ( this.onRangesLockCreate ){
                            var lock = await lockRef.get();
                            return this.onRangesLockCreate( lock );
                        }
                    })
                    .catch( err => { //ignore if exist lock
                        return false;
                    });
        }else if ( snap.data() && snap.data().status !== 'joining' ){  //Prevents to repeat joining
            return lockRef.create({
                    status: 'joining'
                })
                .then( async write => {
                    if ( this.onRangesLockCreate ){
                        var lock = await lockRef.get();
                        return this.onRangesLockCreate( lock );
                    }
                })
                .catch( err => { //ignore if exist lock
                    return false;
                });
        }
    }

    this.afterRangeCreated = async ( refOrPathOrSnap )=>{
        return this.afterRangeUpdated(refOrPathOrSnap);
    }

    this.afterRangeUpdated = async ( refOrPathOrSnap )=>{
        var snap = typeof refOrPathOrSnap === 'object' ? (refOrPathOrSnap.ref? refOrPathOrSnap:undefined) : undefined;
        //var ref = typeof refOrPathOrSnap === 'string' ? getRef(refOrPathOrSnap): (refOrPathOrSnap.parent?refOrPathOrSnap:refOrPathOrSnap.ref);
        //snap = snap? snap: ref.get();
    }

    this.joinRanges = async ( snap, backward=true )=>{
        var ranges = await snap.ref.parent.orderBy('min').get();
        if ( snap && snap.id != '--lock--' ){
            ranges = ranges.docs? ranges.docs.filter( range =>{
                if ( backward && range.data().max < snap.data().max )
                    return true; // After the max
                else if ( !backward )
                    return true;
                return false;
            }): [];
        }else
            ranges = ranges.docs;

        for( var i=ranges.length-2; i >= 0; i-- ){
            var prevMin = ranges[i+1].data().min;
            var prevMax = ranges[i+1].joined? ranges[i+1]._max: ranges[i+1].data().max;
            var prevCount = ranges[i+1].joined? ranges[i+1]._count + ranges[i+1].data().count: ranges[i+1].data().count;
            var max = ranges[i].data().max;
            var min = ranges[i].data().min;
            var count = ranges[i].data().count;

            if ( ((prevMin - 60) == max ) || //in the sequence
                 ( min <= prevMin && max <= prevMax && max > prevMin ) ||  //intersection
                 ( min <= prevMin && max >= prevMax )){ //in the middle
                ranges[i]._max = prevMax;
                ranges[i]._count = prevCount;
                ranges[i].joined = true;
                ranges[i+1].deleted = true;
                delete ranges[i+1].joined;

                if ( max > prevMin ) //intersection
                    ranges[i]._count -= (max - prevMin)/60 -1;
            }
        }
        var toDelete = ranges.filter( range => range.deleted );
        var toUpdate = ranges.filter( range => range.joined );
        var promises = [Promise.resolve()];
        if (toDelete.length>0){
            if ( this.onRangeDelete )
                for (let i = 0; i < toDelete.length; i++) {
                    promises.push( this.onRangeDelete( toDelete[i] ) );
                }
            toDelete = toDelete.map(doc=>doc.ref);
            promises.push( deleteAll(toDelete) );
        }

        for (let j = 0; j < toUpdate.length; j++) {
            var rangeUpdate = toUpdate[j].ref.set( {
                max: toUpdate[j]._max,
                count: admin.firestore.FieldValue.increment(toUpdate[j]._count),
                updated: new Date(toUpdate[j]._max*1000)
            }, {merge: true} );
            promises.push(rangeUpdate);            
        }

        var finallyFn = async function(ref) {
            var lockRef = getRangesTable(ref).doc('--lock--');
            var lock = await lockRef.get();
            return   lockRef.delete()
                            .then( async write => {
                                if ( this.onRangesLockDelete )
                                    return this.onRangesLockDelete( lock );
                            });
        }.bind(this, snap.ref);
        return Promise.all(promises).then(finallyFn).catch(finallyFn);
    }

    this.reset = async ( refOrPath )=>{
        var ref = getRef(refOrPath);
        var statTable  = ref.doc(StatisticsDoc);
        var rangesRef = statTable.collection(RangesTable);
        var pendingTable  = statTable.collection(PendingTable);
        //delete all ranges
        var ranges = await rangesRef.get();
        ranges.forEach( r => r.ref.delete() );
        //delete all pendings
        var pendings = await pendingTable.get();
        pendings.forEach( r => r.ref.delete() );
        //set zeros
        return statTable.update({
            count: 0,
            pendingCount: 0
        });
    }

    this.countAll = async ( refOrPath )=>{
        var ref = getRef(refOrPath);
        var statTable  = ref.doc(StatisticsDoc);
        var pendingTable  = statTable.collection(PendingTable);

        var items = await ref.orderBy('start').get();
        var pending = await pendingTable.get();
        statTable.update({
            count: items.size,
            pendingCount: pending.size
        }, { merge: true });
                
        return await updateRanges(items.docs);
    }

    this.query = (refOrPath, rangeStartOrConditions, optionsOrCallback, cb) => {
        const options = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback :cb;
        const key = rangeStartOrConditions !== Object(rangeStartOrConditions) ? rangeStartOrConditions : undefined;
        const conditions = Array.isArray(rangeStartOrConditions) ? rangeStartOrConditions : undefined;
        //var keyPrefix = tablePath.split(PATH_SPLIT).pop().split('_').shift();
      
        try{
          if ( refOrPath.id == RangesTable ){
            var table = refOrPath;
          }else {
            const statTable = getStatsTable(refOrPath);
            var table = statTable.collection(RangesTable);
          }
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
}
//exports = Statistics;
exports.Statistics = new Statistics();

async function main(){
    const firestoreUtil = require('./../util');
    const client = admin.firestore();

    var stat = exports.Statistics;
    //var tbName = [firestoreUtil.databasePath(), ['candles', ['usd','btc'].join('_')].join('_')].join(firestoreUtil.PATH_SPLIT)
    
    var ref=client.collection( firestoreUtil.tablePath('candles') );
    var promises = [stat.count(ref,{onlyPhysical:true}),
                    stat.count(ref),
                    stat.countPendings(ref,{onlyPhysical:true}),
                    stat.countPendings(ref),
                    stat.countRanges(ref,{onlyPhysical:true}),
                    stat.countRanges(ref),
                    stat.countRangeCandles(ref,{onlyPhysical:true}),
                    stat.countRangeCandles(ref)];
    var res = await Promise.all(promises);
    console.log(`candles: ${res[0]}/${res[1]}`);
    console.log(`pendings: ${res[2]}/${res[3]}`);
    console.log(`ranges: ${res[4]}/${res[5]}`);
    console.log(`rangeCandles: ${res[6]}/${res[7]}`);

    var ranges = await stat.query(ref);
    /*
    var candlesCount = ranges.docs.reduce( (prev, value, i, arr)=> {
        value.count = prev.count + value.data().count;
        return value;
    }, { count: 0 }).count;
    console.log('candlesCount: '+candlesCount);*/
    ranges.docs.forEach( range =>{
        var mins = range.data().max - range.data().min;
        var candles = mins/60+1;
        var dif = candles - range.data().count;
        console.log(`min: ${range.data().min} max: ${range.data().max} count: ${range.data().count} dif: ${dif}`);
    });
    if ( !ranges.empty )
        //await stat.afterRangeCreated( ranges.docs[ranges.size-1], false ); 
        await stat.joinRanges( ranges.docs[0] );
}

if (require.main === module) {
    main();
}
