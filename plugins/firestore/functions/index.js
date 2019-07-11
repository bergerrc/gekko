const functions = require('firebase-functions');
const admin = require('firebase-admin');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
const firestore = require('./firestore');
exports.onTableItemCreate = firestore.onTableItemCreate;
exports.onTableItemDelete = firestore.onTableItemDelete;
exports.onPendingCreate = firestore.onPendingCreate;
exports.onPendingDelete = firestore.onPendingDelete;
exports.onRangeCreate = firestore.onRangeCreate;
exports.onRangeUpdate = firestore.onRangeUpdate;
exports.onRangeDelete = firestore.onRangeDelete;
exports.onRangesLockCreate = firestore.onRangesLockCreate;
exports.onRangesLockDelete = firestore.onRangesLockDelete;

//exports.firestore = require('./firestore');

exports.stats = require('./statistics').Statistics;
// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.resetStatistics = functions.https.onRequest((req, res) => {
  // Grab the text parameter.
  const refPath = req.query.path;
  res.write("started. Reference: "+refPath);
  stat.Statistics.reset(refPath)
  .then(()=>{
    res.write("reset OK<br>");
    return stat.Statistics.countAll(refPath)
  })
  .then(()=>{
    return res.write("countAll OK<br>");
  });
});

// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest((req, res) => {
    // Grab the text parameter.
    const original = req.query.text;
    // Push the new message into the Realtime Database using the Firebase Admin SDK.
    return admin.database().ref('/messages').push({original: original}).then((snapshot) => {
      // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
      return res.redirect(303, snapshot.ref.toString());
    });
  });
  
  // Listens for new messages added to /messages/:pushId/original and creates an
  // uppercase version of the message to /messages/:pushId/uppercase
  exports.makeUppercase = functions.database.ref('/messages/{pushId}/original')
      .onCreate((snapshot, context) => {
        // Grab the current value of what was written to the Realtime Database.
        const original = snapshot.val();
        console.log('Uppercasing', context.params.pushId, original);
        const uppercase = original.toUpperCase();
        // You must return a Promise when performing asynchronous tasks inside a Functions such as
        // writing to the Firebase Realtime Database.
        // Setting an "uppercase" sibling in the Realtime Database returns a Promise.
        return snapshot.ref.parent.child('uppercase').set(uppercase);
      });