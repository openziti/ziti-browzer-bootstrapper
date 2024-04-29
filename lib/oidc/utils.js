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

var oidcUtil   = exports;

// var jwtDecode = require('jwt-decode');
// var request = require('request');
var env         = require('../env');
var oidcClient  = require('openid-client');
const isUndefined   = require('lodash.isundefined');


//
var issuer;

/**
 *  getAccessToken()
 * 
 */
oidcUtil.getAccessToken = async function () {

    if (isUndefined(issuer)) {
        var idp_base_url = env('ZITI_BROWZER_BOOTSTRAPPER_IDP_BASE_URL')
        issuer = await oidcClient.Issuer.discover(idp_base_url);
    }

    const client = new issuer.Client({
        client_id:      env('ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_ID'),
        client_secret:  env('ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_SECRET'),
    });
      
    const tokenSet = await client.grant({
        audience:   'browZer-Bootstrapper-M2M',
        // audience:   env('ZITI_BROWZER_BOOTSTRAPPER_IDP_CLIENT_AUDIENCE'),
        grant_type: 'client_credentials'
    });

    // console.log(`getAccessToken() tokenSet: `, tokenSet);
    console.log(`getAccessToken() access_token: `, tokenSet.access_token);

    return tokenSet.access_token;

}
