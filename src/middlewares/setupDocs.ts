import { Middleware } from 'koa'
import { solid } from 'rdf-namespaces'
import { AppConfig } from '../app.js'
import { soapPrefix } from '../config/constants.js'

export const setupDocs: Middleware<
  { config: AppConfig },
  {
    query: {
      webid?: string
      actor?: string
      pod?: string
      username?: string
      pubkey?: string
    }
  }
> = async ctx => {
  const webId =
    ctx.query.webid ?? 'https://username.mypod.example/profile/card#me'
  const pod = ctx.query.pod ?? new URL(webId).origin
  const actor =
    ctx.query.actor ?? new URL('soap-opera/profile/actor', pod).toString()
  const username =
    ctx.query.username ?? new URL(pod).hostname.split('.').shift() ?? 'username'
  const publicKey =
    ctx.query.pubkey ??
    '-----BEGIN PUBLIC KEY-----\nyour-base64-encoded-public-key\n-----END PUBLIC KEY-----'
  ctx.set('content-type', 'text/plain')
  ctx.status = 200
  ctx.body = generateDocs({
    webId,
    actor,
    pod,
    app: ctx.state.config.baseUrl,
    username,
    publicKey,
  })
}

const generateDocs = ({
  webId,
  actor,
  pod,
  app,
  username,
  publicKey,
}: {
  webId: string
  actor: string
  pod: string
  app: string
  username: string
  publicKey: string
}) => {
  return `# Welcome to the experimental SoAP agent!

This is how you need to set up your Pod in order to make it work.

If your Pod root storage is at subpath (e.g. https://mypod.example/username/), then you're out of luck. Get a subdomain-based pod, e.g. at https://solidcommunity.net.

If you want a config that is customized to your needs, provide some or all of the following values as query parameters (all except username should be URIs encoded with encodeURIComponent)

- username
- webid
- actor
- pod
- pubkey

## .well-known/webfinger

You need to save .well-known endpoint at the root of your pod and subdomain.

url: ${new URL('/.well-known/webfinger', actor).toString()}
access: public
content-type: application/json
body:
${JSON.stringify(getWebfinger({ pod, username, actor }), null, 2)}

compact:
${JSON.stringify(getWebfinger({ pod, username, actor }))}

## actor

You need to save actor to your pod.

url: ${actor}
access: public
content-type: application/activity+json
body:
${JSON.stringify(getActor({ actor, pod, app, webId, publicKey, username }), null, 2)}

compact:
${JSON.stringify(getActor({ actor, pod, app, webId, publicKey, username }))}

## webId

url: ${webId}
access: public
content-type: text/turtle

You need to add triples:

(e.g. using Solid n3-patch)

<${webId}> <${solid.oidcIssuer}> <${app}>.
(This allows the agent to act on your behalf, so make sure you trust the agent.)

<${webId}> <${soapPrefix}hasActor> <${actor}>.
(This makes sure that actor and webId are safely linked together)
`
}

const getWebfinger = ({
  username,
  pod,
  actor,
}: {
  username: string
  pod: string
  actor: string
}) => {
  return {
    subject: `acct:${username}@${new URL(pod).host}`,
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actor,
      },
    ],
  }
}

const getActor = ({
  webId,
  actor,
  pod,
  app,
  publicKey,
  username,
}: {
  webId: string
  actor: string
  pod: string
  app: string
  publicKey: string
  username: string
}) => {
  const encodedActor = encodeURIComponent(actor)
  const storage = new URL('/soap-opera/', pod)
  return {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      { soap: soapPrefix },
    ],
    id: actor,
    type: 'Person',
    preferredUsername: username,
    inbox: new URL(`/users/${encodedActor}/inbox`, app).toString(),
    outbox: new URL(`/users/${encodedActor}/outbox`, app).toString(),
    followers: new URL(`/users/${encodedActor}/followers`, app).toString(),
    following: new URL(`/users/${encodedActor}/following`, app).toString(),
    'soap:isActorOf': webId,
    'soap:followers': new URL('followers', storage).toString(),
    'soap:following': new URL('following', storage).toString(),
    publicKey: {
      id: actor + '#main-key',
      owner: actor,
      publicKeyPem: publicKey,
    },
  }
}
