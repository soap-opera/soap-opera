import { OrderedCollection, OrderedCollectionPage } from '@fedify/fedify'
import { getAuthenticatedFetch } from '@soid/koa'
import { Middleware } from 'koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert/strict'
import { schema_https } from 'rdf-namespaces'
import { AppConfig } from '../app.js'
import { OwnerState } from './validateOwner.js'

// this code is copy-pasted to following.ts
// TODO some proper refactor
export const readFollowers: Middleware<
  {
    owner: OwnerState
    config: AppConfig
  },
  { query?: { page?: string } }
> = async ctx => {
  const followers = await readFollowersData(
    ctx.state.owner.actor['soap:storage'] + 'followers',
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
      id: new URL(ctx.state.owner.actor.followers + '?page=' + page),
      partOf: new URL(ctx.state.owner.actor.followers),
      items: page === 1 ? followers.map(f => new URL(f)) : [],
      totalItems: followers.length,
    })

    ctx.body = await collection.toJsonLd()
  } else {
    const collection = new OrderedCollection({
      id: new URL(ctx.state.owner.actor.followers),
      totalItems: followers.length,
      first:
        followers.length > 0
          ? new URL(ctx.state.owner.actor.followers + '?page=1')
          : undefined,
      items: followers.map(f => new URL(f)),
    })

    ctx.body = await collection.toJsonLd()
  }

  ctx.set('content-type', 'application/activity+json')
  ctx.status = 200
}

export const readFollowersData = async (
  url: string,
  options: { actor: string; webId: string; issuer: string },
) => {
  const authFetch = await getAuthenticatedFetch(options.webId, options.issuer)

  const followersResponse = await authFetch(url)

  if (followersResponse.status === 404) return []

  assert.equal(followersResponse.ok, true)
  const followersData = await followersResponse.text()

  const parser = new Parser({
    format: followersResponse.headers.get('content-type') ?? undefined,
    baseIRI: followersResponse.url,
  })

  const { namedNode } = DataFactory

  const quads = parser.parse(followersData)
  const store = new Store(quads)
  const followers = store
    .getSubjects(
      namedNode(schema_https.follows),
      namedNode(options.actor),
      null,
    )
    .map(s => s.id)

  return followers
}
