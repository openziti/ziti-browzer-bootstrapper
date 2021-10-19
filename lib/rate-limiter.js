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

var clients   = {},
    whitelist,
    blacklist,
    end       = false,
    config    = {
      whitelist: {
        totalRequests: -1,
        every:         60 * 60 * 1000
      },
      blacklist: {
        totalRequests: 0,
        every:         60 * 60 * 1000 
      },
      normal: {
        totalRequests: 500,
        every:         60 * 60 * 1000
      }
    };


module.exports = function (options) {
  var categories;

  if (!options){
    options = {};
  }

  logger      = options.logger;
  whitelist   = options.whitelist || [];
  blacklist   = options.blacklist || [];
  end         = options.end       || end;
  

  categories = options.categories || options.catagories; 
  if (categories){
    deepExtend(config, categories);
  }

  logger.info('DDoS rateLimiter: config: %o, end: %o, whitelist: %o, blacklist: %o', config, end, whitelist, blacklist);

  return middleware;
};

function middleware (req, res, next) {
  var name   = req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      type   = getClientType(name),
      client = clients[name];

  res.ratelimit = {
    clients: clients,
    exceeded: false
  };

  if (req.url === '/favicon.ico') {
    next();
    return;
  };

  if (!client) {
    logger.silly('DDoS rateLimiter: creating new Client for name: %o, type: %o, every: %o', name, type, config[type].every);

    clients[name] = client = new Client(name, type, config[type].every);
  }  

  res.setHeader('x-ziti-http-agent-ratelimit-limit', config[type].totalRequests);
  res.setHeader('x-ziti-http-agent-ratelimit-remaining', config[type].totalRequests - client.visits);

  res.ratelimit.exceeded = !ok(client);
  res.ratelimit.client   = client;


  if (ok(client)) {
    client.incrementVisits();
    next();
  } 
  else if (end === false) {
    next();
  }
  else {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 429;
    res.end('{"error":"Rate limit exceded."}');
  }
}

function Client (name, type, resetIn) {

  var name   = name;

  this.name  = name;
  this.type  = type;
  this.visits = 1;

  this.incrementVisits = function() {
    this.visits++;
  }

  setTimeout(function () {
    delete clients[name];
  }, resetIn);
}

function ok (client) {
  if (config[client.type].totalRequests === -1) {
    return true;
  } else {
    return client.visits <= config[client.type].totalRequests;
  }
}

function getClientType (name) {
  if (whitelist.indexOf(name) > -1) {
    return 'whitelist';
  }
  if (blacklist.indexOf(name) > -1) {
    return 'blacklist';
  }
  return 'normal';
}

function deepExtend (destination, source) {
  var property;
  
  for (property in source) {
    if (source[property] && source[property].constructor &&
     source[property].constructor === Object) {
      destination[property] = destination[property] || {};
      deepExtend(destination[property], source[property]);
    } else {
      destination[property] = source[property];
    }
  }
  return destination;
}
