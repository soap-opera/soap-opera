import { z } from 'zod'

const baseActivitySchema = z.object({
  id: z.string().url().optional(),
  type: z.string(),
  actor: z.string().url(),
})

const followActivitySchema = baseActivitySchema.extend({
  type: z.literal('Follow'),
  object: z.string().url(),
})

const noteActivitySchema = baseActivitySchema.extend({
  type: z.literal('Note'),
  content: z.string().min(1).max(5000),
  attributedTo: z.string().url(),
  published: z.string().datetime().optional(),
  actor: z.string().url().optional(),
})

export type FollowActivity = z.infer<typeof followActivitySchema>
// export type NoteActivity = z.infer<typeof noteActivitySchema>

// const logger = getLogger(['soap-opera', 'validate-activity'])

const acceptFollowActivitySchema = baseActivitySchema.extend({
  type: z.literal('Accept'),
  object: followActivitySchema,
})

const activitiesSchema = z.discriminatedUnion('type', [
  followActivitySchema,
  acceptFollowActivitySchema,
  noteActivitySchema,
])

const audienceSchema = z.array(z.string().url()).optional()

export const outboxActivitiesSchema = activitiesSchema.and(
  z.object({
    to: audienceSchema,
    bto: audienceSchema,
    cc: audienceSchema,
    bcc: audienceSchema,
  }),
)

// export type Activity = z.infer<typeof activitiesSchema>

// export const validateActivity: Middleware<{ activity: Activity }> = async (
//   ctx,
//   next,
// ) => {
//   try {
//     logger.info('Received activity to inbox: {activity}', {
//       activity: ctx.request.body,
//     })

//     const activity = activitiesSchema.parse(ctx.request.body)
//     ctx.state.activity = activity
//     await next()
//   } catch (e) {
//     if (e instanceof ZodError) ctx.throw(400, `Invalid activity: ${e.message}`)
//     else throw e
//   }
// }
