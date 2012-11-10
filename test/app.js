/*!
 * webcache - test/app.js
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var urlparse = require('url').parse;
var connect = require('connect');
var webcache = require('../');
var app = connect();

app._store = webcache.MemoryStore();

app.use(webcache(
  app._store,
  [
    { match: /^\/article\/\w+/, maxAge: 3600000, ignoreQuerystring: true, clientCache: true },
    // cache `GET /` one day
    { match: /^\/$/, maxAge: 100 },
    // cache `GET /commnet[s]` 
    { match: /^\/comments?/ }, // 5 minutes cache
  ],
  { version: 2012 }
));

app.use(function (req, res, next) {
  if (req.url.indexOf('/error') >= 0) {
    res.statusCode = 500;
  }

  if (req.url.indexOf('/404') >= 0) {
    res.statusCode = 404;
  }

  var info = urlparse(req.url, true);
  info.query = info.query || {};
  var contentType = info.query.content_type || 'text/html';
  res.setHeader('Content-Type', contentType);
  if (info.query.nocache) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  res.end(req.method + ' ' + req.url);
});

module.exports = app;