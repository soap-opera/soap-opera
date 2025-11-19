import { getDocumentLoader, verifyRequest } from '@fedify/fedify'
import { DefaultBodyType, HttpResponse, StrictRequest, http } from 'msw'
import { setupServer } from 'msw/node'
import assert from 'node:assert/strict'
import encodeURIComponent from 'strict-uri-encode'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sendSignedFollowRequest } from './followers.spec.js'
import { generateFakeActor } from './helpers/fakeActor.js'
import { setupActor } from './helpers/pod.js'
import { appConfig, person, person2 } from './setup.js'

const fakeActors = await Promise.all(
  ['https://example.local/actor', 'https://fake.local/users/alice'].map(actor =>
    generateFakeActor(actor),
  ),
)

const server = setupServer()
let capturedRequests: {
  actor: string
  request: StrictRequest<DefaultBodyType>
}[] = []

server.use(
  ...[
    ...fakeActors.flatMap(actor => [
      http.get(actor.profile.id, async () => {
        return HttpResponse.json(actor.profile)
      }),
      http.post(actor.profile.inbox.toString(), async ({ request }) => {
        capturedRequests.push({ actor: actor.profile.id, request })
        return HttpResponse.json({}, { status: 201 })
      }),
    ]),
  ],
)

describe('ActivityPub Basic Post Creation', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
  beforeEach(() => {
    capturedRequests = []
  })
  afterAll(() => server.close())

  describe('Authentication', () => {
    it('should receive Solid-authenticated Create Note activity from client to outbox', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // send authenticated Create Note activity to the outbox
      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Note',
          published: new Date().toISOString().split('.')[0] + 'Z',
          attributedTo: person.actor.id,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [person.actor.followers],
          content: 'This is a test note!',
        }),
      })

      expect(response.ok).toBe(true)
      expect(response.status).toBe(201)
    })

    it('should reject unauthenticated POST requests', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // send authenticated Create Note activity to the outbox
      const response = await fetch(person.actor.outbox, {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Note',
          published: new Date().toISOString().split('.')[0] + 'Z',
          attributedTo: person.actor.id,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [person.actor.followers],
          content: 'This is a test note!',
        }),
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
    })

    it('should verify user Solid identity matches outbox owner', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)
      await setupActor(person2, appConfig.baseUrl)
      assert.ok(person2.actor)

      // send authenticated Create Note activity to the outbox
      const response = await person2.fetch(person.actor.outbox, {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Note',
          published: new Date().toISOString().split('.')[0] + 'Z',
          attributedTo: person.actor.id,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [person.actor.followers],
          content: 'This is a test note!',
        }),
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(403)
    })
  })

  describe('Basic Post Creation', () => {
    it("should create a simple Note with text content in person's pod", async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // send authenticated Create Note activity to the outbox
      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Note',
          published: new Date().toISOString().split('.')[0] + 'Z',
          attributedTo: person.actor.id,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [person.actor.followers],
          content: 'This is a test note!',
        }),
      })

      expect(response.ok).toBe(true)

      // location header must contain the link to the activity
      // Servers MUST return a 201 Created HTTP code, and unless the activity is transient, MUST include the new id in the Location header.
      // and it will map in some predictable way to the solid pod storage
      const location = response.headers.get('location')
      assert(location)
      const noteRegexp = new RegExp(
        `^${appConfig.baseUrl}/users/${encodeURIComponent(person.actor.id)}/things/(.*)$`,
      )
      expect(location).toMatch(noteRegexp)
      const noteResult = noteRegexp.exec(location)
      assert(noteResult)
      const noteId = noteResult[1]
      assert(noteId)

      // now see that the note is saved on the pod
      const storedNoteResult = await person.fetch(
        new URL(`things/${noteId}`, person.actor['soap:storage']),
        { method: 'GET', headers: { accept: 'text/turtle' } },
      )

      expect(storedNoteResult.ok).toBe(true)
      const resultTurtle = await storedNoteResult.text()
      expect(resultTurtle.trim()).toBeTruthy()
      // TODO check the result
    })

    it.todo('should wrap Note in a Create activity')
    it.todo('should assign unique IDs to both Note and Create activity')
    it.todo('should set published timestamp')
    it.todo('should set actor as attributedTo for the Note')
    it.todo('should add Create activity to actors outbox')
  })

  describe('Content Validation', () => {
    it.todo('should require content property for Note objects')
    it.todo('should reject posts with missing type property')
    it.todo('should reject posts with invalid ActivityStreams type')
    it.todo('should handle basic HTML sanitization in content')
    it.todo('should reject completely empty posts')
  })

  describe('Basic Audience Handling', () => {
    it.todo('should create public posts when to includes Public')
    it.todo('should create private posts when to excludes Public')
    it.todo('should include followers in cc for public posts')
    it.todo('should respect explicit to/cc fields from client')
  })

  describe('Storage', () => {
    it.todo('should store Note object at its assigned URI')
    it.todo('should store Create activity at its assigned URI')
    it.todo('should make stored objects retrievable via GET')
    it.todo('should return proper ActivityStreams JSON content-type')
  })

  describe('Basic Federation', () => {
    it('should deliver Create activity to followers inboxes', async () => {
      await setupActor(person, appConfig.baseUrl)
      assert.ok(person.actor)

      // add followers to person
      for (const actor of fakeActors) {
        const response = await sendSignedFollowRequest(actor, person.actor.id)
        expect(response.ok).toBe(true)
        // checking that they received Accept
        expect(capturedRequests[0]).toBeTruthy()
        assert(capturedRequests[0])
        expect(capturedRequests[0].actor).toEqual(actor.profile.id)
        const json = await capturedRequests[0].request.json()
        expect(json).toHaveProperty('type', 'Accept')
        capturedRequests = []
      }

      // send authenticated Create Note activity to the outbox
      const response = await person.fetch(person.actor.outbox, {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Note',
          published: new Date().toISOString().split('.')[0] + 'Z',
          attributedTo: person.actor.id,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [person.actor.followers],
          content: 'This is a test note!',
        }),
      })

      expect(response.ok).toBe(true)

      // check that the followers received the Create Note activity
      expect(capturedRequests).toHaveLength(2)

      const requestTo0 = capturedRequests.find(
        ({ actor }) => actor === fakeActors[0]?.profile.id,
      )
      const requestTo1 = capturedRequests.find(
        ({ actor }) => actor === fakeActors[1]?.profile.id,
      )

      assert(requestTo0)
      assert(requestTo1)

      const verificationResult0 = await verifyRequest(requestTo0.request, {
        documentLoader: getDocumentLoader({ allowPrivateAddress: true }),
      })
      const verificationResult1 = await verifyRequest(requestTo1.request, {
        documentLoader: getDocumentLoader({ allowPrivateAddress: true }),
      })

      assert(verificationResult0)
      assert(verificationResult1)

      const activity0 = await requestTo0.request.json()
      const activity1 = await requestTo1.request.json()

      // TODO wip
      // eslint-disable-next-line no-console
      console.log(activity0, activity1)
    })

    it.todo('should sign delivery requests with HTTP signatures')
    it.todo('should handle delivery to a single remote inbox')
    it.todo('should not fail post creation if delivery fails')
  })

  describe('Access Control', () => {
    it.todo('should make public posts readable by anyone')
    it.todo('should restrict access to private posts')
    it.todo('should allow actor to read their own posts')
    it.todo('should return 404 for unauthorized access to private posts')
  })

  describe('Outbox Collection', () => {
    it.todo('should add new Create activity to outbox collection')
    it.todo('should increment outbox totalItems count')
    it.todo('should maintain chronological order in outbox')
    it.todo('should return outbox as OrderedCollection')
  })

  describe('Basic Error Handling', () => {
    it.todo('should return 400 for malformed JSON')
    it.todo('should return 401 for missing authentication')
    it.todo('should return 403 for wrong user posting to outbox')
    it.todo('should return 422 for invalid ActivityStreams objects')
  })

  describe('Content Negotiation', () => {
    it.todo('should return ActivityStreams JSON for application/activity+json')
    it.todo('should return ActivityStreams JSON for application/ld+json')
    it.todo('should handle requests without specific Accept header')
  })
})
