import { signRequest } from '@fedify/fedify'
import { DefaultBodyType, http, HttpResponse, StrictRequest } from 'msw'
import { setupServer } from 'msw/node'
import { Parser } from 'n3'
import assert from 'node:assert/strict'
import { beforeEach } from 'node:test'
import { schema_https } from 'rdf-namespaces'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateFakeActor } from './helpers/fakeActor.js'
import { setupActor } from './helpers/pod.js'
import { Person } from './helpers/types.js'
import { appConfig, person, person2 } from './setup.js'

const factor1 = await generateFakeActor('http://fake.local/actor')
const factor2 = await generateFakeActor('http://fake.example/profile/actor')

const server = setupServer()
let capturedRequest: StrictRequest<DefaultBodyType> | undefined = undefined
let runFullFollowInteraction: (props: {
  actor: Person
  object: Awaited<ReturnType<typeof generateFakeActor>>
}) => Promise<void>

server.use(
  ...[factor1, factor2].flatMap(factor1 => [
    http.post(factor1.profile.inbox.toString(), async ({ request }) => {
      capturedRequest = request
      return HttpResponse.json({}, { status: 201 })
    }),
    http.get(factor1.profile.id, async () => {
      return HttpResponse.json(factor1.profile)
    }),
  ]),
)

