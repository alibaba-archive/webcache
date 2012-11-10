webcache [![Build Status](https://secure.travis-ci.org/fengmk2/webcache.png)](http://travis-ci.org/fengmk2/webcache)
=======

![logo](https://raw.github.com/fengmk2/webcache/master/logo.png)

Web Cache middleware base on `req.url`.

You can use any cache store engine which implement `set()` and `get()` methods.

* jscoverage: [100%](http://fengmk2.github.com/coverage/webcache.html)

## Support Cache Store

* redis
* mredis
* tair

## Install

```bash
$ npm install webcache
```

## Usage

```js
var connect = require('connect');
var webcache = require('webcache');
var app = connect();

app.use(webcache{
  webcache.redisStore(redis),
  [
    // cache `GET /article/*` response for one hour, ignore querystring params, enable browser cache
    { match: /^\/article\/\w+/, maxAge: 3600000, ignoreQuerystring: true, clientCache: true },
    // cache `GET /` one day
    { match: /^\/$/, maxAge: 3600000 * 24 },
    // cache `GET /commnet[s]` 
    { match: /^\/comments?/ }, // 5 minutes cache
  ],
  { version: 2012 }
));

// ... ignore ...
```

## License 

(The MIT License)

Copyright (c) 2012 fengmk2 &lt;fengmk2@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.