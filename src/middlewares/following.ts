import { OrderedCollection, OrderedCollectionPage } from '@fedify/fedify'
import { getAuthenticatedFetch } from '@soid/koa'
import { Middleware } from 'koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert/strict'
import { schema_https } from 'rdf-namespaces'
import { AppConfig } from '../app.js'
import { OwnerState } from './validateOwner.js'

// this code is copy-pasted from followers.ts
// TODO some proper refactor

export const readFollowing: Middleware<
  {
    owner: OwnerState
    config: AppConfig
  },
  { query?: { page?: string } }
> = async ctx => {
  const following = await readFollowingData(
    ctx.state.owner.actor['soap:storage'] + 'following',
    {
      webId: ctx.state.owner.webId,
      issuer: ctx.state.config.baseUrl,
      actor: ctx.state.owner.actor.id,
    },
  )

  const page = ctx.query.page && Number(ctx.query.page)

  if (typeof page === 'number') {
    // respond with pages
    const collection = new OrderedCollectionPage({
      id: new URL(ctx.state.owner.actor.following + '?page=' + page),
      partOf: new URL(ctx.state.owner.actor.following),
      items: page === 1 ? following.map(f => new URL(f)) : [],
      totalItems: following.length,
    })

    ctx.body = await collection.toJsonLd()
  } else {
    const collection = new OrderedCollection({
      id: new URL(ctx.state.owner.actor.following),
      totalItems: following.length,
      first:
        following.length > 0
          ? new URL(ctx.state.owner.actor.following + '?page=1')
          : undefined,
      items: following.map(f => new URL(f)),
    })

    ctx.body = await collection.toJsonLd()
  }

  ctx.set('content-type', 'application/activity+json')
  ctx.status = 200
}

const readFollowingData = async (
  url: string,
  options: { actor: string; webId: string; issuer: string },
) => {
  const authFetch = await getAuthenticatedFetch(options.webId, options.issuer)

  const followingResponse = await authFetch(url)

  if (followingResponse.status === 404) return []

  assert.equal(followingResponse.ok, true)
  const followingData = await followingResponse.text()

  const parser = new Parser({
    format: followingResponse.headers.get('content-type') ?? undefined,
    baseIRI: followingResponse.url,
  })

  const { namedNode } = DataFactory

  const quads = parser.parse(followingData)
  const store = new Store(quads)
  const following = store
    .getObjects(namedNode(options.actor), namedNode(schema_https.follows), null)
    .map(s => s.id)

  return following
}
