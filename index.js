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

const SegfaultHandler = require('segfault-handler');
SegfaultHandler.registerHandler('log/crash.log');
                  require('dotenv').config();
const path      = require('path');
const fs        = require('fs');
const connect   = require('connect');
const httpProxy = require('./lib/http-proxy');
const common    = require('./lib/http-proxy/common');
const rateLimiter = require('./lib/rate-limiter');
const terminate = require('./lib/terminate');
const pjson     = require('./package.json');
const winston   = require('winston');
const { v4: uuidv4 } = require('uuid');
const Rest      = require('connect-rest');
// const serveStatic = require('serve-static');
// const heapdump  = require('heapdump');
const greenlock_express = require("greenlock-express");
const pkg       = require('./package.json');




var logger;     // for ziti-http-agent

var uuid;       // for API authn

var ziti;

/**
 * 
 */
var ziti_sdk_js_src = process.env.ZITI_SDK_JS_SRC;

/**
 * 
 */
var target_scheme = process.env.ZITI_AGENT_TARGET_SCHEME;
if (typeof target_scheme === 'undefined') { target_scheme = 'https'; }
var target_host = process.env.ZITI_AGENT_TARGET_HOST;
var target_port = process.env.ZITI_AGENT_TARGET_PORT;

/**
 * 
 */
var agent_host = process.env.ZITI_AGENT_HOST;
var agent_http_port = process.env.ZITI_AGENT_HTTP_PORT;
if (typeof agent_http_port === 'undefined') { agent_http_port = 8080; }
var agent_https_port = process.env.ZITI_AGENT_HTTPS_PORT;
if (typeof agent_https_port === 'undefined') { agent_https_port = 8443; }


/**
 * 
 */
var agent_identity_path = process.env.ZITI_AGENT_IDENTITY_PATH;

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
 * 
 */
var ziti_agent_acme_maintainerEmail = process.env.ZITI_AGENT_ACME_MAINTAINER_EMAIL;
if (typeof ziti_agent_acme_maintainerEmail === 'undefined') { ziti_agent_acme_maintainerEmail = 'openziti@netfoundry.io'; }


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
if (typeof ratelimit_reqs_per_minute === 'undefined') { ratelimit_reqs_per_minute = 30; }

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
    
    // // If we're not in production then log to the `console` with the format:
    // //  `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
    if ((typeof process.env.NODE_ENV === 'undefined') || (process.env.NODE_ENV === 'undefined') || (process.env.NODE_ENV !== 'production')) {
        console.log(`-------> createLogger() adding winston.transports.Console`);

        logger.add(new winston.transports.Console({
            format: combine(
                timestamp(),
                logFormat
            ),
        }));
    }

    return( logger );
}



var selects = [];


/** --------------------------------------------------------------------------------------------------
 *  Initialize the Ziti NodeJS SDK 
 */
const zitiInit = () => {

    return new Promise((resolve, reject) => {

        var rc = ziti.ziti_init( agent_identity_path , ( init_rc ) => {
            if (init_rc < 0) {
                return reject('ziti_init failed');
            }
            return resolve();
        });

        if (rc < 0) {
            return reject('ziti_init failed');
        }

    });
};


/** --------------------------------------------------------------------------------------------------
 *  Start the agent
 */
