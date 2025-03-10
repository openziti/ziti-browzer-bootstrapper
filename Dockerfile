FROM node:18-bookworm-slim AS build

LABEL maintainer="OpenZiti <openziti@netfoundry.io>"

# Install useful tools
RUN apt-get update
RUN apt-get install -y python3 build-essential

# Create directory for the Ziti BrowZer Bootstrapper, and explicitly set the owner of that new directory to the node user
RUN mkdir /home/node/ziti-browzer-bootstrapper
WORKDIR /home/node/ziti-browzer-bootstrapper

# Prepare for dependencies installation
COPY --chown=node:node package.json ./
COPY --chown=node:node yarn.lock ./

ENV YARN_VERSION 4.0.2

RUN set -ex \
  && curl -fsSLO --compressed "https://yarnpkg.com/downloads/$YARN_VERSION/yarn-v$YARN_VERSION.tar.gz" \
  && tar -xzf yarn-v$YARN_VERSION.tar.gz -C /opt/ \
  && ln -s /opt/yarn-v$YARN_VERSION/bin/yarn /usr/local/bin/yarn \
  && ln -s /opt/yarn-v$YARN_VERSION/bin/yarnpkg /usr/local/bin/yarnpkg \
  && rm yarn-v$YARN_VERSION.tar.gz

# Install the dependencies for the Ziti BrowZer Bootstrapper according to yarn.lock (ci) without
# devDepdendencies (--production), then uninstall npm which isn't needed.
RUN  yarn install \
 && npm cache clean --force --loglevel=error 

# Bring in the source of the Ziti BrowZer Bootstrapper to the working folder
COPY --chown=node:node index.js .
COPY --chown=node:node zha-docker-entrypoint .
COPY --chown=node:node lib ./lib/
COPY --chown=node:node assets ./assets/

FROM node:18-bookworm-slim

RUN apt-get update && apt-get install curl -y

COPY --from=build /home/node/ziti-browzer-bootstrapper /home/node/ziti-browzer-bootstrapper

RUN chown -R node:node /home/node/ziti-browzer-bootstrapper
USER node

WORKDIR /home/node/ziti-browzer-bootstrapper

# Expose the Ziti BrowZer Bootstrapper for traffic to be proxied (8000) and the
# REST API where it can be configured (8001)
EXPOSE 8000
EXPOSE 8443

# Put the Ziti BrowZer Bootstrapper on path for zha-docker-entrypoint
ENV PATH=/home/node/bin:$PATH
ENTRYPOINT ["/home/node/ziti-browzer-bootstrapper/zha-docker-entrypoint"]

# CMD ["node index.js > ./log/ziti-browzer-bootstrapper.log > 2&1"]
