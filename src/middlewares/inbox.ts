import { Middleware } from 'koa'
import { User } from './auth.js'
import { Activity } from './validate.js'

export const processActivity: Middleware<{
  user: User
  activity: Activity
}> = async ctx => {
  const activity = ctx.state.activity

  switch (activity.type) {
    case 'Follow':
      break
    default:
      throw new Error('Unrecognized activity')
      break
  }

  ctx.status = 200
}
