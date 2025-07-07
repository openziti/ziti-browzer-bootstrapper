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


var common   = exports,
    env      = require('../env'),
    url      = require('url'),
    required = require('requires-port'),
    fs       = require('fs'),
    requestIp = require('request-ip'),
    find     = require('lodash.find'),
    { isEqual, isUndefined } = require('lodash'),
    swpjson  = require('@openziti/ziti-browzer-sw/package.json'),
    getAccessToken = require('../../lib/oidc/utils').getAccessToken,
    ZITI_CONSTANTS = require('../../lib/edge/constants'),
    ZitiContext = require('../../lib/edge/context'),
    Mutex    = require('async-mutex').Mutex,
    withTimeout = require('async-mutex').withTimeout,
    pjson    = require('../../package.json');

var zitiContextMutex = withTimeout(new Mutex(), 3 * 1000, new Error('timeout on zitiContextMutex'));


var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i,
    isSSL = /^https/;

/**
 * Simple Regex for testing if protocol is https
 */
common.isSSL = isSSL;

common.getConfigValue = function( ...args ) {
  return env( args );
}

/**
 * 
 */
var logLevelMap = new Map();
var logLevel = env('ZITI_BROWZER_RUNTIME_LOGLEVEL');
logLevelMap.set('*', logLevel);
 
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
    level = logLevel ? logLevel : 'error';
  }
  return level;
};

