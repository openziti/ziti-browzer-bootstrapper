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


/**
 * Dynamically load the Ziti JS SDK into the global scope used by this service worker.
 * Let the SDK know that it is being loaded into a serviceWorker scope (so it will not 
 * try to do any DOM/UI manipulations.
 */
zitiConfig.serviceWorker.active = true;
zitiConfig.realFetch = fetch;
self.importScripts( zitiConfig.httpAgent.zitiSDKjs.location );

/**
 * Spawn regex's used to decide intercept events
 */
var regex = new RegExp( zitiConfig.httpAgent.self.host + ':443' , 'g' );    // targets the Ziti HTTP Agent itself
var targethostregex = new RegExp( zitiConfig.httpAgent.target.host , 'g' ); // targets the protected host
var additionaltargethostregex = new RegExp( zitiConfig.httpAgent.additionalTarget.host , 'g' ); // targets the protected host
var corsproxyregex = new RegExp( 'ziti-cors-proxy' , 'g' );                 // targets our CORS proxy
var domproxyregex  = new RegExp( 'ziti-dom-proxy' , 'g' );                  // targets our DOM proxy

// We want to intercept fetch requests that target socket.io/COOKIE/jwts/_h_t_m_l_5_r_d_p.html
var siocregex = new RegExp( 'socket.io/COOKIE/jwts/_h_t_m_l_5_r_d_p.html?' , 'g' );
var siocregex2 = new RegExp( 'software/html5.html' , 'g' );

/**
 * 
 */
 var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
 };
 var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var Mutex = /** @class */ (function () {
    function Mutex() {
        this.mutex = Promise.resolve();
    }
    Mutex.prototype.lock = function () {
        var begin = function (unlock) { 
        };
        this.mutex = this.mutex.then(function () {
            return new Promise(begin);
        });
        return new Promise(function (res) {
            begin = res;
        });
    };
    Mutex.prototype.dispatch = function (fn) {
        return __awaiter(this, void 0, Promise, function () {
            var unlock;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.lock()];
                    case 1:
                        unlock = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, Promise.resolve(fn())];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        unlock();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
   };
   return Mutex;
}());
   
/**
 * 
 */
async function sendMessageToClient( client, message ) {

    return new Promise( async function(resolve, reject) {

        console.log('ziti-sw: sendMessageToClient() processing cmd: ', message.command);

        var messageChannel = new MessageChannel();

        messageChannel.port1.onmessage = function( event ) {
            console.log('ziti-sw: sendMessageToClient() reply event is: ', message.command, ' - ', event.data.response);
            if (event.data.error) {
                reject(event.data.error);
            } else {
                resolve(event.data.response);
            }
        };

        client.postMessage(message, [messageChannel.port2]);
    });
}


/**
 *  INSTALL:
 * 
 */
self.addEventListener('install', function(event) {
    console.log('ziti-sw: install event');

    console.log('ziti-sw: install event, now calling skipWaiting()');
    self.skipWaiting();

    const urlsToCache = ['/'];

    event.waitUntil(async function() {

        const allClients = await clients.matchAll({ includeUncontrolled: true });
        const client     = await clients.get(allClients[0].id);
        var resp;

        resp = await sendMessageToClient( client, { command: 'initClient', options: { logLevel: zitiConfig.httpAgent.zitiSDKjs.logLevel } } );
        console.log('ziti-sw: install() initClient resp is: : ', resp);

        resp = await sendMessageToClient( client, { command: 'setControllerApi', controller: zitiConfig.controller.api } );
        console.log('ziti-sw: install() setControllerApi resp is: : ', resp);

        resp = await sendMessageToClient( client, { command: 'isKeyPairPresent' } );
        console.log('ziti-sw: install() isKeyPairPresent resp is: : ', resp);

        if (resp === '0') { // no keypair present, so generate it

            resp = await sendMessageToClient( client, { command: 'generateKeyPair' } );
            console.log('ziti-sw: install() generateKeyPair resp is: : ', resp);

            resp = await sendMessageToClient( client, { command: 'promptForZitiCredsNoWait' } );
            console.log('ziti-sw: install() promptForZitiCredsNoWait resp is: : ', resp);

        }

        // var cache = await caches.open('ziti_sdk_js');
        // await cache.addAll(urlsToCache);


        // console.log('ziti-sw: install event, now calling skipWaiting()');
        // self.skipWaiting();
    }());

});


/**
 *  ACTIVATE:
 * 
 */
self.addEventListener('activate', async function(event) {
    console.log('ziti-sw: activate event: ', event);
    self.identityPresentCheckFailTime = undefined;
    self.identityPresentCheckActiveCount = 0;
    self.identityPresentCheckFailCount = 0;
    event.waitUntil(self.clients.claim());
    console.log('ziti-sw: activate event completed clients.claim');
});


