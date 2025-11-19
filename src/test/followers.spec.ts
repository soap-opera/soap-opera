import {
  generateCryptoKeyPair,
  getDocumentLoader,
  signRequest,
  verifyRequest,
} from '@fedify/fedify'
import { DefaultBodyType, HttpResponse, StrictRequest, http } from 'msw'
import { setupServer } from 'msw/node'
import { Parser } from 'n3'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { schema_https } from 'rdf-namespaces'
import encodeURIComponent from 'strict-uri-encode'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { soapPrefix } from '../config/constants.js'
import { cryptoKeyToPem } from '../utils/crypto.js'
import { generateFakeActor } from './helpers/fakeActor.js'
import { removeActorLink, setupActor } from './helpers/pod.js'
import { appConfig, person } from './setup.js'

const ownerWebId = 'https://solidpod.local/profile/card#me'
const podStorage = new URL('/activitypub/', ownerWebId).toString()
const ownerActor = 'https://example.localhost/profile/actor'

const fakeActors = [
  await generateFakeActor('https://example.local/actor'),
  await generateFakeActor('https://fake.local/users/test/actor'),
] as const

type FakeActor = (typeof fakeActors)[number]

const getActivity = ({
  actor,
  object,
  type = 'Follow',
}: {
  actor: string
  object: string
  type?: string
}) => ({
  '@context': 'https://www.w3.org/ns/activitystreams',
  // id: new URL('activity/' + , actor).toString(),
  id: new URL('activity/' + randomUUID(), actor).toString(),
  type,
  actor,
  object,
})

const keys = await generateCryptoKeyPair()

const server = setupServer()
let capturedRequest: StrictRequest<DefaultBodyType> | undefined = undefined
server.use(
  ...[
    ...fakeActors.flatMap(actor => [
      http.get(actor.profile.id, async () => {
        return HttpResponse.json(actor.profile)
      }),
      http.post(actor.profile.inbox.toString(), async ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({}, { status: 201 })
      }),
    ]),
    http.get(ownerActor, async () => {
      const baseUrl = new URL(
        `users/${encodeURIComponent(ownerActor)}/`,
        appConfig.baseUrl,
      )
      return HttpResponse.json({
        id: ownerActor,
        preferredUsername: 'example',
        'soap:isActorOf': ownerWebId,
        'soap:storage': podStorage,
        inbox: new URL('inbox', baseUrl),
        followers: new URL('followers', baseUrl),
        following: new URL('following', baseUrl),
        publicKey: {
          id: ownerActor + '#key',
          publicKeyPem: await cryptoKeyToPem(keys.publicKey),
        },
      })
    }),
    http.get(new URL('/profile/card', ownerWebId).toString(), () => {
      return HttpResponse.text(
        `<#me> <${soapPrefix}hasActor> <${ownerActor}>.`,
        {
          headers: { 'content-type': 'text/turtle' },
        },
      )
    }),
    http.patch(podStorage + 'followers', () => {
      return HttpResponse.json({})
    }),
    http.get(podStorage + 'keys/private.pem', async () => {
      return HttpResponse.text(await cryptoKeyToPem(keys.privateKey))
    }),
  ],
)

