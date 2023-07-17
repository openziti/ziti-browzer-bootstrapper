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

// const SegfaultHandler = require('segfault-handler');
// SegfaultHandler.registerHandler('log/crash.log');
                  require('dotenv').config();
const path      = require('path');
const http      = require("http");
const https     = require("https");
const fs        = require('fs');
const express   = require("express");
const crypto    = require('crypto');
const httpProxy = require('./lib/http-proxy');
const common    = require('./lib/http-proxy/common');
const pjson     = require('./package.json');
const winston   = require('winston');
const { v4: uuidv4 } = require('uuid');
var Validator   = require('jsonschema').Validator;
var jsonschemaValidator = new Validator();
var cookieParser = require('cookie-parser')
const helmet    = require("helmet");
const vhost     = require('vhost');
const forEach   = require('lodash.foreach');
const { satisfies } = require('compare-versions');


var logger;     // for ziti-http-agent

/**
 * 
 */
 var targets = process.env.ZITI_AGENT_TARGETS;
 if (typeof targets === 'undefined') { throw new Error('ZITI_AGENT_TARGETS value not specified'); }
 var jsonTargetArray = JSON.parse(targets);

 var targetsSchema = {
    "id": "/Targets",
    "type": "object",
    "properties": {
        "targetArray": {
            "type": "array",
            "items": {
                "properties": {
                    "vhost": {
                        "type": "string"
                    },
                    "service": {
                        "type": "string"
                    },
                    "path": {
                        "type": "string"
                    },
                    "scheme": {
                        "type": "string",
                        "enum": [
                            "http", 
                            "https"
                        ]
                    },
                    "idp_issuer_base_url": {
                        "type": "string"
                    },
                    "idp_client_id": {
                        "type": "string"
                    },
                },
                "required": [
                    "vhost", "service", "idp_issuer_base_url", "idp_client_id"
                ],
            }        
        },
    },
    "required": ["targetArray"]
};
var arraySchema = {
    "type": "array",
    "uniqueItems": true
}   

/**
 * 
 */
var agent_scheme = process.env.ZITI_AGENT_SCHEME;
if (typeof agent_scheme === 'undefined') { 
    agent_scheme = 'http'; 
}
if (typeof agent_scheme !== 'string') { throw new Error('ZITI_AGENT_SCHEME value is not a string'); }
if (agent_scheme !== 'http' && agent_scheme !== 'https') { throw new Error(`ZITI_AGENT_SCHEME value [${agent_scheme}] is invalid`); }
 
/**
 * 
 */
var certificate_path;
if (agent_scheme === 'https') {
    certificate_path = process.env.ZITI_AGENT_CERTIFICATE_PATH;
    if (typeof certificate_path === 'undefined') { throw new Error('ZITI_AGENT_CERTIFICATE_PATH value not specified'); }
    if (typeof certificate_path !== 'string') { throw new Error('ZITI_AGENT_CERTIFICATE_PATH value is not a string'); }
}
 
/**
 * 
 */
var key_path;
if (agent_scheme === 'https') {
    key_path = process.env.ZITI_AGENT_KEY_PATH;
    if (typeof key_path === 'undefined') { throw new Error('ZITI_AGENT_KEY_PATH value not specified'); }
    if (typeof key_path !== 'string') { throw new Error('ZITI_AGENT_KEY_PATH value is not a string'); }
}

/**
 * 
 */
var agent_host = process.env.ZITI_AGENT_HOST;
if (typeof agent_host === 'undefined') { throw new Error('ZITI_AGENT_HOST value not specified'); }
if (typeof agent_host !== 'string') { throw new Error('ZITI_AGENT_HOST value is not a string'); }

var ziti_controller_host = process.env.ZITI_CONTROLLER_HOST;
if (typeof ziti_controller_host === 'undefined') { throw new Error('ZITI_CONTROLLER_HOST value not specified'); }
if (typeof ziti_controller_host !== 'string') { throw new Error('ZITI_CONTROLLER_HOST value is not a string'); }
if (ziti_controller_host === agent_host) { throw new Error('ZITI_CONTROLLER_HOST value and ZITI_AGENT_HOST value cannot be the same'); }
var ziti_controller_port = process.env.ZITI_CONTROLLER_PORT;

var zbr_src = `${agent_host}/ziti-browzer-runtime.js`;

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


/**
 *  These are the supported values for loglevel
 * 
    error 
    warn 
    info 
    http
    verbose 
    debug 
    silly
 *
 */