common.removeValue = function(list, value, separator) {
  if (typeof list === 'undefined') return list;
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
  outgoing.headers = Object.assign({}, req.headers);

  if (options.headers){
    Object.assign(outgoing.headers, options.headers);
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

common.getZBRCSSname = function() {

  try {
    let pathToZitiBrowzerRuntimeModule = require.resolve('@openziti/ziti-browzer-runtime');
    pathToZitiBrowzerRuntimeModule = pathToZitiBrowzerRuntimeModule.substring(0, pathToZitiBrowzerRuntimeModule.lastIndexOf('/'));
    let zbrCSSName;
    fs.readdirSync(pathToZitiBrowzerRuntimeModule).forEach(file => {
      if (file.startsWith('ziti-browzer-css-')) {
        zbrCSSName = file;
      }
    });
    
    return zbrCSSName;
    
  }
  catch (e) {
    console.error(e);
  }
  
}

common.generateZitiConfigObject = function(url, req, options) {

  var client = requestIp.getClientIp(req);
  var zitiClient = client || '*';

  var browzer_bootstrapper_host = req.get('host');

  var u = new URL(`https://${browzer_bootstrapper_host}`);

  var target;
  
  if (env('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS')) {

    target = find(options.targetArray, {
      vhost: `*`
    });

    target_service  = req.ziti_vhost;

    target_path     = target.path;
    target_scheme   = target.scheme;

  } else {

    target = find(options.targetArray, {
      vhost: u.hostname
    });
  
    if (typeof target === 'undefined') {
      options.logger.error({message: 'Host header has no match in targets array', host: browzer_bootstrapper_host});
      target_service  = 'UNKNOWN';
      target_path     = '/';
      target_scheme   = 'https';
    } else {
      target_service  = target.service;
      target_path     = target.path;
      target_scheme   = target.scheme;
    }
  }

  var ziti_controller_host = env('ZITI_CONTROLLER_HOST');
  var ziti_controller_port = env('ZITI_CONTROLLER_PORT');
  var browzer_bootstrapper_scheme = env('ZITI_BROWZER_BOOTSTRAPPER_SCHEME');
  var browzer_bootstrapper_listen_port = env('ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT');
  var idp_issuer_url = req.ziti_idp_issuer_base_url;
  var browzer_load_balancer = env('ZITI_BROWZER_LOAD_BALANCER_HOST');
  var browzer_load_balancer_port = env('ZITI_BROWZER_LOAD_BALANCER_PORT');
  if (!browzer_load_balancer_port) {
    browzer_load_balancer_port = 443;
  }

  let selfHost;
  if (env('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS')) {
    selfHost = `${req.ziti_vhost}.${ common.trimFirstSection( env('ZITI_BROWZER_BOOTSTRAPPER_HOST') )}`
  } else {
    selfHost = `${target.vhost}`;
  }

  let whitelabel = JSON.parse( env('ZITI_BROWZER_WHITELABEL'));
  let svgurl = new URL(whitelabel.branding.browZerButtonIconSvgUrl);
  if (isEqual(browzer_load_balancer, svgurl.hostname)) {
    svgurl.hostname = selfHost;
    whitelabel.branding.browZerButtonIconSvgUrl = svgurl.toString();
  }
  let cssurl = new URL(whitelabel.branding.browZerCSS);
  if (isEqual(browzer_load_balancer, cssurl.hostname)) {
    cssurl.hostname = selfHost;
    whitelabel.branding.browZerCSS = cssurl.toString();
  }

  var ziti_config = 
    {
      controller: {
        api: `https://${ziti_controller_host}:${ziti_controller_port}/edge/client/v1`
      },
      browzer: {
        bootstrapper: {
          self: {
            scheme: `${browzer_bootstrapper_scheme}`,
            host: `${selfHost}`,
            port: `${browzer_bootstrapper_listen_port}`,
            version: `${pjson.version}`,
            latestReleaseVersion: options.getLatestBrowZerReleaseVersion(),
          },
          target: {
            service: `${target_service}`,
            path: `${target_path}`,
            scheme: `${target_scheme}`
          },  
        },
        sw: {
          location: `ziti-browzer-sw.js`,
          version: `${swpjson.version}`, 
          logLevel: `${common.logLevelGetForClient(zitiClient)}`,
        },
        runtime: {
          src: `${common.getZBRname()}`,
          css: `${common.getZBRCSSname()}`,
          logLevel: `${common.logLevelGetForClient(zitiClient)}`,
          skipDeprecationWarnings: env('ZITI_BROWZER_BOOTSTRAPPER_SKIP_DEPRECATION_WARNINGS'),
        },
        loadbalancer: {
          host: browzer_load_balancer ? `${browzer_load_balancer}` : undefined,
          port: browzer_load_balancer ? `${browzer_load_balancer_port}` : undefined
        },
        whitelabel: whitelabel,
      },
      idp: {
        host: `${idp_issuer_url}`,
        clientId: `${req.ziti_idp_client_id}`,
        authorization_endpoint_parms: req.ziti_idp_authorization_endpoint_parms ? `${req.ziti_idp_authorization_endpoint_parms}` : undefined,
        authorization_scope: req.ziti_idp_authorization_scope ? `${req.ziti_idp_authorization_scope}` : undefined,
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
 common.generateAccessControlAllowOrigin = function(req) {

  return `https://${req.ziti_vhost}`;

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
      options.logger.silly({message: 'common.isRequestOnTargetPath: HIT on path', path: path, clientIp: requestIp.getClientIp(req), method: req.method, url: req.url});
      result = true;
    }
  }

  return result;
}

common.addServerHeader = function(headerObj) {
  return Object.assign(headerObj, {
    'Server': `ziti-browzer-bootstrapper/${pjson.version}`
  });
}


/** --------------------------------------------------------------------------------------------------
 *  Spin up a fresh zitiContext 
 */
var zitiContext;
common.newZitiContext = async ( logger ) => {

  await zitiContextMutex.runExclusive(async () => {

    // If we have an active context, release any associated resources
    if (!isUndefined(zitiContext)) {
        logger.silly({message: `now destroying zitiContext[${zitiContext._uuid}] - apiSessionHeartbeat has been cleared`});
        clearTimeout(zitiContext.apiSessionHeartbeatId);
        zitiContext.deleted = true;
        zitiContext = undefined;
    }

    // Instantiate/initialize the zitiContext we will use to obtain Service info from the Controller
    zitiContext = new ZitiContext(Object.assign({
        logger:         logger,
        controllerApi:  `https://${env('ZITI_CONTROLLER_HOST')}:${env('ZITI_CONTROLLER_PORT')}/edge/client/v1`,
        token_type:     `Bearer`,
        access_token:   await getAccessToken( logger ),
    }));
    await zitiContext.initialize( {} );

    // Monitor M2M JWT expiration events
    zitiContext.on(ZITI_CONSTANTS.ZITI_EVENT_IDP_AUTH_HEALTH, common.idpAuthHealthEventHandler);

    await zitiContext.ensureAPISession();

  });

};

/** --------------------------------------------------------------------------------------------------
 *  Refresh the M2M IdP access token if it has expired 
 */
common.idpAuthHealthEventHandler = async ( idpAuthHealthEvent ) => {

    if (!idpAuthHealthEvent.zitiContext.deleted) {
        if (idpAuthHealthEvent.expired) {
            common.newZitiContext( idpAuthHealthEvent.zitiContext.logger );
        }
    }

};


common.setZitiContext = function(context) {
  zitiContext = context;
}
common.getZitiContext = async function() {
  let ctx;
  await zitiContextMutex.runExclusive( () => {
    ctx = zitiContext;
  });
  return ctx;
}

common.trimFirstSection = function(hostname) {
  const sections = hostname.split('.');
  sections.shift();
  const trimmedHostname = sections.join('.');
  return trimmedHostname;
}

common.delay = function(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}
