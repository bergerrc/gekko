const chai = require('chai');
const expect = chai.expect;
const _ = require('lodash');
const async = require("async");

const FirestoreHandle = require('../handle');
const FirestoreReader = require('../reader');
const FirestoreWriter = require('../writer');

describe('plugins/firestore/handle', () => {
  let lastData;
  
  var repeat = function(fn, retries, attempts=1, interval=1000){
    if ( attempts > retries ) return;
    fn(attempts);
    setTimeout( repeat, interval, fn, retries, ++attempts, interval);
  }
  
  it('should connect to cloud firestore', () => {
    expect(async () => {
      await FirestoreHandle.setup();
    }).to.not.throw();
  });

  it('should have collections', async () => {
    const collections = await FirestoreHandle.collections();
    expect(collections).to.not.empty;
  });

  it('should have default table', async () => {
    const table = await FirestoreHandle.table();
    expect(table).to.be.exist;
  });

  it('should insert data', (done) => {
    expect(async () =>{
      var start = Math.round(Date.now()/60000,0)*60;
      const table = await FirestoreHandle.table();
      lastData = {start: start };
      await FirestoreHandle.insert(table.path,[lastData]);
    }).to.not.throw();
    setTimeout(function () {
      done();
    },2000);
  });

  it('should get data by key', async () => {
    const table = await FirestoreHandle.table();
    var res = await FirestoreHandle.query(table.path,lastData.start);
    expect(res.exists,'not exists').to.be.true;
    var data = res.data();
    expect(data.start).to.equal(lastData.start);
  });

  it('should get data by condition', async () => {
    const table = await FirestoreHandle.table();
    //Create ten lines (1 per sec)
    for( var i=0; i < 10; i++){
      lastData.start += 60;
      await FirestoreHandle.insert(table.path,[lastData]);
    };
    await setTimeout(() => {}, 1000);
    var cond = [{field:'start', op:'>=', value: lastData.start - 360},
    {field:'start', op:'<', value: lastData.start - 120}]
    var res = await FirestoreHandle.query(table.path,cond);
    expect(res.size).to.be.equal(4);
  });


  it('should delete data', (done) => {
    expect(async () =>{
      const table = await FirestoreHandle.table();
      var rows = await new FirestoreReader().get(lastData.start, lastData.start+60000);
      await FirestoreHandle.delete(table.path,rows);
    }).to.not.throw();
    setTimeout(function () {
      done();
    }, 2000);
  });
});

