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
 * Module dependencies.
 */

// import { PassThrough } from '../http/readable-stream/_stream_passthrough';
// import memoize from 'fast-memoize';
// import Cookies from 'js-cookie';
// import { Buffer } from 'buffer/';

var flatOptions = require('./flat-options');
var defaultOptions = require('./context-options');
// import { ZitiEnroller } from '../enroll/enroller';
// import { ZitiConnection } from '../channel/connection'
// import { ZitiEdgeProtocol } from '../channel/protocol';
// import { ZitiChannel } from '../channel/channel'
// import throwIf from '../utils/throwif';
var ZITI_CONSTANTS = require('./constants');
// import { ZitiHttpRequest } from '../http/request';
// import { HttpResponse } from '../http/response';
// import { ZitiFormData } from '../http/form-data';
// import { BrowserStdout } from '../http/browser-stdout';
// import { http } from '../http/http';
// import { ZitiWebSocketWrapperCtor } from '../http/ziti-websocket-wrapper-ctor';
// import { ZitiAgentPool } from '../http/ziti-agent-pool';
// import { ZitiWASMFD } from './wasmFD';



// import { LibCrypto, EVP_PKEY_EC, EVP_PKEY_RSA } from '@openziti/libcrypto-js'
// var ZitiBrowzerEdgeClient = import('@openziti/ziti-browzer-edge-client');

var Mutex = require('async-mutex').Mutex;
var withTimeout = require('async-mutex').withTimeout;

    
// import { isUndefined, isEqual, isNull, result, find, filter, has, minBy, forEach } from 'lodash-es';
const forEach   = require('lodash.foreach');
const isUndefined   = require('lodash.isundefined');
const isEqual   = require('lodash.isequal');
const isNull   = require('lodash.isnull');
const find   = require('lodash.find');
const result   = require('lodash.result');

var EventEmitter = require('events');
// import {isIP} from 'is-ip';
// import jwt_decode from 'jwt-decode';
// import ElapsedTime from 'elapsed-time';


