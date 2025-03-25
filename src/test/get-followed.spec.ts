import { generateCryptoKeyPair, signRequest } from '@fedify/fedify'
import { HttpResponse, RequestHandler, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cryptoKeyToPem } from '../utils/crypto.js'
import { appConfig } from './setup.js'

const validBody = {
  '@context': 'https://www.w3.org/ns/activitystreams',
  id: 'https://example.local/my-first-follow',
  type: 'Follow',
  actor: 'https://example.local/actor',
  object: 'https://mastodon.social/users/Mastodon',
}

const keys = await generateCryptoKeyPair()

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
]

const server = setupServer(...handlers)

describe('Accept Follow activity from somebody', () => {
  beforeEach(() => server.listen({ onUnhandledRequest: 'bypass' }))
  afterEach(() => server.resetHandlers())
  afterEach(() => server.close())

  it('should receive Follow activity to inbox', async () => {
    const request = new Request(
      new URL(`/users/testuser/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify(validBody),
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
  })

  it.todo('should reject invalid activity')
  it.todo('should save Follow activity to Solid Pod')
  it.todo('should read a list of followers')
})