describe('Followers', () => {
  // fake endpoints
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
  beforeEach(() => {
    capturedRequest = undefined
  })
  afterAll(() => server.close())

  describe('Accept Follow activity from somebody', () => {
    it('should receive Follow activity to inbox', async () => {
      // send a request from a fake actor
      const response = await sendSignedFollowRequest(fakeActors[0], ownerActor)
      expect(response.status).toBe(202)
    })

    it('should reject activity that is not properly signed', async () => {
      const response = await fetch(
        new URL(
          `/users/${encodeURIComponent(ownerActor)}/inbox`,
          appConfig.baseUrl,
        ),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/activity+json',
            signature:
              'keyId="https://my-example.com/actor#main-key",headers="(request-target) host date",signature="Y2FiYW...IxNGRiZDk4ZA=="',
          },
          body: JSON.stringify(
            getActivity({
              actor: fakeActors[0].profile.id,
              object: ownerActor,
            }),
          ),
        },
      )
      expect(response.status).toBe(401)
      expect(await response.text()).toEqual(
        'Failed to verify the request signature.',
      )
    })

    it('[non-matching actor] should reject spoofed activity', async () => {
      const signedRequest = await createSignedFollowRequest(
        fakeActors[0],
        ownerActor,
        { activity: { actor: 'https://other.local/actor' } },
      )

      const response = await fetch(signedRequest)

      expect(response.status).toBe(401)
      expect(await response.text()).toContain(
        `The signer and the actor do not match.`,
      )
    })

    // fedify accepts it.
    it.skip('[invalid activity] should reject invalid activity', async () => {
      const signedRequest = await createSignedFollowRequest(
        fakeActors[0],
        ownerActor,
        { activity: { type: 'Whatever' } },
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
      const signedRequest = await createSignedFollowRequest(
        fakeActors[0],
        actor,
      )
      const response = await fetch(signedRequest)
      expect(response.status).toBe(400)
      expect(await response.text()).toContain(
        "WebId doesn't link to the actor.",
      )
    })

    it('should save Follow activity to Solid Pod', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      const actor = person.actor.id

      const podFollowers = person.actor['soap:storage'] + 'followers'

      // send the activity to a solid pod
      const response = await sendSignedFollowRequest(fakeActors[0], actor)
      expect(response.status).toBe(202)

      // check that the data are saved in Solid pod
      const podFollowersResponse = await person.fetch(podFollowers)
      expect(podFollowersResponse.ok).toBe(true)

      const body = await podFollowersResponse.text()
      const parser = new Parser({
        format: podFollowersResponse.headers.get('content-type') ?? undefined,
        baseIRI: podFollowersResponse.url,
      })
      const quads = parser.parse(body)
      expect(quads).toHaveLength(1)
      assert.ok(quads[0]) // type narrowing
      expect(quads[0].subject.id).toEqual(fakeActors[0].profile.id)
      expect(quads[0].predicate.id).toEqual(schema_https.follows)
      expect(quads[0].object.id).toEqual(actor)
    })

    it('should respond with `Accept` activity', async () => {
      const originalFetch = globalThis.fetch
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input, init) => {
          const newInput = input instanceof Request ? input.clone() : input
          return originalFetch(newInput, init)
        })
      // send Follow activity
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)
      const actor = person.actor.id
      // const podFollowers = person.actor['soap:storage'] + 'followers'
      const response = await sendSignedFollowRequest(fakeActors[0], actor)
      expect(response.status).toBe(202)

      // const podFollowersResponse = await person.fetch(podFollowers)
      // expect(podFollowersResponse.ok).toBe(true)

      // // expect properly signed Accept being sent in return to the fake actor
      // const relevantCall = fetchSpy.mock.calls.find(params => {
      //   let url = ''
      //   if (params[0] instanceof Request) url = params[0].url
      //   else if (params[0] instanceof URL) url = params[0].toString()
      //   else if (typeof url === 'string') url = params[0]
      //   return url === fakeActors[0].profile.inbox.toString()
      // })

      // expect(relevantCall).toBeDefined()
      // assert.ok(relevantCall)
      // const request = new Request(...relevantCall)

      expect(capturedRequest).toBeTruthy()
      assert.ok(capturedRequest)

      const keyFetch = await fetch(person.actor.id)
      expect(keyFetch.ok).toBe(true)

      const verified = await verifyRequest(capturedRequest, {
        documentLoader: getDocumentLoader({ allowPrivateAddress: true }),
      })
      expect(verified).toBeTruthy()

      const acceptActivity = (await capturedRequest.json()) as {
        type: string
        actor: string
        object: { actor: string; object: string; type: string }
      }

      expect(acceptActivity.type).toEqual('Accept')
      expect(acceptActivity.actor).toEqual(person.actor.id)
      expect(acceptActivity.object).toMatchObject({
        actor: { id: fakeActors[0].profile.id },
        object: person.actor.id,
        type: 'Follow',
      })

      fetchSpy.mockRestore()
    })
  })

  describe('Read a list of followers', () => {
    it('[empty list] should read a list of followers', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      const response = await fetch(person.actor.followers, {
        headers: { accept: 'application/activity+json' },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toEqual(
        'application/activity+json',
      )
      const collection = await response.json()
      expect(collection.totalItems).toEqual(0)
      expect(collection.first).toBeTruthy()
    })

    it('[filled list] should read a list of followers', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      for (const fakeActor of fakeActors)
        await sendSignedFollowRequest(fakeActor, person.actor.id)

      const response = await fetch(person.actor.followers, {
        headers: { accept: 'application/activity+json' },
      })
      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toEqual(
        'application/activity+json',
      )
      const collection = await response.json()
      expect(collection.totalItems).toEqual(fakeActors.length)
      expect(collection.id).toEqual(person.actor.followers)
      expect(collection.first).toEqual(collection.id + '?cursor=1')

      const firstResponse = await fetch(collection.first, {
        headers: { accept: 'application/activity+json' },
      })
      expect(firstResponse.ok).toBe(true)
      expect(firstResponse.headers.get('content-type')).toEqual(
        'application/activity+json',
      )
      const collectionPage1 = await firstResponse.json()
      // expect(collectionPage1.totalItems).toEqual(2)
      expect(collectionPage1.id).toEqual(collection.first)
      expect(collectionPage1.partOf).toEqual(collection.id)
      fakeActors.forEach(actor => {
        expect(collectionPage1.orderedItems).toContain(actor.profile.id)
      })
    })
  })
})

const createSignedFollowRequest = async (
  actor: FakeActor,
  object: string,
  overwrite?: {
    activity?: { actor?: string; object?: string; type?: string }
  },
) => {
  // send the activity to a solid pod
  const request = new Request(
    new URL(`/users/${encodeURIComponent(object)}/inbox`, appConfig.baseUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/activity+json' },
      body: JSON.stringify(
        getActivity({
          actor: overwrite?.activity?.actor ?? actor.profile.id,
          object: overwrite?.activity?.object ?? object,
          type: overwrite?.activity?.type,
        }),
      ),
    },
  )

  const signedRequest = await signRequest(
    request,
    actor.keys.privateKey,
    new URL(actor.profile.publicKey.id),
  )

  return signedRequest
}

export const sendSignedFollowRequest = async (
  ...options: Parameters<typeof createSignedFollowRequest>
) => {
  const signedRequest = await createSignedFollowRequest(...options)
  return await fetch(signedRequest)
}
