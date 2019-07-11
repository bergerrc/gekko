const functions = require('firebase-functions');
const admin = require('firebase-admin');
const databasePath = process.env.FIRESTORE_ROOT_COLLECTION? 
                                    process.env.FIRESTORE_ROOT_COLLECTION + '/':'gekko/'; 

if ( !admin.apps || !admin.apps.length )
  admin.initializeApp(functions.config().firebase);

  /**
  * Convert ref to path and reload through firebase-admin
  */
  const getRef = function ( refOrPath ){
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

  const getStats = function (){
    if ( module.parent.exports.stats )
      return module.parent.exports.stats
    else
      return require('./statistics').Statistics;
  }

exports.onTableItemCreate = functions.firestore.document( databasePath + '{exchange}/{table}/{itemId}')
.onCreate((snap, context) =>{
  if ( context && context.params && context.params.itemId !== '--stats--' )
    return getStats().update(snap.ref,1);
  return false;
});

exports.onTableItemDelete = functions.firestore.document( databasePath + '{exchange}/{table}/{itemId}')
.onDelete((snap, context) =>{
  if ( context && context.params && context.params.itemId !== '--stats--' )
    return getStats().update(snap.ref,-1);
  return false;
});

exports.onPendingCreate = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/pending/{pendingId}')
.onCreate( async (snap, context) =>{
  var ref = getRef(snap.ref);
  await ref.parent.parent.update( {pendingCount: admin.firestore.FieldValue.increment(1)},
                            {merge: true});
  return getStats().afterPendingCreated(ref);
});
//
exports.onPendingDelete = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/pending/{pendingId}')
.onDelete((snap, context) =>{
  var ref = getRef(snap.ref);
  return ref.parent.parent.update( {pendingCount: admin.firestore.FieldValue.increment(-1)},
                                  {merge: true});  
});

exports.onRangeCreate = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/ranges/{rangeId}')
.onCreate( async(snap, context) =>{
  var ref = getRef(snap.ref);
  var rangeCandles = await getStats().countRangeCandles(ref,{onlyPhysical:true});
  await ref.parent.parent.update( {rangeCount: admin.firestore.FieldValue.increment(1),
                             rangeCandles: rangeCandles},
                            {merge: true});
  return getStats().afterRangeCreated(snap);
});

exports.onRangeUpdate = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/ranges/{rangeId}')
.onUpdate( async(change, context) =>{
  var ref = getRef(change.after.ref);
  var rangeCandles = await getStats().countRangeCandles(ref,{onlyPhysical:true});
  await ref.parent.parent.update( {rangeCandles: rangeCandles},{merge: true})
  return getStats().afterRangeUpdated(change.after);
});

exports.onRangeDelete = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/ranges/{rangeId}')
.onDelete( (snap, context) =>{
  var ref = getRef(snap.ref);
  //var rangeCandles = await getStats().countRangeCandles(ref,{onlyPhysical:true});
  return ref.parent.parent.update( {rangeCount: admin.firestore.FieldValue.increment(-1)},
                                  {merge: true});  
});

exports.onRangesLockCreate = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/ranges/--lock--')
.onCreate( (snap, context) =>{
  return getStats().afterRangesLocked(snap);
});

exports.onRangesLockDelete = functions.firestore.document( databasePath + '{exchange}/{table}/--stats--/ranges/--lock--')
.onDelete( (snap, context) =>{
  return getStats().afterRangesUnlocked(snap);
});