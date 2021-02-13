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
 * 
 */
async function sendMessageToClient( client, message ) {

    return new Promise( async function(resolve, reject) {

        console.log('ziti-http-agent: sendMessageToClient() processing msg: ', message);

        var messageChannel = new MessageChannel();

        messageChannel.port1.onmessage = function( event ) {
            console.log('ziti-http-agent: sendMessageToClient() onmessage(): reply event is: : ', event);
            if (event.data.error) {
                reject(event.data.error);
            } else {
                resolve(event.data);
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
    console.log('ziti-http-agent: install event');

    const urlsToCache = ['/'];

    event.waitUntil(async function() {

        const allClients = await clients.matchAll({ includeUncontrolled: true });
        const client     = await clients.get(allClients[0].id);
        var resp;

        resp = await sendMessageToClient( client, { command: 'initClient', options: { logLevel: zitiConfig.httpAgent.zitiSDKjs.logLevel } } );
        console.log('ziti-http-agent: install() setControllerApi resp is: : ', resp);

        resp = await sendMessageToClient( client, { command: 'setControllerApi', controller: zitiConfig.controller.api } );
        console.log('ziti-http-agent: install() setControllerApi resp is: : ', resp);

        resp = await sendMessageToClient( client, { command: 'generateKeyPair' } );
        console.log('ziti-http-agent: install() generateKeyPair resp is: : ', resp);


        // var cache = await caches.open('ziti_sdk_js');
        // await cache.addAll(urlsToCache);


        console.log('ziti-http-agent: install event, now calling skipWaiting()');
        self.skipWaiting();
    }());

});


/**
 *  ACTIVATE:
 * 
 */
self.addEventListener('activate', async function(event) {
    console.log('ziti-http-agent: activate event: ', event);
    event.waitUntil(async function() {
        clients.claim();
    }());
});


/**
 * 
 */
async function shouldIntercept( event ) {

    return new Promise( async (resolve) => {

        var url = event.request.url;

        console.log('ziti-http-agent: shouldIntercept entered for: ', url);

        var requestUrl = new URL( event.request.url );

        // If scheme is https and URL did not specify a port, then default it to 443 on behalf of the regex below
        if (requestUrl.protocol === 'https:') {
            if (requestUrl.port === '') {
                url = requestUrl.protocol + '//' + requestUrl.hostname + ':443' + requestUrl.pathname;
            }
        }

        // We only want to intercept fetch requests that target the Ziti HTTP Agent
        var regex = new RegExp( zitiConfig.httpAgent.self.host + ':443' , 'g' );

        if (url.match( regex )) {   // request is indeed targeting Ziti HTTP Agent

            // Ensure the browser, not this service worker, does the fetch of the root page
            if ( requestUrl.pathname === '/' ) {
            
                console.log('ziti-http-agent: shouldIntercept returning FALSE for: ', url);
                resolve( false );
                return;

            } else {

                console.log('ziti-http-agent: shouldIntercept TRUE for: ', url);

                /**
                 * Since we will be routing the request over Ziti, do NOT proceed until we have the necessary Ziti network credentials.
                 * 
                 * We do an 'awaitIdentityLoaded' command over to the client (page), instead of just looking in IndexedDB, because
                 * if we do NOT have a viable Identity, we will need to prompt the user for their Ziti UPDB creds, and this prompt
                 * requires us to render a UI via DHTML.  Here in the service worker, we have NO access to the DOM, so the UI is managed
                 * over in the client (page).
                 */

                const clientId = event.resultingClientId !== "" ? event.resultingClientId : event.clientId;
                const client = await self.clients.get(clientId);
      
                console.log('ziti-http-agent: shouldIntercept now doing awaitIdentityLoaded for: ', url);
                resp = await sendMessageToClient( client, { command: 'awaitIdentityLoaded', options: { logLevel: zitiConfig.httpAgent.zitiSDKjs.logLevel } } );
                console.log('ziti-http-agent: fetch() awaitIdentityLoaded resp is: : ', resp);
    

                console.log('ziti-http-agent: shouldIntercept returning TRUE for: ', url);
                resolve( true );
                return;

            }
        }

        // All other requests should be handled by the browser
        console.log('ziti-http-agent: shouldIntercept returning FALSE for: ', url);
        resolve( false );
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


/**
 *  FETCH:
 * 
 */
self.addEventListener('fetch', async function( event ) {

    console.log( 'ziti-http-agent: fetch starting for url: ', event.request.url);

    event.respondWith(async function() {

        return new Promise( async (resolve) => {

            console.log( 'ziti-http-agent: inside event.respondWith, BEFORE shouldIntercept() for: ', event.request.url);
            var doIntercept = await shouldIntercept( event ).catch( async (err) => {

                console.log( 'ziti-http-agent: shouldIntercept error: fetch NOT intercepting', err); 
        
                var response = await fetch(event.request);

                return resolve( response );

            });

            console.log( 'ziti-http-agent: inside event.respondWith, AFTER  shouldIntercept() for: ', event.request.url, doIntercept);

            if ( !doIntercept ) {

                console.log( 'ziti-http-agent: fetch NOT intercepting: ', event.request.url); 
        
                var response = await fetch(event.request);

                return resolve( response );
        
            } else {

                console.log( 'ziti-http-agent: fetch IS intercepting: ', event.request.url); 

                /**
                 * Retarget the request from the Ziti HTTP Agent over to the (dark) target host
                 */
                var newUrl = new URL( event.request.url );
                newUrl.hostname = zitiConfig.httpAgent.target.host;
                newUrl.port = zitiConfig.httpAgent.target.port;
                console.log( 'ziti-http-agent: transformed URL: ', newUrl.toString());

                /**
                 * Instantiate a fresh HTTP Request object that we will push through the ziti-sdk-js which will:
                 * 
                 * 1) contain re-routed host
                 * 2) have any headers we need to pile on
                 * 3) prepare to stream out any body data associated with the intercepted request
                 */
                const zitiRequest = new Request(event.request, {
                    headers: {
                        // 'x-ziti-http-agent': '?',
                    }
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
 * 
 */
addEventListener('message', event => {
    console.log(`The client sent me a message: ${event.data}`);  
});
  
