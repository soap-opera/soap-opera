import { Create, Follow, Note, signRequest } from '@fedify/fedify'
import { getAuthenticatedFetch } from '@soid/koa'
import type { Middleware } from 'koa'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import encodeURIComponent from 'strict-uri-encode'
import { AppConfig } from '../app.js'
import { importPrivateKey } from '../utils/crypto.js'
import {
  FollowActivity,
  outboxActivitiesSchema,
} from '../validation/activity.js'
import { Actor } from '../validation/owner.js'
import { federation, fixContext } from './federation.js'
import { fromKoaRequest } from './fedify-koa-integration.js'

export const processActivity: Middleware<{
  config: AppConfig
  owner: { webId: string; actor: Actor }
}> = async ctx => {
  const request = fromKoaRequest(ctx)
  const contextData = { config: ctx.state.config, owner: ctx.state.owner.actor }
  const contextDataPromise =
    contextData instanceof Promise ? contextData : Promise.resolve(contextData)

  const resolvedContextData = await contextDataPromise
  const activityReceived = ctx.request.body
  const validActivity = outboxActivitiesSchema.parse(activityReceived)
  const fedifyContext = federation.createContext(request, resolvedContextData)
  fixContext(fedifyContext)

  switch (validActivity.type) {
    case 'Follow': {
      // remember temporary follow activity until we get Accept
      const activity = await saveTemporaryFollow(validActivity, {
        storage: ctx.state.owner.actor['soap:storage'],
        webId: ctx.state.owner.webId,
        app: ctx.state.config.baseUrl,
      })

      await sendFollow(
        { ...activityReceived, id: activity.id },
        {
          webId: ctx.state.owner.webId,
          app: ctx.state.config.baseUrl,
          storage: ctx.state.owner.actor['soap:storage'],
          publicKeyUri: ctx.state.owner.actor.publicKey.id,
        },
      )
      break
    }
    case 'Note': {
      const noteId = Date.now() + '__' + randomUUID()
      const authFetch = await getAuthenticatedFetch(
        ctx.state.owner.webId,
        ctx.state.config.baseUrl,
      )

      const data = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        // '@id': '',
        ...validActivity,
      }

      const saveResult = await authFetch(
        new URL(`things/${noteId}`, ctx.state.owner.actor['soap:storage']),

        {
          method: 'PUT',
          body: JSON.stringify(data),
          headers: { 'content-type': 'application/ld+json' },
        },
      )
      assert(saveResult.ok)
      ctx.set(
        'location',
        new URL(
          `users/${encodeURIComponent(ctx.state.owner.actor.id)}/things/${noteId}`,
          ctx.state.config.baseUrl,
        ).toString(),
      )

      const followersUri = fedifyContext.getFollowersUri(
        ctx.state.owner.actor.id,
      )

      const allTo = [
        ...(data.to ?? []),
        ...(data.bto ?? []),
        ...(data.cc ?? []),
        ...(data.bcc ?? []),
      ]

      const isForFollowers = allTo.includes(followersUri.toString())
      const sender = { identifier: ctx.state.owner.actor.id }
      const activity = new Create({
        actor: new URL(ctx.state.owner.actor.id),
        object: await Note.fromJsonLd(data),
        tos: data.to?.map(uri => new URL(uri)),
        ccs: data.cc?.map(uri => new URL(uri)),
      })
      // send the activity out
      if (isForFollowers)
        await fedifyContext.sendActivity(sender, 'followers', activity)
      else await fedifyContext.sendActivity(sender, [], activity)

      ctx.set(
        'location',
        new URL(
          `users/${encodeURIComponent(ctx.state.owner.actor.id)}/things/${noteId}`,
          ctx.state.config.baseUrl,
        ).toString(),
      )

      break
    }
    default: {
      break
    }
  }

  ctx.status = 201
}

/**
 * Save the Follow activity that has not yet been accepted or rejected by the target
 */
const saveTemporaryFollow = async (
  activity: FollowActivity,
  options: { storage: string; webId: string; app: string },
) => {
  const uri = new URL(`activities/${randomUUID()}`, options.storage)
  const authFetch = await getAuthenticatedFetch(options.webId, options.app)

  const activityFormatted = new Follow({
    id: uri,
    actor: new URL(activity.actor),
    object: new URL(activity.object),
  })

  const response = await authFetch(uri, {
    method: 'PUT',
    body: JSON.stringify(await activityFormatted.toJsonLd()),
    headers: { 'content-type': 'application/activity+json' },
  })
  assert.ok(response.ok)
  return activityFormatted
}

/**
 * Send Follow activity
 */
const sendFollow = async (
  {
    id,
    actor,
    object,
    to,
  }: {
    id: string
    actor: string
    object: string
    to: string[]
  },
  options: {
    webId: string
    app: string
    storage: string
    publicKeyUri: string
  },
) => {
  // find inbox
  if (!to[0]) throw new Error()

  const toResponse = await fetch(to[0], {
    headers: { accept: 'application/activity+json' },
  })
  assert.ok(toResponse.ok)
  const toActor = await toResponse.json()
  const inbox = toActor.inbox

  const acceptActivity = await new Follow({
    id: new URL(id),
    actor: new URL(actor),
    object: new URL(object),
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
