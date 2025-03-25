import cors from '@koa/cors'
import Router from '@koa/router'
import Koa, { Middleware } from 'koa'
import koaHelmet from 'koa-helmet'

export interface AppConfig {
  isBehindProxy: boolean
  port: number
  baseUrl: string
}

export const createApp = async (config: AppConfig) => {
  const app = new Koa()

  app.proxy = config.isBehindProxy
  const router = new Router()

  router.post('/users/:username/inbox', (async ctx => {
    ctx.status = 200
  }) as Middleware<null, { params: { username: string } }>)

  app
    .use(koaHelmet.default())
    .use(cors())
    .use(router.routes())
    .use(router.allowedMethods())

  return app
}
