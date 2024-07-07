`ziti-browzer-bootstrapper`
=====================

A NodeJS-based server responsible for securely bootstrapping browser-based web applications over an
[OpenZiti Overlay Network](https://openziti.io/docs/reference/glossary/#network-overlay-overlay)

<img src="https://raw.githubusercontent.com/openziti/branding/main/images/logos/ziti-dark.svg" width="400" />

Learn about OpenZiti at [openziti.io](https://openziti.io)


[![Build](https://github.com/openziti/ziti-browzer-bootstrapper/workflows/Build/badge.svg?branch=main)]()
[![Issues](https://img.shields.io/github/issues-raw/openziti/ziti-browzer-bootstrapper)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![LOC](https://img.shields.io/tokei/lines/github/openziti/ziti-browzer-bootstrapper)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=rounded)](CONTRIBUTING.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v2.0%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)



<!-- TOC -->

- [Motivation](#motivation)
- [Features](#features)
- [Installing/Running](#installingrunning)
- [Configuration](#configuration)
- [License](#license)

<!-- /TOC -->


## Motivation

Zero trust is an evolving landscape. Lots of enterprises, organizations, individuals would like to have a more robust
security posture, but installing agents is sometimes a non-starter. BrowZer bypasses the need for installing agents on
devices that are accessing resources secured by the OpenZiti overlay network. Instead of relying on a client to be
installed, BrowZer enables "clientless zero trust". Users do not need to install any client to use an http-based resource
protected by BrowZer and OpenZiti

## Features

Client-less zero trust, bootstrapped entirely in the browser!

## Prerequisites

### Node/Yarn

The project relies on NodeJS. You'll obviously need to have node available. The project also relies on [yarn](https://yarnpkg.com/)
for building. Ensure you have the necessary version of Node and Yarn installed

### OpenZiti Network

To run the project, you'll first need to have administrator access to a running OpenZiti overlay. Follow [one of the
network quickstarts](https://openziti.io/docs/learn/quickstarts/network/) to get an overlay network running. Ensure
you have configured the overlay with "alternative server certs" as outlined 
[in the documentation](https://openziti.io/docs/guides/alt-server-certs).

### third-party verifiable, wildcard certificate
BrowZer operates in your browser, having a PKI that is not self-signed make using BrowZer much easier. LetsEncrypt
makes obtaining certificates attainable for nearly everyone. It is easier to procure a wildcard certificate and use it
for not only your OpenZiti overlay network, but also for the ziti-browzer-bootstrapper as well.

### OIDC Provider

BrowZer leverages OpenZiti's "ext-jwt-signers" functionality. This functionality allows delegation of authentication to
configured OIDC providers. To use BrowZer you will **need** and OIDC provider. There are many providers available to 
choose from. Find one that works for you.

## Configuring the OpenZiti Network

To configure the OpenZiti overlay, you'll need to do the following:

* create a valid `ext-jwt-signer`
* create an `auth-policy` that uses the configured `ext-jwt-signer`
* associate the `auth-policy` to the identities which are to be enabled for BrowZer-based authentication

### Create a valid ext-jwt-signer

The easiest way to configure the ext-jwt-signer will be to use the OIDC discovery endpoint. Most OIDC providers will expose
this endpoint to you. The URL will generally end with `.well-known/openid-configuration`. For example, if you use Auth0
as your OIDC provider you'll be given a 'domain' from Auth0 that will look like: https://dev-blah_blah_xctngxka.us.auth0.com.
For this Auth0 domain, the discovery endpoint will be at `https://dev-blah_blah_xctngxka.us.auth0.com/.well-known/openid-configuration`.
Inspecting this endpoint will provide you with the information you need to configure the overlay. All the OIDC providers
will provide a CLIENT_ID of some kind. You will also need to know this value to configure BrowZer and OpenZiti properly.
There's lots of information about the client id on the internet, one such source you can use to read about client id
[is provided here](https://www.oauth.com/oauth2-servers/client-registration/client-id-secret/)

Another piece of information you will require from the OIDC provider is the expected claim value to associate the user to. Every OIDC provider
is different. It's up to you to understand what claim you want to map. As another example, staying with Auth0, you
will see the JWT bearer token returned from Auth0 will contain a claim named "email". When creating the `ext-jwt-signer`,
this claim is referenced as the 'claims-property'.

Here's a very simple set of steps that illustrates how you might use the `ziti` CLI with Auth0 to create an external
jwt signer in your OpenZiti overlay (see the official doc site for more information) This example will not work for you as-is,
you'll need to supply the proper inputs. The example is for illustration only:

```bash
ZITI_BROWZER_OIDC_URL=https://dev-blah_blah_xctngxka.us.auth0.com
ZITI_BROWZER_CLIENT_ID=blah_blah_45p8tvLJTbRbGw6TU2xjj
ZITI_BROWZER_FIELD=email
issuer=$(curl -s ${ZITI_BROWZER_OIDC_URL}/.well-known/openid-configuration | jq -r .issuer)
jwks=$(curl -s ${ZITI_BROWZER_OIDC_URL}/.well-known/openid-configuration | jq -r .jwks_uri)

echo "OIDC issuer   : $issuer"
echo "OIDC jwks url : $jwks"

ext_jwt_signer=$(ziti edge create ext-jwt-signer "browzer-auth0-ext-jwt-signer" "${issuer}" --jwks-endpoint "${jwks}" --audience "${ZITI_BROWZER_CLIENT_ID}" --claims-property ${ZITI_BROWZER_FIELD})
echo "ext jwt signer id: $ext_jwt_signer"
```

### Create an Authentication Policy

Once the external jwt signer is created you will need an [authentication policy](https://openziti.io/docs/learn/core-concepts/security/authentication/authentication-policies).
If you have run the command above, you will be able to create and echo the auth-policy using a command similar to this 
one (see the official doc site for more information):

```bash
auth_policy=$(ziti edge create auth-policy browzer-auth0-auth-policy --primary-ext-jwt-allowed --primary-ext-jwt-allowed-signers ${ext_jwt_signer})
echo "auth policy id: $auth_policy"
```

### Authorizing an Identity for BrowZer

Once the external signer and auth policy are in place, now you need to associate the policy with an identity.
For example, if you ran the auth policy command shown above, you could do something as shown:

```bash
id=some.email@address.ziti
ziti edge create identity user "${id}" --auth-policy ${auth_policy} --external-id "${id}" -a browzer.enabled.identities
```

This creates an association in OpenZiti mapping an identity with "some.email.@address.ziti" to this OpenZiti identity.
Continuing with Auth0 as the OIDC provider, when a user tries to use a service protected with BrowZer, after authenticating
to Auth0, Auth0 is expected to return a bearer token with a field named email, containing "some.email@address.ziti". (the
_actual_ email of the user should be returned, of course). If that's the case, now this user will be authorized to access
the service.

## Installing/Running

Once the prerequisites are met, starting the `ziti-browzer-bootstrapper` should be relatively simple. To start the bootstrapper you will
be expected to provide the following environment variables before starting the service. If you are running with NodeJS,
you'll set these as environment variables. If you're running via docker, you can either use a .env file or you can set
environment variables.

### Environment Variables

* NODE_ENV: controls if the environment is production or development
* ZITI_BROWZER_RUNTIME_LOGLEVEL: the log level for the Ziti BrowZer Runtime (ZBR) to use
* ZITI_BROWZER_RUNTIME_HOTKEY: the hotkey to activate the BrowZer settings dialog modal. default: alt+F12
* ZITI_CONTROLLER_HOST: the "alternative" address for the OpenZiti controller
* ZITI_CONTROLLER_PORT: the port to find the OpenZiti controller at
* ZITI_BROWZER_BOOTSTRAPPER_LOGLEVEL: the log level for the ziti-browzer-bootstrapper to log at
* ZITI_BROWZER_BOOTSTRAPPER_HOST: the address the ziti-browzer-bootstrapper is available at
* ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT: the port the ziti-browzer-bootstrapper is available at
* ZITI_BROWZER_BOOTSTRAPPER_SCHEME: the scheme to use to access the ziti-browzer-bootstrapper (https by default)
* ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH: the path to the certificate the ziti-browzer-bootstrapper presents to clients
* ZITI_BROWZER_BOOTSTRAPPER_KEY_PATH: the associated key for the ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH
* ZITI_BROWZER_LOAD_BALANCER_HOST: the address of the load balancer (if an optional LB does TLS-termination in front of the ziti-browzer-bootstrapper)
* ZITI_BROWZER_LOAD_BALANCER_PORT: the port the load balancer listens on (443 by default)
* ZITI_BROWZER_BOOTSTRAPPER_TARGETS: __more on this below__

```bash
      NODE_ENV: production
      ZITI_BROWZER_RUNTIME_LOGLEVEL: debug
      ZITI_BROWZER_RUNTIME_HOTKEY: alt+F12
      ZITI_CONTROLLER_HOST: ${ZITI_CTRL_EDGE_ALT_ADVERTISED_ADDRESS}
      ZITI_CONTROLLER_PORT: ${ZITI_CTRL_EDGE_ADVERTISED_PORT}
      ZITI_BROWZER_BOOTSTRAPPER_LOGLEVEL: debug
      ZITI_BROWZER_BOOTSTRAPPER_HOST: ${ZITI_BROWZER_BOOTSTRAPPER_HOST}
      ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT: ${ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT}
      ZITI_BROWZER_BOOTSTRAPPER_SCHEME: https
      ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH: /etc/letsencrypt/live/your.fqdn.here/fullchain.pem
      ZITI_BROWZER_BOOTSTRAPPER_KEY_PATH: /etc/letsencrypt/live/your.fqdn.here/privkey.pem
      ZITI_BROWZER_BOOTSTRAPPER_TARGETS: __more on this below__
```

### ZITI_BROWZER_BOOTSTRAPPER_TARGETS

The `ZITI_BROWZER_BOOTSTRAPPER_TARGETS` environment variable is a json block that specifies the configuration of services the `ziti-browzer-bootstrapper`
should support. The json is a single entry named "targetArray" which is an array of services to configure with one entry
per service. An example json block would look like the following:
```json
{
  "targetArray": [
    {
      "vhost": "${ZITI_BROWZER_VHOST}",
      "service": "${ZITI_BROWZER_SERVICE}",
      "path": "/",
      "scheme": "http",
      "idp_issuer_base_url": "${ZITI_BROWZER_OIDC_URL}",
      "idp_client_id": "${ZITI_BROWZER_CLIENT_ID}"
    }
  ]
}
```

### Starting the ziti-browzer-bootstrapper

Once you have set the required environment variables you can start the `ziti-browzer-bootstrapper` directly by running `yarn build`
and then running:
```bash
NODE_EXTRA_CA_CERTS=node_modules/node_extra_ca_certs_mozilla_bundle/ca_bundle/ca_intermediate_root_bundle.pem node index.js
```

To start the `ziti-browzer-bootstrapper` from docker you can issue a command, using the environment variables. For example:
```bash
docker run
--name ziti-browzer-bootstrapper
--rm -v /etc/letsencrypt:/etc/letsencrypt
--user 1000:2171
-p 1443:1443
-e NODE_ENV=production
-e ZITI_BROWZER_BOOTSTRAPPER_LOGLEVEL=debug
-e ZITI_BROWZER_RUNTIME_LOGLEVEL=debug
-e ZITI_BROWZER_RUNTIME_HOTKEY=alt+F12
-e ZITI_CONTROLLER_HOST=ctrl.zititv.demo.openziti.org
-e ZITI_CONTROLLER_PORT=1280
-e ZITI_BROWZER_BOOTSTRAPPER_HOST=browzer.zititv.demo.openziti.org
-e ZITI_BROWZER_BOOTSTRAPPER_SCHEME=https
-e ZITI_BROWZER_BOOTSTRAPPER_CERTIFICATE_PATH=/etc/letsencrypt/live/zititv.demo.openziti.org/fullchain.pem
-e ZITI_BROWZER_BOOTSTRAPPER_KEY_PATH=/etc/letsencrypt/live/zititv.demo.openziti.org/privkey.pem
-e ZITI_BROWZER_BOOTSTRAPPER_LISTEN_PORT=1443
-e ZITI_BROWZER_BOOTSTRAPPER_TARGETS=  {
    "targetArray": [
      {
        "vhost": "docker-whale.zititv.demo.openziti.org",
        "service": "docker.whale",
        "path": "/",
        "scheme": "http",
        "idp_issuer_base_url": "https://dev-b2q0t23rxctngxka.us.auth0.com",
        "idp_client_id": "Yo1JXbaLhp045p8tvLJTbRbGw6TU2xjj"
      }
    ]
  }\
  ghcr.io/openziti/ziti-browzer-bootstrapper:pr177.432
```


[npm-image]: https://flat.badgen.net/npm/v/@openziti/ziti-sdk-js
[npm-url]: https://www.npmjs.com/package/@openziti/ziti-sdk-js
[install-size-image]: https://flat.badgen.net/packagephobia/install/@openziti/ziti-sdk-js
[install-size-url]: https://packagephobia.now.sh/result?p=@openziti/ziti-sdk-js
