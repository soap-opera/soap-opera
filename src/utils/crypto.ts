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