describe('plugins/firestore/reader', () => {
  let lastData;
  
  it('should get data by range', async () => {
    var start = Math.round(Date.now()/60000,0)*60 + 180;
    lastData = { start: start };
    var res = await new FirestoreReader().get(lastData.start, lastData.start+120);
    expect(res.length).to.equal(3);
    expect(res[0].start).to.equal(lastData.start);
  });

  it('should count by simple range', async () => {
    var c = await new FirestoreReader().count(lastData.start, lastData.start+120);
    expect(c).to.equal(3);
  });

  it('should count by complex range', async () => {
    var start = Math.round(Date.now()/60000,0)*60;
    lastData = { start: start };
    var c = await new FirestoreReader().count([[lastData.start, lastData.start+60],
                                               [lastData.start+180, lastData.start+240]]);
    expect(c).to.equal(4);
  });

  it('should count ranges', async () => {
    var start = Math.round(Date.now()/60000,0)*60;
    lastData = { start: start };
    var c = await new FirestoreReader().countRanges([[lastData.start, lastData.start+60],
                                               [lastData.start+180, lastData.start+240]]);
    expect(c).to.least(1);
  });


  it('should count total by stats', async () => {
    var reader = new FirestoreReader();
    const table = await FirestoreHandle.table();
    
    var c = await reader.countTotal();
    var candles = await FirestoreHandle.query(table.path);
    expect(c).to.closeTo(candles.size,candles.size*0.1);
  });

  it('should get boundry', async () => {
    var start = Math.round(Date.now()/60000,0)*60;
    lastData = { start: start };
    var boundry = await new FirestoreReader().getBoundry();
    expect(boundry.first).to.greaterThan(0);
    expect(boundry.last).to.greaterThan(boundry.first);
  });

  it('should table exists (or not)', async () => {
    var reader = new FirestoreReader();
    var tab1 = await reader.tableExists();
    expect(tab1).to.be.true;
    var tab2 = await reader.tableExists('other');
    expect(tab2).to.be.false;
  });
});
/*
describe('plugins/firestore/scanner', () => {
  let lastData;
  
  it('should scan single database', async () => {
    var os = require('os');
    var config = require('../../../web/routes/baseConfig');
    var dateRangeScan = require('../../../core/workers/dateRangeScan/parent');
    var scan = require('../../../plugins/firestore/scanner');;
    scan( (err, markets) => {
      //console.log( JSON.stringify( datasets ) );
      if(err)
        throw err;
  
        let numCPUCores = os.cpus().length;
        if(numCPUCores === undefined)
           numCPUCores = 1;
        async.eachLimit(markets, numCPUCores, (market, next) => {
  
        let marketConfig = _.clone(config);
        marketConfig.watch = market;
  
        var rangeScan = require('../../../core/tools/dateRangeScanner');
        rangeScan(
          (err, ranges, reader) => {
            reader.close();
            market.ranges = ranges;
            next();
          }
        );
  
      }, err => {
        let resp = {datasets:[],
                    errors: []};
        markets.forEach(market => {
          if(market.ranges)
            resp.datasets.push(market);
          else
            resp.errors.push(market);
        })
        //done(err, resp);
        expect( err ).to.be.empty;
        expect ( resp ).to.have.least(1);
      })
    });
  });
});
*/
describe('plugins/firestore/writer', () => {
  var lastData = {
    start: Math.round(Date.now()/60000,0)*60,
    open: 1,
    high: 2,
    low: 3,
    close: 4,
    vwp: 5,
    volume: 6,
    trades: 7
  };
  
  it('should insert one row', (done) => {
    expect( () =>{
      lastData.start = Math.round(Date.now()/60000,0)*60;
      new FirestoreWriter(()=>{}).processCandle(lastData,()=>{});
    }).to.not.throw();
    //Give a time to data be written
    setTimeout(function () {
      done();
    },5000);
  });

  it('should be inserted correctly', async () => {
    const table = await FirestoreHandle.table();
    var res = await FirestoreHandle.query(table.path,lastData.start);
    expect(res.exists,'not exists').to.be.true;
    var data = res.data();
    expect(data.start).to.equal(lastData.start);
    expect(data).to.haveOwnProperty('open');
    expect(data).to.haveOwnProperty('high');
    expect(data).to.haveOwnProperty('low');
    expect(data).to.haveOwnProperty('close');
    expect(data).to.haveOwnProperty('vwp');
    expect(data).to.haveOwnProperty('volume');
    expect(data).to.haveOwnProperty('trades');
  });

  it('should insert multiple rows', (done) => {
    expect( () =>{
      for( var i=0; i < 120; i++){
        lastData.start += 60;
        new FirestoreWriter(()=>{}).processCandle(lastData,()=>{});
      };
    }).to.not.throw();
    //Give a time to data be written
    setTimeout(function () {
      done();
    }, 20000);
  });

  it('should be multiple inserted correctly', async () => {
    var c = await new FirestoreReader().count(lastData.start-60*19,lastData.start);
    expect(c).to.equal(120);
  });
/*
  it('should insert multiple rows as import', (done) => {

    expect( () =>{
      var util = require('../../core/util');
      util.setGekkoMode( 'importer' );
      for( var i=0; i < 500; i++){
        lastData.start += 60;
        new FirestoreWriter(()=>{}).processCandle(lastData,()=>{});
      };
    }).to.not.throw();
    //Give a time to data be written
    setTimeout(function () {
      done();
    }, 20000);
  });

  it('should be correctly multiple inserted as import', async () => {
    var c = await new FirestoreReader().count(lastData.start-29940,lastData.start);
    expect(c).to.equal(500);
  });
  
});

describe('plugins/firestore/handle', () => {
  let lastData = {};

  it('should delete data', (done) => {
    lastData.start = Math.round(Date.now()/60000,0)*60;
    expect(async () =>{
      const table = await FirestoreHandle.table();
      var rows = await new FirestoreReader().get(lastData.start-300, lastData.start+60000);
      new FirestoreWriter(()=>{}).deleteCandles(rows);
    }).to.not.throw();
    setTimeout(function () {
      done();
    }, 10000);
  });
  */
});