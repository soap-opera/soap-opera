import type { Federation } from '@fedify/fedify'
import { getLogger } from '@logtape/logtape'
import type { Context, Next } from 'koa'
import { Buffer } from 'node:buffer'

const logger = getLogger(['soap-opera', 'fedify'])

type ContextDataFactory<TContextData> = (
  ctx: Context,
) => TContextData | Promise<TContextData>

export function integrateFederation<TContextData>(
  federation: Federation<TContextData>,
  contextDataFactory: ContextDataFactory<TContextData>,
): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx, next) => {
    const request = fromKoaRequest(ctx)
    const contextData = contextDataFactory(ctx)
    const contextDataPromise =
      contextData instanceof Promise
        ? contextData
        : Promise.resolve(contextData)

    const resolvedContextData = await contextDataPromise

    let notFound = false
    let notAcceptable = false

    const response = await federation.fetch(request, {
      contextData: resolvedContextData,
      onNotFound: async () => {
        notFound = true
        await next()
        return new Response('Not found', { status: 404 })
      },
      onNotAcceptable: async () => {
        notAcceptable = true
        await next()
        return new Response('Not acceptable', {
          status: 406,
          headers: {
            'Content-Type': 'text/plain',
            Vary: 'Accept',
          },
        })
      },
    })

    if (notFound) return
    if (notAcceptable && ctx.response.body != null) return

    await setKoaResponse(ctx, response)
  }
}

function fromKoaRequest(ctx: Context): Request {
  const url = `${ctx.request.origin}${ctx.request.url}`
  const headers = new Headers()

  for (const [key, value] of Object.entries(ctx.request.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (typeof value === 'string') {
      headers.append(key, value)
    }
  }

  const requestInit: RequestInit & { duplex?: string } = {
    method: ctx.request.method,
    headers,
  }

  // Handle body for methods that can have one
  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    // Since we're using koa-bodyparser, the body is already parsed
    // We need to reconstruct it from ctx.request.body
    if (ctx.request.body !== undefined && ctx.request.body !== null) {
      let bodyContent: string
      const contentType = ctx.request.headers['content-type'] || ''

      if (typeof ctx.request.body === 'string') {
        bodyContent = ctx.request.body
      } else if (contentType.includes('application/json')) {
        bodyContent = JSON.stringify(ctx.request.body)
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        // Convert object back to form data
        bodyContent = new URLSearchParams(
          ctx.request.body as Record<string, string>,
        ).toString()
      } else {
        // Default to JSON
        bodyContent = JSON.stringify(ctx.request.body)
      }

      requestInit.body = bodyContent
      requestInit.duplex = 'half'
    }
  }

  return new Request(url, requestInit)
}

async function setKoaResponse(ctx: Context, response: Response): Promise<void> {
  ctx.response.status = response.status

  response.headers.forEach((value, key) => {
    ctx.response.set(key, value)
  })

  if (response.body == null) {
    ctx.response.body = null
    return
  }

  try {
    // Clone response to avoid "body disturbed" errors
    const clonedResponse = response.clone()
    const buffer = await clonedResponse.arrayBuffer()
    ctx.response.body = Buffer.from(buffer)
  } catch (error) {
    logger.error('Error reading response body:', { error })
    ctx.response.body = null
  }
}
