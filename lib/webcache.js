/*!
 * webcache - lib/webcache.js
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

require('buffer-concat');
var debug = require('debug')('webcache');
var eventproxy = require('eventproxy');
var urlparse = require('url').parse;

/**
 * Parse the given Cache-Control `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */
var parseCacheControl = function (str) {
  var directives = str.split(',');
  var obj = {};

  for (var i = 0, len = directives.length; i < len; i++) {
    var parts = directives[i].split('=');
    var key = parts.shift().trim();
    var val = parseInt(parts.shift(), 10);

    obj[key] = isNaN(val) ? true : val;
  }

  return obj;
};

/**
 * Web Cache middleware.
 *
 * ```js
 * app.use(webcache(
 *   webcache.redisStore(redis),
 *   [
 *     { match: /^\/article\/\w+/, maxAge: 3600000, ignoreQuerystring: true },
 *     { match: /^\/$/, maxAge: 3600000 * 24 },
 *     { match: /^\/comments?/ }, // 5 minutes cache
 *   ],
 *   { version: 2012 }
 * ));
 * ```
 *
 * @param {CacheStore} cache, cache store impl `get()` and `set()` methods.
 *   #get(key, callback) and 
 *   #set(key, value, maxAge, [callback]), or use a array and exports.setCacheIndex
 * @param {Array} rules, match url cache rules.
 *   - {Object} rule: {
 *     - {RegExp} match: regex to detect which `req.url` need to be cache.
 *     - {Number} maxAge: cache millisecond, default is `options.maxAge`.
 *     - {Boolean} ignoreQuerystring: ignore `req.url` querystring params.
 *     - {Boolean} clientCache: client side cache, default is `options.clientCache`.
 *   }
 * @param options
 *   - {Number} maxAge: global cache millisecond, default is 300000ms (5 minutes).
 *   - {String} version: cache version, append to cache store key, default is `''`.
 *   - {Boolean} ignoreQuerystring: ignore `req.url` querystring params, default is false.
 *   - {Boolean} clientCache: client side cache, default is false.
 * @returns {Function (req, res, next)}
 * @api public
 */
