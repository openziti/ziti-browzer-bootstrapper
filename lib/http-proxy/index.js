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


var httpProxy = module.exports,
    extend    = require('util')._extend,
    parse_url = require('url').parse,
    EE3       = require('eventemitter3'),
    http      = require('http'),
    https     = require('https'),
    web       = require('./passes/web-incoming-zitified');

httpProxy.Server = ProxyServer;


/**
 * Returns a function that creates the loader for
 *  `web`'s  passes.
 *
 * Examples:
 *
 *    httpProxy.createRightProxy('web')
 *    // => [Function]
 *
 * @param {String} Type Must be 'web'
 * 
 * @return {Function} Loader Function that when called returns an iterator for the right passes
 *
 * @api private
 */

function createRightProxy(type) {

  return function(options) {
    return function(req, res /*, [head], [opts] */) {
      var passes = this.webPasses,
          args = [].slice.call(arguments),
          cntr = args.length - 1,
          head, cbl;

      /* optional args parse begin */
      if(typeof args[cntr] === 'function') {
        cbl = args[cntr];

        cntr--;
      }

      var requestOptions = options;
      if(
        !(args[cntr] instanceof Buffer) &&
        args[cntr] !== res
      ) {
        //Copy global options
        requestOptions = extend({}, options);
        //Overwrite with request options
        extend(requestOptions, args[cntr]);

        cntr--;
      }

      if(args[cntr] instanceof Buffer) {
        head = args[cntr];
      }

      /* optional args parse end */

      [ 'target' ].forEach(function(e) {
        if (typeof requestOptions[e] === 'string')
          requestOptions[e] = parse_url(requestOptions[e]);
      });

      for(var i=0; i < passes.length; i++) {
        /**
         * Call of passes functions
         * pass(req, res, options, head)
         */
        if(passes[i](req, res, requestOptions, head, this, cbl)) { // passes can return a truthy value to halt the loop
          break;
        }
      }
    };
  };
}
httpProxy.createRightProxy = createRightProxy;

function ProxyServer(options) {
  EE3.call(this);

  options = options || {};
  options.prependPath = options.prependPath === false ? false : true;

  this.web = this.proxyRequest = createRightProxy('web')(options);
  this.options = options;

  this.webPasses = Object.keys(web).map(function(pass) {
    return web[pass];
  });

  this.on('error', this.onError, this);

}

require('util').inherits(ProxyServer, EE3);

ProxyServer.prototype.onError = function (err) {
  //
  // Remark: Replicate node core behavior using EE3
  // so we force people to handle their own errors
  //
  if(this.listeners('error').length === 1) {
    throw err;
  }
};

ProxyServer.prototype.listen = function(port, hostname) {
  var self    = this,
      closure = function(req, res) { self.web(req, res); };

  this._server  = this.options.ssl ?
    https.createServer(this.options.ssl, closure) :
    http.createServer(closure);

  this._server.listen(port, hostname);

  return this;
};

ProxyServer.prototype.close = function(callback) {
  var self = this;
  if (this._server) {
    this._server.close(done);
  }

  // Wrap callback to nullify server after all open connections are closed.
  function done() {
    self._server = null;
    if (callback) {
      callback.apply(null, arguments);
    }
  };
};

ProxyServer.prototype.before = function(type, passName, callback) {
  if (type !== 'web') {
    throw new Error('type must be `web`');
  }
  var passes = this.webPasses,
      i = false;

  passes.forEach(function(v, idx) {
    if(v.name === passName) i = idx;
  })

  if(i === false) throw new Error('No such pass');

  passes.splice(i, 0, callback);
};
ProxyServer.prototype.after = function(type, passName, callback) {
  if (type !== 'web') {
    throw new Error('type must be `web`');
  }
  var passes = this.webPasses,
      i = false;

  passes.forEach(function(v, idx) {
    if(v.name === passName) i = idx;
  })

  if(i === false) throw new Error('No such pass');

  passes.splice(i++, 0, callback);
};
