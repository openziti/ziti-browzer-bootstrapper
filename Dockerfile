# FROM node:lts-alpine3.12
# FROM node:14.16.1-buster
FROM ubuntu:20.04

LABEL maintainer="OpenZiti <openziti@netfoundry.io>"

# Install useful tools
RUN apt-get update
RUN apt-get install -y jq curl python2 build-essential git

# Install NodeJS 14.x
RUN curl -sL https://deb.nodesource.com/setup_14.x  | bash -
RUN apt-get -y install nodejs

# Add 'node' user
RUN groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/bash --create-home node

# Create directory for the Ziti BrowZer Bootstrapper, and explicitly set the owner of that new directory to the node user
RUN mkdir /home/node/ziti-browzer-bootstrapper/ && chown -R node:node /home/node/ziti-browzer-bootstrapper
WORKDIR /home/node/ziti-browzer-bootstrapper

# Prepare for dependencies installation
COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

# Install the dependencies for the Ziti BrowZer Bootstrapper according to package-lock.json (ci) without
# devDepdendencies (--production), then uninstall npm which isn't needed.
RUN npm install --global yarn \
 && yarn install \
 && npm cache clean --force --loglevel=error 

RUN chown -R node:node .

USER node

# Bring in the source of the Ziti BrowZer Bootstrapper to the working folder
COPY --chown=node:node index.js .
COPY --chown=node:node zha-docker-entrypoint .
COPY --chown=node:node lib ./lib/
COPY --chown=node:node greenlock.d ./greenlock.d/

# Expose the Ziti BrowZer Bootstrapper for traffic to be proxied (8000) and the
# REST API where it can be configured (8001)
EXPOSE 8000
EXPOSE 8443

# Put the Ziti BrowZer Bootstrapper on path for zha-docker-entrypoint
ENV PATH=/home/node/bin:$PATH
ENTRYPOINT ["/home/node/ziti-browzer-bootstrapper/zha-docker-entrypoint"]

# CMD ["node index.js > ./log/ziti-browzer-bootstrapper.log > 2&1"]
