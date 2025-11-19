import type {
  RequestMethod,
  SolidTokenVerifierFunction,
} from '@solid/access-token-verifier'
import * as verifier from '@solid/access-token-verifier'
import type { Middleware } from 'koa'
import assert from 'node:assert/strict'

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

  if (!matches) return ctx.throw(403)

  return await next()
}
