import { describe, expect, it } from 'vitest'
import { person } from './setup.js'

const contentTypes = ['application/activity+json', 'something/random+whatever']

describe('content-type on CSS', () => {
  contentTypes.forEach(contentType => {
    it(`should return the same content type (${contentType}) that is saved`, async () => {
      const createResponse = await person.fetch(
        new URL('./profile/actor', person.podUrl),
        {
          method: 'PUT',
          body: `asdf`,
          headers: { 'content-type': contentType },
        },
      )
      expect(createResponse.ok).toBeTruthy()

      const readResponse = await person.fetch(
        new URL('./profile/actor', person.podUrl),
        { headers: { accept: contentType } },
      )

      expect(readResponse.ok).toBeTruthy()
      expect(readResponse.headers.get('content-type')).toEqual(contentType)
    })
  })
})
