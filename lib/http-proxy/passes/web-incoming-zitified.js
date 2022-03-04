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
    corsProxy = require('./cors-proxy'),
    url  = require('url'),
    requestIp = require('request-ip'),
    cookie = require('cookie');

const { ZitiRequest } = require('./ziti-request');

web_o = Object.keys(web_o).map(function(pass) {
  return web_o[pass];
});

var target_host = process.env.ZITI_AGENT_TARGET_HOST;


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
    options.logger.debug('req start: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);
    server.emit('start', req, res, options.target || options.forward);

    let outgoing = common.setupOutgoing(options.ssl || {}, options, req);

    //
    // If request is a Ziti CORS Proxy
    //
    if (req.method === 'POST') {
      let corsProxyRequest = (outgoing.path.match(/\/ziti-cors-proxy\//) || []).length;
      if ((corsProxyRequest > 0)) {
        options.logger.debug('beginning CORS Proxy: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);

        let proxy = corsProxy.createProxy({});

        let corsRequestHandler = corsProxy.getHandler({logger: options.logger}, proxy);

        corsRequestHandler(req, res, options.logger);

        return;  
      }
    }

    // Terminate any requests that are not GET's
    if (req.method !== 'GET') {
      res.writeHead(403, { 'x-ziti-http-agent-forbidden': 'non-GET methods are prohibited' });
      res.end('');
      options.logger.debug('req terminate; non-GET method: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);
      return;
    }

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
    // If request is for resource related to the Ziti service worker
    //
    let swRequest = (outgoing.path.match(/\/ziti-browzer-sw/) || []).length;
    if ((swRequest > 0)) {
      options.logger.debug('Request for ziti-browzer-sw component: clientIp [%s], url [%s]', requestIp.getClientIp(req), req.url);

      // Locate the path to the SW distro within the build of our running instance
      let pathToZitiBrowzerSwModule = require.resolve('@openziti/ziti-browzer-sw');
      pathToZitiBrowzerSwModule = pathToZitiBrowzerSwModule.substring(0, pathToZitiBrowzerSwModule.lastIndexOf('/'));

      // Read the component off the disk
      fs.readFile( path.join( pathToZitiBrowzerSwModule, outgoing.path.split("/").pop() ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'x-ziti-http-agent-err': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          res.writeHead(200, { 
            'Content-Type': 'application/javascript',
            'Service-Worker-Allowed': '/',
            'x-ziti-http-agent-info': 'self-configured ziti service worker' 
          });

          res.write(data);  // the actual service worker code

          res.end('\n');
          return;
        }

      });
          
      return;
    }

    let rootRequest = (outgoing.path.match(/\/$/) || []).length;
    if ((rootRequest > 0)) {
      options.logger.debug('ziti-js-sdk was previously injected, but we will honor reload of root page: clientIp [%s], method [%s], url [%s]',
        requestIp.getClientIp(req), req.method, req.url);
      sdkHasBeenInjected = false;
      options.logger.debug('Request for root, we will load page: clientIp [%s], method [%s], path [%s]', requestIp.getClientIp(req), req.method, outgoing.path);
    }

    let requestIsTargetPath = common.isRequestOnTargetPath( options, outgoing.path );
    if ( requestIsTargetPath ) {
      sdkHasBeenInjected = false;
      options.logger.debug('Request for (targetPath) root, we will load page: clientIp [%s], method [%s], path [%s]', requestIp.getClientIp(req), req.method, outgoing.path);
    }


    let sioRequest = (outgoing.path.match(/\/software\/html5.html/) || []).length;
    if ((sioRequest > 0)) {
      sdkHasBeenInjected = false;
    }

    // Prevent any other HTTP requests from proceeding after SDK injection was previously performed
    if (sdkHasBeenInjected) {
      options.logger.debug('req terminate; ziti-js-sdk was previously injected: clientIp [%s], method [%s], url [%s]', 
        requestIp.getClientIp(req), req.method, req.url);
      res.writeHead(403, { 'x-ziti-http-agent-forbidden': 'ziti-js-sdk has already been injected' });
      res.end('');
      return;
    }

    if (!requestIsTargetPath) {
      options.logger.debug('req terminate; request is NOT on target-path: clientIp [%s], method [%s], url [%s]',
        requestIp.getClientIp(req), req.method, req.url);
      res.writeHead(403, { 'x-ziti-http-agent-forbidden': 'request is NOT on target-path' });
      res.end('');
      return;
    }

    let proxyReqOptions = Object.assign({}, url.parse( outgoing.protocol + '//' + outgoing.host + outgoing.path ), {
      ziti: options.ziti,
      method: 'GET',
      headers: outgoing.headers
    });

    options.logger.debug('sending request over Ziti for url [%s]', req.url);

    // Ziti Request initalization
    let proxyReq = new ZitiRequest( proxyReqOptions );

    // Deal with case where Ziti service name is Mixed-case
    let target_host_lower   = target_host.toLowerCase();
    proxyReq.opts.host      =  proxyReq.opts.host.replace(target_host_lower, target_host);
    proxyReq.opts.hostname  =  proxyReq.opts.hostname.replace(target_host_lower, target_host);
    proxyReq.opts.href      =  proxyReq.opts.href.replace(target_host_lower, target_host);

    // Ziti Request initiation
    outgoing.profiler = options.logger.startTimer();
    await proxyReq.start();

    // Ensure we abort proxy if request is aborted
    req.on('aborted', function () {
      options.logger.debug('req.on.aborted entered');
      // proxyReq.abort();
    });

    // Handle errors in Ziti Request and incoming request
    let proxyError = createErrorHandler(proxyReq, options.target);
    req.once('error', proxyError);
    proxyReq.once('error', proxyError);

    function createErrorHandler(proxyReq, url) {
      options.logger.silly('createErrorHandler entered url[%o]', url);
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
      if (typeof err !== 'undefined') {
        options.logger.error('pump.req error[%o]', err);
      }
    })

    req.on('end', () => {
      proxyReq.end();
    });

    // Handle the Response event bubbled up from the Ziti NodeJS SDK
    proxyReq.once('response', function(proxyRes) {

      if (proxyRes.statusCode < 0) {
        res.writeHead(503, { 'x-ziti-http-agent': 'check service configuration' });
        res.end('');
        return;
      }

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
          outgoing.profiler.done({ message: 'req complete, url [' + req.url + ']', level: 'debug' });
          if (server) server.emit('end', req, res, proxyRes);
          options.logger.debug('req end: clientIp [%s], method [%s], url [%s], status [%d]', requestIp.getClientIp(req), req.method, req.url, proxyRes.statusCode);
        });

        proxyRes.once('close', function () {
          options.logger.silly('proxyRes.on.close entered');
        });

        // Pipe Ziti Response data to the original response object (to the browser)
        pump(proxyRes, res, function(err) {
          if (typeof err !== 'undefined') {
            options.logger.error('pump.proxyRes %o', err);
          }
        })
      
      } else {
        if (server) server.emit('end', req, res, proxyRes);
        options.logger.debug('req end: clientIp [%s], method [%s], url [%s]', requestIp.getClientIp(req), req.method, req.url);
      }
    });
  }

};
