import { parseLinkHeader } from '@solid/community-server'
import { v7 } from 'css-authn'
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { Person } from './types.js'

export const createRandomAccount = async ({
  solidServer,
}: {
  solidServer: string
}) => {
  const account = await v7.createAccount({
    username: randomUUID(),
    password: randomUUID(),
    email: randomUUID() + '@example.com',
    provider: solidServer,
  })

  const authenticatedFetch = await v7.getAuthenticatedFetch({
    email: account.email,
    password: account.password,
    provider: solidServer,
  })

  return { ...account, fetch: authenticatedFetch }
}

/**
 * Find link to ACL document for a given URI
 */
export const getAcl = async (
  uri: string,
  ffetch: typeof globalThis.fetch = globalThis.fetch,
) => {
  const response = await ffetch(uri, { method: 'HEAD' })
  expect(response.ok).toBe(true)
  const linkHeader = response.headers.get('link')
  const links = parseLinkHeader(linkHeader ?? '')
  const aclLink = links.find(link => link.parameters.rel === 'acl')
  const aclUri = aclLink?.target
  if (!aclUri) throw new Error(`We could not find WAC link for ${uri}`)
  // if aclUri is relative, return absolute uri
  return new URL(aclUri, uri).toString()
}

/**
 * Generate accommodation URI for a given person
 */
export const generateAccommodationUri = (person: Pick<Person, 'podUrl'>) =>
  `${person.podUrl}${
    person.podUrl.endsWith('/') ? '' : '/'
  }hospex/test/${randomUUID()}#accommodation`

export const getContainer = (uri: string) =>
  uri.substring(0, uri.lastIndexOf('/') + 1)

export const getResource = (uri: string) => {
  const url = new URL(uri)
  const clearedUrl = new URL(url.pathname, url.origin).toString()
  return clearedUrl
}

export const getDefaultPerson = async (
  {
    email,
    password,
    pods: [{ name }],
  }: {
    email: string
    password: string
    pods: [{ name: string }]
  },
  cssUrl: string,
): Promise<Person> => {
  const podUrl = `${cssUrl}/${name}/`
  const withoutFetch: Omit<Person, 'fetch'> = {
    podUrl,
    idp: cssUrl + '/',
    webId: podUrl + 'profile/card#me',
    username: name,
    password,
    email,
  }
  return {
    ...withoutFetch,
    fetch: await v7.getAuthenticatedFetch({
      ...withoutFetch,
      provider: cssUrl,
    }),
  }
}

const getRandomLocation = (): [number, number] => [
  (Math.random() - 0.5) * 180,
  (Math.random() - 0.5) * 360,
]

export function getRandomPort(): number {
  // Generate a random number between 1024 and 65535
  const min = 1024
  const max = 65535
  return Math.floor(Math.random() * (max - min + 1)) + min
}
