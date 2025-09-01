import { generateCryptoKeyPair } from '@fedify/fedify'
import { cryptoKeyToPem } from './crypto.js'

export const generateFakeActor = async (url: string) => {
  const keys = await generateCryptoKeyPair()
  return {
    profile: {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
      ],
      id: url,
      type: 'Person',
      inbox: new URL('inbox', url),
      outbox: new URL('outbox', url),
      followers: new URL('followers', url),
      following: new URL('following', url),
      publicKey: {
        id: url + '#main-key',
        owner: url,
        publicKeyPem: await cryptoKeyToPem(keys.publicKey),
      },
    },
    keys,
  }
}
