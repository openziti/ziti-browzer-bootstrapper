# FROM node:lts-alpine3.12
FROM node:14.15.4-buster

LABEL maintainer="OpenZiti <openziti@netfoundry.io>"

# Install useful tools
RUN apt-get update
RUN apt-get install jq curl python2 

# Create directory for the Ziti HTTP Agent, and explicitly set the owner of that new directory to the node user
RUN mkdir /home/node/ziti-http-agent/ && chown -R node:node /home/node/ziti-http-agent
WORKDIR /home/node/ziti-http-agent

# Prepare for dependencies installation
COPY --chown=node:node package*.json ./

# Install the dependencies for the Ziti HTTP Agent according to package-lock.json (ci) without
# devDepdendencies (--production), then uninstall npm which isn't needed.
RUN npm ci --production \
 && npm cache clean --force --loglevel=error 

RUN chown -R node:node .

USER node

# Bring in the source of the Ziti HTTP Agent to the working folder
COPY --chown=node:node index.js .
COPY --chown=node:node lib ./lib/
COPY --chown=node:node bin ./bin/
# COPY --chown=node:node agent.json .

# Expose the Ziti HTTP Agent for traffic to be proxied (8000) and the
# REST API where it can be configured (8001)
EXPOSE 8000
EXPOSE 8001

# Put the Ziti HTTP Agent on path for zha-docker-entrypoint
ENV PATH=/home/node/bin:$PATH
# ENTRYPOINT ["/home/node/ziti-http-agent/zha-docker-entrypoint"]

# CMD ["node index.js"]
