# Stage 1: Install dependencies
FROM node:22-slim AS build

LABEL maintainer="OpenZiti <openziti@netfoundry.io>"

# Install useful tools
RUN apt-get update
RUN apt-get install -y python3 build-essential curl

# Create directory for the Ziti BrowZer Bootstrapper, and explicitly set the owner of that new directory to the node user
RUN mkdir /home/node/ziti-browzer-bootstrapper
WORKDIR /home/node/ziti-browzer-bootstrapper

# Prepare for dependencies installation
COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

# Install Yarn 4 globally
RUN corepack enable && yarn set version stable

# Bring in the source of the Ziti BrowZer Bootstrapper to the working folder
COPY --chown=node:node index.js .
COPY --chown=node:node zha-docker-entrypoint .
COPY --chown=node:node lib ./lib/
COPY --chown=node:node assets ./assets/

# Install dependencies (ensuring node_modules remains)
RUN yarn install --immutable

# Stage 2: Production-ready image
FROM node:22-slim

WORKDIR /home/node/ziti-browzer-bootstrapper

# Copy installed node_modules from build stage
COPY --from=build /home/node/ziti-browzer-bootstrapper /home/node/ziti-browzer-bootstrapper

RUN chown -R node:node /home/node/ziti-browzer-bootstrapper
USER node

# Expose the Ziti BrowZer Bootstrapper for traffic to be proxied (8000) and the
# REST API where it can be configured (8001)
EXPOSE 8000
EXPOSE 8443

# Put the Ziti BrowZer Bootstrapper on path for zha-docker-entrypoint
ENV PATH=/home/node/bin:$PATH
ENTRYPOINT ["/home/node/ziti-browzer-bootstrapper/zha-docker-entrypoint"]

# CMD ["node index.js > ./log/ziti-browzer-bootstrapper.log > 2&1"]
