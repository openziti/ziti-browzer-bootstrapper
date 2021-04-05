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


var httpNative   = require('http'),
    httpsNative  = require('https'),
    pump = require('pump'),
    fs = require('fs'),
    path = require('path'),
    web_o  = require('./web-outgoing'),
    common = require('../common'),    
    url  = require('url'),
    requestIp = require('request-ip'),
    cookie = require('cookie'),
    followRedirects = require('follow-redirects');

const { ZitiRequest } = require('./ziti-request');

web_o = Object.keys(web_o).map(function(pass) {
  return web_o[pass];
});



/*!
 * Array of passes.
 *
 * A `pass` is just a function that is executed on `req, res, options`
 * so that you can easily add new checks while still keeping the base
 * flexible.
 */


module.exports = {

  /**
   * Sets `content-length` to '0' if request is of DELETE type.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  deleteLength: function deleteLength(req, res, options) {
    if((req.method === 'DELETE' || req.method === 'OPTIONS')
       && !req.headers['content-length']) {
      req.headers['content-length'] = '0';
      delete req.headers['transfer-encoding'];
    }
  },

  /**
   * Sets timeout in request socket if it was specified in options.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  timeout: function timeout(req, res, options) {
    if(options.timeout) {
      req.socket.setTimeout(options.timeout);
    }
  },

  /**
   * Sets `x-forwarded-*` headers if specified in config.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  XHeaders: function XHeaders(req, res, options) {
    if(!options.xfwd) return;

    let encrypted = req.isSpdy || common.hasEncryptedConnection(req);
    let values = {
      for  : req.connection.remoteAddress || req.socket.remoteAddress,
      port : common.getPort(req),
      proto: encrypted ? 'https' : 'http'
    };

    ['for', 'port', 'proto'].forEach(function(header) {
      req.headers['x-forwarded-' + header] =
        (req.headers['x-forwarded-' + header] || '') +
        (req.headers['x-forwarded-' + header] ? ',' : '') +
        values[header];
    });

    req.headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers['host'] || '';
  },

  /**
   * Does the actual proxying. If `forward` is enabled fires up
   * a ForwardStream, same happens for ProxyStream. The request
   * just dies otherwise.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  stream: async function stream(req, res, options, _, server, clb) {

    // And we begin!
    server.emit('start', req, res, options.target || options.forward);
    options.logger.debug('req start: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);

    // Terminate any requests that are not GET's
    if (req.method !== 'GET') {
      res.writeHead(403, { 'x-ziti-http-agent-forbidden': 'non-GET methods are prohibited' });
      res.end('');
      options.logger.debug('req terminate; non-GET method: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);
      return;
    }

    let outgoing = common.setupOutgoing(options.ssl || {}, options, req);

    //
    // Look for cookie that indicates that we have already injected the ziti-sdk-js...
    //
    var cookies = cookie.parse(req.headers.cookie || ''); 
    var sdkInjectedCookie = cookies['x-ziti-http-agent-sdk-js-injected'];
    var sdkHasBeenInjected = false;
    if (typeof sdkInjectedCookie !== 'undefined') {
      sdkHasBeenInjected = true;
    }

    //
    // If request is for the Ziti service worker
    //
    let swRequest = (outgoing.path.match(/\/ziti-sw.js$/) || []).length;
    if ((swRequest > 0)) {
      options.logger.debug('swRequest encountered!');

      fs.readFile( path.join(__dirname, 'ziti-sw.js'), (err, data) => {

        if (err) {  // If we can't read the service worker file from disk

          res.writeHead(500, { 'x-ziti-http-agent-err': err.message });
          res.end('');
          return;

        } else {    // Emit the dynamically generated JS SDK config, and the service worker file from disk

          res.writeHead(200, { 
            'Content-Type': 'application/javascript',
            'x-ziti-http-agent-info': 'self-configured ziti service worker' 
          });

          res.write('/* generated Ziti JS SDK Config start */\n');
          res.write(common.generateZitiConfig( sdkInjectedCookie ));
          res.write('/* generated Ziti JS SDK Config end */\n\n');

          res.write(data);  // the actual service worker code

          res.end('\n');
          return;
        }

      });
          
      return;
    }

    // Prevent any other HTTP requests from proceeding after SDK injection was previously performed
    if (sdkHasBeenInjected) {
      res.writeHead(403, { 'x-ziti-http-agent-forbidden': 'ziti-js-sdk has already been injected' });
      res.end('');
      options.logger.debug('req terminate; ziti-js-sdk was previously injected: clientIp [%s], method [%s], url [%s]', 
        requestIp.getClientIp(req), req.method, req.url);
      return;
    }

    let proxyReqOptions = Object.assign({}, url.parse( 'http://' + outgoing.host + outgoing.path ), {
      ziti: options.ziti,
      method: 'GET',
      headers: outgoing.headers
    });

    // Ziti Request initalization
    let proxyReq = new ZitiRequest( proxyReqOptions );

    // Ziti Request initiation
    outgoing.profiler = options.logger.startTimer();
    await proxyReq.start();

    // Ensure we abort proxy if request is aborted
    req.on('aborted', function () {
      // proxyReq.abort();
    });

    // Handle errors in Ziti Request and incoming request
    let proxyError = createErrorHandler(proxyReq, options.target);
    req.once('error', proxyError);
    proxyReq.once('error', proxyError);

    function createErrorHandler(proxyReq, url) {
      return function proxyError(err) {
        options.logger.error('proxyError [%s]', err.code);

        if (req.socket.destroyed && err.code === 'ECONNRESET') {
          server.emit('econnreset', err, req, res, url);
          return proxyReq.abort();
        }

        if (clb) {
          clb(err, req, res, url);
        } else {
          server.emit('error', err, req, res, url);
        }
      }
    }

    // Pipe the the original request (from the browser) into the Ziti Request
    pump(req, proxyReq, function(err) {
    })

    req.on('end', () => {
      proxyReq.end();
    });

    // Handle the Response event bubbled up from the Ziti NodeJS SDK
    proxyReq.once('response', function(proxyRes) {

      let self = this;

      if(server) { server.emit('proxyRes', proxyRes, req, res); }

      if(!res.headersSent && !options.selfHandleResponse) {
        for(let i=0; i < web_o.length; i++) {
          if(web_o[i](req, res, proxyRes, options)) { break; }
        }
      }

      if (!res.finished) {

        // Allow us to listen when the proxy has completed
        proxyRes.once('end', function () {
          options.logger.debug('proxyRes.on.end entered');
          outgoing.profiler.done({ message: 'req complete, url [' + req.url + ']', level: 'debug' });
          if (server) server.emit('end', req, res, proxyRes);
          options.logger.debug('req end: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);
        });

        proxyRes.once('close', function () {
          options.logger.debug('proxyRes.on.close entered');
        });

        // Pipe Ziti Response data to the original response object (to the browser)
        pump(proxyRes, res, function(err) {
        })
      
      } else {
        if (server) server.emit('end', req, res, proxyRes);
        options.logger.debug('req end: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);
      }
    });
  }

};
