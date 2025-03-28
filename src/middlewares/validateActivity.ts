import { getLogger } from '@logtape/logtape'
import { Middleware } from 'koa'
import { z, ZodError } from 'zod'

const logger = getLogger(['soap-opera', 'validate-activity'])

const baseActivitySchema = z.object({
  id: z.string().url(),
  type: z.string(),
  actor: z.string().url(),
})

export const followActivitySchema = baseActivitySchema.extend({
  type: z.literal('Follow'),
  object: z.string().url(),
})

const activitiesSchema = z.discriminatedUnion('type', [followActivitySchema])

export type Activity = z.infer<typeof activitiesSchema>
export type FollowActivity = z.infer<typeof followActivitySchema>

export const validateActivity: Middleware<{ activity: Activity }> = async (
  ctx,
  next,
) => {
  try {
    logger.info('Received activity to inbox: {activity}', {
      activity: ctx.request.body,
    })

    const activity = activitiesSchema.parse(ctx.request.body)
    ctx.state.activity = activity
    await next()
  } catch (e) {
    if (e instanceof ZodError) ctx.throw(400, `Invalid activity: ${e.message}`)
    else throw e
  }
}
