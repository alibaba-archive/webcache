/*!
 * webcache - test/webcache.test.js
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var webcache = require('../');
var pedding = require('pedding');
var should = require('should');
var request = require('supertest');
var app = require('./app');
var version = 'WebCache' + require('../package.json').version;


describe('webcache.test.js', function () {
  var _get = app._store.get;
  beforeEach(function () {
    app._store._data = {};
    app._store.get = function (key, callback) {
      if (key.indexOf('mock_get_error') >= 0) {
        process.nextTick(function () {
          callback(new Error('mock get ' + key + ' error'));
        });
        return;
      }
      _get.call(this, key, callback);
    };
  });
  afterEach(function () {
    app._store.get = _get;
  });

  it('should throw TypeError when params wrong', function () {
    (function () {
      webcache();
    }).should.throw('cache must support #get() and #set()');
    (function () {
      webcache({});
    }).should.throw('cache must support #get() and #set()');
    (function () {
      webcache(app._store);
    }).should.throw('rules must not empty');
    (function () {
      webcache(app._store, []);
    }).should.throw('rules must not empty');
  });

  it('should cache GET /article/foo', function (done) {
    done = pedding(2, done);

    request(app)
    .get('/article/foo')
    .expect('GET /article/foo')
    .expect('Content-Type', 'text/html')
    .expect(200, function (err, res) {
      should.not.exist(err);
      res.headers.should.not.have.property('X-Cache-By');
      request(app)
      .get('/article/foo')
      .expect('X-Cache-By', version)
      .expect('Cache-Control', 'public, max-age=3600')
      .expect('Content-Type', 'text/html')
      .expect('GET /article/foo')
      .expect(200, done);

      request(app)
      .get('/article/foo?t=123123')
      .expect('X-Cache-By', version)
      .expect('Cache-Control', 'public, max-age=3600')
      .expect('Content-Type', 'text/html')
      .expect('GET /article/foo')
      .expect(200, done);
    });
  });

  it('should cache GET /comments and not cache /comments?foo=bar', function (done) {
    done = pedding(2, done);

    request(app)
    .get('/comments')
    .expect('GET /comments')
    .expect('Content-Type', 'text/html')
    .expect(200, function (err, res) {
      should.not.exist(err);
      res.headers.should.not.have.property('x-cache-by');
      request(app)
      .get('/comments')
      .expect('X-Cache-By', version)
      .expect('Content-Type', 'text/html')
      .expect('GET /comments')
      .expect(200, function (err, res) {
        should.not.exist(err);
        done();
      });

      request(app)
      .get('/comments?foo=bar')
      .expect('Content-Type', 'text/html')
      .expect('GET /comments?foo=bar')
      .expect(200, function (err, res) {
        should.not.exist(err);
        res.headers.should.not.have.property('x-cache-by');
        done();
      });
    });
  });

  it('should cache / 100ms', function (done) {
    request(app)
    .get('/')
    .expect('GET /')
    .expect(200, function (err, res) {
      request(app)
      .get('/')
      .expect('X-Cache-By', version)
      .expect('GET /')
      .expect(200, function (err, res) {
        should.not.exist(err);
        res.headers.should.not.have.property('Cache-Control');
        setTimeout(function () {
          request(app)
          .get('/')
          .expect('GET /')
          .expect(200, function (err, res) {
            should.not.exist(err);
            res.headers.should.not.have.property('x-cache-by');
            done();
          });
        }, 110);
      });
    });
  });

  describe('no cache', function () {
    it('should not cache when not match any rules', function (done) {
      request(app)
      .get('/foo')
      .expect('GET /foo')
      .expect(200, function (err, res) {
        should.not.exist(err);
        request(app)
        .get('/foo')
        .expect('GET /foo')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          done();
        });
      });
    });

    it('should not cache when request with no-cache headers', function (done) {
      request(app)
      .get('/comments')
      .expect('GET /comments')
      .expect(200, function (err, res) {
        should.not.exist(err);
        request(app)
        .get('/comments')
        .set('Cache-Control', 'no-cache')
        .expect('GET /comments')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          done();
        });
      });
    });

    it('should not cache when response error', function (done) {
      request(app)
      .get('/article/error')
      .expect('GET /article/error')
      .expect(500, function (err, res) {
        should.not.exist(err);
        res.headers.should.not.have.property('x-cache-by');
        request(app)
        .get('/article/error')
        .expect('GET /article/error')
        .expect(500, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          done();
        });
      });
    });

    it('should not cache when response 404', function (done) {
      request(app)
      .get('/article/404')
      .expect('GET /article/404')
      .expect(404, function (err, res) {
        should.not.exist(err);
        res.headers.should.not.have.property('x-cache-by');
        request(app)
        .get('/article/404')
        .expect('GET /article/404')
        .expect(404, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          done();
        });
      });
    });

    it('should not cache when response no-cache header', function (done) {
      request(app)
      .get('/article/foo?nocache=1')
      .expect('GET /article/foo?nocache=1')
      .expect(200, function (err, res) {
        should.not.exist(err);
        res.headers.should.not.have.property('x-cache-by');
        request(app)
        .get('/article/foo?nocache=1')
        .expect('GET /article/foo?nocache=1')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          done();
        });
      });
    });

    it('should not cache when cache store get() error', function (done) {
      request(app)
      .get('/comments/mock_get_error')
      .expect('GET /comments/mock_get_error')
      .expect(200, function (err, res) {
        should.not.exist(err);
        res.headers.should.not.have.property('x-cache-by');
        request(app)
        .get('/comments/mock_get_error')
        .expect('GET /comments/mock_get_error')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          app._store.get = _get;
          request(app)
          .get('/comments/mock_get_error')
          .expect('GET /comments/mock_get_error')
          .expect(200, function (err, res) {
            should.not.exist(err);
            res.headers.should.have.property('x-cache-by');
            done();
          });
        });
      });
    });

    it('should not cache POST request', function (done) {
      request(app)
      .post('/')
      .expect('POST /')
      .expect(200, function (err, res) {
        should.not.exist(err);
        request(app)
        .post('/')
        .expect('POST /')
        .expect(200, function (err, res) {
          res.headers.should.not.have.property('x-cache-by');
          done(err);
        });
      });
    });

    it('should not cache DELETE request', function (done) {
      request(app)
      .del('/')
      .expect('DELETE /')
      .expect(200, function (err, res) {
        should.not.exist(err);
        request(app)
        .del('/')
        .expect('DELETE /')
        .expect(200, function (err, res) {
          res.headers.should.not.have.property('x-cache-by');
          done(err);
        });
      });
    });

    it('should not cache PUT request', function (done) {
      request(app)
      .put('/')
      .expect('PUT /')
      .expect(200, function (err, res) {
        should.not.exist(err);
        request(app)
        .put('/')
        .expect('PUT /')
        .expect(200, function (err, res) {
          res.headers.should.not.have.property('x-cache-by');
          done(err);
        });
      });
    });

  });
});