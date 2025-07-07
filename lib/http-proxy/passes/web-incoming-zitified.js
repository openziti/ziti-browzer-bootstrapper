/*
Copyright NetFoundry, Inc.

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
    common = require('../common'),
    env = require('../../env'),
    pjson = require('../../../package.json');
    const { isUndefined, isEqual } = require('lodash');
    corsProxy = require('./cors-proxy'),
    url  = require('url'),
    net = require('net'),
    requestIp = require('request-ip'),
    { stringify } = require('./urlon'),
    cookie = require('cookie');


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
    if (!net.isIP(req.headers['host'])) {
      options.logger.silly({message: 'req start', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url, hostname: req.hostname});
    }

    // If wildcard vhost support is enabled (i.e. accessing 'zrok shares' )
    if (env('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS') && env('NOT_YET_IMPLEMENTED')) {

      // Determine if we previously encountered this service/share name...
      let zitiContext = await common.getZitiContext();
      let id = await zitiContext.getServiceIdByName( req.ziti_target_service );

      if (isUndefined(id)) {  // if not...
      
        // Ask the Controller if the service/share exists
        let fetchComplete = false;
        do {
          zitiContext = await common.getZitiContext();
          fetchComplete = await zitiContext.fetchServiceByName( req.ziti_target_service );
          if (!fetchComplete) {
            await common.delay(100);
          }
        } while (!fetchComplete)

        // Does network have the service/share name...
        zitiContext = await common.getZitiContext();
        id = await zitiContext.getServiceIdByName( req.ziti_target_service );

        if (isUndefined(id)) {  // if not, route the HTTP request to a 404 response

          let browzer_error_data_json = {
            status:   404,
            myvar: {
              type: 'zrok',
              zrokshare: `${req.ziti_target_service}`,
            }
          };    

          res.writeHead( 301,
            { 
              'X-Ziti-BrowZer-Bootstrapper': `target zrok share [${req.ziti_target_service}] unknown`,
              'Location': `/browzer_error?browzer_error_data=${stringify(JSON.stringify(browzer_error_data_json))}` 
            }
          );
          res.end('');
          if (!net.isIP(req.headers['host'])) {
            options.logger.warn({message: `req terminate - target zrok share [${req.ziti_target_service}] unknown`, vhost: req.headers['host']});
          }
          return;

        }
  
      }

    }

    //
    if (typeof req.ziti_target_service === 'undefined') {
      res.writeHead(404, { 'X-Ziti-BrowZer-Bootstrapper': `vhost [${req.headers['host']}] unknown` });
      res.end('');
      if (!net.isIP(req.headers['host'])) {
        options.logger.error({message: 'req terminate; vhost unknown', vhost: req.headers['host']});
      }
      return;

    }

    //
    options.target = 'https://' + req.ziti_target_service;
    options.targetPath = req.ziti_target_path;

    server.emit('start', req, res, options.target || options.forward);

    let outgoing = common.setupOutgoing(options.ssl || {}, options, req);

    //
    // If request is for the naked/un-SHA'ed Ziti BrowZer Runtime
    //
    let rtNakedRequest = (outgoing.path.match(/\/ziti-browzer-runtime\.js/) || []).length;
    if ((rtNakedRequest > 0)) {
      options.logger.silly({message: 'Request for naked ziti-browzer-runtime.js', component: 'JS', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule;
      pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      let rtFileName = common.getZBRname();
      options.logger.silly({message: 'ziti-browzer-runtime SHA filename: ' + rtFileName, clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      res.writeHead(302, common.addServerHeader({
        'Location': `${rtFileName}`,
        'X-Ziti-BrowZer-Bootstrapper': 'ziti-browzer-runtime SHA filename',
      }));
      res.end('');

      return;
    }

    //
    // If request is a Ziti CORS Proxy
    //
    let corsProxyRequest = (outgoing.path.match(/\/ziti-cors-proxy\//) || []).length;
    if ((corsProxyRequest > 0)) {
      options.logger.silly({message: 'beginning CORS Proxy', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      let proxy = corsProxy.createProxy({});
      
      let corsRequestHandler = corsProxy.getHandler(
        {
          logger: options.logger,
        }, 
      proxy);

      corsRequestHandler(req, res, options.logger);

      return;  
    }

    // Terminate any requests that are not GET's
    if (req.method !== 'GET') {
      res.writeHead(403, { 'X-Ziti-BrowZer-Bootstrapper': 'non-GET methods are prohibited' });
      res.end('');
      options.logger.warn({message: 'req terminate; non-GET method', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});
      return;
    }

    //
    // If request is for resource related to the Ziti BrowZer Runtime
    //
    let rtRequest = (outgoing.path.match(/\/ziti-browzer-runtime/) || []).length;
    if ((rtRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-runtime', component: 'JS', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the SW distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule;
      pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      let rtFileName = common.getZBRname();
      fs.readFile( path.join( pathToZitiBrowzerRuntimeModule, rtFileName ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          var browzer_bootstrapper_host = env('ZITI_BROWZER_BOOTSTRAPPER_HOST');

          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'application/javascript',
              'Content-Security-Policy': "script-src 'self' " + browzer_bootstrapper_host + " 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;",
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    //
    // If request is for resource related to the Ziti BrowZer CSS
    //
    let cssRequest = (outgoing.path.match(/\/ziti-browzer-css/) || []).length;
    if ((cssRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-css.css', component: 'CSS', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      let cssFileName = common.getZBRCSSname();
      fs.readFile( path.join( pathToZitiBrowzerRuntimeModule, cssFileName ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'text/css',
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    //
    // If request is for resource related to the Ziti BrowZer cursor
    //
    let curRequest = (outgoing.path.match(/\/ziti-browzer-cur/) || []).length;
    if ((curRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-cur.cur', component: 'CUR', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      let curFileName = 'ziti-browzer-cur.cur';
      fs.readFile( path.join( pathToZitiBrowzerRuntimeModule, curFileName ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'text/css',
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    //
    // If request is for resource related to the Ziti BrowZer Logo SVG
    //
    let logoRequest = (outgoing.path.match(/\/ziti-browzer-logo.svg/) || []).length;
    if ((logoRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-logo.svg', component: 'SVG', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      fs.readFile( path.join( pathToZitiBrowzerRuntimeModule, 'ziti-browzer-logo.svg' ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'image/svg+xml',
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    //
    // If request is for resource related to the Ziti BrowZer Runtime's WebAssembly
    //
    let rtwasmRequest = (outgoing.path.match(/\/libcrypto.*.wasm$/) || []).length;
    if ((rtwasmRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-runtime libcrypto.wasm', component: 'WASM', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the SW distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/libcrypto-js');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      let rtwasmFileName = outgoing.path.split("/").pop();
      rtwasmFileName = rtwasmFileName.split("?")[0];

      fs.readFile( path.join( pathToZitiBrowzerRuntimeModule, rtwasmFileName ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'application/wasm',
              'X-Ziti-BrowZer-Bootstrapper': 'OpenZiti browZer WebAssembly',
              }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    //
    // If request is for resource related to Polipop
    //
    let polipopRequest = (outgoing.path.match(/\/polipop/) || []).length;
    if ((polipopRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-UI', component: 'UI', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the distro within the build of our running instance
      let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
      pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));

      // Read the component off the disk
      let polipopFileName = outgoing.path.split("/").pop();
      polipopFileName = polipopFileName.split("?")[0];
      fs.readFile( path.join( pathToZitiBrowzerRuntimeModule, polipopFileName ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          let contentType = 'application/javascript';
          let hasCSS = (polipopFileName.match(/\.css/) || []).length;
          if ((hasCSS > 0)) {
            contentType = 'text/css';
          }
      
          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': `${contentType}`,
              'X-Ziti-BrowZer-Bootstrapper': 'OpenZiti browZer Polipop',
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    //
    // If request is for resource related to the Ziti service worker
    //
    let swRequest = (outgoing.path.match(/\/ziti-browzer-sw/) || []).length;
    if ((swRequest > 0)) {
      options.logger.silly({message: 'Request for ziti-browzer-sw', component: 'JS', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Locate the path to the SW distro within the build of our running instance
      let pathToZitiBrowzerSwModule = require.resolve('@openziti/ziti-browzer-sw');
      pathToZitiBrowzerSwModule = pathToZitiBrowzerSwModule.substring(0, pathToZitiBrowzerSwModule.lastIndexOf('/'));

      // Read the component off the disk
      let swFileName = outgoing.path.split("/").pop();
      swFileName = swFileName.split("?")[0];
      fs.readFile( path.join( pathToZitiBrowzerSwModule, swFileName ), (err, data) => {
        if (err) {  // If we can't read the file from disk

          options.logger.error({error: err});

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk
      
          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'application/javascript',
              'Service-Worker-Allowed': '/',
              'Access-Control-Allow-Headers': 'Origin',
              'X-Ziti-BrowZer-Bootstrapper': 'OpenZiti browZer Service Worker',
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });
          
      return;
    }

    //
    // If request is for resource related to Canny
    //
    let cannyRequest = (outgoing.path.match(/\/canny-setup.js/) || []).length;
    if ((cannyRequest > 0)) {
      options.logger.silly({message: 'Request for canny-setup.js', component: 'JS', clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});

      // Read the component off the disk
      fs.readFile( path.join( __dirname, '../../../assets/canny-setup.js' ), (err, data) => {

        if (err) {  // If we can't read the file from disk

          res.writeHead(500, { 'X-Ziti-BrowZer-Bootstrapper': err.message });
          res.end('');
          return;

        } else {    // Emit the file from disk

          var cacheData = {
            status: 200, 
            headers: common.addServerHeader({ 
              'Content-Type': 'application/javascript',
            }),
            data: data
          }

          res.writeHead(cacheData.status, cacheData.headers);

          res.write(cacheData.data);  // the actual file contents

          options.cache.set(req.url, cacheData);

          res.end();
          return;
        }

      });

      return;
    }

    
    let html = `
<!doctype html>
<html>
  <head>
    <title>OpenZiti BrowZer Bootstrapper</title>
  </head>
  <body></body>
</html>
`;

    res._isHtml = true;

    res.writeHead(
      200, common.addServerHeader({ 
      'Content-Type': 'text/html',
    }));

    res.write(  html );  

    res.end();
    return;
  
  }

};
