import {
  Accept,
  Context,
  createFederation,
  CryptographicKey,
  Follow,
  importPem,
  MemoryKvStore,
  Person,
} from '@fedify/fedify'
import { getLogger } from '@logtape/logtape'
import { getAuthenticatedFetch } from '@soid/koa'
import assert from 'node:assert'
import { schema_https } from 'rdf-namespaces'
import { z } from 'zod'
import type { AppConfig } from '../app.js'
import { readFollowersData } from '../data/followers.js'
import { readFollowingData } from '../data/following.js'
import { importPrivateKey, importPublicKey } from '../utils/crypto.js'
import { Actor, actorSchema } from '../validation/owner.js'

const logger = getLogger(['soap-opera', 'federation'])

export interface ContextData {
  owner: Actor
  config: AppConfig
}

export const federation = createFederation<ContextData>({
  kv: new MemoryKvStore(),
})

function fixContext(ctx: Context<{ owner: Actor }>) {
  // @ts-expect-error replacing protected function
  if (ctx.prevGetKeyPairs) return
  // @ts-expect-error replacing protected function
  ctx.prevGetKeyPairs = ctx.getKeyPairsFromIdentifier
  ctx.getActorUri = function (identifier: string) {
    return new URL(decodeURIComponent(identifier))
  }

  // @ts-expect-error replacing protected function
  ctx.getKeyPairsFromIdentifier = async function (
    identifier: string,
  ): Promise<(CryptoKeyPair & { keyId: URL })[]> {
    // @ts-expect-error replacing protected function
    const keyPairs = await ctx.prevGetKeyPairs(identifier)
    // @ts-expect-error replacing protected function so we're fine with any
    return keyPairs.map((kp, i) => ({
      ...kp,
      keyId: new URL(
        // For backwards compatibility, the first key is always the #main-key:
        i == 0 ? `#main-key` : `#key-${i + 1}`,
        decodeURIComponent(identifier),
      ),
    }))
  }
}

federation
  // @ts-expect-error +identifier not supported by @fedify, but works
  .setActorDispatcher('/users/{+identifier}', async (ctx, identifier) => {
    if (identifier.includes('/')) return null

    fixContext(ctx)

    const actor = decodeURIComponent(identifier)
    const resp = await fetch(actor)
    const actorDataRaw = await resp.json()

    const actorData = actorSchema.parse(actorDataRaw)

    return new Person({
      id: new URL(actor),
      preferredUsername: actorData.preferredUsername,
      url: new URL('/', ctx.url),
      inbox: new URL(actorData.inbox),
      publicKey: new CryptographicKey({
        publicKey: await importPem(actorData.publicKey.publicKeyPem),
      }),
      followers: ctx.getFollowersUri(decodeURIComponent(identifier)),
      following: ctx.getFollowingUri(decodeURIComponent(identifier)),
    })
  })
  .setKeyPairsDispatcher(async ctx => {
    fixContext(ctx)
    const owner = ctx.data.owner
    const publicKeyPem = owner.publicKey.publicKeyPem

    const authFetch = await getAuthenticatedFetch(
      owner['soap:isActorOf'],
      ctx.data.config.baseUrl,
    )

    // now fetch the private key
    const privkeyresp = await authFetch(
      new URL('keys/private.pem', owner['soap:storage']),
    )

    assert.ok(privkeyresp.ok)

    const privateKeyPem = await privkeyresp.text()

    const privateKey = await importPrivateKey(privateKeyPem)
    const publicKey = await importPublicKey(publicKeyPem)

    return [{ privateKey, publicKey }]
  })

