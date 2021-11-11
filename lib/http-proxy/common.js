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
    required = require('requires-port');

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
logLevelMap.set('*', process.env.ZITI_SDK_JS_LOGLEVEL);
 
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
    level = process.env.ZITI_SDK_JS_LOGLEVEL;
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
 * Generates the config for the Ziti JS SDK
 *
 * 
 * @return {Object} config Object
 *
 * @api private
 */

common.generateZitiConfig = function(url, client) {

  var zitiSDKjsInjectionURL = url || '';
  var zitiClient = client || '*';

  var ziti_controller_host = process.env.ZITI_CONTROLLER_HOST;
  var ziti_controller_port = process.env.ZITI_CONTROLLER_PORT;
  var target_scheme = process.env.ZITI_AGENT_TARGET_SCHEME;
  var target_host = process.env.ZITI_AGENT_TARGET_HOST;
  var additional_target_host = process.env.ZITI_AGENT_ADDITIONAL_TARGET_HOST;
  var target_port = process.env.ZITI_AGENT_TARGET_PORT;
  var agent_host = process.env.ZITI_AGENT_HOST;
  var agent_https_port = process.env.ZITI_AGENT_HTTPS_PORT;
  if (typeof agent_https_port === 'undefined') { agent_https_port = 443; }
  var ziti_sdk_js_location = process.env.ZITI_SDK_JS_SRC;
  var cors_proxy_hosts = process.env.ZITI_AGENT_CORS_PROXY_HOSTS;
  var dom_proxy_hosts = process.env.ZITI_AGENT_DOM_PROXY_HOSTS;


  var ziti_config = `
var zitiConfig = {
  controller: {
    api: "https://${ziti_controller_host}:${ziti_controller_port}"
  },
  httpAgent: {
    self: {
        host: "${agent_host}",
        port: "${agent_https_port}"
    },
    target: {
      scheme: "${target_scheme}",
      host: "${target_host}",
      port: "${target_port}"     
    },
    additionalTarget: {
      scheme: "${target_scheme}",
      host: "${additional_target_host}",
      port: "${target_port}"     
    },
    corsProxy: {
      hosts: "${cors_proxy_hosts}",
    },
    domProxy: {
      hosts: "${dom_proxy_hosts}",
    },
    zitiSDKjs: {
      location: "https://${ziti_sdk_js_location}",
      logLevel: "${common.logLevelGetForClient(zitiClient)}"
    },
    zitiSDKjsInjectionURL: {
      location: "${zitiSDKjsInjectionURL}",
    }
  },
  serviceWorker: {
    location: "ziti-sw.js",
    active: false
  }
}
`

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
 * Generates the config for the Ziti JS SDK
 *
 */
 common.generateAccessControlAllowOrigin = function() {

  var agent_host = process.env.ZITI_AGENT_HOST;

  return `https://${agent_host}`;

}
  

/**
 * Determine if 'path' is one on the 'target path'
 */
common.isRequestOnTargetPath = function( options, path ) {

  let result = false;

  var regex = new RegExp( path + '$', 'g' );
  let hit = (options.targetPath.match(regex) || []).length;
  if ((hit > 0)) {
    options.logger.debug('common.isRequestOnTargetPath: HIT on path [%s]', path);
    result = true;
  }  

  return result;
}
