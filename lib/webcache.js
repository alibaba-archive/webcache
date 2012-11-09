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
 *   }
 * @param options
 *   - {Number} maxAge: global cache millisecond, default is 300000ms (5 minutes).
 *   - {String} version: cache version, append to cache store key, default is `''`.
 *   - {Boolean} ignoreQuerystring: ignore `req.url` querystring params, default is false.
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

  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    rule.maxAge = rule.maxAge || defaultMaxAge;
    rule.ignoreQuerystring = rule.ignoreQuerystring || defaultIgnoreQuerystring;
  }

  return function webcache(req, res, next) {
    if (req.method !== 'GET') {
      return next();
    }

    var matchRule = null;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.match.test(req.url)) {
        matchRule = rule;
      }
    }

    if (!matchRule) {
      return next();
    }
    var url = req.url;
    if (matchRule.ignoreQuerystring) {
      url = urlparse(url).path;
    }

    var key = 'wc_' + url + '_' + version;
    var keyContentType = key + '_ct';


    var ep = eventproxy.create('content_type', 'content', function (contentType, content) {
      if (content) {
        var cc = req.headers['cache-control'];
        if (!cc || !parseCacheControl(cc)['no-cache']) {
          if (contentType) {
            res.setHeader('Content-Type', contentType);
          }
          res.setHeader('X-Cache-By', 'WebCache' + exports.version);
  //      res.setHeader('Cache-Control', 'public, max-age=' + options.maxAge);
          return res.end(content); 
        }
      }

      var chunks = [];
      var size = 0;
      res.__source_write = res.write;
      res.write = function (chunk, encoding) {
        res.__source_write(chunk, encoding);

        if (!Buffer.isBuffer(chunk)) {
          chunk = new Buffer(chunk, encoding);
        }
        chunks.push(chunk);
        size += chunk.length;
      };
      var end = res.end;
      res.end = function (chunk, encoding) {
        res.end = end;
        if (chunk) {
          res.write(chunk, encoding);
        }
        res.end();

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
            var maxAge = matchRule.maxAge;
            cache.set(key, buf, maxAge);
            var contentType = res.getHeader('Content-Type');
            if (contentType) {
              cache.set(keyContentType, contentType, maxAge);
            }
          }
        } 
        
      };
      next();
    });
    
    ep.on('error', function (err) {
      console.error('[webcache][%s] %s', new Date(), err.stack);
      ep.unbind();
      next();
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
exports.version = require('../package.json').version;