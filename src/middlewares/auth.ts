import { verifyRequest } from '@fedify/fedify'
import { getLogger } from '@logtape/logtape'
import { Middleware } from 'koa'

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

  ctx.state.user = { id: result.ownerId.toString() }

  logger.info('Received signed request {method} {url}', {
    method: ctx.req.method,
    url: ctx.req.url,
  })

  await next()
}