var ziti_agent_loglevel = process.env.ZITI_AGENT_LOGLEVEL;
if (typeof ziti_agent_loglevel === 'undefined') { ziti_agent_loglevel = 'info'; }
ziti_agent_loglevel = ziti_agent_loglevel.toLowerCase();

/**
 *  DDoS protection (request-rate limiting) variables
 */
var ratelimit_terminate_on_exceed = process.env.ZITI_AGENT_RATELIMIT_TERMINATE_ON_EXCEED;
if (typeof ratelimit_terminate_on_exceed !== 'undefined') {
    if (!common.toBool(ratelimit_terminate_on_exceed)) {
        throw new Error('ZITI_AGENT_RATELIMIT_TERMINATE_ON_EXCEED value is not a boolean');
    }
} else {
    ratelimit_terminate_on_exceed = true;
}

var ratelimit_reqs_per_minute = process.env.ZITI_AGENT_RATELIMIT_REQS_PER_MINUTE;
if (typeof ratelimit_reqs_per_minute === 'undefined') { ratelimit_reqs_per_minute = 300; }

var ratelimit_whitelist = process.env.ZITI_AGENT_RATELIMIT_WHITELIST;
var ratelimit_whitelist_array = [];
if (typeof ratelimit_whitelist !== 'undefined') {
    if (typeof ratelimit_whitelist !== 'string') {
        throw new Error('ZITI_AGENT_RATELIMIT_WHITELIST value is not a string');
    }
    ratelimit_whitelist_array = ratelimit_whitelist.split(',');
} 

var ratelimit_blacklist = process.env.ZITI_AGENT_RATELIMIT_BLACKLIST;
var ratelimit_blacklist_array = [];
if (typeof ratelimit_blacklist !== 'undefined') { 
    if (typeof ratelimit_blacklist !== 'string') {
        throw new Error('ZITI_AGENT_RATELIMIT_BLACKLIST value is not a string');
    }
    ratelimit_blacklist_array = ratelimit_blacklist.split(',');
}
 
var cidr_whitelist = process.env.ZITI_AGENT_CIDR_WHITELIST;
var cidr_whitelist_array = [];
if (typeof cidr_whitelist !== 'undefined') { 
    if (typeof cidr_whitelist !== 'string') {
        throw new Error('ZITI_AGENT_CIDR_WHITELIST value is not a string');
    }
    cidr_whitelist_array = cidr_whitelist.split(',');
}

/** --------------------------------------------------------------------------------------------------
 *  Create logger 
 */
const createLogger = () => {

    var logDir = 'log';

    if ( !fs.existsSync( logDir ) ) {
        fs.mkdirSync( logDir );
    }

    const { combine, timestamp, label, printf, splat, json } = winston.format;

    const logFormat = printf(({ level, message, durationMs, timestamp }) => {
        if (typeof durationMs !== 'undefined') {
            return `${timestamp} ${level}: [${durationMs}ms]: ${message}`;
        } else {
            return `${timestamp} ${level}: ${message}`;
        }
    });
    
    var logger = winston.createLogger({
        level: ziti_agent_loglevel,
        format: combine(
            splat(),
            timestamp(),
            logFormat
        ),
        transports: [
            new winston.transports.Console({format: combine( timestamp(), logFormat, json() ), }),
        ],
        exceptionHandlers: [    // handle Uncaught exceptions
            new winston.transports.Console({format: combine( timestamp(), logFormat ), }),
        ],
        rejectionHandlers: [    // handle Uncaught Promise Rejections
            new winston.transports.Console({format: combine( timestamp(), logFormat ), }),
        ],
        exitOnError: false,     // Don't die if we encounter an uncaught exception or promise rejection
    });
    
    return( logger );
}

var selects = [];

/** --------------------------------------------------------------------------------------------------
 *  Start the agent
 */
