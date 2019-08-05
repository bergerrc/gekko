var _ = require('lodash');
var util = require('../../core/util.js');
var config = util.getConfig();
var log = require(util.dirs().core + 'log');

var handle = require('./handle');
var postgresUtil = require('./util');

const { Query } = require('pg');

var Reader = function() {
  _.bindAll(this);
  this.db = handle;
}

// returns the furthest point (up to `from`) in time we have valid data from
Reader.prototype.mostRecentWindow = function(from, to, next) {
  to = to.unix();
  from = from.unix();

  var maxAmount = to - from + 1;
  
  this.db.connect((err,client,done) => {
    var query = client.query(new Query(`
    SELECT start from ${postgresUtil.table('candles')}
    WHERE start <= ${to} AND start >= ${from}
    ORDER BY start DESC
    `), function (err, result) {
      if (err) {
        // bail out if the table does not exist
        if (err.message.indexOf(' does not exist') !== -1)
          return next(false);

        log.error(err);
        return util.die('DB error while reading mostRecentWindow');
      }
    });

    var rows = [];
    query.on('row', function(row) {
      rows.push(row);
    });

    // After all data is returned, close connection and return results
    query.on('end', function() {
      done();
      // no candles are available
      if(rows.length === 0) {
        return next(false);
      }

      if(rows.length === maxAmount) {

        // full history is available!

        return next({
          from: from,
          to: to
        });
      }

      // we have at least one gap, figure out where
      var mostRecent = _.first(rows).start;

      var gapIndex = _.findIndex(rows, function(r, i) {
        return r.start !== mostRecent - i * 60;
      });

      // if there was no gap in the records, but
      // there were not enough records.
      if(gapIndex === -1) {
        var leastRecent = _.last(rows).start;
        return next({
          from: leastRecent,
          to: mostRecent
        });
      }

      // else return mostRecent and the
      // the minute before the gap
      return next({
        from: rows[ gapIndex - 1 ].start,
        to: mostRecent
      });
    });
  });  
}

Reader.prototype.tableExists = function (name, next) {
  this.db.connect((err,client,done) => {
    client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='${postgresUtil.schema()}'
        AND table_name='${postgresUtil.table(name)}';
    `, function(err, result) {
      done();
      if (err) {
        return util.die('DB error at `tableExists`');
      }

      next(null, result.rows.length === 1);
    });
  });  
}

Reader.prototype.get = function(from, to, what, next) {
  if(what === 'full'){
    what = '*';
  }
  
  this.db.connect((err,client,done) => {
    var query = client.query(new Query(`
    SELECT ${what} from ${postgresUtil.table('candles')}
    WHERE start <= ${to} AND start >= ${from}
    ORDER BY start ASC
    `));

    var rows = [];
    query.on('row', function(row) {
      rows.push(row);
    });

    query.on('end',function(){
      done();
      next(null, rows);
    });
  });  
}

Reader.prototype.count = function(from, to, next) {
  this.db.connect((err,client,done) => {
    var query = client.query(new Query(`
    SELECT COUNT(*) as count from ${postgresUtil.table('candles')}
    WHERE start <= ${to} AND start >= ${from}
    `));
    var rows = [];
    query.on('row', function(row) {
      rows.push(row);
    });

    query.on('end',function(){
      done();
      next(null, _.first(rows).count);
    });
  });  
}

Reader.prototype.countTotal = function(next) {
  this.db.connect((err,client,done) => {
    var query = client.query(new Query(`
    SELECT COUNT(*) as count from ${postgresUtil.table('candles')}
    `));
    var rows = [];
    query.on('row', function(row) {
      rows.push(row);
    });

    query.on('end',function(){
      done();
      next(null, _.first(rows).count);
    });
  });  
}

Reader.prototype.getBoundry = function(next) {
  this.db.connect((err,client,done) => {
    var query = client.query(new Query(`
    SELECT (
      SELECT start
      FROM ${postgresUtil.table('candles')}
      ORDER BY start LIMIT 1
    ) as first,
    (
      SELECT start
      FROM ${postgresUtil.table('candles')}
      ORDER BY start DESC
      LIMIT 1
    ) as last
    `));
    var rows = [];
    query.on('row', function(row) {
      rows.push(row);
    });

    query.on('end',function(){
      done();
      next(null, _.first(rows));
    });
  });  
}

Reader.prototype.getRanges = function(next) {
  this.db.connect((err,client,done) => {
    var query = client.query(new Query(`
      WITH 
      nofill AS (
        select 
            a.start lb,
            to_timestamp(a.start) lb_ts,
            min(c.start) fa,
            to_timestamp(min(c.start)) fa_ts,
            row_number () over (order by a.start) seq
        from ${postgresUtil.table('candles')} a
        left outer join ${postgresUtil.table('candles')} b on b.start between (a.start+60) and (a.start+180)
        left outer join ${postgresUtil.table('candles')} c on c.start > a.start
        where b.id is null
        group by a.start
        order by a.start 
      ),
      refill AS (
        SELECT a.fa, a.fa_ts, a.seq seq1, b.lb, b.lb_ts, b.seq seq2 FROM nofill a
        left outer join nofill b on b.seq = a.seq+1 or a.seq = b.seq-1
      ),
      bottom AS (
        SELECT a.fa, to_timestamp(a.fa) fa_ts, b.lb, b.lb_ts, a.seq seq1, b.seq seq2
        FROM (SELECT min(start) fa, 1 seq FROM ${postgresUtil.table('candles')} ) a
        inner join nofill b on a.seq = b.seq
      )
    SELECT coalesce(b.fa_ts,a.fa_ts) as from_ts, coalesce(b.fa, a.fa) as from,
          a.lb_ts as to_ts, a.lb as to, a.seq1 seq
    FROM refill a
    LEFT OUTER JOIN bottom b on a.seq1 = b.seq1
    where a.fa is not null;
    `));
    var rows = [];
    query.on('row', function(row) {
      rows.push(row);
    });

    query.on('end',function(){
      done();
      next(null, rows);
    });
  });  
}

Reader.prototype.close = function() {
  //obsolete due to connection pooling
  //this.db.end();
}

module.exports = Reader;