/**
 *    ZitiContext
 */
 module.exports = class ZitiContext extends EventEmitter {

  /**
   * 
   */
  constructor(options) {

    super();

    this._initialized = false;
    // this._initializedInnerWASM = false;

    let _options = flatOptions(options, defaultOptions);

    this._keyType = _options.keyType;

    this.logger = _options.logger;
    this.controllerApi = _options.controllerApi;

    this.token_type = _options.token_type;
    this.access_token = _options.access_token;

    this.sdkType = _options.sdkType;
    this.sdkVersion = _options.sdkVersion;
    this.sdkBranch = _options.sdkBranch;
    this.sdkRevision = _options.sdkRevision;

    this.apiSessionHeartbeatTimeMin  = _options.apiSessionHeartbeatTimeMin;
    this.apiSessionHeartbeatTimeMax = _options.apiSessionHeartbeatTimeMax;

    // this.bootstrapperTargetService = _options.bootstrapperTargetService;

    // this._libCrypto = new LibCrypto();
    // this._libCryptoInitialized = false;

    this._network_sessions = new Map();
    this._services = new Map();
    // this._channels = new Map();
    // this._channelsById = new Map();
    // this._wasmFDsById = new Map();
    
    /**
     * We start the channel id's at 10 so that they will be well above any 'fd'
     * used by traditional WebAssembly (i.e. stdin, stdout, stderr). In the WebAssembly
     * we have logic that watches for read/write operations to 'fd' values, and
     * any that target a 'fd' above 10 will route the i/o to the appropriate ZitiChannel|ZitiTLSSocket.
     */
    // this._channelSeq = 10;
    // this._wasmFDSeq  = 10;
    
    // this._connSeq = 0;

    this._ensureAPISessionMutex = withTimeout(new Mutex(), 3 * 1000);
    // this._servicesMutex = withTimeout(new Mutex(), 3 * 1000);

    // this._connectMutexWithTimeout = withTimeout(new Mutex(), 30 * 1000);

    this._servicesMutex = withTimeout(new Mutex(), 3 * 1000, new Error('timeout on _servicesMutex'));

    // this._fetchSemaphoreHTTP  = new Semaphore( 8 );

    //TEMP: we constrain HTTP requests that travel over nestedTLS to one-at-a-time for the moment.
    //      This will be removed as soon as I fix the TLS protocol collision issue that manifests
    //      when multiple HTTP requests are initiated simultaneously :(
    // this._fetchSemaphoreHTTPS = new Semaphore( 8 );

    // this._pkey = null;
    // this._privateKeyPEM = null;
    // this._publicKeyPEM = null;
    // this._casPEM = null;
    // this._certPEM = null;
    this._apiSession = null;

    this._timeout = ZITI_CONSTANTS.ZITI_DEFAULT_TIMEOUT;
    
  }

  updateAccessToken(access_token) {
    this._apiSession = null;
    this.access_token = access_token;
  }

  /**
   * 
   */
  async initialize(options) {

    if (this._initialized) throw Error("Already initialized; Cannot call .initialize() twice on instance.");

    this._zitiBrowzerEdgeClient = await this.createZitiBrowzerEdgeClient ({
      logger: this.logger,
      controllerApi: this.controllerApi,
      domain: this.controllerApi,
      token_type: this.token_type,
      access_token: this.access_token,
    });

    this._initialized = true;

  }

  /**
   * 
   * @param {*} options 
   * @returns ZitiContext
   */
  async createZitiBrowzerEdgeClient (options) {

    const { ZitiBrowzerEdgeClient } = await import('@openziti/ziti-browzer-edge-client');

    /**
     *  The following will make the ZitiBrowzerEdgeClient believe it is running in a browser
     */
    var {
      Headers,
      Request,
      Response,
    } = await import('node-fetch');
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    if (!globalThis.fetch) {
      globalThis.fetch = fetch
      globalThis.Headers = Headers
      globalThis.Request = Request
      globalThis.Response = Response
    }

    let zitiBrowzerEdgeClient = new ZitiBrowzerEdgeClient(Object.assign( {}, options))

    return zitiBrowzerEdgeClient;
  }


  /**
   * 
   */
  async doAuthenticate() {

    let self = this;

    return new Promise( async (resolve, reject) => {

      // Use 'ext-jwt' style authentication, but allow for 'password' style (mostly for testing)
      let method = (isNull(self.access_token)) ? 'password' : 'ext-jwt';
      self.logger.trace(`ZitiContext.doAuthenticate(): method[${method}]`);

      // Get an API session with Controller
      let res = await self._zitiBrowzerEdgeClient.authenticate({

        method: method,

        auth: { 

          username: self.updbUser,
          password: self.updbPswd,

          configTypes: [
            'ziti-tunneler-client.v1',
            'intercept.v1',
            'zrok.proxy.v1'
          ],

          envInfo: {

            // e.g.:  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.83 Safari/537.36'
            arch: (typeof _ziti_realFetch !== 'undefined') ? window.navigator.userAgent : 'n/a',

            // e.g.:  'macOS', 'Linux', 'Windows'
            os: (typeof _ziti_realFetch !== 'undefined') ? (typeof navigator.userAgentData !== 'undefined' ? navigator.userAgentData.platform : 'n/a') : 'n/a'
          },
            
          sdkInfo: {
            type: self.sdkType,
            version: self.sdkVersion,
            branch: self.sdkBranch,
            revision: self.sdkRevision,
          },   
              
        }
      }).catch((error) => {
        self.logger.error( error );
      });

      return resolve( res );

    });

  }

  delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }
  
  /**
   * 
   */
  async getFreshAPISession() {
  
    this.logger.trace('ZitiContext.getFreshAPISession() entered');

    let authenticated = false;
    let retry = 5;

    do {

      let res = await this.doAuthenticate();

      if (isUndefined(res)) {

        this.logger.trace('ZitiContext.getFreshAPISession(): will retry after delay');
        await this.delay(1000);
        retry--;

      }
      else if (!isUndefined(res.error)) {

        retry = 0;

        var decoded_access_token = jwt_decode(this.access_token);

        this.logger.error(`ZitiContext.getFreshAPISession(): user [${decoded_access_token.email}] authentication request failed`);

        // Let any listeners know the given JWT is not authorized to access the network,
        // which is most likely a condition where the Identity was not provisioned
        this.emit(ZITI_CONSTANTS.ZITI_EVENT_INVALID_AUTH, {
          email: decoded_access_token.email
        });

      } else {

        this._apiSession = res.data;

        if (isUndefined( this._apiSession )) {

          this.logger.error('response contains no data');
          this.logger.trace('ZitiContext.getFreshAPISession(): will retry after delay');
          await this.delay(1000);
          retry--;

        } 
        else if (isUndefined( this._apiSession.token )) {

          this.logger.error('response contains no token');
          this.logger.trace('ZitiContext.getFreshAPISession(): will retry after delay');
          await this.delay(1000);
          retry--;

        }
        else {

          // Set the token header on behalf of all subsequent Controller API calls
          this._zitiBrowzerEdgeClient.setApiKey(this._apiSession.token, 'zt-session', false);

          setTimeout(this.apiSessionHeartbeat, this.getApiSessionHeartbeatTime(this), this );

          authenticated = true;

        }

      }

    } while (!authenticated && retry > 0);

    if (!authenticated) {
      this.logger.error(`cannot authenticate`);
    }

    this.logger.trace({message: 'ZitiContext.getFreshAPISession() exiting', token: this._apiSession.token});

    return this._apiSession.token ;
  }


  /**
   * 
   */
  async ensureAPISession() {
  
    let token;

    await this._ensureAPISessionMutex.runExclusive(async () => {
      if (isNull( this._apiSession ) || isUndefined( this._apiSession.token )) {
        token = await this.getFreshAPISession().catch((error) => {
          token = null;
        });
      } else {
        token = this._apiSession.token;
      }
    });
  
    return token;
  }
  

  /**
   *
   */
  async apiSessionHeartbeat(self) {

    self.logger.trace('ZitiContext.apiSessionHeartbeat() entered');

    let res = await self._zitiBrowzerEdgeClient.getCurrentAPISession({ }).catch((error) => {
      throw error;
    });

    let idpAuthHealthEvent = {
      expired: false    // default is to assume JWT is NOT expired
    };

    if (!isUndefined(res.error)) {

      self.logger.error(res.error.message);

      if (!isUndefined( self._apiSession )) {
        self._apiSession.token = null;
      }

      idpAuthHealthEvent.expired = true;
    
    } else {

      self._apiSession = res.data;
      if (isUndefined( self._apiSession )) {
        self.logger.warn('ZitiContext.apiSessionHeartbeat(): response contains no data:', res);
        idpAuthHealthEvent.expired = true;
      }

      if (isUndefined( self._apiSession.token )) {
        self.logger.warn('ZitiContext.apiSessionHeartbeat(): response contains no token:', res);
        idpAuthHealthEvent.expired = true;
      }

      if (Array.isArray( res.data.authQueries )) {
        forEach( res.data.authQueries, function( authQueryElement ) {
          if (isEqual(authQueryElement.typeId, 'EXT-JWT')) {
            idpAuthHealthEvent.expired = true;
          }
        });
      }

      // Set the token header on behalf of all subsequent Controller API calls
      self._zitiBrowzerEdgeClient.setApiKey(self._apiSession.token, 'zt-session', false);

      self.logger.trace({message: 'ZitiContext.apiSessionHeartbeat() exiting', token: self._apiSession.token});
    }

    // Let any listeners know the current IdP Auth health status
    self.emit(ZITI_CONSTANTS.ZITI_EVENT_IDP_AUTH_HEALTH, idpAuthHealthEvent);

    setTimeout(self.apiSessionHeartbeat, self.getApiSessionHeartbeatTime(self), self );
  }


  /**
   * 
   */
  getApiSessionHeartbeatTime(self) {
    let time = self.getRandomInt(self.apiSessionHeartbeatTimeMin, self.apiSessionHeartbeatTimeMax);
    self.logger.debug({message: `mins before next heartbeat: ${time}`});
    return (time * 1000 * 60);
  }

  /**
   * Returns a random integer between min (inclusive) and max (inclusive).
   */
  getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  

  /**
   * 
   */
  async fetchServices() {

    await this._servicesMutex.runExclusive(async () => {

      await this.ensureAPISession();

      let done = false;
      let offset = 0;
      this._services = [];

      do {

        // Get list of active Services from Controller
        let res = await this._zitiBrowzerEdgeClient.listServices({
          offset: offset,
          limit: '10000'
        }).catch((error) => {
          throw error;
        });

        if (!isUndefined(res.error)) {
          this.logger.error(res.error.message);
          throw new Error(res.error.message);
        }

        for (let i=0; i < res.data.length; i++) {

          this._services.push(res.data[i]);
          offset++;

          if (offset >= res.meta.pagination.totalCount) {
            done = true;
          }

        }

      } while (!done);
    
    });

  }


  /**
   * 
   */
  async listControllerVersion() {
     
    let res = await this._zitiBrowzerEdgeClient.listVersion({ 
    }).catch((error) => {
      throw error;
    });

    if (!isUndefined(res.error)) {
      this.logger.error(res.error.message);
      throw new Error(res.error.message);
    }

    this._controllerVersion = res.data;
    
    if (isUndefined( this._controllerVersion ) ) {
      throw new Error('response contains no data');
    }

    this.logger.info('Controller Version acquired: ', this._controllerVersion.version);

    return this._controllerVersion;
  }

  get controllerVersion () {
    return this._controllerVersion;
  }


  get services () {
    return this._services;
  }


  /**
   * 
   */
  async getServiceIdByName(name) {

    let self = this;
    let service_id;

    await this._servicesMutex.runExclusive(async () => {

      service_id = result(find(self._services, function(obj) {
        return obj.name === name;
      }), 'id');

    });

    return service_id;

  } 
 
}
