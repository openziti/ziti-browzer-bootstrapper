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




/**
 * Default options.
 */
 module.exports = defaultOptions = {

    /**
     * See {@link Options.logger}
     *
     */
    logger: null,

    /**
     * See {@link Options.controllerApi}
     *
     */
    controllerApi: 'https://local-controller:1280',

    /**
     * See {@link Options.token_type}
     *
     */
     token_type: null,

    /**
     * See {@link Options.access_token}
     *
     */
     access_token: null,

    /**
     * See {@link Options.sdkType}
     *
     */
    sdkType:        'unknown',
    sdkVersion:     'unknown',
    sdkBranch:      'unknown',
    sdkRevision:    'unknown',

    /**
     * See {@link Options.apiSessionHeartbeatTime}
     * 
     */
    apiSessionHeartbeatTimeMin: (1),
    apiSessionHeartbeatTimeMax: (5),

};
