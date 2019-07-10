const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
// If index.js calls admin.initializeApp at the top of the file,
// we need to stub it out before requiring index.js. This is because the
// functions will be executed as a part of the require process.
// Here we stub admin.initializeApp to be a dummy function that doesn't do anything.
adminInitStub = sinon.stub(admin, 'initializeApp');
// Now we can require index.js and save the exports inside a namespace called myFunctions.
const myFunctions = require('../firestore');

const test = require('firebase-functions-test')();

describe('Table Item', () => {

  // Make snapshot
  const snapPath = 'gekko/bitfinex/unittest/';//Math.round(Date.now()/60000,0)*60);

  it('on insert', () => {
    expect( () =>{
      var snapData = {
        start: 1560203740, //Math.round(Date.now()/60000,0)*60,
      };
      const onTableItemCreate = test.wrap(myFunctions.onTableItemCreate);
      const snap = test.firestore.makeDocumentSnapshot(snapData, snapPath+snapData.start);
      return onTableItemCreate(snap);
    }).to.not.throw();
  });

  it('on insert multiple', () => {
    var snapData2 = {
      start: 1560206440, //Math.round(Date.now()/60000,0)*60,
    };
    expect( () =>{
      const onTableItemCreate = test.wrap(myFunctions.onTableItemCreate);
      var promises = [];
      for ( var i=0; i < 10; i++ ){
        const path = snapPath + snapData2.start;
        const snap = test.firestore.makeDocumentSnapshot(snapData2,path);
        promises.push( onTableItemCreate(snap) );
        snapData2.start += 60;
      }
      return Promise.all(promises);
    }).to.not.throw();
  });

  it('on insert multiple not sequenced', () => {
    var snapData3 = {
      start: 1560209140, //Math.round(Date.now()/60000,0)*60,
    };
    expect( () =>{
      const onTableItemCreate = test.wrap(myFunctions.onTableItemCreate);
      var promises = [];
      for ( var i=0; i < 15; i++ ){
        const path = snapPath + snapData3.start;
        const snap = test.firestore.makeDocumentSnapshot(snapData3,path);
        promises.push( onTableItemCreate(snap) );
        snapData3.start += 60;
      }
      return Promise.all(promises);
    }).to.not.throw();
  });

  /*
// Make snapshot for state of database beforehand
const beforeSnap = test.firestore.makeDocumentSnapshot({foo: 'bar'}, 'document/path');
// Make snapshot for state of database after the change
const afterSnap = test.firestore.makeDocumentSnapshot({foo: 'faz'}, 'document/path');
const change = test.makeChange(beforeSnap, afterSnap);
*/
/*
  it('on update', () => {
    expect(async () =>{
    }).to.not.throw();
  });

  it('on delete', () => {
    expect(async () =>{

    }).to.not.throw();
  });
*/
});

describe('Pending', () => {
  const snapPath = 'gekko/bitfinex/unittest/--stats--/pending/';
  
  it('on insert', () => {
    expect( () =>{
      var snapData = {
        refId: 1560203740, //Math.round(Date.now()/60000,0)*60,
        refPath: 'gekko/bitfinex/unittest/'+1560203740
      };
      const snap = test.firestore.makeDocumentSnapshot(snapData, snapPath+ snapData.refId);
      const onPendingCreate = test.wrap(myFunctions.onPendingCreate);
      return onPendingCreate(snap);
    }).to.not.throw();
  });

  it('on insert multiple', () => {
    var snapData2 = {
      refId: 1560206440, //Math.round(Date.now()/60000,0)*60,
    };
    expect( () =>{
      const onPendingCreate = test.wrap(myFunctions.onPendingCreate);
      var promises = [];
      for ( var i=0; i < 10; i++ ){
        const path = snapPath + snapData2.refId;
        const snap = test.firestore.makeDocumentSnapshot(snapData2,path);
        promises.push( onPendingCreate(snap) );
        snapData2.refId += 60;
      }
      return Promise.all(promises);
    }).to.not.throw();
  });

  it('on insert multiple not sequenced', () => {
    var snapData3 = {
      refId: 1560209140, //Math.round(Date.now()/60000,0)*60,
    };
    expect( () =>{
      const onPendingCreate = test.wrap(myFunctions.onPendingCreate);
      var promises = [];
      for ( var i=0; i < 15; i++ ){
        const path = snapPath + snapData3.refId;
        const snap = test.firestore.makeDocumentSnapshot(snapData3,path);
        promises.push( onPendingCreate(snap) );
        snapData3.refId += 60;
      }
      return Promise.all(promises);
    }).to.not.throw();
    setTimeout(function () {
      done();
    }, 5000);
  });
});

/*

describe('Range', () => {
  const snapPath = 'gekko/bitfinex/unittest/--stats--/ranges/';
  const timestamp = Math.round(Date.now()/60000,0)*60;

  it('on insert', () => {
    expect( () =>{
      var snapData = {
        min: timestamp, 
        max: timestamp,
        count: 1
      };
      const snap = test.firestore.makeDocumentSnapshot(snapData, snapPath+ snapData.min);
      const onRangeCreate = test.wrap(myFunctions.onRangeCreate);
      return onRangeCreate(snap);
    }).to.not.throw();
  });

  it('on update', () => {
    expect( () =>{
      var snapData = {
        min: timestamp, 
        max: timestamp + 60,
        count: 2
      };
      const snap = test.firestore.makeDocumentSnapshot(snapData, snapPath+ snapData.min);
      const onRangeUpdate = test.wrap(myFunctions.onRangeUpdate);
      return onRangeUpdate({after: snap});
    }).to.not.throw();
  });

  it('on delete', () => {
    expect( () =>{
      var snapData = {
        min: timestamp, 
        max: timestamp + 60,
        count: 2
      };
      const snap = test.firestore.makeDocumentSnapshot(snapData, snapPath+ snapData.min);
      const onRangeDelete = test.wrap(myFunctions.onRangeDelete);
      return onRangeDelete(snap);
    }).to.not.throw();
  });

});

*/