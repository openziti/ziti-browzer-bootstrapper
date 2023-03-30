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


var common   = exports,
    url      = require('url'),
    extend   = require('util')._extend,
    required = require('requires-port'),
    fs       = require('fs'),
    requestIp = require('request-ip'),
    find     = require('lodash.find'),
    swpjson  = require('@openziti/ziti-browzer-sw/package.json');

var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i,
    isSSL = /^https/;

/**
 * Simple Regex for testing if protocol is https
 */
common.isSSL = isSSL;

/**
 * 
 */
var logLevelMap = new Map();
logLevelMap.set('*', process.env.ZITI_BROWZER_RUNTIME_LOGLEVEL);
 
function mapEntriesToString(entries) {
  return Array
    .from(entries, ([k, v]) => `${k}:${v}, `)
    .join("") + "";
}

common.logLevelSet = function (key, val) {
  logLevelMap.set(key, val);
};

common.logLevelGet = function () {
  return mapEntriesToString(logLevelMap.entries());
};

common.logLevelGetForClient = function (client) {
  let level = logLevelMap.get(client);
  if (typeof level === 'undefined') {
    level = process.env.ZITI_BROWZER_RUNTIME_LOGLEVEL ? process.env.ZITI_BROWZER_RUNTIME_LOGLEVEL : 'error';
  }
  return level;
};

common.removeValue = function(list, value, separator) {
  separator = separator || ",";
  var values = list.split(separator);
  for(var i = 0 ; i < values.length ; i++) {
    if(values[i].trim() == value) {
      values.splice(i, 1);
      return values.join(separator);
    }
  }
  return list;
}

/**
 * Copies the right headers from `options` and `req` to
 * `outgoing` which is then used to fire the proxied
 * request.
 *
 * Examples:
 *
 *    common.setupOutgoing(outgoing, options, req)
 *    // => { host: ..., hostname: ...}
 *
 * @param {Object} Outgoing Base object to be filled with required properties
 * @param {Object} Options Config object passed to the proxy
 * @param {ClientRequest} Req Request Object
 * @param {String} Forward String to select forward or target
 * 
 * @return {Object} Outgoing Object with all required properties set
 *
 * @api private
 */

common.setupOutgoing = function(outgoing, options, req, forward) {

  outgoing.port = options[forward || 'target'].port ||
                  (isSSL.test(options[forward || 'target'].protocol) ? 443 : 80);

  [
    'host', 
    'hostname', 
    'socketPath', 
    'pfx', 
    'key',
    'passphrase', 
    'cert', 
    'ca', 
    'ciphers', 
    'secureProtocol', 
    'protocol'
  ].forEach(
    function(e) { outgoing[e] = options[forward || 'target'][e]; }
  );

  outgoing.method = options.method || req.method;
  outgoing.headers = extend({}, req.headers);

  if (options.headers){
    extend(outgoing.headers, options.headers);
  }

  // Prevent this from being sent (results in 500 errors on initial TSPlus requests)
  delete outgoing.headers['if-modified-since'];

  // Prevent 'br' from being sent as a viable 'Accept-Encoding' (we do not support the Brotli algorithm here)
  let val = common.removeValue(outgoing.headers['accept-encoding'], 'br');
  if (val === "") {
    delete outgoing.headers['accept-encoding'];
  } else {
    outgoing.headers['accept-encoding'] = val;
  }

  if (options.auth) {
    outgoing.auth = options.auth;
  }
  
  if (options.ca) {
      outgoing.ca = options.ca;
  }

  if (isSSL.test(options[forward || 'target'].protocol)) {
    outgoing.rejectUnauthorized = (typeof options.secure === "undefined") ? true : options.secure;
  }

  outgoing.agent = options.agent || false;
  outgoing.localAddress = options.localAddress;

  //
  // Remark: If we are false and not upgrading, set the connection: close. This is the right thing to do
  // as node core doesn't handle this COMPLETELY properly yet.
  //
  if (!outgoing.agent) {
    outgoing.headers = outgoing.headers || {};
    if (typeof outgoing.headers.connection !== 'string'
        || !upgradeHeader.test(outgoing.headers.connection)
       ) { outgoing.headers.connection = 'close'; }
  }

  // the final path is target path + relative path requested by user:
  var target = options[forward || 'target'];
  var targetPath = target && options.prependPath !== false
    ? (target.path || '')
    : '';

  var outgoingPath = !options.toProxy
    ? (url.parse(req.url).path || '')
    : req.url;

  //
  // Remark: ignorePath will just straight up ignore whatever the request's
  // path is. This can be labeled as FOOT-GUN material if you do not know what
  // you are doing and are using conflicting options.
  //
  outgoingPath = !options.ignorePath ? outgoingPath : '';

  outgoing.path = common.urlJoin(targetPath, outgoingPath);

  if (options.changeOrigin) {
    outgoing.headers.host =
      required(outgoing.port, options[forward || 'target'].protocol) && !hasPort(outgoing.host)
        ? outgoing.host + ':' + outgoing.port
        : outgoing.host;
  }

  return outgoing;

};


