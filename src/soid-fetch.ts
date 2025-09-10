// To be replaced with @soid/koa
import { getEndpoints } from '@soid/core'
export { getAuthenticatedFetch } from '@soid/core'

export const solidIdentityFetch = (webId: string, issuer?: string) => {
  const endpoints = getEndpoints(webId, issuer)

  // Return a fetch handler function
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const method = request.method.toLowerCase()

    // Find matching endpoint
    const matchedEndpoint = endpoints.find(endpoint => {
      return (
        endpoint.method.toLowerCase() === method &&
        matchesPath(endpoint.path, url.pathname)
      )
    })

    if (!matchedEndpoint) {
      return new Response('Not Found', { status: 404 })
    }

    // Handle content negotiation
    const acceptHeader = request.headers.get('accept') || '*/*'
    const acceptedTypes = parseAcceptHeader(acceptHeader)
    const availableTypes = Object.keys(matchedEndpoint.body)

    const accepted =
      acceptedTypes.find(type => availableTypes.includes(type)) ||
      matchedEndpoint.defaultContentType

    const body =
      matchedEndpoint.body[accepted] ||
      matchedEndpoint.body[matchedEndpoint.defaultContentType]

    return new Response(
      typeof body === 'object' ? JSON.stringify(body) : body,
      {
        headers: {
          'Content-Type': accepted || matchedEndpoint.defaultContentType,
        },
      },
    )
  }
}

// Helper functions
function matchesPath(endpointPath: string, requestPath: string): boolean {
  // Simple exact match - you might need more sophisticated routing
  return endpointPath === requestPath
}

function parseAcceptHeader(acceptHeader: string): string[] {
  // Simple accept header parsing
  return acceptHeader
    .split(',')
    .map(type => type.trim().split(';')[0])
    .filter((type): type is string => Boolean(type))
}
