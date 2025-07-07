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

require('dotenv').config();                  
var env         = require('./lib/env');
const path      = require('path');
const http      = require("http");
const https     = require("https");
const net       = require('net');
const os        = require('os');
const fs        = require('fs');
const tls       = require('tls');
const express   = require("express");
const httpProxy = require('./lib/http-proxy');
const common    = require('./lib/http-proxy/common');
const pjson     = require('./package.json');
const winston   = require('winston');
const { v4: uuidv4 } = require('uuid');
var Validator   = require('jsonschema').Validator;
var cookieParser = require('cookie-parser')
const helmet    = require("helmet");
const vhost     = require('vhost');
const forEach   = require('lodash.foreach');
const { satisfies } = require('compare-versions');
const _httpErrorPages = require('http-error-pages');
const URLON     = require('urlon');
const favicon   = require('serve-favicon');
const { X509Certificate } = require('crypto');
const cron      = require('node-cron');
const { isEqual, isUndefined } = require('lodash');
const NodeCache = require("node-cache");
var getAccessToken = require('./lib/oidc/utils').getAccessToken;
var ZITI_CONSTANTS = require('./lib/edge/constants');
const Mustache = require('mustache');
const he = require('he');


var latestBrowZerReleaseVersion;

const cache = new NodeCache({ stdTTL: 60 * 60 * 3 });   // 3-hour TTL

const verifyCache = (req, res, next) => {
    try {
        const id = req.url;

        if (cache.has(id)) {

            var cacheData = cache.get(id);
            res.writeHead(cacheData.status, cacheData.headers);
            res.write(cacheData.data);
            res.end();

            return;
        }

        return next();

    } catch (err) {
        throw new Error(err);
    }
};
  

var logger;     // for Ziti BrowZer Bootstrapper

