import { verifyRequest } from '@fedify/fedify'
import { getLogger } from '@logtape/logtape'
import type {
  RequestMethod,
  SolidTokenVerifierFunction,
} from '@solid/access-token-verifier'
import * as verifier from '@solid/access-token-verifier'
import type { Middleware } from 'koa'
import assert from 'node:assert/strict'

const logger = getLogger(['soap-opera', 'auth'])

export const verifyHttpSignature: Middleware = async (ctx, next) => {
  const normalizedHeaders: Record<string, string> = Object.entries(
    ctx.request.headers,
  ).reduce(
    (acc, [key, value]) => {
      if (Array.isArray(value)) {
        // Join multiple header values into a single string.
        acc[key] = value.join(', ')
      } else if (value !== undefined) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, string>,
  )

  const result = await verifyRequest(
    new Request(new URL(ctx.request.url, ctx.request.origin), {
      method: ctx.request.method,
      // TODO fix the type
      headers: normalizedHeaders,
      body: ctx.request.rawBody,
    }),
  )

  if (!result) return ctx.throw(401, 'HTTP Signature is not valid.')
  if (!result.ownerId) return ctx.throw(401, 'No signer.')

  const signer = result.ownerId.toString()

  if (ctx.request.body?.actor !== signer)
    return ctx.throw(
      401,
      `Actor must match Signer.\nActor: ${ctx.request.body.actor}\nSigner: ${signer}`,
    )

  ctx.state.user ??= {}
  ctx.state.user.actor = signer

  logger.info('Received signed request {method} {url}', {
    method: ctx.req.method,
    url: ctx.req.url,
  })

  await next()
}

export const solidAuth: Middleware<{
  user: { webId: string }
  client?: string
}> = async (ctx, next) => {
  const authorizationHeader = ctx.request.headers.authorization
  const dpopHeader = ctx.request.headers.dpop
  const solidOidcAccessTokenVerifier: SolidTokenVerifierFunction =
    verifier.createSolidTokenVerifier()

  try {
    const { client_id: clientId, webid: webId } =
      await solidOidcAccessTokenVerifier(authorizationHeader as string, {
        header: dpopHeader as string,
        method: ctx.request.method as RequestMethod,
        url: ctx.request.URL.toString(),
      })

    ctx.state.user ??= { webId }
    ctx.state.user.webId = webId
    ctx.state.client = clientId
  } catch (error) {
    const message = `Error verifying Access Token via WebID: ${
      error instanceof Error ? error.message : 'unexpected error'
    }`

    ctx.throw(401, message)
    return
  }

  // on success continue
  return await next()
}

// check that the user webId matches owner webId, or that user actor matches owner actor
export const allowOwner: Middleware<{
  owner: { webId: string; actor: string }
  user: { webId: string }
}> = async (ctx, next) => {
  assert.ok(ctx.state.user.webId)
  assert.ok(ctx.state.owner.webId && ctx.state.owner.actor)

  const matches = ctx.state.user.webId === ctx.state.owner.webId

  if (!matches) ctx.throw(403)

  return await next()
}
