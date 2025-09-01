import { Follow, signRequest } from '@fedify/fedify'
import { getAuthenticatedFetch } from '@soid/koa'
import type { Middleware } from 'koa'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AppConfig } from '../app.js'
import { importPrivateKey } from '../utils/crypto.js'
import { followActivitySchema } from './validateActivity.js'
import { Actor } from './validateOwner.js'

export const processActivity: Middleware<{
  config: AppConfig
  owner: { webId: string; actor: Actor }
}> = async ctx => {
  const activityReceived = ctx.request.body

  // remember temporary follow activity until we get Accept
  const activity = await saveTemporaryFollow(activityReceived, {
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

  ctx.status = 201
}

/**
 * Save the Follow activity that has not yet been accepted or rejected by the target
 */
const saveTemporaryFollow = async (
  activity: z.infer<typeof followActivitySchema>,
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