/**
 * 
 */
 var targets = env('ZITI_BROWZER_BOOTSTRAPPER_TARGETS')
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
                    "idp_authorization_endpoint_parms": {
                        "type": "string"
                    },
                    "idp_authorization_scope": {
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
var browzer_bootstrapper_scheme =   env('ZITI_BROWZER_BOOTSTRAPPER_SCHEME');
var browzer_load_balancer =         env('ZITI_BROWZER_LOAD_BALANCER_HOST');
var browzer_load_balancer_port =    env('ZITI_BROWZER_LOAD_BALANCER_PORT');
var skip_controller_cert_check =    env('ZITI_BROWZER_BOOTSTRAPPER_SKIP_CONTROLLER_CERT_CHECK');

var certificate_path;
var key_path;
if (browzer_bootstrapper_scheme === 'https') {
    certificate_path =              env('ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH')
    key_path =                      env('ZITI_BROWZER_BOOTSTRAPPER_KEY_PATH')
}
 
var browzer_bootstrapper_host =     env('ZITI_BROWZER_BOOTSTRAPPER_HOST')

var ziti_controller_host =          env('ZITI_CONTROLLER_HOST')
if (ziti_controller_host === browzer_bootstrapper_host) { throw new Error('ZITI_CONTROLLER_HOST value and ZITI_BROWZER_BOOTSTRAPPER_HOST value cannot be the same'); }
var ziti_controller_port =          env('ZITI_CONTROLLER_PORT')

var zbr_src = `${browzer_bootstrapper_host}/ziti-browzer-runtime.js`;

var browzer_bootstrapper_listen_port = env('ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT')

var ziti_browzer_bootstrapper_loglevel = env('ZITI_BROWZER_BOOTSTRAPPER_LOGLEVEL')
ziti_browzer_bootstrapper_loglevel = ziti_browzer_bootstrapper_loglevel.toLowerCase();


/** --------------------------------------------------------------------------------------------------
 *  Create logger 
 */
const createLogger = () => {

    var logDir = 'log';

    if ( !fs.existsSync( logDir ) ) {
        fs.mkdirSync( logDir );
    }

    const { combine, timestamp, label, printf, splat, json, errors } = winston.format;

    const logFormat = printf(({ level, message, durationMs, timestamp }) => {
        if (typeof durationMs !== 'undefined') {
            return `${timestamp} ${level}: [${durationMs}ms]: ${message}`;
        } else {
            return `${timestamp} ${level}: ${message}`;
        }
    });
    
    let defaultMeta;
    let logTags = env('ZITI_BROWZER_BOOTSTRAPPER_LOG_TAGS');
    if (logTags) {
        defaultMeta = { version: `${pjson.version}`, tags: JSON.parse(logTags) }
    } else {
        defaultMeta = { version: `${pjson.version}` }
    }

    var logger = winston.createLogger({
        level: ziti_browzer_bootstrapper_loglevel,
        format: combine(
            splat(),
            errors({ stack: true }),
            timestamp(),
            logFormat
        ),
        defaultMeta: defaultMeta,
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

    logger.trace = logger.silly;
    
    return( logger );
}

var selects = [];

/** --------------------------------------------------------------------------------------------------
 *  Start the BrowZer Bootstrapper
 */
const startBootstrapper =  async ( logger ) => {

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
        let zbrSrc;
        if (browzer_load_balancer) {
            zbrSrc = `https://${req.ziti_vhost}:${browzer_load_balancer_port}/${common.getZBRname()}`;
            if (env('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS')) {
                zbrSrc = `https://${req.ziti_vhost}.${ common.trimFirstSection( env('ZITI_BROWZER_LOAD_BALANCER_HOST') )}:${browzer_load_balancer_port}/${common.getZBRname()}`;
            }
        } else {
            
            if (env('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS')) {
                zbrSrc = `${req.ziti_browzer_bootstrapper_scheme}://${req.ziti_vhost}.${ common.trimFirstSection( env('ZITI_BROWZER_BOOTSTRAPPER_HOST') )}:${browzer_bootstrapper_listen_port}/${common.getZBRname()}`;
            } else {
                zbrSrc = `${req.ziti_browzer_bootstrapper_scheme}://${req.ziti_vhost}:${browzer_bootstrapper_listen_port}/${common.getZBRname()}`;
            }
        }
        let thirdPartyHTML = '';
        let ziti_inject_html = `
${thirdPartyHTML}
<!-- load Ziti browZer Runtime -->
<script id="from-ziti-browzer-bootstrapper" type="text/javascript" src="${zbrSrc}"></script>
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
     *  1) the ACTION is massaged to ensure that the target specified is changed to the BrowZer Bootstrapper
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

    // Make sure we don't experience the dreaded UNABLE_TO_VERIFY_LEAF_SIGNATURE issue when we make REST calls to the Controller
    const extraCaCertsPath = env('NODE_EXTRA_CA_CERTS');
    logger.info(`Using CA certificates: ${extraCaCertsPath}`);
    https.globalAgent.options.ca = fs.readFileSync(extraCaCertsPath);
    
    if (!skip_controller_cert_check) {

        logger.info({message: 'contacting specified controller', host: ziti_controller_host, port: ziti_controller_port});

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
                try {
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
                }
                catch (e) {}
            });
        }).end();
        request.on('timeout', () => {
            request.destroy();
            logger.error({message: 'timeout attempting to contact specified controller', controllerHost: ziti_controller_host, controllerPort: ziti_controller_port});
            process.exit(-1);
        });

    }

    /** --------------------------------------------------------------------------------------------------
     *  Ask GHCR what the latest release of BrowZer is 
     */
    const fetchLatestBrowZerReleaseVersion = async ( ) => {

        var options = {        
            hostname: 'api.github.com',
            path: '/orgs/openziti/packages/container/ziti-browzer-bootstrapper/versions',
            method: 'GET',
            port: 443,
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: ' Bearer ' + ghApiToken,
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            timeout: 3000
        };
    
        let responseData = '';

        const request = https.request(options, function(res) {
            if (res.statusCode !== 200) {
                logger.error({message: 'cannot contact GitHub API'});
                process.exit(-1);
            }
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                responseData += chunk;
            });
            res.on('end', function () {       
                
                latestBrowZerReleaseVersion = undefined;
                let foundLatest = false;
                let i = 0;

                var releaseArray = JSON.parse(responseData);

                do {

                    if (releaseArray[i].metadata.container.tags.includes('latest')) {
                        latestBrowZerReleaseVersion = releaseArray[i].metadata.container.tags[0];
                        foundLatest = true;
                    } else {
                        i++;
                    }


                } while (!foundLatest)
                
                logger.info({message: 'latest release check of browZer', latestVersion: latestBrowZerReleaseVersion});
            });
        }).end();
        request.on('timeout', () => {
            request.destroy();
            logger.error({message: 'timeout attempting to contact GitHub API'});
        });

    };
    const getLatestBrowZerReleaseVersion = ( ) => {
        return latestBrowZerReleaseVersion;
    };
    
    /** --------------------------------------------------------------------------------------------------
     *  Keep track of the "latest" browZer release if Bootstrapper is configured to do so 
     */
    var ghApiToken = env('ZITI_BROWZER_BOOTSTRAPPER_GITHUB_API_TOKEN');
    if (!isUndefined(ghApiToken)) {

        await fetchLatestBrowZerReleaseVersion();   // fetch it upon start up...

        cron.schedule('1 * * * *', () => {          // ... then run every hour

            fetchLatestBrowZerReleaseVersion();

        });

    }
    
      
    /** --------------------------------------------------------------------------------------------------
     *  Crank up the web server.  The 'browzer_bootstrapper_listen_port' value can be arbitrary since it is used
     *  inside the container.  Port 443|80 is typically mapped onto the 'browzer_bootstrapper_listen_port' e.g. 443->8443
     */
    var options = {
        logger: logger,

        cache: cache,

        getLatestBrowZerReleaseVersion: getLatestBrowZerReleaseVersion,

        // Set up to rewrite 'Location' headers on redirects
        hostRewrite: browzer_bootstrapper_host,
        autoRewrite: true,

        // Pass in the dark web app target array
        targetArray: jsonTargetArray.targetArray,
    };
    
    var app                     = express();
    // app.use(require('express-status-monitor')(
    // {
    //     title: `Ziti BrowZer Bootstrapper Status\n(${browzer_bootstrapper_host})`,
    //     theme: 'default.css',
    //     path: '/healthstatus',
    //     spans: [{
    //         interval: 1,
    //         retention: 60
    //     }, {
    //         interval: 5,
    //         retention: 60
    //     }, {
    //         interval: 15,
    //         retention: 60
    //     }, {
    //         interval: 60,
    //         retention: 60
    //     }],
    //     chartVisibility: {
    //         cpu: true,
    //         mem: true,
    //         load: true,
    //         eventLoop: true,
    //         heap: true,
    //         responseTime: true,
    //         rps: true,
    //         statusCodes: true
    //     },
    //     healthChecks: [
    //         {
    //             protocol: browzer_bootstrapper_scheme,
    //             host: browzer_bootstrapper_host,
    //             path: '/healthcheck',
    //             port: browzer_bootstrapper_listen_port
    //         }
    //     ],
    // }));

    app.use(favicon(path.join(__dirname, 'assets', 'favicon.ico')));

    var target_apps             = new Map();
    var target_app_to_target    = new Map();

    forEach(jsonTargetArray.targetArray, function(target) {

        target.vhost = target.vhost.toLowerCase();

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
            if (browzer_load_balancer) {
                req.ziti_browzer_bootstrapper_scheme = 'https';
            } else {
                req.ziti_browzer_bootstrapper_scheme = browzer_bootstrapper_scheme;
            }
        
            req.ziti_idp_issuer_base_url = target.idp_issuer_base_url;
            req.ziti_idp_client_id   = target.idp_client_id;
            req.ziti_idp_authorization_endpoint_parms   = target.idp_authorization_endpoint_parms;
            req.ziti_idp_authorization_scope   = target.idp_authorization_scope;

            next();
        });  

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

     var returnElapsedTime = function(epoch) { // epoch is in seconds
        var days = epoch / 86400,
            hours = (days % 1) * 24,
            minutes = (hours % 1) * 60,
            seconds = (minutes % 1) * 60;
        return Math.floor(days) + " days, " + Math.floor(hours) + " hours, " + Math.floor(minutes) + " mins, " + Math.round(seconds) + " secs";
      }
      
     app.use('/healthcheck', require('express-healthcheck')({
        healthy: function () {
            return {
                version: pjson.version,
                uptime: returnElapsedTime(process.uptime()),
                date: new Date(),
            };
        }
    }));

    /** -------------------------------------------------------------------------------------------------- */


    options.logger.debug({message: 'configured target service(s)', targets: JSON.parse(targets)});
          
    app.get('/browzer_error', function(req, res, next){
        const err = new Error();
        err.browzer_error_data = JSON.parse(URLON.parse(req.query.browzer_error_data));
        err.status = err.browzer_error_data.status;
        next(err);
    });

    app.get('/ziti-browzer-latest-release-version', function(req, res, next){

        let data = {
            latestBrowZerReleaseVersion: getLatestBrowZerReleaseVersion()
        }

        res.writeHead(
            200, 
            common.addServerHeader({ 
                'Content-Type': 'application/javascript',
            })
        );

        res.write( JSON.stringify(data) );

        res.end();

        return;
    });

    /**
     * 
     */
    app.use(express.json()); 
    app.post('/controller-oidc-proxy', async (req, res) => {

        let { 
            urlWithParams,
            method,
            headers,
            postData
        } = req.body; // Extract the proxy variables from POST body

        if (!urlWithParams) {
            return res.status(400).json({ error: 'Missing urlWithParams parameter' });
        }

        const url = new URL(urlWithParams);

        const options = {
            hostname:   url.hostname,
            port:       url.port || 443,
            path:       url.pathname + url.search, 
            method:     method,
            headers:    headers,
            redirect:   'manual' 
        };

        if (isEqual(method, 'POST')) {

            postData = JSON.stringify(postData);              
            options.headers['Content-Length'] = Buffer.byteLength(postData);

            const req = https.request(options, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                  data += chunk;
                });
              
                response.on('end', () => {
                  if (response.statusCode >= 300 && response.statusCode < 400) {
                      res.json({ redirectUrl: response.headers.location });
                  } else {
                      res.status(400).json({ error: 'expected redirect did not occur' });
                  }
                  res.end();
                });
              });
                            
              req.write(postData);
              req.end();

        } else {

            https.request(options, async function(response) {

                let data = '';

                response.on('data', (chunk) => {
                  data += chunk;
                });

                response.on('end', () => {
              
                    if (response.statusCode >= 300 && response.statusCode < 400) {
                        res.json({ redirectUrl: response.headers.location });
                    } else {
                        logger.error({error: `${data}`, redirect_uri: `${env('ZITI_BROWZER_BOOTSTRAPPER_HOST')}`, error_code: response.statusCode});

                        res.status(400).json({ error: 'expected redirect did not occur' });
                    }
                    res.end();
                });

            }).end();
        }    
    });    

    var proxy = httpProxy.createProxyServer(options);

    app.use(require('./lib/inject')(options, [], selects));

    /**
     *  Loop through the target app array and set up
     */
    forEach(jsonTargetArray.targetArray, function(target) {

        var target_app = target_apps.get(target.vhost);

        if (env('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS')) {

            app.use(vhost( `*.${ common.trimFirstSection( env('ZITI_BROWZER_BOOTSTRAPPER_HOST') )}` , function handle (req, res, next) {

                var target_app = target_apps.get('*');
                var target = target_app_to_target.get(target_app);
    
                req.ziti_vhost           = req.vhost[0];
                req.ziti_target_service  = req.vhost[0];
                if (typeof target.path === 'undefined') { 
                    target.path = '/';
                }
                req.ziti_target_path     = target.path;
                if (typeof target.scheme === 'undefined') { 
                    target.path = 'http';
                }
                req.ziti_target_scheme   = target.scheme;
                if (browzer_load_balancer) {
                    req.ziti_browzer_bootstrapper_scheme = 'https';
                } else {
                    req.ziti_browzer_bootstrapper_scheme = browzer_bootstrapper_scheme;
                }
            
                req.ziti_idp_issuer_base_url = target.idp_issuer_base_url;
                req.ziti_idp_client_id   = target.idp_client_id;
                req.ziti_idp_authorization_endpoint_parms   = target.idp_authorization_endpoint_parms;
                req.ziti_idp_authorization_scope   = target.idp_authorization_scope;
    
                next();
    
            }))
    
        } else {

            app.use(vhost(target.vhost, target_app));

        }

    });

    app.use(function (req, res, next) {
        res.setHeader('X-Powered-By', `BrowZer v${pjson.version}`)
        next()
    })

    app.use(verifyCache, function (req, res) {
        proxy.web(req, res);
    });

    /**
     * 
     */
    await _httpErrorPages.express(app, {
        template:   './assets/template.ejs',
        css:        './assets/layout.css',
        filter: function(data, req, res) {
            if (data.error && data.error.browzer_error_data) {

                let whitelabel = JSON.parse(env('ZITI_BROWZER_WHITELABEL'));

                let footer = `<a href="https://openziti.io/docs/learn/quickstarts/browzer/"><strong>powered by ${whitelabel.branding.browZerName} v${pjson.version}</strong><img src="${whitelabel.branding.browZerButtonIconSvgUrl}" style="width: 2%;position: fixed;bottom: 15px;margin-left: 10px;"></a>`;

                if (isUndefined(data.error.browzer_error_data.myvar)) {
                    data.error.browzer_error_data.myvar = {type: 'zbr'}
                }
                switch(data.error.browzer_error_data.myvar.type) {

                    case `zbr`:
                        data.body = Mustache.render(fs.readFileSync('./assets/template-zbr.ejs').toString(), {
                            code: data.error.browzer_error_data.code,
                            title: data.error.browzer_error_data.title,
                            message: data.error.browzer_error_data.message,
                            browzer_name: whitelabel.branding.browZerName,
                            footer: footer,
                        });
                        data.body = he.decode(data.body);
                        logger.error({message: `${data.error.browzer_error_data.message}`, error: `${data.error.browzer_error_data.title}`, error_code: data.error.browzer_error_data.code});
                        break;

                    case `zrok`:      
                        data.body = Mustache.render(fs.readFileSync('./assets/template-zrok.ejs').toString(), {
                            zrokshare: data.error.browzer_error_data.myvar.zrokshare,
                            footer: footer,
                        });
                        data.body = he.decode(data.body);
                        break;
                      
                    default:
                        data.body = Mustache.render(fs.readFileSync('./assets/template-zbr.ejs').toString(), {
                            code: data.error.browzer_error_data.code,
                            title: data.error.browzer_error_data.title,
                            message: data.error.browzer_error_data.message,
                            browzer_name: whitelabel.branding.browZerName,
                            footer: footer,
                        });
                        data.body = he.decode(data.body);
                        logger.error({message: `${data.error.browzer_error_data.message}`, error: `${data.error.browzer_error_data.title}`, error_code: data.error.browzer_error_data.code});
                }
            }
            return data;
        },
        onError: function(data){
        }
    });

    /**
     *  When listening on HTTPS, then detect certificate refreshes, and reload TLS context accordingly
     */
    var tlsContext;
    function createTLScontext() {
        tlsContext = tls.createSecureContext({
            cert: fs.readFileSync(certificate_path),
            key: fs.readFileSync(key_path),
            isServer: true,
        });
        logger.info({message: 'new tlsContext created', certificate_path: certificate_path, key_path: key_path});
    }
      
    var server;
    if (browzer_bootstrapper_scheme === 'https') {

        createTLScontext();

        fs.watchFile( 
            certificate_path,
            {
              bigint: false,
              persistent: true,
              interval: 5000,
            },
            (curr, prev) => {
                logger.info({message: 'file-system change detected', filename: certificate_path, curr: curr});
                setTimeout(function () {
                    createTLScontext();
                }, 1000)
            }
        );
        fs.watchFile(
            key_path,
            {
              bigint: false,
              persistent: true, 
              interval: 5000,
            },
            (curr, prev) => {
                logger.info({message: 'file-system change detected', filename: key_path, curr: curr});
                setTimeout(function () {
                    createTLScontext();
                }, 1000)
            }
        );

        cron.schedule('1,31 * * * *', () => {      // run every half-hour
            const { validTo } = new X509Certificate(fs.readFileSync( certificate_path));
            var validToDate = new Date(validTo);
            var validToTime = validToDate.getTime() / 1000;
            var nowDate = new Date();
            var nowTime = nowDate.getTime() / 1000;
            var remainingTime = validToTime - nowTime;
            var remainingDays = Math.round( remainingTime / (60 * 60 * 24) );
            if (remainingDays <= 7) {           // once we're within a week of expiration, start logging warnings
                logger.warn({message: 'certificate expiration warning', certificate: certificate_path, remainingDays: remainingDays});
            }
        });

        const httpServer = http.createServer({
            SNICallback: (servername, cb) => {
                logger.silly({message: 'SNICallback() entered', servername: servername});
                cb(null, tlsContext);
            }            
        }, app);
          
        // Create a TLS server
        server = tls.createServer({
            cert: fs.readFileSync(certificate_path),
            key: fs.readFileSync(key_path),
            isServer: true,
        }, (socket) => {

            /**
             * If we are being hit via IP address, respond with simple response rendering our version number
             */
            if (!(socket.servername)) {
                let response = 
`HTTP/1.1 200 OK
Content-Type: text/plain
x-ziti-browzer-bootstrapper: ${pjson.version}
Server: ziti-browzer-bootstrapper/v${pjson.version}

Hello, from OpenZiti BrowZer v${pjson.version} !
`
                socket.write(response);
                socket.end();

            } else {

                /**
                 * If we are being hit via DNS name, emit the socket to the HTTP server so that
                 * it can process the request
                 */
                httpServer.emit('connection', socket);
            }
          
            socket.on('error', (error) => {
              logger.error({message: 'TLS error', error: error});
              socket.destroy();
            });
        });
  
        server.listen(browzer_bootstrapper_listen_port, () => {
            logger.info({message: 'listening', port: browzer_bootstrapper_listen_port, scheme: browzer_bootstrapper_scheme});
        });          

    }
    else {

        server = http.createServer({
        }, app).listen(browzer_bootstrapper_listen_port, "0.0.0.0", function() {
            logger.info({message: 'listening', port: browzer_bootstrapper_listen_port, scheme: browzer_bootstrapper_scheme});
        });

    }

    /** --------------------------------------------------------------------------------------------------
     *  If we are configured to do machine-to-machine (M2M) OIDC auth, then instantiate an initial
     *  zitiContext.  The zitiContext will be used to look up zrok 'private' shares (Services) from
     *  the Controller.  The response from the Controller will be used to determine which wildcard
     *  vhost HTTP Requests should be honored, and which should be 404'd
     */
    if (env('ZITI_BROWZER_BOOTSTRAPPER_IDP_BASE_URL')) {
        common.newZitiContext( logger );
    }

    /** -------------------------------------------------------------------------------------------------- */

    // The signals we want to handle
    // NOTE: although it is tempting, the SIGKILL signal (9) cannot be intercepted and handled
    var signals = {
            'SIGHUP': 1,
            'SIGINT': 2,
            'SIGTERM': 15
        };
    // Do any necessary shutdown logic for our application here
    const shutdown = (signal, value) => {
        logger.info("shutdown!");
        process.exit(128 + value);
    };
    // Create a listener for each of the signals that we want to handle
    Object.keys(signals).forEach((signal) => {
        process.on(signal, () => {
            logger.info(`process received a ${signal} signal`);
            shutdown(signal, signals[signal]);
        });
    });
};

/**
 * 
 */
const isValidSearchParams = (paramString) => {
    const regex = /^(?:(?:[a-zA-Z0-9%_.+-]+=[^&]*)|(?:[a-zA-Z0-9%_.+-]+(?:&|$)))*$/;    
    return regex.test(paramString);
};

/**
 * 
 */
const main = async () => {

    uuid = uuidv4();

    logger = createLogger();

    logger.info({message: 'ziti-browzer-bootstrapper initializing'});

    Validator.prototype.customFormats.obsoleteIdPConfig = function(input) {
        if (isEqual(input, 'idp_type') || isEqual(input, 'idp_realm')) {
            logger.warn({message: 'obsolete config field encountered - ignored', field: input});
        }
        return false;
    };
      
    var jsonschemaValidator = new Validator();

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

    forEach(jsonTargetArray.targetArray, function(target) {
        if (target.idp_authorization_endpoint_parms) {
            if (!isValidSearchParams(target.idp_authorization_endpoint_parms)) {
                logger.error({message: 'idp_authorization_endpoint_parms does not valid URL search parms', idp_authorization_endpoint_parms: `${target.idp_authorization_endpoint_parms}`});
                process.exit(-1);
            }        
        }
    });

    jsonschemaValidator.validate('idp_type', {type: 'string', format: 'obsoleteIdPConfig'});

    startBootstrapper( logger );

};
  

process.on('unhandledRejection', function (reason, p) {
    throw reason;
});
process.on('uncaughtException', function ( e ) {
    if (logger) {
        logger.error( e );
    } else {
        console.error( e );
    }
    process.exit( -1 );
});
  
main();