/**
 * 
 */
async function shouldDoInterceptInJSSDK( event ) {

    return new Promise( async (resolve) => {

        var url = event.request.url;
        var method = event.request.method;

        console.log('ziti-sw: shouldDoInterceptInJSSDK entered for: ', url);

        var requestUrl = new URL( event.request.url );

        // If scheme is https and URL did not specify a port, then default it to 443 on behalf of the regex below
        if (requestUrl.protocol === 'https:') {
            if (requestUrl.port === '') {
                url = requestUrl.protocol + '//' + requestUrl.hostname + ':443' + requestUrl.pathname;
            }
        }

        if (
               url.match( regex ) 
            || url.match( targethostregex ) 
            || url.match( additionaltargethostregex )
        ) {   // request targets Ziti HTTP Agent, or a protected host

            // Ensure the browser, not this service worker, does the fetch of the root page
            if ( requestUrl.pathname === '/' ) {
            
                console.log('ziti-sw: shouldDoInterceptInJSSDK returning FALSE (root path) for: ', url);
                resolve( 0 );
                return;
            }

            else if (url.match( corsproxyregex )) {

                console.log('ziti-sw: shouldDoInterceptInJSSDK returning FALSE (ziti-cors-proxy path) for: ', url);
                resolve( 0 );
                return;
    
            }    

            else if (url.match( domproxyregex )) {

                console.log('ziti-sw: shouldDoInterceptInJSSDK returning TRUE (ziti-dom-proxy path) for: ', url);
                resolve( 1 );
                return;
    
            }    

            else if (url.match( siocregex )) {

                console.log('ziti-sw: shouldDoInterceptInJSSDK returning TRUE (socket.io/COOKIE/jwts/_h_t_m_l_5_r_d_p.html path) for: ', url);
                resolve( 1 );
                return;
    
            }    

            else if (url.match( siocregex2 )) {

                console.log('ziti-sw: shouldDoInterceptInJSSDK returning FALSE (software/html5.html path) for: ', url);
                resolve( false );
                return;
    
            }    

            // Ensure the browser, not this service worker, does the (re)fetch of the page that caused sdk injection.
            else if ( method === 'GET' && requestUrl.pathname === zitiConfig.httpAgent.zitiSDKjsInjectionURL.location ) {
            
                console.log('ziti-sw: shouldDoInterceptInJSSDK returning FALSE (1) for: ', url);
                resolve( 0 );
                return;

            } else {

                console.log('ziti-sw: shouldDoInterceptInJSSDK TRUE for: ', url);
                console.log('ziti-sw: shouldDoInterceptInJSSDK self.identityLoaded is: ', self.identityLoaded);

                /**
                 * Since we will be routing the request over Ziti, do NOT proceed until we have the necessary Ziti network credentials.
                 * 
                 * If the client has already obtained the creds, and has signaled this fact to us, then do not ask client.
                 */
                // if (self.identityLoaded) {
                //     console.log('ziti-sw: shouldDoInterceptInJSSDK returning TRUE since self.identityLoaded = true');
                //     resolve( 1 );
                //     return;
                // }

                /** 
                 * Otherwise we do an 'awaitIdentityLoaded' command over to the client (page), instead of just looking in IndexedDB, because
                 * if we do NOT have a viable Identity, we will need to prompt the user for their Ziti UPDB creds, and this prompt
                 * requires us to render a UI via DHTML.  Here in the service worker, we have NO access to the DOM, so the UI is managed
                 * over in the client (page).
                 */
                 console.log('ziti-sw: await clients.matchAll: ', url, event.clientId);
                 let clients = await self.clients.matchAll();
                 console.log('ziti-sw: clients.matchAll returned: ', url, clients);
                 let client;
                 clients.forEach( function( c ) {
                    // if (c.id == event.clientId) {
                    // if (c.focused) {
                        client = c;
                    // }
                 });

                // console.log('ziti-sw: await clients.get for clientId: ', url, event.clientId);
                // const client = await self.clients.get(event.clientId);
                // console.log('ziti-sw: clients.get returned: ', url, client);
                if (!client) {
                    console.log('ziti-sw: clients.get returned null, returning FALSE for: ', url);
                    resolve( 0 );
                    return;            
                }

                /**
                 * We can't enable any intercepts unless we have a Cert
                 */
                console.log('ziti-sw: --- BEGIN IDENTITY-PRESENT CHECK --- : ', url);

                /**
                 * If there is no evidence that an identity has been loaded, and we have checked, and failed,
                 * at least once in the last second... then skip this intercept
                 */
                if (typeof self.identityLoaded === 'undefined') {
                    if (self.identityPresentCheckFailTime) {
                        let now = new Date();
                        let elapsed = now.getTime() - self.identityPresentCheckFailTime.getTime();
                        if ((self.identityPresentCheckFailCount > 0) || (elapsed > 1000)) {
                            console.log('ziti-sw: identityPresentCheckFailCount > 0, returning -1 for: ', url);
                            return resolve( -1 );
                        }
                    }
                }

                let unlock = undefined;

                if (typeof self.identityLoaded === 'undefined') {

                    //
                    //  ------ ENTER CRITICAL SECTION
                    //
                    if (typeof self.identityPresentCheckMutex === 'undefined') {
                        self.identityPresentCheckMutex = new Mutex();
                    }
                    unlock = await self.identityPresentCheckMutex.lock();
                    console.log('ziti-sw: --- NOW OWN MUTEX---, url: ', url);

                    if (typeof self.identityLoaded === 'undefined') { // if it wasn't loaded while we awaiting mutex

                        self.identityPresentCheckActiveCount++;
                        console.log('ziti-sw: await sendMessageToClient: isIdentityPresent: ', self.identityPresentCheckActiveCount, url);
                        let resp = await sendMessageToClient( client, { command: 'isIdentityPresent' } );
                        self.identityPresentCheckActiveCount--;
                        console.log('ziti-sw: sendMessageToClient returned: ', self.identityPresentCheckActiveCount, url, resp);
                        if (resp === '0') {

                            console.log('ziti-sw: --- NO IDENTITY PRESENT ---, url: ', url);

                            // Prevent subsequent requests from attempting to load creds since one is enough to accomplish the task
                            if (typeof self.identityPresentCheckFailTime === 'undefined') {
                                self.identityPresentCheckFailTime = new Date();
                                self.identityPresentCheckFailCount = 0;
                            }
                            self.identityPresentCheckFailCount++;

                            // No identity present, so ask the client page to begin the process of acquiring it.
                            let resp = await sendMessageToClient( client, { command: 'promptForZitiCredsNoWait', options: { logLevel: zitiConfig.httpAgent.zitiSDKjs.logLevel } } );
                            console.log('ziti-sw: install() promptForZitiCredsNoWait resp is: : ', resp);

                            // We'll skip intercept of this request (it will 409). We expect the
                            // above cmd to eventually cause the page to reload, and when it does, we'll have the identity we need,
                            // and we'll then route it over Ziti.
                            console.log('ziti-sw: clients.get returned null, returning FALSE for: ', url);
                            console.log('ziti-sw: identityPresentCheckFailCount --- NOW RELEASING MUTEX---, url: ', url);
                            unlock();
                            return resolve( -1 );
                        }

                        self.identityLoaded = 1;

                        // Now that we've got the creds, allow subsequent requests through
                        self.identityPresentCheckFailTime = undefined;
                        self.identityPresentCheckFailCount = 0;

                    } else {

                        console.log('ziti-sw: --- SKIPPING sendMessageToClient isIdentityPresent --- url: ', url);

                    }

                    console.log('ziti-sw: identityPresentCheckFailCount --- NOW RELEASING MUTEX---, url: ', url);
                    unlock();
                }
      
                // console.log('ziti-sw: shouldDoInterceptInJSSDK now doing awaitIdentityLoaded for: ', url);
                // resp = await sendMessageToClient( client, { command: 'awaitIdentityLoaded', options: { logLevel: zitiConfig.httpAgent.zitiSDKjs.logLevel } } );
                // console.log('ziti-sw: fetch() awaitIdentityLoaded resp is: : ', resp);
    
                console.log('ziti-sw: shouldDoInterceptInJSSDK returning TRUE for: ', url);
                resolve( 1 );
                return;
            }
        }

        // All other requests should be handled by the browser
        console.log('ziti-sw: shouldDoInterceptInJSSDK returning FALSE (2) for: ', url);
        resolve( 0 );
        return;
    });
}


