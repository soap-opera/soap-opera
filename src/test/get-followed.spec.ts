import { describe, expect, it } from 'vitest'
import { appConfig } from './setup.js'

describe('Accept Follow activity from somebody', () => {
  it('should receive Follow activity to inbox', async () => {
    const response = await fetch(
      new URL(`/users/testuser/inbox`, appConfig.baseUrl),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/activity+json',
          signature:
            'keyId="https://my-example.com/actor#main-key",headers="(request-target) host date",signature="Y2FiYW...IxNGRiZDk4ZA=="',
        },
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: 'https://my-example.com/my-first-follow',
          type: 'Follow',
          actor: 'https://my-example.com/actor',
          object: 'https://mastodon.social/users/Mastodon',
        }),
      },
    )

    expect(response.status).toBe(200)
  })
  it.todo('should reject activity that is not properly signed')
  it.todo('should reject invalid activity')
  it.todo('should save Follow activity to Solid Pod')
  it.todo('should read a list of followers')
})
