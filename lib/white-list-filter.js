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

const IPCIDR    = require("ip-cidr");
const forEach   = require('lodash.foreach');


module.exports = function (options) {

  if (!options){
    options = {};
  }

  logger      = options.logger;
  cidrList    = options.cidrList || [];
  whitelist   = [];

  forEach(cidrList, function( address ) {

    if(!IPCIDR.isValidAddress( address )) {

      logger.error('whiteListFilter: invalid whitelist CIDR block specified: %o', address);
      process.exit(-1);

    }
    else {

      const cidr = new IPCIDR(address); 

      whitelist = whitelist.concat( cidr.toArray() );

    }
  
  });

  logger.info('whiteListFilter: whitelist: %o', whitelist);

  return middleware;
};

function middleware (req, res, next) {

  // If we were not configured with a white list, then allow request to proceed.
  if (whitelist.length === 0) {
    next();
    return;
  }

  var clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // If client is in the white list, then allow request to proceed
  if (ok(clientIP)) {
    next();
  } 
  // Otherwise, kill it
  else {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 511;
    res.end('{"error":"Network Authentication Required."}');
  }
}


function ok (clientIP) {
  if (whitelist.indexOf(clientIP) > -1) {
    return true;
  } else {
    return false;
  }
}
