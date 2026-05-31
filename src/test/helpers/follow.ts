import { signRequest } from '@fedify/fedify'
import { getLogger } from '@logtape/logtape'
import { randomUUID } from 'node:crypto'
import encodeURIComponent from 'strict-uri-encode'
import { appConfig } from '../setup.js'
import { generateFakeActor } from './fakeActor.js'

type FakeActor = Awaited<ReturnType<typeof generateFakeActor>>

const logger = getLogger(['soap-tests', 'follow request'])

export const createSignedFollowRequest = async (
  actor: FakeActor,
  object: string,
  overwrite?: {
    activity?: { actor?: string; object?: string; type?: string }
  },
) => {
  // send the activity to a solid pod
  const request = new Request(
    new URL(`/users/${encodeURIComponent(object)}/inbox`, appConfig.baseUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/activity+json' },
      body: JSON.stringify(
        getActivity({
          actor: overwrite?.activity?.actor ?? actor.profile.id,
          object: overwrite?.activity?.object ?? object,
          type: overwrite?.activity?.type,
        }),
      ),
    },
  )

  const signedRequest = await signRequest(
    request,
    actor.keys.privateKey,
    new URL(actor.profile.publicKey.id),
  )

  return signedRequest
}

export const sendSignedFollowRequest = async (
  ...options: Parameters<typeof createSignedFollowRequest>
) => {
  const signedRequest = await createSignedFollowRequest(...options)
  logger.debug(
    `Sending signed follow request: ${signedRequest.method} ${signedRequest.url}`,
  )
  const awaited = await fetch(signedRequest)
  return awaited
}

export const getActivity = ({
  actor,
  object,
  type = 'Follow',
}: {
  actor: string
  object: string
  type?: string
}) => ({
  '@context': 'https://www.w3.org/ns/activitystreams',
  // id: new URL('activity/' + , actor).toString(),
  id: new URL('activity/' + randomUUID(), actor).toString(),
  type,
  actor,
  object,
})
