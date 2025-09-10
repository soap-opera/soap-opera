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
import { serve } from '@hono/node-server'
import { configure, getConsoleSink } from '@logtape/logtape'
import { getAuthenticatedFetch } from '@soid/koa'
import assert from 'node:assert'
import { schema_https } from 'rdf-namespaces'
import { z } from 'zod'
import { AppConfig } from './app.js'
import { readFollowersData } from './middlewares/followers.js'
import {
  Actor,
  actorSchema,
  validateOwnerRaw,
} from './middlewares/validateOwner.js'
import { solidIdentityFetch } from './soid-fetch.js'
import { importPrivateKey, importPublicKey } from './utils/crypto.js'

await configure({
  sinks: { console: getConsoleSink() },
  filters: {},
  loggers: [{ category: 'fedify', sinks: ['console'], lowestLevel: 'info' }],
})

export const start = (appConfig: AppConfig) => {
  const federation = createFederation<{ owner: Actor }>({
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
      fixContext(ctx)
      const actor = decodeURIComponent(identifier)
      const resp = await fetch(actor)
      const actorDataRaw = await resp.json()

      const actorData = actorSchema.parse(actorDataRaw)
      console.log(
        ctx.getFollowersUri(decodeURIComponent(identifier)),
        'followers uriiiiiiiiii',
      )

      return new Person({
        id: new URL(actor),
        preferredUsername: actorData.preferredUsername,
        url: new URL('/', ctx.url),
        inbox: new URL(actorData.inbox),
        publicKey: new CryptographicKey({
          publicKey: await importPem(actorData.publicKey.publicKeyPem),
        }),
        followers: ctx.getFollowersUri(decodeURIComponent(identifier)),
      })
    })
    .setKeyPairsDispatcher(async ctx => {
      fixContext(ctx)
      const owner = ctx.data.owner
      const publicKeyPem = owner.publicKey.publicKeyPem

      const authFetch = await getAuthenticatedFetch(
        owner['soap:isActorOf'],
        appConfig.baseUrl,
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
        appConfig.baseUrl,
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
            issuer: appConfig.baseUrl,
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
          issuer: appConfig.baseUrl,
        },
      )
      return followers.length
    })

  return serve({
    port: appConfig.port,
    async fetch(request) {
      const response = await solidIdentityFetch(
        'https://example.com',
        appConfig.baseUrl,
      )(request)

      if (response.ok) return response

      const url = new URL(request.url)

      let owner: Actor | undefined = undefined

      // Your validation here before calling fedify
      if (url.pathname.includes('/users/')) {
        try {
          const actorId = extractActorFromPath(url.pathname)
          ;({ actor: owner } = await validateOwnerRaw(
            actorId,
            appConfig.baseUrl,
          ))
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.startsWith('Owner is not properly set up')
          )
            return new Response(error.message, { status: 400 })
          else {
            return new Response('Invalid', { status: 500 })
          }
        }
      }

      assert.ok(owner)

      return await federation.fetch(request, {
        contextData: { owner },
      })
    },
  })
}

function paginateArray<T>(items: T[], page: number, pageSize: number): T[] {
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  return items.slice(startIndex, endIndex)
}

function extractActorFromPath(pathname: string): string {
  const parts = pathname.split('/')

  if (parts[1] !== 'users' || !parts[2]) {
    throw new Error(`Invalid users path: ${pathname}`)
  }

  return decodeURIComponent(parts[2])
}
