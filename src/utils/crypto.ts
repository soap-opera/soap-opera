import { webcrypto } from 'node:crypto'

/**
 * Export node:crypto keys to ascii format
 */
export const cryptoKeyToPem = async (key: CryptoKey): Promise<string> => {
  const isPublic = key.type === 'public'
  // Export the key: use "spki" for public, "pkcs8" for private keys.
  const format = isPublic ? 'spki' : 'pkcs8'
  const exported = await crypto.subtle.exportKey(format, key)

  // Convert the ArrayBuffer to a base64 string.
  // In Node, use Buffer; in a browser, use btoa after converting to a string.
  const exportedAsBase64 = Buffer.from(exported).toString('base64')

  // Create the PEM header and footer.
  const pemHeader = isPublic
    ? '-----BEGIN PUBLIC KEY-----'
    : '-----BEGIN PRIVATE KEY-----'
  const pemFooter = isPublic
    ? '-----END PUBLIC KEY-----'
    : '-----END PRIVATE KEY-----'

  // Insert line breaks every 64 characters.
  const pemBody =
    exportedAsBase64.match(/.{1,64}/g)?.join('\n') || exportedAsBase64

  return `${pemHeader}\n${pemBody}\n${pemFooter}`
}

// Helper to convert PEM string to an ArrayBuffer.
function pemToArrayBuffer(pem: string) {
  // Remove header, footer and line breaks.
  const b64 = pem.replace(/-----.*-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(Buffer.from(b64, 'base64')).buffer
}

// Import the PEM key (assuming PKCS#8 format for a private key)
// Adjust algorithm details and usages as needed.
export async function importPrivateKey(pem: string) {
  const keyData = pemToArrayBuffer(pem)
  return await webcrypto.subtle.importKey(
    'pkcs8', // format of the key
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5', // or other algorithm, e.g., "RSA-PSS"
      hash: 'SHA-256',
    },
    true, // extractable
    ['sign'], // allowed usages
  )
}
