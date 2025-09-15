import { z } from 'zod'

const baseActivitySchema = z.object({
  id: z.string().url().optional(),
  type: z.string(),
  actor: z.string().url(),
})

export const followActivitySchema = baseActivitySchema.extend({
  type: z.literal('Follow'),
  object: z.string().url(),
})

export type FollowActivity = z.infer<typeof followActivitySchema>
