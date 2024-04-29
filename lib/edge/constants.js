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


"use strict";

/**
 * 
 */
const ZITI_CONSTANTS = 
{   
    /**
     * The selected JWT to enroll with
     */
    'ZITI_JWT':             'ZITI_JWT',

    /**
     * The location of the Controller REST endpoint (as decoded from the JWT)
     */
    'ZITI_CONTROLLER':      'ZITI_CONTROLLER',

    /**
     * The location of the Controller WS endpoint (as returned from /protocols)
     */
    'ZITI_CONTROLLER_WS':      'ZITI_CONTROLLER_WS',

    /**
     * 
     */
    'ZITI_EXPIRY_TIME': 'ZITI_EXPIRY_TIME',

    /**
     * The Identity certificate (produced during enrollment)
     */
    'ZITI_IDENTITY_CERT':   'ZITI_IDENTITY_CERT',

    /**
     * The Identity public key (generated locally during enrollment)
     */
    'ZITI_IDENTITY_PUBLIC_KEY_FILENAME':    'ZITI_BROWZER_PUBLIC_KEY.pem',
    'ZITI_IDENTITY_PRIVATE_KEY_FILENAME':   'ZITI_BROWZER_PRIVATE_KEY.pem',
    'ZITI_IDENTITY_PUBLIC_KEY_FILE_NOT_FOUND':      'ZITI_IDENTITY_PUBLIC_KEY_FILE_NOT_FOUND',
    'ZITI_IDENTITY_PRIVATE_KEY_FILE_NOT_FOUND':      'ZITI_IDENTITY_PRIVATE_KEY_FILE_NOT_FOUND',
    'ZITI_IDENTITY_KEYPAIR_FOUND':      'ZITI_IDENTITY_KEYPAIR_FOUND',
    'ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_FS':      'ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_FS',
    'ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_IDB':      'ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_IDB',


    /**
     * The Identity public key (generated locally during enrollment)
     */
    'ZITI_IDENTITY_PUBLIC_KEY':    'ZITI_IDENTITY_PUBLIC_KEY',

    /**
     * The Identity private key (generated locally during enrollment)
     */
    'ZITI_IDENTITY_PRIVATE_KEY':    'ZITI_IDENTITY_PRIVATE_KEY',

    /**
     * The Identity CA (retrived from Controller during enrollment)
     */
    'ZITI_IDENTITY_CA':     'ZITI_IDENTITY_CA',

    /**
     * 
     */
    'ZITI_SERVICES': 'ZITI_SERVICES',

    'ZITI_API_SESSION_TOKEN': 'ZITI_API_SESSION_TOKEN',

    'ZITI_IDENTITY_USERNAME': 'ZITI_IDENTITY_USERNAME',
    'ZITI_IDENTITY_PASSWORD': 'ZITI_IDENTITY_PASSWORD',

    'ZITI_NETWORK_SESSIONS': 'ZITI_NETWORK_SESSIONS',



    /**
     * The default timeout in milliseconds for connections and write operations to succeed.
     */
    'ZITI_DEFAULT_TIMEOUT': 10000,

    /**
     * Name of event indicating data send|recv to|from the wsER
     */
    'ZITI_EVENT_XGRESS':                    'xgressEvent',
    'ZITI_EVENT_XGRESS_TX':                 'tx',
    'ZITI_EVENT_XGRESS_RX':                 'rx',
    'ZITI_EVENT_INVALID_AUTH':              'invalidAuthEvent',
    'ZITI_EVENT_NO_SERVICE':                'noServiceEvent',
    'ZITI_EVENT_NO_CONFIG_FOR_SERVICE':     'noConfigForServiceEvent',
    'ZITI_EVENT_SESSION_CREATION_ERROR':    'sessionCreationErrorEvent',
    'ZITI_EVENT_NO_WSS_ROUTERS':            'noWSSEnabledEdgeRoutersEvent',
    'ZITI_EVENT_IDP_AUTH_HEALTH':           'idpAuthHealthEvent',
    'ZITI_EVENT_CHANNEL_CONNECT_FAIL':      'channelConnectFailEvent',
    'ZITI_EVENT_NESTED_TLS_HANDSHAKE_TIMEOUT':     'nestedTLSHandshakeTimeout',
    'ZITI_EVENT_NO_CONFIG_PROTOCOL_FOR_SERVICE':  'noConfigProtocolForServiceEvent',

    /**
     * Name of event indicating encrypted data for a nestedTLS connection has arrived and needs decryption
     */
    'ZITI_EVENT_XGRESS_RX_NESTED_TLS':      'xgressEventNestedTLS',

};

module.exports = ZITI_CONSTANTS;
