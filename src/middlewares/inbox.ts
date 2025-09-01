import { Accept, Follow, signRequest } from '@fedify/fedify'
import { getLogger } from '@logtape/logtape'
import { getAuthenticatedFetch } from '@soid/koa'
import { Middleware } from 'koa'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { schema_https } from 'rdf-namespaces'
import { z } from 'zod'
import { AppConfig } from '../app.js'
import { importPrivateKey } from '../utils/crypto.js'
import {
  acceptFollowActivitySchema,
  Activity,
  FollowActivity,
  followActivitySchema,
} from './validateActivity.js'
import { Actor } from './validateOwner.js'

const logger = getLogger(['soap-opera', 'inbox'])

export const activityEmitter = new EventEmitter()

export const processActivity: Middleware<
  {
    activity: Activity
    config: AppConfig
    owner: {
      webId: string
      actor: Actor
    }
  },
  { params: { actor: string } }
> = async ctx => {
  const activity = ctx.state.activity

  switch (activity.type) {
    case 'Follow':
      await follow(activity, ctx.state.owner, ctx.state.config.baseUrl)
      // respond with Accept activity after the request is finished
      ctx.res.on('finish', async () => {
        try {
          await acceptFollow(activity, {
            webId: ctx.state.owner.webId,
            app: ctx.state.config.baseUrl,
            storage: ctx.state.owner.actor['soap:storage'],
            publicKeyUri: ctx.state.owner.actor.publicKey.id,
          })
        } catch (error) {
          logger.error('Accept response to Follow failed:', { error })
          throw error
        }

        if (process.env.NODE_ENV === 'vitest')
          activityEmitter.emit('acceptDispatched', null)
      })
      break
    case 'Accept':
      await processAccept(activity, {
        webId: ctx.state.owner.webId,
        app: ctx.state.config.baseUrl,
        storage: ctx.state.owner.actor['soap:storage'],
      })
      break

    default:
      throw new Error('Unrecognized activity')
  }

  ctx.status = 200
}

/**
 * Save follower to Solid pod
 */
const follow = async (
  activity: z.infer<typeof followActivitySchema>,
  owner: { webId: string; actor: Actor },
  issuer: string,
) => {
  if (activity.object !== owner.actor.id)
    throw new Error(
      `Activity object and owner do not match.\nObject: ${activity.object}\nOwner: ${owner.actor.id}`,
    )

  const authFetch = await getAuthenticatedFetch(owner.webId, issuer)
  const followersSolid = owner.actor['soap:storage'] + 'followers'

  const response = await authFetch(followersSolid, {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.
    _:patch a solid:InsertDeletePatch;
      solid:inserts { <${activity.actor}> <${schema_https.follows}> <${activity.object}>. } .`,
  })

  assert.equal(response.ok, true)
}

/**
 * Send Accept activity after successfully receiving Follow
 */
const acceptFollow = async (
  activity: FollowActivity,
  options: {
    webId: string
    app: string
    storage: string
    publicKeyUri: string
  },
) => {
  // find inbox
  const actorResponse = await fetch(activity.actor, {
    headers: { accept: 'application/activity+json' },
  })
  assert.ok(actorResponse.ok)
  const actor = (await actorResponse.json()) as Actor
  const inbox = actor.inbox

  const acceptActivity = await new Accept({
    actor: new URL(activity.object),
    object: new Follow({
      id: activity.id ? new URL(activity.id) : undefined,
      actor: new URL(activity.actor),
      object: new URL(activity.object),
    }),
  }).toJsonLd()

  const request = new Request(inbox, {
    method: 'POST',
    headers: { 'content-type': 'application/activity+json' },
    body: JSON.stringify(acceptActivity),
  })

  const authFetch = await getAuthenticatedFetch(options.webId, options.app)

  const privateKeyResponse = await authFetch(
    new URL('keys/private.pem', options.storage),
  )
  assert.ok(privateKeyResponse.ok)
  const privateKey = await privateKeyResponse.text()

  const signedRequest = await signRequest(
    request,
    await importPrivateKey(privateKey),
    new URL(options.publicKeyUri),
  )

  await fetch(signedRequest)
}

const processAccept = async (
  activity: z.infer<typeof acceptFollowActivitySchema>,
  options: { storage: string; webId: string; app: string },
) => {
  logger.info('Processing Accept activity', activity)
  const object = activity.object

  switch (object.type) {
    case 'Follow': {
      const { id } = object
      if (!id.startsWith(options.storage))
        throw new Error('This activity does not belong to this person')
      // fetch the local object for comparison
      const authFetch = await getAuthenticatedFetch(options.webId, options.app)
      const response = await authFetch(id)
      assert.ok(response.ok)
      const storedActivity = await response.json()

      assert.equal(storedActivity.actor, object.actor)
      assert.equal(storedActivity.object, object.object)

      const followingSolid = options.storage + 'following'

      const responseSolid = await authFetch(followingSolid, {
        method: 'PATCH',
        headers: { 'content-type': 'text/n3' },
        body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.
    _:patch a solid:InsertDeletePatch;
      solid:inserts { <${object.actor}> <${schema_https.follows}> <${object.object}>. } .`,
      })

      assert.equal(responseSolid.ok, true)

      break
    }
    default: {
      throw new Error('Unrecognized Accept object type: ' + object.type)
    }
  }
}