const startAgent = ( logger ) => {

    /** --------------------------------------------------------------------------------------------------
     *  Dynamically modify the proxied site's <head> element as we stream it back to the browser.  We will:
     *  1) inject the zitiConfig needed by the SDK
     *  2) inject the Ziti browZer Runtime
     */
    var headselect = {};

    headselect.query = 'head';
    headselect.func = function (node, req) {

        node.rs = node.createReadStream();
        node.ws = node.createWriteStream({outer: false, emitClose: true});

        node.rs.on('error', () => {
            node.ws.end();
            this.destroy();
        });
         
        node.rs.on('end', () => {
            node.ws.end();
            node.rs = null;
            node.ws = null;
        });

        // Inject the Ziti browZer Runtime at the front of <head> element so we are prepared to intercept as soon as possible over on the browser
        let ziti_inject_html = `
<!-- load Ziti browZer Runtime -->
<script id="from-ziti-http-agent" type="text/javascript" src="${req.ziti_agent_scheme}://${req.ziti_vhost}:${agent_listen_port}/${common.getZBRname()}"></script>
`;
        node.ws.write( ziti_inject_html );

        // Read the node and put it back into our write stream.
        node.rs.pipe(node.ws, {});	
    } 

    selects.push(headselect);
    /** -------------------------------------------------------------------------------------------------- */


    /** --------------------------------------------------------------------------------------------------
     *  Dynamically modify the proxied site's <meta http-equiv="Content-Security-Policy" ...>  element as 
     *  we stream it back to the browser.  We will ensure that:
     *  1) the CSP will allow loading the Ziti browZer Runtime from specified CDN
     *  2) the CSP will allow webassembly (used within the Ziti browZer Runtime) to load
     */
    var metaselect = {};

    metaselect.query = 'meta';
    metaselect.func = function (node) {

        var attr = node.getAttribute('http-equiv');
        if (typeof attr !== 'undefined') {

            if (attr === 'Content-Security-Policy') {

                var content = node.getAttribute('content');
                if (typeof content !== 'undefined') {

                    content += ' * ' + zbr_src + "/ 'unsafe-inline' 'unsafe-eval' 'wasm-eval'";

                    node.setAttribute('content', content);
                }
            }
        }
    } 

    selects.push(metaselect);
    /** -------------------------------------------------------------------------------------------------- */

    /** --------------------------------------------------------------------------------------------------
     *  Dynamically modify the proxied site's <form method="POST" action="..." ...> element as
     *  we stream it back to the browser.  We will ensure that:
     *  1) the ACTION is massaged to ensure that the target specified is changed to the HTTP Agent
     */
    var formselect = {};

    formselect.query = 'form';
    formselect.func = function (node) {

        var action = node.getAttribute('action');
        if (typeof action !== 'undefined') {

            var actionUrl = new URL( action );

            if ((actionUrl.protocol === 'http:') || (actionUrl.protocol === 'https:')) {

                let href = actionUrl.href;

                let origin = actionUrl.origin;

                let protocol = actionUrl.protocol;

                let hostname = actionUrl.hostname;

                let host = actionUrl.host;

            }
        }
    }

    selects.push(formselect);
    /** -------------------------------------------------------------------------------------------------- */

    logger.info({message: 'contacting specified controller', host: ziti_controller_host, port: ziti_controller_port});

    // process.env['NODE_EXTRA_CA_CERTS'] = 'node_modules/node_extra_ca_certs_mozilla_bundle/ca_bundle/ca_intermediate_root_bundle.pem';

    const request = https.request({
        hostname: ziti_controller_host,
        port: ziti_controller_port,
        path: '/version',
        method: 'GET',
        timeout: 3000,
      }, function(res) {
        if (res.statusCode !== 200) {
            logger.error({message: 'cannot contact specified controller', statusCode: res.statusCode, controllerHost: ziti_controller_host, controllerPort: ziti_controller_port});
            process.exit(-1);
        }
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            var jsonTargetArray = JSON.parse(chunk);
            let controllerVersion = jsonTargetArray.data.version.replace('v','');
            logger.info({message: 'attached controller version', controllerVersion: controllerVersion});
            let compatibleControllerVersion = `${pjson.compatibleControllerVersion}`;
            if (controllerVersion !== '0.0.0') {
                if (!satisfies(controllerVersion, compatibleControllerVersion)) {
                    logger.error({message: 'incompatible controller version', controllerVersion: controllerVersion, compatibleControllerVersion: compatibleControllerVersion});
                    process.exit(-1);
                }
            }
        });
    }).end();
    request.on('timeout', () => {
        request.destroy();
        logger.error({message: 'timeout attempting to contact specified controller', controllerHost: ziti_controller_host, controllerPort: ziti_controller_port});
        process.exit(-1);
    });
    
      
    /** --------------------------------------------------------------------------------------------------
     *  Crank up the web server.  The 'agent_listen_port' value can be arbitrary since it is used
     *  inside the container.  Port 443|80 is typically mapped onto the 'agent_listen_port' e.g. 443->8443
     */
    var options = {
        logger: logger,

        // Set up to rewrite 'Location' headers on redirects
        hostRewrite: agent_host,
        autoRewrite: true,

        // Pass in the dark web app target array
        targetArray: jsonTargetArray.targetArray,
    };
    
    var app                     = express();
    var target_apps             = new Map();
    var target_app_to_target    = new Map();

    forEach(jsonTargetArray.targetArray, function(target) {

        target_apps.set(target.vhost, express());

        var target_app = target_apps.get(target.vhost);

        target_app_to_target.set(target_app, target);

        target_app.use(function (req, res, next) {

            var target = target_app_to_target.get(target_app);


            req.ziti_vhost           = target.vhost;
            req.ziti_target_service  = target.service;
            if (typeof target.path === 'undefined') { 
                target.path = '/';
            }
            req.ziti_target_path     = target.path;
            if (typeof target.scheme === 'undefined') { 
                target.path = 'http';
            }
            req.ziti_target_scheme   = target.scheme;
            req.ziti_agent_scheme    = agent_scheme;
            req.ziti_idp_issuer_base_url = target.idp_issuer_base_url;
            req.ziti_idp_client_id   = target.idp_client_id;

            next();
        });  

        target_app.use(require('./lib/inject')(options, [], selects));

    });
      

    /** --------------------------------------------------------------------------------------------------
     *  HTTP Header middleware
     */
    //  app.use(helmet.contentSecurityPolicy());
    //  app.use(helmet({ crossOriginEmbedderPolicy: false }));
    //  app.use(helmet.crossOriginOpenerPolicy());
    //  app.use(helmet.crossOriginResourcePolicy());
    //  app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
     app.use(helmet.dnsPrefetchControl());
     app.use(helmet.expectCt());
     app.use(helmet.frameguard());
     app.use(helmet.hidePoweredBy());
     app.use(helmet.hsts());
     app.use(helmet.ieNoOpen());
     app.use(helmet.noSniff());
     app.use(helmet.originAgentCluster());
     app.use(helmet.permittedCrossDomainPolicies());
     app.use(helmet.referrerPolicy());
     app.use(helmet.xssFilter());

     app.use(cookieParser())

     app.use('/healthcheck', require('express-healthcheck')({
        healthy: function () {
            return {
                version: pjson.version,
                uptime: process.uptime(),
                date: new Date(),
            };
        }
    }));

    /** -------------------------------------------------------------------------------------------------- */


    options.logger.debug({message: 'configured target service(s)', targets: JSON.parse(targets)});
          

    var proxy = httpProxy.createProxyServer(options);

    /**
     *  Loop through the target app array and set up
     */
    forEach(jsonTargetArray.targetArray, function(target) {

        var target_app = target_apps.get(target.vhost);

        app.use(vhost(target.vhost, target_app));
    });


    app.use(function (req, res) {
        proxy.web(req, res);
    });

    /**
     * 
     */
    if (agent_scheme === 'https') {

        https.createServer({
            cert: fs.readFileSync(certificate_path),
            key: fs.readFileSync(key_path),
        }, app).listen(agent_listen_port, "0.0.0.0", function() {
            logger.info({message: 'listening', port: agent_listen_port, scheme: agent_scheme});
        });

    }
    else {

        http.createServer({
        }, app).listen(agent_listen_port, "0.0.0.0", function() {
            logger.info({message: 'listening', port: agent_listen_port, scheme: agent_scheme});
        });

    }
    /** -------------------------------------------------------------------------------------------------- */
    
};


/**
 * 
 */
const main = async () => {

    uuid = uuidv4();

    logger = createLogger();

    logger.info({message: 'ziti-http-agent initializing', version: pjson.version});

    let validationResult = jsonschemaValidator.validate(jsonTargetArray, targetsSchema, {
        allowUnknownAttributes: false,
        nestedErrors: true
    });
    if (!validationResult.valid) {
        validationResult.errors.map(function(err) {
            logger.error({message: 'targets specification error', error: `${err}`});
        });          
        process.exit(-1);
    }   
    validationResult = jsonschemaValidator.validate(jsonTargetArray.targetArray, arraySchema, {
        allowUnknownAttributes: false,
        nestedErrors: true
    });
    if (!validationResult.valid) {
        validationResult.errors.map(function(err) {
            logger.error({message: 'targets specification error', error: `${err}`});
        });          
        process.exit(-1);
    }   


    // Now start the Ziti HTTP Agent
    try {
        startAgent( logger );
    }
    catch (e) {
        console.error(e);
    }

};
  
main();
  