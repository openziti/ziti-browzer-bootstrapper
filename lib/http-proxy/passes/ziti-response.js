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

const Stream = require('stream');
const Duplex = Stream.Duplex;
const Readable = Stream.Readable;

/**
 * Base HTTP "ZitiResponse" class. Emulates the node-core `http.ClientRequest` class, but
 * does not use Socket, and instead integrates with the ziti-sdk-nodejs https_request_XXX
 * mechanisms.
 *
 * @api public
 */

class ZitiResponse extends Readable {

    constructor() {
        super();

        /**
         *  Properties
         */
        this._headers;
        this._statusCode;
        this._statusMessage;
    }

    _read () { /* nop */ }

    
    /**
     * 
     */
    async _pushData(buffer) {

        this.push(buffer);

    }


    /**
     *  Properties
     */
    get headers() {
        return this._headers;
    }
    set headers(headers) {
        this._headers = headers;
    }
    get statusCode() {
        return this._statusCode;
    }
    set statusCode(statusCode) {
        this._statusCode = statusCode;
    }
    get statusMessage() {
        return this._statusMessage;
    }
    set statusMessage(statusMessage) {
        this._statusMessage = statusMessage;
    }
    
    /**
     * 
     */
    setTimeout(msecs, callback) {
        if (callback)
            this.on('timeout', callback);
        return this;
    }

    /**
     * 
     */
    destroy(error) {
    }


    /**
     * 
     */
    dispose() {
    }
}


/**
 * Module exports.
 */

module.exports.ZitiResponse = ZitiResponse;
