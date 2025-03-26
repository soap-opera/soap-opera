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
    'soap:following': string
    'soap:followers': string
  }
}
