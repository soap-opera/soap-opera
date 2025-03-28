import { Context, Middleware } from 'koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { AppConfig } from '../app.js'
import { soapPrefix } from '../config/constants.js'

const actorSchema = z.object({
  id: z.string().url(),
  'soap:isActorOf': z.string().url(),
  'soap:storage': z.string().url().endsWith('/'),
  followers: z.string().url(),
  following: z.string().url(),
  inbox: z.string().url(),
  publicKey: z.object({ id: z.string().url() }),
})

export type Actor = z.infer<typeof actorSchema>
export interface OwnerState {
  webId: string
  actor: Actor
}

export const validateOwner: Middleware<
  { owner: { webId: string; actor: Actor }; config: AppConfig }, // to be filled
  { params: { actor: string } }
> = async (ctx, next) => {
  const owner = ctx.params.actor

  // fetch owner and get link to webId
  // TODO improve error messages when things fail
  const ownerResponse = await fetch(owner)
  assert.equal(ownerResponse.ok, true)
  const ownerProfileRaw = await ownerResponse.json()
  const ownerProfile = actorSchema.parse(ownerProfileRaw)
  const webId = ownerProfile['soap:isActorOf']

  assert.equal(ownerProfile.id, owner)

  const baseUrl = new URL(
    `users/${encodeURIComponent(owner)}/`,
    ctx.state.config.baseUrl,
  )
  assert.equal(ownerProfile.followers, new URL(`followers`, baseUrl).toString())
  assert.equal(ownerProfile.following, new URL(`following`, baseUrl).toString())
  assert.equal(ownerProfile.inbox, new URL(`inbox`, baseUrl).toString())

  // check that webId links back to the owner
  await checkWebIdActorLink(webId, owner, ctx)

  ctx.state.owner = {
    webId,
    actor: ownerProfile,
  }

  await next()
}

const checkWebIdActorLink = async (
  webId: string,
  actor: string,
  ctx: Context,
) => {
  const webIdResponse = await fetch(webId)
  const webIdDocument = webIdResponse.url
  const webIdProfile = await webIdResponse.text()

  const parser = new Parser({
    format: webIdResponse.headers.get('content-type') ?? undefined,
    baseIRI: webIdDocument,
  })

  const quads = parser.parse(webIdProfile)

  const store = new Store(quads)
  const webIdActors = store
    .getObjects(
      DataFactory.namedNode(webId),
      DataFactory.namedNode(soapPrefix + 'hasActor'),
      null,
    )
    .map(obj => obj.value)

  if (!webIdActors.includes(actor))
    return ctx.throw(
      400,
      `Owner is not properly set up.\nWebId doesn't link to the actor.\nExpected: ${webIdActors.join(',')}\nActual: ${actor}`,
    )
}
