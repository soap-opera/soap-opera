import { generateCryptoKeyPair, signRequest } from '@fedify/fedify'
import { HttpResponse, RequestHandler, http } from 'msw'
import { setupServer } from 'msw/node'
import { Parser } from 'n3'
import assert from 'node:assert/strict'
import { schema_https } from 'rdf-namespaces'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { soapPrefix } from '../config/constants.js'
import { cryptoKeyToPem } from '../utils/crypto.js'
import { removeActorLink, setupActor } from './helpers/pod.js'
import { appConfig, person } from './setup.js'

const validBody = {
  '@context': 'https://www.w3.org/ns/activitystreams',
  id: 'https://example.local/my-first-follow',
  type: 'Follow',
  actor: 'https://example.local/actor',
  object: 'https://mastodon.social/users/Mastodon',
}

const keys = await generateCryptoKeyPair()

const ownerWebId = 'https://solidpod.local/profile/card#me'
const podFollowers = new URL('/activitypub/followers', ownerWebId).toString()
const ownerActor = 'https://example.localhost/profile/actor'

const handlers: RequestHandler[] = [
  http.get('https://example.local/actor', async () => {
    return HttpResponse.json({
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
      ],
      id: 'https://example.local/actor',
      type: 'Person',
      inbox: 'https://example.local/inbox',
      outbox: 'https://example.local/outbox',
      followers: 'https://example.local/followers',
      following: 'https://example.local/following',
      publicKey: {
        id: 'https://example.local/actor#main-key',
        owner: 'https://example.local/actor',
        publicKeyPem: await cryptoKeyToPem(keys.publicKey),
      },
    })
  }),
  http.get(ownerActor, () => {
    const baseUrl = new URL(
      `users/${encodeURIComponent(ownerActor)}/`,
      appConfig.baseUrl,
    )
    return HttpResponse.json({
      id: ownerActor,
      'soap:isActorOf': ownerWebId,
      'soap:followers': podFollowers,
      inbox: new URL('inbox', baseUrl),
      followers: new URL('followers', baseUrl),
      following: new URL('following', baseUrl),
    })
  }),
  http.get(new URL('/profile/card', ownerWebId).toString(), () => {
    return HttpResponse.text(`<#me> <${soapPrefix}hasActor> <${ownerActor}>.`, {
      headers: { 'content-type': 'text/turtle' },
    })
  }),
  http.patch(podFollowers, () => {
    return HttpResponse.json({})
  }),
]

const server = setupServer(...handlers)

describe('Accept Follow activity from somebody', () => {
  beforeEach(() => server.listen({ onUnhandledRequest: 'bypass' }))
  afterEach(() => server.resetHandlers())
  afterEach(() => server.close())

  it('should receive Follow activity to inbox', async () => {
    const request = new Request(
      new URL(
        `/users/${encodeURIComponent('https://example.localhost/profile/actor')}/inbox`,
        appConfig.baseUrl,
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          ...validBody,
          object: 'https://example.localhost/profile/actor',
        }),
      },
    )

    const signedRequest = await signRequest(
      request,
      keys.privateKey,
      new URL('https://example.local/actor#main-key'),
    )

    const response = await fetch(signedRequest)

    expect(response.status).toBe(200)
  })

  it('should reject activity that is not properly signed', async () => {
    const response = await fetch(
      new URL(`/users/testuser/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/activity+json',
          signature:
            'keyId="https://my-example.com/actor#main-key",headers="(request-target) host date",signature="Y2FiYW...IxNGRiZDk4ZA=="',
        },
        body: JSON.stringify(validBody),
      },
    )
    expect(response.status).toBe(401)
    expect(await response.text()).toEqual('HTTP Signature is not valid.')
  })

  it('[non-matching actor] should reject spoofed activity', async () => {
    const request = new Request(
      new URL(`/users/testuser/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          ...validBody,
          actor: 'https://other.local/actor',
        }),
      },
    )

    const signedRequest = await signRequest(
      request,
      keys.privateKey,
      new URL('https://example.local/actor#main-key'),
    )

    const response = await fetch(signedRequest)

    expect(response.status).toBe(401)
    expect(await response.text()).toContain(
      `Actor must match Signer.\nActor: https://other.local/actor\nSigner: https://example.local/actor`,
    )
  })

  it('[invalid activity] should reject invalid activity', async () => {
    const request = new Request(
      new URL(`/users/testuser/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          ...validBody,
          type: 'Whatever',
        }),
      },
    )

    const signedRequest = await signRequest(
      request,
      keys.privateKey,
      new URL('https://example.local/actor#main-key'),
    )

    const response = await fetch(signedRequest)

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('Invalid activity:')
  })

  it.todo("when object does not match the target actor's inbox, fail")
  it('make sure that webId and actor link to each other', async () => {
    await setupActor(person, appConfig.baseUrl)
    assert.ok(person.actor)
    await removeActorLink(person.actor.id, person)

    const actor = person.actor.id

    // send the activity to a solid pod
    const request = new Request(
      new URL(`/users/${encodeURIComponent(actor)}/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({ ...validBody, object: actor }),
      },
    )

    const signedRequest = await signRequest(
      request,
      keys.privateKey,
      new URL('https://example.local/actor#main-key'),
    )

    const response = await fetch(signedRequest)

    expect(response.status).toBe(400)
    expect(await response.text()).toContain("WebId doesn't link to the actor.")
  })

  it('should save Follow activity to Solid Pod', async () => {
    await setupActor(person, appConfig.baseUrl)
    assert.ok(person.actor)

    const actor = person.actor.id

    const podFollowers = person.actor['soap:followers']

    // send the activity to a solid pod
    const request = new Request(
      new URL(`/users/${encodeURIComponent(actor)}/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({ ...validBody, object: actor }),
      },
    )

    const signedRequest = await signRequest(
      request,
      keys.privateKey,
      new URL('https://example.local/actor#main-key'),
    )

    const response = await fetch(signedRequest)

    expect(response.status).toBe(200)

    const podFollowersResponse = await person.fetch(podFollowers)

    expect(podFollowersResponse.ok).toBe(true)

    const body = await podFollowersResponse.text()
    const parser = new Parser({
      format: podFollowersResponse.headers.get('content-type') ?? undefined,
    })
    const quads = parser.parse(body)
    expect(quads).toHaveLength(1)
    assert.ok(quads[0]) // type narrowing
    expect(quads[0].subject.id).toEqual(validBody.actor)
    expect(quads[0].predicate.id).toEqual(schema_https.follows)
    expect(quads[0].object.id).toEqual(actor)
  })
})

describe('Read a list of followers', () => {
  it.todo('should read a list of followers', async () => {
    await setupActor(person, appConfig.baseUrl)
    assert.ok(person.actor)

    const response = await fetch(person.actor.followers)

    // console.log(response.status, await response.text())
    expect(response.ok).toBe(true)
  })
})
