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
var nconf   = require('nconf');
var nval    = require('nconf-validator')(nconf);


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

            // This token is for *.browzer.cloudziti.io
            ZITI_BROWZER_RUNTIME_ORIGIN_TRIAL_TOKEN: `AtUaUNUk/l7kBpCXAyB6W9KWymYJb8ydLcPLTkENXw88AJB0bXMUzwkwcPKy796N2h0KaCkq1zaAycQJ21jtpwIAAACAeyJvcmlnaW4iOiJodHRwczovL2Jyb3d6ZXIuY2xvdWR6aXRpLmlvOjQ0MyIsImZlYXR1cmUiOiJXZWJBc3NlbWJseUpTUHJvbWlzZUludGVncmF0aW9uIiwiZXhwaXJ5IjoxNzMwMjQ2Mzk5LCJpc1N1YmRvbWFpbiI6dHJ1ZX0=`,
			
			NODE_EXTRA_CA_CERTS:						'node_modules/node_extra_ca_certs_mozilla_bundle/ca_bundle/ca_intermediate_root_bundle.pem',
	    }
    )
    .required(
        [
            'ZITI_BROWZER_BOOTSTRAPPER_TARGETS',
            'ZITI_BROWZER_BOOTSTRAPPER_HOST',
            'ZITI_CONTROLLER_HOST',
        ]
    );

/** -----------------------------------------------------------------------------------------------
 *  config validation rules
 *  -----------------------------------------------------------------------------------------------*/
nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_TARGETS',                           'json');
if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_LOG_TAGS')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_LOG_TAGS',                      'json');
}

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

if (nconf.get('ZITI_BROWZER_RUNTIME_ORIGIN_TRIAL_TOKEN')) {
    nval.addRule('ZITI_BROWZER_RUNTIME_ORIGIN_TRIAL_TOKEN',                 String);
}

if (nconf.get('ZITI_BROWZER_BOOTSTRAPPER_GITHUB_API_TOKEN')) {
    nval.addRule('ZITI_BROWZER_BOOTSTRAPPER_GITHUB_API_TOKEN',              String);
}


/**
 *  Now validate the config
 */
 nval.validate();


module.exports = function(key) {
  return nconf.get(key);
};