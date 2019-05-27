const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const databasePath = process.env.FIRESTORE_ROOT_COLLECTION? process.env.FIRESTORE_ROOT_COLLECTION + '/':'gekko/'; 

exports.onTableItemCreate = functions.firestore.document( databasePath + '{exchange}/{table}/{itemId}')
  .onCreate((snap, context) =>
    snap.ref.parent.doc('--stats--').update({
            count: admin.firestore.FieldValue.increment(1),
    })
  );

exports.onTableItemDelete = functions.firestore.document( databasePath + '{exchange}/{table}/{itemId}')
  .onDelete((snap, context) =>
    snap.ref.parent.doc('--stats--').update({
        count: admin.firestore.FieldValue.increment(-1),
    })
  );
