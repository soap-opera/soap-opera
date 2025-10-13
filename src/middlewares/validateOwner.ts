import { Middleware } from 'koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert/strict'
import encodeURIComponent from 'strict-uri-encode'
import { AppConfig } from '../app.js'
import { soapPrefix } from '../config/constants.js'
import { Actor, actorSchema } from '../validation/owner.js'

const validateOwnerRaw = async (actor: string, baseUrl: string) => {
  // fetch owner and get link to webId
  // TODO improve error messages when things fail
  const ownerResponse = await fetch(actor)
  assert.equal(ownerResponse.ok, true)
  const ownerProfileRaw = await ownerResponse.json()
  const ownerProfile = actorSchema.parse(ownerProfileRaw)
  const webId = ownerProfile['soap:isActorOf']

  assert.equal(ownerProfile.id, actor)

  const ownerBaseUrl = new URL(`users/${encodeURIComponent(actor)}/`, baseUrl)
  assert.equal(
    ownerProfile.followers,
    new URL(`followers`, ownerBaseUrl).toString(),
  )
  assert.equal(
    ownerProfile.following,
    new URL(`following`, ownerBaseUrl).toString(),
  )
  assert.equal(ownerProfile.inbox, new URL(`inbox`, ownerBaseUrl).toString())

  // check that webId links back to the owner
  await checkWebIdActorLink(webId, actor)

  return {
    webId,
    actor: ownerProfile,
  }
}

export const validateOwner: Middleware<
  { owner: { webId: string; actor: Actor }; config: AppConfig }, // to be filled
  { params: { actor: string } }
> = async (ctx, next) => {
  const owner = ctx.params.actor

  try {
    ctx.state.owner = await validateOwnerRaw(owner, ctx.state.config.baseUrl)
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.startsWith('Owner is not properly set up')
    )
      return ctx.throw(400, e.message)
    throw e
  }

  await next()
}

const checkWebIdActorLink = async (webId: string, actor: string) => {
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
    throw new Error(
      `Owner is not properly set up.\nWebId doesn't link to the actor.\nExpected: ${webIdActors.join(',')}\nActual: ${actor}`,
    )
}
