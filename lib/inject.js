/*
Copyright Netfoundry, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


var trumpet = require('trumpet');
var zlib = require('zlib');
var cookie = require('cookie');
var jwt = require('jsonwebtoken');
const {Base64} = require('js-base64');
const common = require('./http-proxy/common');
const requestIp = require('request-ip');
const { v4: uuidv4 } = require('uuid');

module.exports = function injectBinary(reqSelectors, resSelectors, htmlOnly) {
  var _reqSelectors = reqSelectors || [];
  var _resSelectors = resSelectors || [];
  var _htmlOnly     = (typeof htmlOnly == 'undefined') ? false : htmlOnly;

  function prepareRequestSelectors(req, res) {
    var tr = trumpet();

    prepareSelectors(tr, _reqSelectors, req, res);

    req.on('data', function(data) {
      tr.write(data);
    });
  }

  function prepareResponseSelectors(req, res) {
    var tr          = trumpet();
    var _write      = res.write;
    var _end        = res.end;
    var _writeHead  = res.writeHead;
    var gunzip      = zlib.Gunzip();
    var theRequest  = req;
    let id_token    = req.oidc.idToken;

    prepareSelectors(tr, _resSelectors, req, res);

    res.isHtml = function () {
      if (res._isHtml === undefined) {
        var contentType = res.getHeader('content-type') || '';
        res._isHtml = contentType.indexOf('text/html') === 0;
      }

      return res._isHtml;
    }

    res.isRedirect = function() {
      var redirectRegex = /^201|30(1|2|7|8)$/;
      if( redirectRegex.test(res.statusCode)) {
        return true;
      }
      return false;
    }

    res.isGzipped = function () {
      if (res._isGzipped === undefined) {
        var encoding = res.getHeader('content-encoding') || '';
        res._isGzipped = encoding.toLowerCase() === 'gzip' && res.isHtml();
      }

      return res._isGzipped;
    }

    res.writeHead = function () {
      var headers = (arguments.length > 2) ? arguments[2] : arguments[1]; // writeHead supports (statusCode, headers) as well as (statusCode, statusMessage, headers)
      headers = headers || {};

      /* Sniff out the content-type header.
       * If the response is HTML, we're safe to modify it.
       */
      if (!_htmlOnly && res.isHtml()) {
        res.removeHeader('Content-Length');
        delete headers['content-length'];
      }

      /* Sniff out the content-encoding header.
       * If the response is Gziped, we're have to gunzip content before and ungzip content after.
       */
      if (res.isGzipped()) {
        res.removeHeader('Content-Encoding');
        delete headers['content-encoding'];
      }

      // These are the circumstances under which we will inject the ziti-sdk-js
      if ( res.isHtml() && !res.isRedirect() && !res.isGzipped()) {

        var cookies = res.getHeaders()['set-cookie'] || [];

        cookies.push(
          cookie.serialize(
            'x-ziti-http-agent-sdk-js-injected', theRequest.url, 
            {
              httpOnly: true,
              secure:   true, 
              sameSite: true,
              path:     '/',
              maxAge:   5,
              expires:  new Date(new Date().getTime() + 5000), // expire 500ms fron now
            }
          )
        );

        var token = jwt.sign({
          token_type: 'Bearer',
          access_token: id_token,
        },
        uuidv4()  // secret
        );

        cookies.push(
          cookie.serialize(
            '__Secure-ziti-browzer-jwt', token, 
            {
              secure:   true, 
              sameSite: true,
              path:     '/',
            }
          )
        );  

        var zitiConfig = common.generateZitiConfigObject( '', requestIp.getClientIp(req));
        zitiConfig = JSON.stringify(zitiConfig);
        zitiConfig = Base64.encode(zitiConfig);
        cookies.push(
          cookie.serialize(
            '__Secure-ziti-browzer-config', zitiConfig, 
            {
              secure:   true, 
              sameSite: true,
              path:     '/',
            }
          )
        );  


        res.setHeader('Set-Cookie', cookies ); 


      }

      _writeHead.apply(res, arguments);
    };

    res.write = function (data, encoding) {

      // Only run data through trumpet if we have HTML AND this is NOT a redirect. 
      //
      // If this is a redirect, we expect the browser to come right back and ask
      // for the 'Location' the terget web server specified, so we will wait to
      // inject the ziti-sdk-js until all redirects have completed, and we have a 200.

      if ( res.isHtml() && !res.isRedirect() ) {

        if (res.isGzipped()) {

          gunzip.write(data);

        } else {
  
          // Perform HTML manipulation
          tr.write(data, encoding);

        }

      } else {

        // We do not manipulate redirect responses
        _write.apply(res, arguments);
      }
    };

    tr.on('data', function (buf) {
      _write.call(res, buf);
    });

    gunzip.on('data', function (buf) {
      tr.write(buf);
    });

    res.end = function (data, encoding) {
      if (res.isGzipped()) {
        gunzip.end(data);
      } else {
        tr.end(data, encoding);
      }
    };

    gunzip.on('end', function (data) {
      tr.end(data);
    });

    tr.on('end', function () {
      _end.call(res);
    });
  }

  function prepareSelectors(tr, selectors, req, res) {
    for (var i = 0; i < selectors.length; i++) {
      (function (callback, req, res) {
        var callbackInvoker  = function(element) {
          callback(element, req, res);
        };

        tr.selectAll(selectors[i].query, callbackInvoker);
      })(selectors[i].func, req, res);
    }
  }

  return function injectBinary(req, res, next) {
    var ignore = false;

    if (_htmlOnly) {
      var lowercaseUrl = req.url.toLowerCase();

      if ((lowercaseUrl.indexOf('.js', req.url.length - 3) !== -1) ||
          (lowercaseUrl.indexOf('.css', req.url.length - 4) !== -1)) {
        ignore = true;
      }
    }

    if (!ignore) {
      if (_reqSelectors.length) {
        prepareRequestSelectors(req, res);
      }

      if (_resSelectors.length) {
        prepareResponseSelectors(req, res);
      }
    }

    next();
  };
};
