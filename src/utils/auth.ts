import type {
  RequestMethod,
  SolidTokenVerifierFunction,
} from '@solid/access-token-verifier'
import * as verifier from '@solid/access-token-verifier'

/**
 * Checks whether a request is Solid-authenticated via authorization and dpop headers
 * Returns webId and clientId of the authenticated person
 * Throws an error when authentication fails
 */
export const getSolidAuth = async (request: Request) => {
  const authorizationHeader = request.headers.get('authorization')
  const dpopHeader = request.headers.get('dpop')
  const solidOidcAccessTokenVerifier: SolidTokenVerifierFunction =
    verifier.createSolidTokenVerifier()

  const { client_id: clientId, webid: webId } =
    await solidOidcAccessTokenVerifier(authorizationHeader as string, {
      header: dpopHeader as string,
      method: request.method as RequestMethod,
      url: request.url,
    })

  return { webId, clientId }
}