describe('Following', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
  beforeEach(() => {
    capturedRequest = undefined
  })
  // afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('Send a Follow activity to somebody', () => {
    it('should receive Follow activity from client to outbox', async () => {
      // set up actor
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // client sends activity to server
      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: {
          'content-type':
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Follow',
          actor: person.actor.id,
          object: factor1.profile.id,
          to: [factor1.profile.id],
        }),
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(201)
    })

    it('should reject activity that is not authenticated', async () => {
      // set up actor
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // client sends activity to server, but is not authenticated with Solid-OIDC
      const response = await fetch(person.actor.outbox, {
        method: 'POST',
        headers: {
          'content-type':
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Follow',
          actor: person.actor.id,
          object: factor1.profile.id,
          to: [factor1.profile.id],
        }),
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
    })

    it('should reject the activity that is not authenticated by the actor themself', async () => {
      // set up actor
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // client sends activity to server, but the outbox doesn't belong to the person
      const response = await person2.fetch(person.actor.outbox, {
        method: 'POST',
        headers: {
          'content-type':
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Follow',
          actor: person.actor.id,
          object: factor1.profile.id,
          to: [factor1.profile.id],
        }),
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(403)
    })

    it('should send a Follow activity to the inbox of the other person', async () => {
      // set up actor
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // send activity from client to server outbox
      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: {
          'content-type':
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          // id: new URL('follow', person.actor.id).toString(),
          type: 'Follow',
          actor: person.actor.id,
          object: factor1.profile.id,
          to: [factor1.profile.id],
        }),
      })

      expect(response.status).toBe(201)

      // server should send a request to the inbox of the "to"
      expect(capturedRequest).not.toBeUndefined()
      expect(capturedRequest?.url).toBe(factor1.profile.inbox.toString())
    })

    it.todo(
      'sending Follow to somebody else - "to" does not match the object ???',
    )

    it('should remember the pending follow activity until Accept is received', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: {
          'content-type':
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Follow',
          actor: person.actor.id,
          object: factor1.profile.id,
          to: [factor1.profile.id],
        }),
      })

      expect(response.status).toBe(201)

      // server should send the request to the "to"
      assert.ok(capturedRequest)
      expect(capturedRequest.url).toBe(factor1.profile.inbox.toString())

      const capturedBody = await capturedRequest.json()

      assert.ok(capturedBody)
      assert.ok(typeof capturedBody === 'object')
      expect(capturedBody).toHaveProperty('id')
      const id = capturedBody.id
      assert.ok(typeof id === 'string')

      const resp = await person.fetch(id)
      expect(resp.ok).toBe(true)
      // const body = await resp.json()
    })

    /**
     * This full interaction is used to execute the following test (full success test) and to repeat the run when needed in other preparations
     */
    runFullFollowInteraction = async ({
      actor: person,
      object: factor1,
    }: {
      actor: Person
      object: Awaited<ReturnType<typeof generateFakeActor>>
    }) => {
      assert.ok(person.actor)
      // this is the client sending follow request to the actor's outbox
      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: {
          'content-type':
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          // id: new URL('follow', person.actor.id).toString(),
          type: 'Follow',
          actor: person.actor.id,
          object: factor1.profile.id,
          to: [factor1.profile.id],
        }),
      })

      // server should process it.
      expect(response.status).toBe(201)

      // server should send the request to the "to"
      assert.ok(capturedRequest)
      expect(capturedRequest.url).toBe(factor1.profile.inbox.toString())

      const capturedBody = await capturedRequest.json()

      assert.ok(capturedBody)
      assert.ok(typeof capturedBody === 'object')
      expect(capturedBody).toHaveProperty('id')
      const id = capturedBody.id
      assert.ok(typeof id === 'string')

      // send fake Accept response from the object being followed
      const acceptRequest = new Request(person.actor.inbox, {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Accept',
          actor: factor1.profile.id,
          object: {
            id,
            type: 'Follow',
            actor: person.actor.id,
            object: factor1.profile.id,
          },
        }),
      })

      const signedAcceptRequest = await signRequest(
        acceptRequest,
        factor1.keys.privateKey,
        new URL(factor1.profile.publicKey.id),
      )
      const acceptResponse = await fetch(signedAcceptRequest)

      expect(acceptResponse.ok).toBe(true)
    }

    it('should add the activity to following collection after Accept activity is received', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      await runFullFollowInteraction({ actor: person, object: factor1 })

      // check that the data are saved in Solid pod
      const podFollowing = person.actor['soap:storage'] + 'following'

      const podFollowingResponse = await person.fetch(podFollowing)
      expect(podFollowingResponse.status).toBe(200)
      expect(podFollowingResponse.ok).toBe(true)

      const body = await podFollowingResponse.text()
      const parser = new Parser({
        format: podFollowingResponse.headers.get('content-type') ?? undefined,
        baseIRI: podFollowingResponse.url,
      })
      const quads = parser.parse(body)
      expect(quads).toHaveLength(1)
      assert.ok(quads[0]) // type narrowing
      expect(quads[0].subject.id).toEqual(person.actor.id)
      expect(quads[0].predicate.id).toEqual(schema_https.follows)
      expect(quads[0].object.id).toEqual(factor1.profile.id)
    })

    it('should also receive and correctly process Reject')
  })

  describe('Read a list of following', () => {
    it('[empty list] should read a list of following', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      const response = await fetch(person.actor.following, {
        headers: {
          Accept:
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toEqual(
        'application/activity+json',
      )
      const collection = await response.json()

      expect(collection.totalItems).toEqual(0)
    })

    it('[filled list] should read a list of following', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // follow 2 (fake) actors
      const fakeActors = [factor1, factor2]

      for (const factor of fakeActors)
        await runFullFollowInteraction({ actor: person, object: factor })

      const response = await fetch(person.actor.following, {
        headers: {
          Accept:
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
      })
      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toEqual(
        'application/activity+json',
      )
      const collection = await response.json()
      expect(collection.totalItems).toEqual(fakeActors.length)
      expect(collection.id).toEqual(person.actor.following)
      expect(collection.first).toEqual(collection.id + '?cursor=1')

      const firstResponse = await fetch(collection.first, {
        headers: {
          Accept:
            'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        },
      })
      expect(firstResponse.ok).toBe(true)
      expect(firstResponse.headers.get('content-type')).toEqual(
        'application/activity+json',
      )
      const collectionPage1 = await firstResponse.json()
      expect(collectionPage1.id).toEqual(collection.first)
      expect(collectionPage1.partOf).toEqual(collection.id)
      fakeActors.forEach(actor => {
        expect(collectionPage1.orderedItems).toContain(actor.profile.id)
      })
    })
  })
})