federation
  // @ts-expect-error +identifier is not supported by fedify but works
  .setInboxListeners('/users/{+identifier}/inbox', '/inbox')
  .on(Follow, async (ctx, follow) => {
    fixContext(ctx)
    if (
      follow.id == null ||
      follow.actorId == null ||
      follow.objectId == null
    ) {
      return
    }
    if (
      !ctx.recipient ||
      follow.objectId.toString() !== decodeURIComponent(ctx.recipient)
    )
      return
    const follower = await follow.getActor(ctx)
    if (follower === null) return
    const authFetch = await getAuthenticatedFetch(
      ctx.data.owner['soap:isActorOf'],
      ctx.data.config.baseUrl,
    )
    const followersSolid = ctx.data.owner['soap:storage'] + 'followers'

    const response = await authFetch(followersSolid, {
      method: 'PATCH',
      headers: { 'content-type': 'text/n3' },
      body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.
    _:patch a solid:InsertDeletePatch;
      solid:inserts { <${follow.actorId}> <${schema_https.follows}> <${follow.objectId}>. } .`,
    })

    assert.equal(response.ok, true)
    await ctx.sendActivity(
      { identifier: decodeURIComponent(ctx.recipient) },
      follower,
      new Accept({ actor: follow.objectId, object: follow }),
    )
  })
  .on(Accept, async (ctx, activity) => {
    logger.info('Processing Accept activity', { activity })
    const object = await activity.getObject()

    if (object instanceof Follow) {
      const { id } = object
      if (!id?.toString().startsWith(ctx.data.owner['soap:storage']))
        throw new Error('This activity does not belong to this person')
      // fetch the local object for comparison
      const authFetch = await getAuthenticatedFetch(
        ctx.data.owner['soap:isActorOf'],
        ctx.data.config.baseUrl,
      )
      const response = await authFetch(id)
      assert.ok(response.ok)
      const storedActivity = await response.json()

      assert.equal(storedActivity.actor, object.actorId?.toString())
      assert.equal(storedActivity.object, object.objectId?.toString())

      const followingSolid = ctx.data.owner['soap:storage'] + 'following'

      const responseSolid = await authFetch(followingSolid, {
        method: 'PATCH',
        headers: { 'content-type': 'text/n3' },
        body: `
    @prefix solid: <http://www.w3.org/ns/solid/terms#>.
    _:patch a solid:InsertDeletePatch;
      solid:inserts { <${object.actorId}> <${schema_https.follows}> <${object.objectId}>. } .`,
      })

      assert.equal(responseSolid.ok, true)
    } else {
      throw new Error('Unrecognized Accept object type: ' + object)
    }
  })

const PAGE_SIZE = 10
const FIRST_PAGE = 1
federation
  .setFollowersDispatcher(
    // @ts-expect-error +identifier not supported by fedify types, but is necessary for correct identifier expansion
    `/users/{+identifier}/followers`,
    async (ctx, identifier, cursor) => {
      fixContext(ctx)
      const cursorSchema = z.union([
        z.coerce.number().int().min(FIRST_PAGE),
        z.null(),
      ])
      const actorSchema = z.object({
        id: z.string().url(),
        inbox: z.string().url(),
      })
      const validCursor = cursorSchema.parse(cursor)
      // read followers from Solid Pod
      const followers = await readFollowersData(
        ctx.data.owner['soap:storage'] + 'followers',
        {
          actor: ctx.data.owner.id,
          webId: ctx.data.owner['soap:isActorOf'],
          issuer: ctx.data.config.baseUrl,
        },
      )

      // let's do pagination. Take the current followers page
      const followersPage =
        validCursor === null
          ? followers
          : paginateArray(followers, validCursor, PAGE_SIZE)

      // fetch these followers and find their inboxes
      // TODO cache
      const fetchedActorsResults = await Promise.allSettled(
        followersPage.map(async follower => {
          const result = await fetch(follower)
          const rawData = await result.json()
          const actor = actorSchema.parse(rawData)
          return actor
        }),
      )

      const followersWithInboxes = fetchedActorsResults
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<z.infer<typeof actorSchema>> =>
            result.status === 'fulfilled',
        )
        .map(result => ({
          id: new URL(result.value.id),
          inboxId: new URL(result.value.inbox),
        }))

      return {
        items: followersWithInboxes,
        nextCursor:
          validCursor === null
            ? undefined
            : validCursor * PAGE_SIZE >= followers.length
              ? null
              : String(validCursor + 1),
        prevCursor:
          validCursor === null
            ? undefined
            : validCursor === 1
              ? null
              : String(validCursor - 1),
      }
    },
  )
  .setFirstCursor(() => String(FIRST_PAGE))
  .setCounter(async ctx => {
    fixContext(ctx)
    const followers = await readFollowersData(
      ctx.data.owner['soap:storage'] + 'followers',
      {
        actor: ctx.data.owner.id,
        webId: ctx.data.owner['soap:isActorOf'],
        issuer: ctx.data.config.baseUrl,
      },
    )
    return followers.length
  })

federation
  .setFollowingDispatcher(
    // @ts-expect-error +identifier not supported by fedify types, but is necessary for correct identifier expansion
    `/users/{+identifier}/following`,
    async (ctx, identifier, cursor) => {
      fixContext(ctx)
      const cursorSchema = z.union([
        z.coerce.number().int().min(FIRST_PAGE),
        z.null(),
      ])
      const actorSchema = z.object({
        id: z.string().url(),
        inbox: z.string().url(),
      })
      const validCursor = cursorSchema.parse(cursor)
      // read following from Solid Pod
      const following = await readFollowingData(
        ctx.data.owner['soap:storage'] + 'following',
        {
          actor: ctx.data.owner.id,
          webId: ctx.data.owner['soap:isActorOf'],
          issuer: ctx.data.config.baseUrl,
        },
      )

      // let's do pagination. Take the current following page
      const followingPage =
        validCursor === null
          ? following
          : paginateArray(following, validCursor, PAGE_SIZE)

      // fetch these followed actors and find their inboxes
      // TODO cache
      const fetchedActorsResults = await Promise.allSettled(
        followingPage.map(async following => {
          const result = await fetch(following)
          const rawData = await result.json()
          const actor = actorSchema.parse(rawData)
          return actor
        }),
      )

      const followingWithInboxes = fetchedActorsResults
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<z.infer<typeof actorSchema>> =>
            result.status === 'fulfilled',
        )
        .map(result => ({
          id: new URL(result.value.id),
          inboxId: new URL(result.value.inbox),
        }))

      return {
        items: followingWithInboxes,
        nextCursor:
          validCursor === null
            ? undefined
            : validCursor * PAGE_SIZE >= following.length
              ? null
              : String(validCursor + 1),
        prevCursor:
          validCursor === null
            ? undefined
            : validCursor === 1
              ? null
              : String(validCursor - 1),
      }
    },
  )
  .setFirstCursor(() => String(FIRST_PAGE))
  .setCounter(async ctx => {
    fixContext(ctx)
    const following = await readFollowingData(
      ctx.data.owner['soap:storage'] + 'following',
      {
        actor: ctx.data.owner.id,
        webId: ctx.data.owner['soap:isActorOf'],
        issuer: ctx.data.config.baseUrl,
      },
    )
    return following.length
  })
function paginateArray<T>(items: T[], page: number, pageSize: number): T[] {
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  return items.slice(startIndex, endIndex)
}
