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
const https     = require("https");
const fs        = require('fs');
const express   = require("express");
const crypto    = require('crypto');
const httpProxy = require('./lib/http-proxy');
const common    = require('./lib/http-proxy/common');
const whiteListFilter = require('./lib/white-list-filter');
const rateLimiter = require('./lib/rate-limiter');
const terminate = require('./lib/terminate');
const pjson     = require('./package.json');
const winston   = require('winston');
const { v4: uuidv4 } = require('uuid');

const { auth }  = require('express-openid-connect');
const helmet    = require("helmet");


var logger;     // for ziti-http-agent

var uuid;       // for API authn

/**
 * 
 */
 var certificate_path = process.env.ZITI_AGENT_CERTIFICATE_PATH;
 if (typeof certificate_path === 'undefined') { throw new Error('ZITI_AGENT_CERTIFICATE_PATH value not specified'); }
 if (typeof certificate_path !== 'string') { throw new Error('ZITI_AGENT_CERTIFICATE_PATH value is not a string'); }
 
/**
 * 
 */
 var key_path = process.env.ZITI_AGENT_KEY_PATH;
 if (typeof key_path === 'undefined') { throw new Error('ZITI_AGENT_KEY_PATH value not specified'); }
 if (typeof key_path !== 'string') { throw new Error('ZITI_AGENT_KEY_PATH value is not a string'); }

/**
 * 
 */
var target_service = process.env.ZITI_AGENT_TARGET_SERVICE;
if (typeof target_service === 'undefined') { throw new Error('ZITI_AGENT_TARGET_SERVICE value not specified'); }
if (typeof target_service !== 'string') { throw new Error('ZITI_AGENT_TARGET_SERVICE value is not a string'); }

/**
 * 
 */
var agent_host = process.env.ZITI_AGENT_HOST;
if (typeof agent_host === 'undefined') { throw new Error('ZITI_AGENT_HOST value not specified'); }
if (typeof agent_host !== 'string') { throw new Error('ZITI_AGENT_HOST value is not a string'); }

var zbr_src = `${agent_host}/ziti-browzer-runtime.js`;

var agent_https_port = process.env.ZITI_AGENT_HTTPS_PORT;
if (typeof agent_https_port === 'undefined') { agent_https_port = 8443; }


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

var target_path = process.env.ZITI_AGENT_TARGET_PATH;
if (typeof target_path === 'undefined') { target_path = '/'; }

/** --------------------------------------------------------------------------------------------------
 *  Create logger 
 */
