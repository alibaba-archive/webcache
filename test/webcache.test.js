/*!
 * webcache - test/webcache.test.js
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var fs = require('fs');
var webcache = require('../');
var pedding = require('pedding');
var should = require('should');
var request = require('supertest');
var server = require('./server');
var redis = require('redis');
var mredis = require('mredis');
var interceptor = require('interceptor');

var mockRedisServer = interceptor.create('localhost:6379');
mockRedisServer.listen(6380);
var mredisClient = mredis.createClient({
  server: [ 'localhost:6379', 'localhost:6380' ]
});
var redisClient = redis.createClient();
var version = 'WebCache' + require('../package.json').version;

function cacheKey(key) {
  return 'wc_' + key + '_2012';
}

describe('webcache.test.js', function () {

  var stores = [
    [ 'MemoryStore', webcache.MemoryStore() ],
    [ 'RedisStore', webcache.createStore('redis', redisClient) ],
    [ 'MRedis', webcache.createStore('redis', mredisClient) ],
  ];

  stores.forEach(function (item) {

    describe(item[0], function () {

      var store = item[1];
      var cleanupCache = function (callback) {
        var keys = [
          '/article/foo',
          '/comments/foobar',
          '/article/image',
          '/article/json',
          '/article/javascript',
          '/article/large',
          '/comments/foobar?foo=bar',
          '/'
        ];
        callback = pedding(keys.length, callback);
        keys.forEach(function (key) {
          store.set(cacheKey(key), null, null, callback);
        });
      };
      
      var app = server.create(store);
      var _get = store.get;
      beforeEach(function (done) {
        store.get = function (key, callback) {
          if (key.indexOf('mock_get_error') >= 0) {
            process.nextTick(function () {
              callback(new Error('mock get ' + key + ' error'));
            });
            return;
          }
          _get.call(this, key, callback);
        };
        cleanupCache(done);
      });
      afterEach(function (done) {
        store.get = _get;
        cleanupCache(done);
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

      it('should cache GET /article/large', function (done) {
        done = pedding(2, done);

        var content = fs.readFileSync(__filename, 'utf8');

        request(app)
        .get('/article/large')
        .expect(content)
        .expect('Content-Type', 'text/html')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('X-Cache-By');
          request(app)
          .get('/article/large')
          .expect('X-Cache-By', version)
          .expect('Cache-Control', 'public, max-age=3600')
          .expect('Content-Type', 'text/html')
          .expect(content)
          .expect(200, done);

          request(app)
          .get('/article/large?t=123123')
          .expect('X-Cache-By', version)
          .expect('Cache-Control', 'public, max-age=3600')
          .expect('Content-Type', 'text/html')
          .expect(content)
          .expect(200, done);
        });
      });

      it('should cache GET /comments/foobar and not cache /comments/foobar?foo=bar', function (done) {
        done = pedding(2, done);

        request(app)
        .get('/comments/foobar')
        .expect('GET /comments/foobar')
        .expect('Content-Type', 'text/html')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          request(app)
          .get('/comments/foobar')
          .expect('X-Cache-By', version)
          .expect('Content-Type', 'text/html')
          .expect('GET /comments/foobar')
          .expect(200, function (err, res) {
            should.not.exist(err);
            done();
          });

          request(app)
          .get('/comments/foobar?foo=bar')
          .expect('Content-Type', 'text/html')
          .expect('GET /comments/foobar?foo=bar')
          .expect(200, function (err, res) {
            should.not.exist(err);
            res.headers.should.not.have.property('x-cache-by');
            done();
          });
        });
      });

      it('should cache / 1000ms', function (done) {
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
            }, 2000);
          });
        });
      });

      it('should cache / and ignore querystring effect', function (done) {
        request(app)
        .get('/')
        .expect('GET /')
        .expect(200, function (err, res) {
          request(app)
          .get('/?foo=bar')
          .expect('X-Cache-By', version)
          .expect('GET /')
          .expect(200, done);
        });
      });
   
      it('should cache /comments and ignore ?spm=xxxx query params', function (done) {
        request(app)
        .get('/comments?spm=2.3.4.5&app=123')
        .expect(200, function (err, res) {
          request(app)
          .get('/comments?app=123&spm=1.2.3.4')
          .expect('X-Cache-By', version)
          .expect(200, done);
        });
      });
      
      it('should cache /comments and ignore ?sp2=xxxx query params', function (done) {
        request(app)
        .get('/comments?sp2=test&app=1243&sc=cdg2')
        .expect(200, function (err, res) {
          request(app)
          .get('/comments?app=1243&sc=cdg2&sp2=12.3.4')
          .expect('X-Cache-By', version)
          .expect(200, done);
        });
      });

      it('should cache /article/javascript?content_type=application/javascript', function (done) {
        request(app)
        .get('/article/javascript?content_type=application/javascript')
        .expect('Content-Type', 'application/javascript')
        .expect(200, function (err, res) {
          should.not.exist(err);
          var body = '';
          res.on('data', function (chunk) {
            body += chunk.toString();
          });
          res.on('end', function () {
            body.should.equal('GET /article/javascript?content_type=application%2Fjavascript');
            request(app)
            .get('/article/javascript?content_type=application/javascript')
            .expect('X-Cache-By', version)
            .expect('Content-Type', 'application/javascript')
            .expect(200, function (err, res) {
              should.not.exist(err);
              var body = '';
              res.on('data', function (chunk) {
                body += chunk.toString();
              });
              res.on('end', function () {
                body.should.equal('GET /article/javascript?content_type=application%2Fjavascript');
                done();
              });
            });
          });
        });
      });

      it('should cache /article/json?content_type=application/json', function (done) {
        request(app)
        .get('/article/json?content_type=application/json')
        .expect('GET /article/json?content_type=application%2Fjson')
        .expect('Content-Type', 'application/json')
        .expect(200, function (err, res) {
          should.not.exist(err);
          res.headers.should.not.have.property('x-cache-by');
          request(app)
          .get('/article/json?content_type=application/json')
          .expect('GET /article/json?content_type=application%2Fjson')
          .expect('Content-Type', 'application/json')
          .expect('X-Cache-By', version)
          .expect(200, done);
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
              should.not.exist(err);
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
              should.not.exist(err);
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
              should.not.exist(err);
              res.headers.should.not.have.property('x-cache-by');
              done(err);
            });
          });
        });

        it('should not cache /article/image request', function (done) {
          request(app)
          .get('/article/image')
          .expect(200, function (err, res) {
            should.not.exist(err);
            res.headers.should.not.have.property('x-cache-by');
            request(app)
            .get('/article/image')
            .expect(200, function (err, res) {
              should.not.exist(err);
              res.headers.should.not.have.property('x-cache-by');
              done(err);
            });
          });
        });

      });
    });
  });

  it('should createStore() throw error when cache type not support', function () {
    (function () {
      webcache.createStore('tair', {});
    }).should.throw('tair not support, please implement the get() and set() methods yourself');
  });
  
});