exports = module.exports = function webcache(cache, rules, options) {
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new TypeError('cache must support #get() and #set()');
  }
  if (!rules || !rules.length) {
    throw new TypeError('rules must not empty');
  }

  options = options || {};
  var defaultMaxAge = options.maxAge || 300000;
  var defaultIgnoreQuerystring = options.ignoreQuerystring || false;
  var version = options.version || '';
  var clientCache = !!options.clientCache;

  var TEXT_RE = /^(?:text\/|application\/json|application\/javascript)/i;

  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    rule.maxAge = rule.maxAge || defaultMaxAge;
    rule.ignoreQuerystring = rule.ignoreQuerystring || defaultIgnoreQuerystring;
    rule.clientCache = rule.clientCache || clientCache;
  }

  return function webcache(req, res, next) {
    if (req.method !== 'GET') {
      return next();
    }

    var matchRule = null;
    var urlinfo = urlparse(req.url);
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.match.test(urlinfo.pathname)) {
        matchRule = rule;
      }
    }

    if (!matchRule) {
      return next();
    }
    var url = req.url;
    if (matchRule.ignoreQuerystring) {
      url = urlinfo.pathname;
    }

    var key = 'wc_' + url + '_' + version;
    var keyContentType = key + '_ct';
    var maxAge = matchRule.maxAge;

    var nextHandle = function () {
      var chunks = [];
      var size = 0;
      res.__source_write = res.write;
      res.write = function (chunk, encoding) {
        this.__source_write(chunk, encoding);

        if (!Buffer.isBuffer(chunk)) {
          chunk = new Buffer(chunk, encoding);
        }
        chunks.push(chunk);
        size += chunk.length;
      };
      res.__source_end = res.end;
      res.end = function (chunk, encoding) {
        if (chunk) {
          this.write(chunk, encoding);
        }
        this.end = this.__source_end;
        this.end();

        if (res.statusCode !== 200) {
          // dont cache non 200 status response
          return;
        }

        var cc = res.getHeader('cache-control');
        if (cc && parseCacheControl(cc)['no-cache']) {
          return;
        }

        if (chunks.length > 0) {
          var buf = Buffer.concat(chunks, size);
          if (buf && buf.length > 0) {
            var contentType = res.getHeader('Content-Type');
            if (contentType) {
              var need = TEXT_RE.test(contentType);
              debug('check %j %s %s', req.url, contentType, need);
              if (need) {
                cache.set(key, buf, maxAge);
                cache.set(keyContentType, contentType, maxAge);
              }
            }
          }
        } 
        
      };
      next();
    };

    var ep = eventproxy.create('content_type', 'content', function (contentType, content) {
      if (content) {
        var cc = req.headers['cache-control'];
        if (!cc || !parseCacheControl(cc)['no-cache']) {
          if (contentType) {
            res.setHeader('Content-Type', contentType);
          }
          res.setHeader('X-Cache-By', 'WebCache' + exports.version);
          if (matchRule.clientCache && maxAge >= 1000) {
            var seconds = parseInt(maxAge / 1000, 10);
            res.setHeader('Cache-Control', 'public, max-age=' + seconds);
          }
          debug('hit %s %s, %d bytes', key, contentType, content.length);
          return res.end(content); 
        }
      }
      debug('miss %s', key);

      nextHandle();
    });
    
    ep.on('error', function (err) {
      debug('[%s] %s', new Date(), err.stack);
      ep.unbind();
      nextHandle();
    });

    cache.get(key, function (err, content) {
      if (err) {
        return ep.emit('error', err);
      }
      ep.emit('content', content);
    });

    cache.get(keyContentType, function (err, keyContentType) {
      if (err) {
        return ep.emit('error', err);
      }
      ep.emit('content_type', keyContentType);
    });
  };
};

/**
 * Cache in process memory, Don't use int production env.
 */
function MemoryStore() {
  if (!(this instanceof MemoryStore)) {
    return new MemoryStore();
  }
  this._data = {};
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[webcache][%s] MUST not use MemoryStore in production env.', new Date());
  } 
}

MemoryStore.prototype.set = function (key, value, maxAge, callback) {
  var expired = 0;
  if (maxAge) {
    expired = Date.now() + maxAge;
  }
  this._data[key] = [value, expired, maxAge];
  process.nextTick(function () {
    callback && callback();
  });
};

MemoryStore.prototype.get = function (key, callback) {
  var data = this._data[key];
  var value = null;
  if (data) {
    if (data[1] && Date.now() >= data[1]) {
      delete this._data[key];
    } else {
      value = data[0];
    }
  }
  process.nextTick(function () {
    callback(null, value);
  });
};

exports.MemoryStore = MemoryStore;

function RedisStore(cache) {
  this.cache = cache;
}

RedisStore.prototype.set = function (key, value, maxAge, callback) {
  if (!value) {
    debug('del %s', key);
    return this.cache.del(key, callback);
  }
  var seconds = 0;
  if (maxAge && maxAge >= 1000) {
    seconds = parseInt(maxAge / 1000, 10);
  }
  debug('set %s %s', key, seconds);
  if (seconds) {
    this.cache.setex(key, seconds, value, callback);
  } else {
    this.cache.set(key, value, callback);
  }
};

RedisStore.prototype.get = function (key, callback) {
  this.cache.get(key, callback);
};

/**
 * Create a cache store.
 * @param {String} type, cache type, e.g.: 'redis', 'tair'
 * @param {Object} cache, cache instance
 * @return {Object} store instance
 */
exports.createStore = function (type, cache) {
  if (type === 'redis') {
    return new RedisStore(cache);
  }
  throw new TypeError(type + ' not support, please implement the get() and set() methods yourself');
};

exports.version = require('../package.json').version;