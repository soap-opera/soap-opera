import { generateCryptoKeyPair } from '@fedify/fedify'
import { expect, vi } from 'vitest'
import { soapPrefix } from '../../config/constants.js'
import { cryptoKeyToPem } from '../../utils/crypto.js'
import { getAcl } from './index.js'
import { Person } from './types.js'

export const setupActor = async (person: Person, app: string) => {
  const keys = await generateCryptoKeyPair()
  const publicKeyPem = await cryptoKeyToPem(keys.publicKey)
  const privateKeyPem = await cryptoKeyToPem(keys.privateKey)
  const actorUrl = new URL(
    'activitypub/profile/actor',
    person.podUrl,
  ).toString()
  const publicKeyUrl = new URL(
    'activitypub/keys/public.pem',
    person.podUrl,
  ).toString()
  const privateKeyUrl = new URL(
    'activitypub/keys/private.pem',
    person.podUrl,
  ).toString()

  // make sure cached webId oidcIssuers in CSS expire before continuing
  // https://github.com/CommunitySolidServer/access-token-verifier/blob/718f7dde42df358f339e78b836d909f10df099a5/src/config/index.ts#L16
  vi.useFakeTimers({ now: Date.now() - 121000 })

  // save well-known
  await createWebfinger(person, actorUrl)
  // save actor
  await createActor(person, actorUrl, app, publicKeyPem)
  // save public key
  await saveKey(publicKeyPem, publicKeyUrl, person)
  await makePublic(publicKeyUrl, person)
  // save private key
  await saveKey(privateKeyPem, privateKeyUrl, person)
  // save soid identity provider
  await saveAppIdentityProvider(app, person)
  // save link from webId to actor
  await saveActorLink(actorUrl, person)
  vi.useRealTimers()
}

const createWebfinger = async (person: Person, actorUrl: string) => {
  const wellKnown = new URL('/.well-known/webfinger', person.podUrl)
  const response = await person.fetch(wellKnown, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: `acct:${person.username}@${new URL(person.webId).host}`,
      links: [
        {
          rel: 'self',
          type: 'application/json',
          href: actorUrl,
        },
      ],
    }),
  })

  expect(response.ok).toBe(true)

  await makePublic(wellKnown.toString(), person)
}

const createActor = async (
  person: Person,
  actorUrl: string,
  app: string,
  publicKeyPem: string,
) => {
  const actor = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      { soap: soapPrefix },
    ],
    id: actorUrl,
    type: 'Person',
    inbox: new URL(
      `/users/${encodeURIComponent(actorUrl)}/inbox`,
      app,
    ).toString(),
    outbox: new URL(
      `/users/${encodeURIComponent(actorUrl)}/outbox`,
      app,
    ).toString(),
    followers: new URL(
      `/users/${encodeURIComponent(actorUrl)}/followers`,
      app,
    ).toString(),
    following: new URL(
      `/users/${encodeURIComponent(actorUrl)}/following`,
      app,
    ).toString(),
    'soap:isActorOf': person.webId,
    'soap:followers': new URL(
      'activitypub/followers',
      person.podUrl,
    ).toString(),
    'soap:following': new URL(
      'activitypub/following',
      person.podUrl,
    ).toString(),
    publicKey: {
      id: actorUrl + '#main-key',
      owner: actorUrl,
      publicKeyPem,
    },
  }

  person.actor = actor

  const response = await person.fetch(actorUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/activity+json' },
    body: JSON.stringify(actor),
  })
  expect(response.ok).toBe(true)

  await makePublic(actorUrl, person)
}

const makePublic = async (document: string, person: Person) => {
  const acl = await getAcl(document, person.fetch)
  const path = document.split('/').pop()

  // save public acl
  const response = await person.fetch(acl, {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: `
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#public>
    a acl:Authorization;
    acl:agentClass foaf:Agent;
    acl:accessTo <./${path}>;
    acl:mode acl:Read.

# The owner has full access to the profile
<#owner>
    a acl:Authorization;
    acl:agent <${person.webId}>;
    acl:accessTo <./${path}>;
    acl:mode acl:Read, acl:Write, acl:Control.
    `,
  })
  expect(response.ok).toBe(true)
}

const saveKey = async (key: string, url: string, person: Person) => {
  const response = await person.fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: key,
  })

  expect(response.ok).toBe(true)
}

const saveAppIdentityProvider = async (app: string, person: Person) => {
  const response = await person.fetch(new URL(person.webId), {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.

  _:patch a solid:InsertDeletePatch;
    solid:inserts { <${person.webId}> solid:oidcIssuer <${new URL(app).origin}>. } .`,
  })

  expect(response.ok).toBe(true)
}

const saveActorLink = async (actor: string, person: Person) => {
  const response = await person.fetch(new URL(person.webId), {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.

  _:patch a solid:InsertDeletePatch;
    solid:inserts { <${person.webId}> <${soapPrefix}hasActor> <${actor}>. } .`,
  })

  expect(response.ok).toBe(true)
}

export const removeActorLink = async (actor: string, person: Person) => {
  const response = await person.fetch(new URL(person.webId), {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.

  _:patch a solid:InsertDeletePatch;
    solid:deletes { <${person.webId}> <${soapPrefix}hasActor> <${actor}>. } .`,
  })

  expect(response.ok).toBe(true)
}
