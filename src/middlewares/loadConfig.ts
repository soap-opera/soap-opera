import { type Middleware } from 'koa'
import { type AppConfig } from '../app.js'

export const loadConfig: (
  config: AppConfig,
) => Middleware<{ config: AppConfig }> = config => async (ctx, next) => {
  ctx.state.config = config
  await next()
}
