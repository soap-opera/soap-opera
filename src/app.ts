import { bodyParser } from '@koa/bodyparser'
import cors from '@koa/cors'
import Router from '@koa/router'
import Koa from 'koa'
import koaHelmet from 'koa-helmet'
import { verifyHttpSignature } from './middlewares/auth.js'
import { processActivity } from './middlewares/inbox.js'
import { validateActivity } from './middlewares/validate.js'
import { configureLog } from './utils/log.js'

export interface AppConfig {
  isBehindProxy: boolean
  port: number
  baseUrl: string
}

export const createApp = async (config: AppConfig) => {
  await configureLog()

  const app = new Koa()

  app.proxy = config.isBehindProxy
  const router = new Router()

  router.post(
    '/users/:username/inbox',
    verifyHttpSignature,
    validateActivity,
    processActivity,
  )

  app
    .use(koaHelmet.default())
    .use(cors())
    .use(
      bodyParser({
        enableTypes: [/*'text',*/ 'json'],
        extendTypes: {
          json: [
            'application/ld+json',
            'application/json',
            'application/activity+json',
          ],
          // text: ['text/turtle'],
        },
        encoding: 'utf-8',
      }),
    )
    .use(router.routes())
    .use(router.allowedMethods())

  return app
}
