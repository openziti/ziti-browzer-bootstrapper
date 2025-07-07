/*
Copyright NetFoundry Inc.

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

var path    = require('path');
var fs      = require('fs');
var nconf   = require('nconf');
const isEqual = require('lodash.isequal');
var nval    = require('nconf-validator')(nconf);
const Ajv   = require("ajv");
const ajv   = new Ajv({ validateFormats: true });
const addFormats = require("ajv-formats");
addFormats(ajv); // Adds support for formats like "uri", "email", "date", etc.

/**
 *  Reach into teh ZBR dependency, and obtain the "hashed" name of the ZBR CSS file.
 *  This will be the default used
 */
function getZBRCSSname() {
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
  
/** -----------------------------------------------------------------------------------------------
 *   Config value Order-of-precedence is:
 *      1) cmd line args
 *      2) env vars
 *      3) config.json
 *      4) defaults
 *  -----------------------------------------------------------------------------------------------*/
nconf
    .argv()
    .env()
    .file(
        { 
            file: path.join(__dirname, '../config.json') 
        }
    )
	.defaults(
        {
            ZITI_BROWZER_BOOTSTRAPPER_LOGLEVEL:         'error',
            ZITI_BROWZER_BOOTSTRAPPER_SCHEME:           'http',
            ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS:  false,
            ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT:      80,

            ZITI_BROWZER_LOAD_BALANCER_PORT:            443,

            ZITI_CONTROLLER_PORT:                       443,

            ZITI_BROWZER_RUNTIME_LOGLEVEL:              'error',
            ZITI_BROWZER_RUNTIME_HOTKEY:                'alt+f12',

			NODE_EXTRA_CA_CERTS:						'node_modules/node_extra_ca_certs_mozilla_bundle/ca_bundle/ca_intermediate_root_bundle.pem',

            ZITI_BROWZER_WHITELABEL: JSON.stringify({
                "enable": {
                    "browZerButton":            true,
                    "browZerToastMessages":     true,
                    "browZerSplashScreen":      true,
                    "browZerThroughputChart":   true
                },
                "branding": {
                    "browZerName":              "OpenZiti BrowZer",
                    "browZerSplashMessage":     "Stand by while OpenZiti BrowZer Bootstraps your private web app",
                    "browZerButtonIconSvgUrl":  `https://${nconf.get('ZITI_BROWZER_BOOTSTRAPPER_HOST')}/ziti-browzer-logo.svg`,
                    "browZerCSS":               `https://${nconf.get('ZITI_BROWZER_BOOTSTRAPPER_HOST')}/${getZBRCSSname()}`
                }
            }),
	    }
    )
    .required(
        [
            'ZITI_BROWZER_BOOTSTRAPPER_TARGETS',
            'ZITI_BROWZER_BOOTSTRAPPER_HOST',
            'ZITI_CONTROLLER_HOST',
        ]
    );

const whitelabelSchema = {
    type: "object",
    properties: {
        enable: {
            type: "object",
            properties: {
                browZerButton:          { type: "boolean" },
                browZerToastMessages:   { type: "boolean" },
                browZerSplashScreen:    { type: "boolean" },
                browZerThroughputChart: { type: "boolean" }
            },
            required: [
                "browZerButton", 
                "browZerToastMessages", 
                "browZerSplashScreen", 
                "browZerThroughputChart"
            ],
            additionalProperties: false     // Prevent misspelled keys 
        },
        branding: {
            type: "object",
            properties: {
                browZerName:                { type: "string" },
                browZerSplashMessage:       { type: "string" },
                browZerButtonIconSvgUrl:    { type: "string", format: "uri"},
                browZerCSS:                 { type: "string", format: "uri"},
            },
            required: [
                "browZerName", 
                "browZerSplashMessage", 
                "browZerButtonIconSvgUrl",
                "browZerCSS"
            ],
            additionalProperties: false     // Prevent misspelled keys 
        }
    },
    additionalProperties: false             // Prevent misspelled keys
};
      
/** -----------------------------------------------------------------------------------------------
 *  config validation rules
 *  -----------------------------------------------------------------------------------------------*/
nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_TARGETS',                           'json');
if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_LOG_TAGS')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_LOG_TAGS',                      'json');
}

nval.addRule('ZITI_BROWZER_WHITELABEL',                                     'json');

nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS',                   Boolean);
 
nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_SCHEME',                            ['http', 'https']);

if (nconf.get('ZITI_BROWZER_LOAD_BALANCER_HOST')) {
    nval.addRule('ZITI_BROWZER_LOAD_BALANCER_HOST',                         'domain')
}

// M2M OIDC-related config
if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_IDP_BASE_URL')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_IDP_BASE_URL',                  'url')
    nconf.required([
        'ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_ID', 
        'ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_SECRET',
        'ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_AUDIENCE'
    ]);
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_ID',                 String)
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_SECRET',             String)
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_AUDIENCE',           String)
}
 
if (nconf.get('ZITI_BROWZER_LOAD_BALANCER_PORT')) {
    nval.addRule('ZITI_BROWZER_LOAD_BALANCER_PORT',                         'port')
}

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_SKIP_CONTROLLER_CERT_CHECK')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_SKIP_CONTROLLER_CERT_CHECK',    Boolean)
}

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_SKIP_DEPRECATION_WARNINGS')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_SKIP_DEPRECATION_WARNINGS',     Boolean)
}

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH',              String);
}

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_KEY_PATH')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_KEY_PATH',                      String);
}

nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_HOST',                              'domain')

nval.addRule('ZITI_CONTROLLER_HOST',                                        'domain')

nval.addRule('ZITI_CONTROLLER_PORT',                                        'port')

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT',                   'port');
}

nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_LOGLEVEL', function(x) { 
    if (! (typeof x === 'string')) { return false;}
    x = x.toLowerCase();
    if (['error', 'warn', 'info', 'verbose', 'debug', 'silly'].includes(x)) {
        return true;
    }
    return false;
})

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_GITHUB_API_TOKEN')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_GITHUB_API_TOKEN',              String);
}


/**
 *  Now validate the config
 */
nval.validate();

const validateWhitelabel = ajv.compile(whitelabelSchema);
const whitelabelConfigData = JSON.parse(nconf.get('ZITI_BROWZER_WHITELABEL'));
const valid = validateWhitelabel(whitelabelConfigData);

if (!valid) {
    console.error("Whitelabel Configuration validation failed:", validateWhitelabel.errors);
    throw new Error("Whitelabel Configuration validation failed")
}

function asBool (value) {
    const val = value.toLowerCase()
  
    const allowedValues = [
      'false',
      '0',
      'true',
      '1'
    ]
  
    if (allowedValues.indexOf(val) === -1) {
      throw new Error('should be either "true", "false", "TRUE", "FALSE", 1, or 0')
    }
  
    return !(((val === '0') || (val === 'false')))
}

module.exports = function(key) {
  let val = nconf.get(key);
  if (val && (isEqual(key, 'ZITI_BROWZER_BOOTSTRAPPER_WILDCARD_VHOSTS') 
           || isEqual(key, 'ZITI_BROWZER_BOOTSTRAPPER_SKIP_CONTROLLER_CERT_CHECK')
           || isEqual(key, 'ZITI_BROWZER_BOOTSTRAPPER_SKIP_DEPRECATION_WARNINGS'))
     ) {
    val = asBool(val);
  }
  return val;
};