const createLogger = () => {

    var logDir = 'log';

    if ( !fs.existsSync( logDir ) ) {
        fs.mkdirSync( logDir );
    }

    const { combine, timestamp, label, printf, splat } = winston.format;

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
            new winston.transports.Console({format: combine( timestamp(), logFormat ), }),
        ],
        exceptionHandlers: [    // handle Uncaught exceptions
            new winston.transports.File({ filename: path.join(__dirname, logDir, '/ziti-http-agent-uncaught-exceptions.log' ) })
        ],
        rejectionHandlers: [    // handle Uncaught Promise Rejections
            new winston.transports.File({ filename: path.join(__dirname, logDir, '/ziti-http-agent-uncaught-promise-rejections.log' ) })
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
<script id="from-ziti-http-agent" type="text/javascript" src="https://${agent_host}/${common.getZBRname()}"></script>
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
                logger.debug('actionUrl.href is: %o', href);

                let origin = actionUrl.origin;
                logger.debug('actionUrl.origin is: %o', origin);

                let protocol = actionUrl.protocol;
                logger.debug('actionUrl.protocol is: %o', protocol);

                let hostname = actionUrl.hostname;
                logger.debug('actionUrl.hostname is: %o', hostname);

                let host = actionUrl.host;
                logger.debug('actionUrl.host is: %o', host);

            }
        }
    }

    selects.push(formselect);
    /** -------------------------------------------------------------------------------------------------- */

    var app = express();

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
    /** -------------------------------------------------------------------------------------------------- */

    /** --------------------------------------------------------------------------------------------------
     *  Engage the OpenID Connect middleware.
     */
     app.use(

        auth({

            authRequired:   true,

            idpLogout:      true,

            attemptSilentLogin: false,

            clientID:       process.env.IDP_CLIENT_ID,
            issuerBaseURL:  process.env.IDP_ISSUER_BASE_URL,

            secret:         crypto.randomBytes(32).toString('hex'),

            baseURL:        'https://' + process.env.ZITI_AGENT_HOST,
            
            authorizationParams: {  // we need this in order to acquire the User's externalId (claimsProperty) from the IdP
                response_type:  'id_token',
                scope:          'openid ' + process.env.IDP_CLAIMS_PROPERTY,
                audience:       'https://' + process.env.ZITI_AGENT_HOST,
                
                prompt:         'login',
            },

            session: {
                name: 'browZerSession',
                absoluteDuration: process.env.IDP_TOKEN_DURATION ? process.env.IDP_TOKEN_DURATION : 28800,
                rolling: false,
                cookie: {
                    httpOnly: false,    // ZBR needs to access this
                    domain: `${process.env.ZITI_AGENT_HOST}`
                }
            }
        }),

    );
    /** -------------------------------------------------------------------------------------------------- */


    /** --------------------------------------------------------------------------------------------------
     *  Set up the White List filter
     */
    app.use(
        whiteListFilter(
            {
                logger: logger,

                cidrList: cidr_whitelist_array, // By default all clients are allowed in

            }
        )
    );
    /** -------------------------------------------------------------------------------------------------- */

    
    /** --------------------------------------------------------------------------------------------------
     *  Set up the DDoS limiter
     */
    app.use(
        rateLimiter(
            {
                logger: logger,

                end: ratelimit_terminate_on_exceed,   // Whether to terminate the request if rate-limit exceeded

                whitelist: ratelimit_whitelist_array, // By default client names in the whitelist will be subject to 4000 requests per hour

                blacklist: ratelimit_blacklist_array, // By default client names in the blacklist will be subject to 0 requests per 0 time. In other words they will always be exceding the rate limit

                categories: {

                    normal: {
                        totalRequests:  ratelimit_reqs_per_minute,
                        every:          (60 * 1000)
                    },

                    whitelist: {
                        every:          (60 * 60 * 1000)
                    },

                    blacklist: {
                        totalRequests:  0,
                        every:          0 
                    }
                }
            }
        )
    );
    /** -------------------------------------------------------------------------------------------------- */

    logger.info('target path: %o', target_path);
          

    /** --------------------------------------------------------------------------------------------------
     *  Crank up the web server.  The 'agent_https_port' value can be arbitrary since it is used
     *  inside the container.  Port 443 is typically mapped onto the 'agent_http_port' e.g. 443->8443
     */
    var proxy = httpProxy.createProxyServer({
        logger: logger,
        changeOrigin: true,
        target: 'https://' + target_service,
        targetPath: target_path,

        // Set up to rewrite 'Location' headers on redirects
        hostRewrite: agent_host,
        autoRewrite: true,
    });
    
    app.use(require('./lib/inject')([], selects));

    app.use(function (req, res) {
        proxy.web(req, res);
    })

    https.createServer({
        cert: fs.readFileSync(certificate_path),
        key: fs.readFileSync(key_path),
    }, app).listen(agent_https_port, "0.0.0.0", function() {
        logger.info('Listening on %o', agent_https_port);
    });
    /** -------------------------------------------------------------------------------------------------- */
    
};


/**
 * 
 */
const main = async () => {

    uuid = uuidv4();

    logger = createLogger();

    logger.info(`ziti-http-agent version ${pjson.version} starting at ${new Date()}`);

    logger.info(`ziti-http-agent uuid to auth API is: ${uuid}`);


    // Now start the Ziti HTTP Agent
    try {
        startAgent( logger );
    }
    catch (e) {
        console.error(e);
    }

};
  
main();
  