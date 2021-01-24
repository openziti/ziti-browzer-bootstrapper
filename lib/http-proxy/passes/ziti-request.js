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

const EventEmitter = require('events');
const v4 = require('uuid');
const { ZitiResponse } = require('./ziti-response');


const UV_EOF = -4095;

/**
 * Base HTTP "ZitiRequest" class. Emulates the node-core `http.ClientRequest` class, but
 * does not use Socket, and instead integrates with the ziti-sdk-nodejs https_request_XXX
 * mechanisms.
 *
 * @api public
 */

class ZitiRequest extends EventEmitter {

    constructor(opts) {
        super();

        this.uuid = v4();   // debugging/tracing aid

        /**
         * The reference to the Ziti nodejs sdk
         */
        this.ziti = opts.ziti;

        /**
         * 
         */
        this.opts = opts;

        /**
         * The underlying Ziti HTTP Request (i.e. the um_http_req_t returned from Ziti_http_request() in the ziti-sdk-NodeJS )
         */
        this.ziti_http_request;

        /**
         * This response is where we'll put any data returned from a um_http_req_t
         */
        this.response = new ZitiResponse(this.uuid);

        /**
         *  Properties
         */
        this._writable = true;

    }


    /**
     *  Properties
     */
    get writable() {
        return this._writable;
    }
    set writable(writable) {
        this._writable = writable;
    }


    /**
     * Initiate an HTTPS request.  We do this by invoking the Ziti_http_request() function in the Ziti NodeJS-SDK.
     * @param {*} url 
     * @param {*} method 
     * @param {*} headers 
     */
    async do_Ziti_http_request(url, method, headers) {
        const self = this;
        return new Promise((resolve, reject) => {
            try {
        
                // console.log('TRANSMITTING: req uuid: %o \nmethod: %s \nurl: %s \nheaders: %o', this.uuid, method, url, headers);

                self.ziti.Ziti_http_request(
                    url,
                    method,
                    headers,

                    // on_req callback
                    (obj) => {

                        // console.log('on_req callback: req is: %o', obj.req);

                        resolve(obj.req);

                    },
                    
                    // on_resp callback
                    (obj) => {

                        // console.log('TRANSMITTING (on_resp callback): req uuid: %o \nobj: %0', this.uuid, obj);

                        // Set properties
                        this.response.headers = obj.headers;
                        this.response.statusCode = obj.code;
                        this.response.statusMessageCode = obj.status;

                        // console.log('on_resp callback: req is: %o, statusCode: %o', this.ziti_http_request, this.response.statusCode);

                        // console.log('on_resp callback: emitting resp: %o', this.response);

                        this.emit('response', this.response);

                    },

                    // on_resp_body callback
                    (obj) => {

                        // console.log('on_resp_body callback: req is: %o, len: %o', this.ziti_http_request, obj.len);

                        //
                        //  REQUEST COMPLETE 
                        //
                        if (obj.len === UV_EOF) {
                            // console.log('REQUEST COMPLETE');
                            this.response._pushData(null);
                            this.response.emit('close');
                        }

                        //
                        //  ERROR 
                        //
                        else if (obj.len < 0) {
                            let err = this.requestException(obj.len);
                            // console.log('on_resp_body callback: emitting error: %o', err);
                            this.emit('error', err);
                        }

                        //
                        // DATA RECEIVED
                        //
                        else {

                            if (obj.body) {

                                const buffer = Buffer.from(obj.body);

                                // console.log('on_resp_body callback: DATA RECEIVED: body is: \n%s', buffer.toString());
                            
                                this.response._pushData(buffer);

                            } else {

                                // console.error('on_resp_body callback: DATA RECEIVED: but body is undefined!');

                            }
                        }

                    },
                );

            }
            catch (e) {
                reject(e);
            }
        });
    }


    /**
     *  Initiate the HTTPS request
     */
    async start() {

        let headersArray = [];

        for (var key of Object.keys(this.opts.headers)) {
            let hdr
            if (key !== 'host') {
                if (key === 'Cookie') {
                    let value = '';
                    this.opts.headers[key].forEach(element => {
                        if (value.length > 0) {
                            value += ';';
                        }
                        value += element;
                    });
                    hdr = key + ':' + value;
                } else {
                    hdr = key + ':' + this.opts.headers[key];
                }
                headersArray.push(hdr);
            }
        }
        
        this.ziti_http_request = await this.do_Ziti_http_request(

            this.opts.href,
            this.opts.method,
            headersArray

        ).catch((e) => {
            logger.error('Error: %o', e);
        });
    }
    
    /**
     * 
     */
    end(chunk, encoding, callback) {

        if (typeof this.ziti_http_request !== 'undefined') {
            this.ziti.Ziti_http_request_end( this.ziti_http_request );
        }
      
        return this;
    };
    
    
    /**
     * Send a request body chunk.  We do this by invoking the Ziti_http_request_data() function in the Ziti NodeJS-SDK.
     * @param {*} req 
     * @param {*} buffer 
     */
    async do_Ziti_http_request_data(req, buffer) {
        const self = this;
        return new Promise((resolve, reject) => {
            try {

                if (typeof req === 'undefined') {
                    throw new Error('req is "undefined"');
                }
        
                self.ziti.Ziti_http_request_data(
                    req,
                    buffer,

                    // on_req_body callback
                    (obj) => {

                        //
                        //  ERROR 
                        //
                        if (obj.status < 0) {
                            reject(this.requestException(obj.status));
                        }

                        //
                        // SUCCESSFUL TRANSMISSION
                        //
                        else {
                            resolve(obj);
                        }
                    }
                );
            }
            catch (e) {
                reject(e);
            }
        });
    }


    /**
     * Send a request body chunk.
     */
    async write(chunk, encoding, callback) {

        let buffer;

        if (typeof chunk === 'string' || chunk instanceof String) {
            buffer = Buffer.from(chunk, 'utf8');
        } else if (Buffer.isBuffer(chunk)) {
            buffer = chunk;
        } else {
            throw new Error('chunk type of [' + typeof chunk + '] is not a supported type');
        }
        
        let obj = await this.do_Ziti_http_request_data(

            this.ziti_http_request,
            buffer

        ).catch((e) => {
            this.emit('error', e);
        });
    }


    /**
     * 
     */
    requestException(num) {
        const ex = new Error('HTTPS Request failed; code ['+num+']');
        ex.code = 'EREQUEST';
        return ex;
    }

    /**
     * 
     */
    abort() {
    }

}


/**
 * Module exports.
 */

module.exports.ZitiRequest = ZitiRequest;
