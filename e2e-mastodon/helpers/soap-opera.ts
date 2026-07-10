import { generateCryptoKeyPair } from '@fedify/fedify'
import { expect } from '@playwright/test'
import { SolidAccount } from './solid.js'

export async function setupSoapOpera(account: SolidAccount) {
  console.log(account)

  const actorUrl = new URL('/profile/actor', account.podUrl)
  const webfingerUrl = new URL('/.well-known/webfinger', account.podUrl)

  // save webfinger
  const webfingerResponse = await account.fetch(webfingerUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/jrd+json' },
    body: JSON.stringify({
      subject: `acct:${account.username}@${actorUrl.host}`,
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: actorUrl.toString(),
        },
      ],
    }),
  })
  console.log(await webfingerResponse.text())
  expect(webfingerResponse.ok).toBe(true)

  const webfingerAclResponse = await account.fetch(
    webfingerUrl.toString() + '.acl',
    {
      method: 'PUT',
      headers: { 'content-type': 'text/turtle' },
      body: `
      @prefix acl: <http://www.w3.org/ns/auth/acl#>.
      @prefix foaf: <http://xmlns.com/foaf/0.1/>.

      <#own> a acl:Authorization;
        acl:accessTo </.well-known/webfinger>;
        acl:mode acl:Read, acl:Write, acl:Append, acl:Control;
        acl:agent <${account.webId}>.

      <#read> a acl:Authorization;
        acl:accessTo </.well-known/webfinger>;
        acl:mode acl:Read;
        acl:agentClass foaf:Agent.
      `,
    },
  )
  console.log(webfingerAclResponse.text)
  expect(webfingerAclResponse.ok).toBe(true)

  console.log(account, '*****')

  const keys = await generateMastodonKeys()
  const soapStorage = new URL('soap-opera/', account.podUrl)

  // save actor
  const actorResponse = await account.fetch(actorUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/activity+json' },
    body: JSON.stringify({
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        'https://w3id.org/security/v1',
        'https://w3id.org/security/data-integrity/v1',
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
        {
          soap: 'https://soap.example/activitypub#',
          alsoKnownAs: {
            '@id': 'as:alsoKnownAs',
            '@type': '@id',
          },
          manuallyApprovesFollowers: 'as:manuallyApprovesFollowers',
          movedTo: {
            '@id': 'as:movedTo',
            '@type': '@id',
          },
          toot: 'http://joinmastodon.org/ns#',
          Emoji: 'toot:Emoji',
          featured: {
            '@id': 'toot:featured',
            '@type': '@id',
          },
          featuredTags: {
            '@id': 'toot:featuredTags',
            '@type': '@id',
          },
          discoverable: 'toot:discoverable',
          suspended: 'toot:suspended',
          memorial: 'toot:memorial',
          indexable: 'toot:indexable',
          schema: 'http://schema.org#',
          PropertyValue: 'schema:PropertyValue',
          value: 'schema:value',
          misskey: 'https://misskey-hub.net/ns#',
          _misskey_followedMessage: 'misskey:_misskey_followedMessage',
          isCat: 'misskey:isCat',
        },
      ],
      id: actorUrl.toString(),
      type: 'Person',
      preferredUsername: 'username',
      inbox: `https://soap.test/users/${encodeURIComponent(actorUrl.toString())}/inbox`,
      outbox: `https://soap.test/users/${encodeURIComponent(actorUrl.toString())}/outbox`,
      followers: `https://soap.test/users/${encodeURIComponent(actorUrl.toString())}/followers`,
      following: `https://soap.test/users/${encodeURIComponent(actorUrl.toString())}/following`,
      discoverable: true,
      indexable: true,
      'soap:isActorOf': account.webId,
      'soap:storage': soapStorage,
      publicKey: {
        id: `${actorUrl.toString()}#main-key`,
        owner: actorUrl.toString(),
        publicKeyPem: keys.pem.publicKey,
      },
    }),
  })
  expect(actorResponse.ok).toBe(true)

  const actorAclResponse = await account.fetch(actorUrl.toString() + '.acl', {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: `
      @prefix acl: <http://www.w3.org/ns/auth/acl#>.
      @prefix foaf: <http://xmlns.com/foaf/0.1/>.

      <#own> a acl:Authorization;
        acl:accessTo <${actorUrl.pathname}>;
        acl:mode acl:Read, acl:Write, acl:Append, acl:Control;
        acl:agent <${account.webId}>.

      <#read> a acl:Authorization;
        acl:accessTo <${actorUrl.pathname}>;
        acl:mode acl:Read;
        acl:agentClass foaf:Agent.
      `,
  })
  expect(actorAclResponse.ok).toBe(true)

  // add necessary triples to webid
  const webidResponse = await account.fetch(account.webId, {
    method: 'PATCH',
    headers: { 'content-type': 'text/n3' },
    body: `@prefix solid: <http://www.w3.org/ns/solid/terms#> .
    
    <#patch> a solid:InsertDeletePatch;
        solid:inserts {
            <${account.webId}> <https://soap.example/activitypub#hasActor> <${actorUrl}>;
                solid:oidcIssuer <https://soap.test> .
        } .
    `,
  })
  expect(webidResponse.ok).toBe(true)

  // save private key
  const privkeyResponse = await account.fetch(
    new URL('keys/private.pem', soapStorage),
    {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: keys.pem.privateKey,
    },
  )
  expect(privkeyResponse.ok).toBe(true)
}

// initially generated by google search AI mode
async function generateMastodonKeys() {
  // 1. Generate a compliant RSASSA-PKCS1-v1_5 keypair using Fedify
  const { privateKey, publicKey } =
    await generateCryptoKeyPair('RSASSA-PKCS1-v1_5')

  // 2. Export the private key to PKCS#8 DER binary, then convert to PEM
  const privateDer = await crypto.subtle.exportKey('pkcs8', privateKey)
  const privateBase64 = btoa(String.fromCharCode(...new Uint8Array(privateDer)))

  // Format Private Key into a standard 64-character line width PEM chunk
  const privatePem = [
    '-----BEGIN PRIVATE KEY-----',
    ...(privateBase64.match(/.{1,64}/g) || []),
    '-----END PRIVATE KEY-----',
  ].join('\n')

  // 3. Export the public key to SPKI DER binary, then convert to Base64
  const publicDer = await crypto.subtle.exportKey('spki', publicKey)
  const publicBase64Raw = btoa(
    String.fromCharCode(...new Uint8Array(publicDer)),
  )

  // Format Public Key into a standard 64-character line width PEM chunk
  const publicPem = [
    '-----BEGIN PUBLIC KEY-----',
    ...(publicBase64Raw.match(/.{1,64}/g) || []),
    '-----END PUBLIC KEY-----',
  ].join('\n')

  return {
    raw: { publicKey, privateKey },
    base64: { publicKey: publicBase64Raw, privateKey: privateBase64 },
    pem: { publicKey: publicPem, privateKey: privatePem },
  }
}