/**
 * 
 */
async function getRequestBody( zitiRequest ) {
    return new Promise( async (resolve) => {
        var requestBlob = await zitiRequest.blob();
        if (requestBlob.size > 0) {
            return resolve( requestBlob );
        }
        return resolve( undefined );
    });
}


function dumpHeaders(headersObject) {
    for (var pair of headersObject.entries()) {
        console.log( 'ziti-sw: dumpHeaders: ', pair[0], pair[1]);
    }
}

/**
 *  FETCH:
 * 
 */
self.addEventListener('fetch', async function( event ) {

    console.log( 'ziti-sw: fetch starting for url: ', event.request.url);

    event.respondWith(async function() {

        return new Promise( async (resolve) => {

            console.log( 'ziti-sw: inside event.respondWith, BEFORE shouldDoInterceptInJSSDK() for: ', event.request.url);
            var doInterceptInJSSDK = await shouldDoInterceptInJSSDK( event ).catch( async (err) => {

                console.log( 'ziti-sw: shouldDoInterceptInJSSDK error: fetch NOT intercepting', err); 
        
                var response = await fetch(event.request);

                return resolve( response );

            });

            if ( -1 == doInterceptInJSSDK ) {

                return resolve( new Response(null, { "status" : 409 , "statusText" : "Ziti Identity not loaded yet!" }) );
        
            }

            else if ( 0 == doInterceptInJSSDK ) {

                console.log( 'ziti-sw: doing HTTP Agent fetch for: ', event.request.url); 
        
                var response = await fetch(event.request);

                console.log( 'ziti-sw: HTTP Agent response returned from: ', event.request.url); 

                return resolve( response );
        
            } else {

                console.log( 'ziti-sw: fetch IS intercepting: ', event.request.url); 

                // dumpHeaders(event.request.headers);

                /**
                 * Retarget the request from the Ziti HTTP Agent over to the (dark) target host
                 */
                var newUrl = new URL( event.request.url );
                newUrl.hostname = zitiConfig.httpAgent.target.host;
                newUrl.port = zitiConfig.httpAgent.target.port;
                if (!event.request.url.match( domproxyregex )) {
                    if (event.request.url.match( additionaltargethostregex )) {
                        newUrl.hostname = zitiConfig.httpAgent.additionalTarget.host;
                    }
                }
                console.log( 'ziti-sw: transformed URL: ', newUrl.toString());

                /**
                 * Instantiate a fresh HTTP Request object that we will push through the ziti-sdk-js which will:
                 * 
                 * 1) contain re-routed host
                 * 2) have any headers we need to pile on
                 * 3) prepare to stream out any body data associated with the intercepted request
                 */                 
                const zitiRequest = new Request(event.request, {
                });
                var blob = await getRequestBody( zitiRequest );
                var zitiResponse = await ziti.fetchFromServiceWorker(
                    newUrl.toString(), {
                        method:         zitiRequest.method, 
                        headers:        zitiRequest.headers,
                        mode:           zitiRequest.mode,
                        cache:          zitiRequest.cache,
                        credentials:    zitiRequest.credentials,
                        redirect:       zitiRequest.redirect,
                        referrerPolicy: zitiRequest.referrerPolicy,
                        body:           blob
                    }
                );        

                /**
                 * Now that ziti-sdk-js has returned us a ZitiResponse, instantiate a fresh Response object that we 
                 * will return to the Browser. This requires us to:
                 * 
                 * 1) propagate the HTTP headers, status, etc
                 * 2) pipe the HTTP response body 
                 */

                var zitiHeaders = zitiResponse.headers.raw();
                var headers = new Headers();
                const keys = Object.keys(zitiHeaders);
                for (let i = 0; i < keys.length; i++) {
                  const key = keys[i];
                  const val = zitiHeaders[key][0];
                  headers.append( key, val);
                //   console.log( 'ziti-sw: zitiResponse.headers: ', key, val); 
                }
                headers.append( 'x-ziti-http-agent-sdk-js-version', ziti.VERSION );

                var responseBlob = await zitiResponse.blob();
                var responseBlobStream = responseBlob.stream();               
                const responseStream = new ReadableStream({
                    start(controller) {
                        function push() {
                            var chunk = responseBlobStream.read();
                            if (chunk) {
                                controller.enqueue(chunk);
                                push();  
                            } else {
                                controller.close();
                                return;
                            }
                        };
                        push();
                    }
                });

                var response = new Response( responseStream, { "status": zitiResponse.status, "headers":  headers } );
                
                return resolve( response );
            }
        });

    }());
    
});


/**
 *  Client response sender
 */
_sendResponse = ( event, responseObject ) => {

    var data = {
        command: event.data.command,  // echo this back
        response: responseObject
    };
    event.ports[0].postMessage( data );
}


/**
 *  identityLoaded 'message' handler
 */
 _onMessage_identityLoaded = async ( event ) => {
    self.identityLoaded = event.data.identityLoaded;
    self.identityPresentCheckFailTime = undefined;
    self.identityPresentCheckFailCount = 0;
    console.log('ziti-sw: self.identityLoaded now set to: ', self.identityLoaded);

    _sendResponse( event, 'OK' );
}


/**
 *  nop 'message' handler
 */
_onMessage_nop = async ( event ) => {
    _sendResponse( event, 'nop OK' );
}
  

/**
 *  Client 'message' router
 */
 addEventListener('message', event => {

    console.log('ziti-sw: received msg from client: ', event);

         if (event.data.command === 'identityLoaded')       { _onMessage_identityLoaded( event ); }
    else if (event.data.command === 'nop')                  { _onMessage_nop( event ); }

    else { throw new Error('unknown message.command received [' + event.data.command + ']'); }
});
