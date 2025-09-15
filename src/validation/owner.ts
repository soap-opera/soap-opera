import { z } from 'zod'

export const actorSchema = z.object({
  id: z.string().url(),
  preferredUsername: z.string().optional(),
  'soap:isActorOf': z.string().url(),
  'soap:storage': z.string().url().endsWith('/'),
  followers: z.string().url(),
  following: z.string().url(),
  inbox: z.string().url(),
  publicKey: z.object({ id: z.string().url(), publicKeyPem: z.string() }),
})

export type Actor = z.infer<typeof actorSchema>
