import { Accept, Follow, signRequest } from '@fedify/fedify'
import { getAuthenticatedFetch } from '@soid/koa'
import { Middleware } from 'koa'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { schema_https } from 'rdf-namespaces'
import { z } from 'zod'
import { AppConfig } from '../app.js'
import { importPrivateKey } from '../utils/crypto.js'
import { User } from './auth.js'
import {
  Activity,
  FollowActivity,
  followActivitySchema,
} from './validateActivity.js'
import { Actor } from './validateOwner.js'

export const activityEmitter = new EventEmitter()

export const processActivity: Middleware<
  {
    user: User
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
      // respond with Accept activity after the request is sent
      ctx.res.on('finish', async () => {
        try {
          await acceptFollow(activity, {
            webId: ctx.state.owner.webId,
            app: ctx.state.config.baseUrl,
            storage: ctx.state.owner.actor['soap:storage'],
            publicKeyUri: ctx.state.owner.actor.publicKey.id,
          })
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Accept response to Follow failed:')
          // eslint-disable-next-line no-console
          console.error(error)
          throw error
        }

        if (process.env.NODE_ENV === 'vitest')
          activityEmitter.emit('acceptDispatched', null)
      })
      break
    default:
      throw new Error('Unrecognized activity')
  }

  ctx.status = 200
}

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
      id: new URL(activity.id),
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
