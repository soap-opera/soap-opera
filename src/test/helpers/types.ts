export interface Person {
  idp: string
  podUrl: string
  webId: string
  username: string
  password: string
  email: string
  fetch: typeof globalThis.fetch
  actor?: {
    id: string
    'soap:storage': string
    followers: string
  }
}
