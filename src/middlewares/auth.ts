import { verifyRequest } from '@fedify/fedify'
import { Middleware } from 'koa'

export interface User {
  id: string
}

export const verifyHttpSignature: Middleware<{ user?: User }> = async (
  ctx,
  next,
) => {
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

  if (!result) return ctx.throw(401)
  if (!result.ownerId) return ctx.throw(401)

  if (ctx.request.body?.actor !== result.ownerId.toString())
    return ctx.throw(401)

  ctx.state.user = { id: result.ownerId.toString() }

  await next()
}
