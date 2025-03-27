import { getAuthenticatedFetch } from '@soid/koa'
import { Middleware } from 'koa'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { AppConfig } from '../app.js'
import { User } from './auth.js'
import { Activity, followActivitySchema } from './validateActivity.js'
import { Actor } from './validateOwner.js'

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
  const followersSolid = owner.actor['soap:followers']

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
