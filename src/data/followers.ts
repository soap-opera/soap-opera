import { getAuthenticatedFetch } from '@soid/koa'
import { DataFactory, Parser, Store } from 'n3'
import assert from 'node:assert/strict'
import { schema_https } from 'rdf-namespaces'

// this code is copy-pasted to following.ts
// TODO some proper refactor

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