/**
 * Generates the config for the Ziti browZer Runtime
 *
 * 
 * @return {Object} config Object
 *
 * @api private
 */

common.generateZitiConfig = function(url, client) {

  var zc = common.generateZitiConfigObject(url, client);

  var ziti_config = `var zitiConfig = ` + JSON.stringify(zc);

  return ziti_config;
}

common.getZBRname = function() {

  try {
    let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
    pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));
    let zbrName;
    fs.readdirSync(pathToZitiBrowzerRuntimeModule).forEach(file => {
      if (file.startsWith('ziti-browzer-runtime')) {
        zbrName = file;
      }
    });
    
    return zbrName;
    
  }
  catch (e) {
    console.error(e);
  }
  
}

common.generateZitiConfigObject = function(url, req, options) {

  var client = requestIp.getClientIp(req);
  var zitiClient = client || '*';

  var agent_host = req.get('host');

  var target = find(options.targetArray, {
    wildcard: agent_host
  });
  if (typeof target === 'undefined') {
    options.logger.error('Host header of [%o] has no match in ZITI_AGENT_TARGETS array', agent_host);
    target_service  = 'UNKNOWN';
    target_port     = 0;
    target_path     = '/';
    target_scheme   = 'https';
  } else {
    target_service  = target.service;
    target_port     = target.port;
    target_path     = target.path;
    target_scheme   = target.scheme;
  }

  var ziti_controller_host = process.env.ZITI_CONTROLLER_HOST;
  var ziti_controller_port = process.env.ZITI_CONTROLLER_PORT;

  var agent_scheme = process.env.ZITI_AGENT_SCHEME;
  if (typeof agent_scheme === 'undefined') { 
    agent_scheme = 'http'; 
  }

  var agent_listen_port = process.env.ZITI_AGENT_LISTEN_PORT;
  if (typeof agent_listen_port === 'undefined') {
      if (agent_scheme === 'http') {
          agent_listen_port = 80;
      }
      else if (agent_scheme === 'https') {
          agent_listen_port = 443;
      }
      else {
          throw new Error('ZITI_AGENT_LISTEN_PORT cannot be set');
      }
  }
  var cors_proxy_hosts = process.env.ZITI_AGENT_CORS_PROXY_HOSTS;
  var dom_proxy_hosts = process.env.ZITI_AGENT_DOM_PROXY_HOSTS;
  var idp_issuer_url = new URL( req.ziti_idp_issuer_base_url );
  var ziti_browzer_runtime_hotkey = process.env.ZITI_BROWZER_RUNTIME_HOTKEY;
  if (typeof ziti_browzer_runtime_hotkey === 'undefined') { ziti_browzer_runtime_hotkey = 'alt+f12'; }


  var ziti_config = 
    {
      controller: {
        api: `https://${ziti_controller_host}:${ziti_controller_port}/edge/client/v1`
      },
      httpAgent: {
        self: {
          scheme: `${agent_scheme}`,
          host: `${agent_host}`,
          port: `${agent_listen_port}`
        },
        target: {
          port: `${target_port}`,
          service: `${target_service}`,
          path: `${target_path}`,
          scheme: `${target_scheme}`
        },
        // additionalTarget: {
        //   scheme: `${target_scheme}`,
        //   host: `${additional_target_host}`,
        //   port: `${target_port}`
        // },
        corsProxy: {
          hosts: `${cors_proxy_hosts}`,
        },
        domProxy: {
          hosts: `${dom_proxy_hosts}`,
        },
      },
      browzer: {
        sw: {
          location: `ziti-browzer-sw.js`,
          version: `${swpjson.version}`, 
          logLevel: `${common.logLevelGetForClient(zitiClient)}`,
        },
        runtime: {
          src: `${agent_host}/${common.getZBRname()}`,
          logLevel: `${common.logLevelGetForClient(zitiClient)}`,
          hotKey: `${ziti_browzer_runtime_hotkey}`,
        },
      },
      idp: {
        host: `${idp_issuer_url.host}`,
        clientId: `${req.ziti_idp_client_id}`
      }
    };


  return ziti_config;
}

