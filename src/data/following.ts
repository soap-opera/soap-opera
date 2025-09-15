import { getAuthenticatedFetch } from '@soid/koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert/strict'
import { schema_https } from 'rdf-namespaces'

// this code is copy-pasted from followers.ts
// TODO some proper refactor

export const readFollowingData = async (
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