const startAgent = ( logger ) => {

    /** --------------------------------------------------------------------------------------------------
     *  Dynamically modify the proxied site's <head> element as we stream it back to the browser.  We will:
     *  1) inject the zitiConfig needed by the SDK
     *  2) inject the Ziti JS SDK
     */
    var headselect = {};

    headselect.query = 'head';
    headselect.func = function (node) {

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

        // Inject the Ziti JS SDK at the front of <head> element so we are prepared to intercept as soon as possible over on the browser
        let ziti_inject_html = `
<!-- config for the Ziti JS SDK -->
<script type="text/javascript">${common.generateZitiConfig()}</script>
<!-- load the Ziti JS SDK itself -->
<script type="text/javascript" src="https://${ziti_sdk_js_src}"></script>
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
     *  1) the CSP will allow loading the Ziti JS SDK from specified CDN
     *  2) the CSP will allow webassembly (used within the Ziti JS SDK) to load
     *  3) the CSP will allow the above-injected inline JS (SDK config) to execute
     */
    var metaselect = {};

    metaselect.query = 'meta';
    metaselect.func = function (node) {

        var attr = node.getAttribute('http-equiv');
        if (typeof attr !== 'undefined') {

            if (attr === 'Content-Security-Policy') {

                var content = node.getAttribute('content');
                if (typeof content !== 'undefined') {

                    content += ' * ' + ziti_sdk_js_src + "/ 'unsafe-inline' 'unsafe-eval'";

                    node.setAttribute('content', content);
                }
            }
        }
    } 

    selects.push(metaselect);
    /** -------------------------------------------------------------------------------------------------- */

    var app = connect();

    var rest = Rest.create(
        {
            context: '/ziti',
            'logger': 'connect-rest',
            apiKeys: [ uuid ],
        }    
    );

    app.use( rest.processRequest() )

    function mapEntriesToString(entries) {
        return Array
          .from(entries, ([k, v]) => `${k}:${v}, `)
          .join("") + "";
    }

    rest.post('/loglevel/:client/:level', async function( req ) {

        const client = req.parameters.client;
        const level = req.parameters.level;

        common.logLevelSet(client, level);

        return { 
            result: {
                logLevel: common.logLevelGet()
            }, 
            options: { 
                statusCode: 200
            } 
        }
    });

    rest.get('/loglevel', async function( req ) {
        
        return { 
            result: {
                logLevel: common.logLevelGet()
            }, 
            options: { 
                statusCode: 200
            } 
        }
    });

    
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


    /** --------------------------------------------------------------------------------------------------
     *  
     */
    //  app.use('/ziti/loglevel', function loglevelMiddleware(req, res, next) {

    //     logger.info(`loglevelMiddleware entered`);

    //     logger.info(`req is: %o`, req);
    //     const token = req.query.token;
    //     const client_ip = req.query.client_ip;
    //     const log_level = req.query.log_level;

    //     logger.info(`client_ip: ${client_ip}`);
    //     logger.info(`token: ${token}`);

    //     if (token !== uuid) {
    //         res.writeHead(401, { 'x-ziti-http-agent-forbidden': 'access prohibited' });
    //         res.end('');
    //         return;    
    //     }

    //     if (typeof client_ip === undefined) {
    //         res.writeHead(403, { 'x-ziti-http-agent-forbidden': 'client_ip not specified' });
    //         res.end('');
    //         return;    
    //     }

    //     res.writeHead(200, { 'x-ziti-http-agent': `client_ip '${client_ip}' now at log_level '${log_level}'` });
    //     res.end('');
    // });
    /** -------------------------------------------------------------------------------------------------- */


    /** --------------------------------------------------------------------------------------------------
     *  Set up the Let's Encrypt infra.  
     *  The configured 'agent_host' will be used when auto-generating the TLS certs.
     */

    try {

        // Let's Encrypt staging API
        var acme_server =  'https://acme-staging-v02.api.letsencrypt.org/directory';
        // Let's Encrypt production API
        // var acme_server =  'https://acme-v02.api.letsencrypt.org/directory';
            
        var configDir;
        if (fs.existsSync('/ziti')) {
            configDir = '/ziti/greenlock.d';                        // running in a container w/ziti volume mounted to host
        } else {
            configDir = './greenlock.d';                            // running on dev box with just node
        }

        var gle = greenlock_express.init({
            version: 'draft-12'                                     // 'draft-12' or 'v01'
                                                                    // 'draft-12' is for Let's Encrypt v2 otherwise known as ACME draft 12
                                                                    // 'v02' is an alias for 'draft-12'
                                                                    // 'v01' is for the pre-spec Let's Encrypt v1
          , server: acme_server

          , subject: agent_host
          , altnames: [agent_host]
                      
          , maintainerEmail: ziti_agent_acme_maintainerEmail

          , packageRoot: __dirname
          , configDir: configDir
          , packageAgent: pkg.name + '/' + pkg.version

          , challengeType: 'http-01'                                // default to this challenge type
          , agreeToTerms: true                                      // hook to allow user to view and accept LE TOS
           
                                                                    // renewals happen at a random time within this window
          , renewWithin: 14 * 24 * 60 * 60 * 1000                   // certificate renewal may begin at this time
          , renewBy:     10 * 24 * 60 * 60 * 1000                   // certificate renewal should happen by this time
           
          , debug: true
          , log: function (debug) {
              logger.debug('greenlock, log() entered: %o', debug);
            } 

          , serverKeyType: "RSA-4096"

          , cluster: false
          
          , notify: function(event, details) {
                logger.info('greenlock event: %o, details: %o', event, details);
            }    
        });

        gle.ready(httpsWorker);

    } catch (e) {
        logger.error('exception: %o', e);
    }
    /** -------------------------------------------------------------------------------------------------- */

      

    /** --------------------------------------------------------------------------------------------------
     *  Initiate the proxy and engage the content injectors.
     */
    function httpsWorker( glx ) {

        logger.info(`httpsWorker starting`);

        var proxy = httpProxy.createProxyServer({
            ziti: ziti,
            logger: logger,
            changeOrigin: true,
            target: target_scheme + '://' + target_host + ':' + target_port,

            // Set up to rewrite 'Location' headers on redirects
            hostRewrite: agent_host,
            autoRewrite: true,
        });
        
        app.use(require('./lib/inject')([], selects));
    
        app.use(function (req, res) {
            proxy.web(req, res);
        })
    /** -------------------------------------------------------------------------------------------------- */
    

    /** --------------------------------------------------------------------------------------------------
     *  Crank up the web server (which will do all the magic regarding cert acquisition, refreshing, etc)
     *  The 'agent_http_port' and 'agent_https_port' values can be arbitrary values since they are used
     *  inside the container.  The ports 80/443 are typically mapped onto the 'agent_http_port' and 
     *  'agent_https_port' values.  e.g.  80->8080 & 443->8443
     */
        // Start a TLS-based listener on the configured port
        const httpsServer = glx.httpsServer(null, app);
        
        httpsServer.on('error', function (e) {
            logger.info('err: %o', e);
        });
            
        httpsServer.listen( agent_https_port, "0.0.0.0", function() {
            logger.info('Listening on %o', httpsServer.address());
        });

        // ALSO listen on port 80 for ACME HTTP-01 Challenges
        // (the ACME and http->https middleware are loaded by glx.httpServer)
        var httpServer = glx.httpServer();

        httpServer.on('error', function (e) {
            logger.info('err: %o', e);
        });

        httpServer.listen( agent_http_port, "0.0.0.0", function() {
            logger.info('Listening on %o', httpServer.address());
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

    logger.info(`ziti-http-agent version ${pjson.version} starting at ${new Date()}`);

    logger.info(`ziti-http-agent uuid to auth API is: ${uuid}`);

    ziti = require('ziti-sdk-nodejs');
    require('assert').strictEqual(ziti.ziti_hello(),"ziti");

    zitiInit().then( () =>  {
        logger.info('zitiInit() completed');
    } ).catch((err) => {
        logger.error('FAILURE: (%s)', err);
        setTimeout(function(){  
            process.exit(-1);
        }, 1000);
    });


    // Now start the Ziti HTTP Agent
    try {
        startAgent( logger );
    }
    catch (e) {
        console.error(e);
    }

};
  
main();
  