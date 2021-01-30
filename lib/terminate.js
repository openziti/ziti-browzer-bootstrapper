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


function terminate (server, options = { coredump: false, timeout: 500 }) {

    // console.log('server is: ', server);
    // console.log('options is: ', options);

    // Exit function
    const exit = code => {
      options.coredump ? process.abort() : process.exit(code)
    }
  
    return (code, reason) => (err, promise) => {

        console.log('code is: ', code);
        console.log('reason is: ', reason);

      if (err && err instanceof Error) {
          if (options.logger) {
            options.logger.error(err.message, err.stack)
          }
      }
  
      // Attempt a graceful shutdown
      server.close(exit)
      setTimeout(exit, options.timeout).unref()
    }

  }
  
  module.exports = terminate
  