/**
 * Set the proper configuration for sockets,
 * set no delay and set keep alive, also set
 * the timeout to 0.
 *
 * Examples:
 *
 *    common.setupSocket(socket)
 *    // => Socket
 *
 * @param {Socket} Socket instance to setup
 * 
 * @return {Socket} Return the configured socket.
 *
 * @api private
 */

common.setupSocket = function(socket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);

  socket.setKeepAlive(true, 0);

  return socket;
};

/**
 * Get the port number from the host. Or guess it based on the connection type.
 *
 * @param {Request} req Incoming HTTP request.
 *
 * @return {String} The port number.
 *
 * @api private
 */
common.getPort = function(req) {
  var res = req.headers.host ? req.headers.host.match(/:(\d+)/) : '';

  return res ?
    res[1] :
    common.hasEncryptedConnection(req) ? '443' : '80';
};

/**
 * Check if the request has an encrypted connection.
 *
 * @param {Request} req Incoming HTTP request.
 *
 * @return {Boolean} Whether the connection is encrypted or not.
 *
 * @api private
 */
common.hasEncryptedConnection = function(req) {
  return Boolean(req.connection.encrypted || req.connection.pair);
};

/**
 * OS-agnostic join (doesn't break on URLs like path.join does on Windows)>
 *
 * @return {String} The generated path.
 *
 * @api private
 */

common.urlJoin = function() {
    //
    // We do not want to mess with the query string. All we want to touch is the path.
    //
  var args = Array.prototype.slice.call(arguments),
      lastIndex = args.length - 1,
      last = args[lastIndex],
      lastSegs = last.split('?'),
      retSegs;

  args[lastIndex] = lastSegs.shift();

  //
  // Join all strings, but remove empty strings so we don't get extra slashes from
  // joining e.g. ['', 'am']
  //
  retSegs = [
    args.filter(Boolean).join('/')
        .replace(/\/+/g, '/')
        .replace('http:/', 'http://')
        .replace('https:/', 'https://')
  ];

  // Only join the query string if it exists so we don't have trailing a '?'
  // on every request

  // Handle case where there could be multiple ? in the URL.
  retSegs.push.apply(retSegs, lastSegs);

  return retSegs.join('?')
};

/**
 * Rewrites or removes the domain of a cookie header
 *
 * @param {String|Array} Header
 * @param {Object} Config, mapping of domain to rewritten domain.
 *                 '*' key to match any domain, null value to remove the domain.
 *
 * @api private
 */
common.rewriteCookieProperty = function rewriteCookieProperty(header, config, property) {
  if (Array.isArray(header)) {
    return header.map(function (headerElement) {
      return rewriteCookieProperty(headerElement, config, property);
    });
  }
  return header.replace(new RegExp("(;\\s*" + property + "=)([^;]+)", 'i'), function(match, prefix, previousValue) {
    var newValue;
    if (previousValue in config) {
      newValue = config[previousValue];
    } else if ('*' in config) {
      newValue = config['*'];
    } else {
      //no match, return previous value
      return match;
    }
    if (newValue) {
      //replace value
      return prefix + newValue;
    } else {
      //remove value
      return '';
    }
  });
};

/**
 * Check the host and see if it potentially has a port in it (keep it simple)
 *
 * @returns {Boolean} Whether we have one or not
 *
 * @api private
 */
function hasPort(host) {
  return !!~host.indexOf(':');
};


/**
 * Determine of a value is a boolean or not
 */
 common.toBool = function (item) {
  switch(typeof item) {
    case "boolean":
      return item;
    case "function":
      return true;
    case "number":
      return item > 0 || item < 0;
    case "object":
      return !!item;
    case "string":
      item = item.toLowerCase();
      return ["true", "1"].indexOf(item) >= 0;
    case "symbol":
      return true;
    case "undefined":
      return false;

    default:
      throw new TypeError("Unrecognised type: unable to convert to boolean");
  }
};


/**
 * Generates the config for the Ziti browZer Runtime
 *
 */
 common.generateAccessControlAllowOrigin = function() {

  var agent_host = process.env.ZITI_AGENT_HOST;

  return `https://${agent_host}`;

}
  

/**
 * Determine if 'path' is one on the 'target path'
 */
common.isRequestOnTargetPath = function( req, options, path ) {

  let result = false;

  if (req.ziti_target_path) {
    let pathNoQuery = path.replace(/\?.*$/,"");
    let regex = new RegExp( pathNoQuery + '$', 'g' );
    let hit = (req.ziti_target_path.match(regex) || []).length;
    if ((hit > 0)) {
      options.logger.debug('common.isRequestOnTargetPath: HIT on path [%s]', path);
      result = true;
    }
  }

  return result;
}
