import { getAuthenticatedFetch } from '@soid/koa'
import { Context, Middleware } from 'koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert'
import { z } from 'zod'
import { AppConfig } from '../app.js'
import { soapPrefix } from '../config/constants.js'
import { User } from './auth.js'
import { Activity, followActivitySchema } from './validate.js'

export const processActivity: Middleware<
  {
    user: User
    activity: Activity
    config: AppConfig
  },
  { params: { username: string } }
> = async ctx => {
  const activity = ctx.state.activity

  switch (activity.type) {
    case 'Follow':
      await follow(activity, ctx.params.username, ctx.state.config.baseUrl, ctx)
      break
    default:
      throw new Error('Unrecognized activity')
  }

  ctx.status = 200
}

const actorSchema = z.object({
  id: z.string().url(),
  'soap:isActorOf': z.string().url(),
  'soap:followers': z.string().url(),
})

const follow = async (
  activity: z.infer<typeof followActivitySchema>,
  object: string,
  issuer: string,
  ctx: Context,
) => {
  if (activity.object !== object)
    throw new Error(
      'Objects do not match' + ' ' + activity.object + ' !== ' + object,
    )

  const actorResponse = await fetch(object)
  assert.equal(actorResponse.ok, true)

  const actorProfileRaw = await actorResponse.json()

  const actorProfile = actorSchema.parse(actorProfileRaw)

  const webId = actorProfile['soap:isActorOf']

  // check that the profile links back to the actor
  await checkWebIdActorLink(webId, object, ctx)

  const authFetch = await getAuthenticatedFetch(webId, issuer)

  const followersSolid = actorProfile['soap:followers']

  const response = await authFetch(followersSolid, {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.

  _:patch a solid:InsertDeletePatch;
    solid:inserts { <${activity.actor}> <https://example.com/soid#follows> <${activity.object}>. } .`,
  })

  assert.equal(response.ok, true)
}

// TODO these common consistency checks can be moved into a common middleware
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
      `WebId doesn't link to the actor.\nExpected: ${webIdActors.join(',')}\nActual: ${actor}`,
    )
}
