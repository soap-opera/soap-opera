import { bodyParser } from '@koa/bodyparser'
import cors from '@koa/cors'
import Router from '@koa/router'
import { solidIdentity } from '@soid/koa'
import Koa, { Context } from 'koa'
import koaHelmet from 'koa-helmet'
import { allowOwner, solidAuth } from './middlewares/auth.js'
import { ContextData, federation } from './middlewares/federation.js'
import { integrateFederation } from './middlewares/fedify-koa-integration.js'
import { loadConfig } from './middlewares/loadConfig.js'
import { processActivity as processOutboxActivity } from './middlewares/outbox.js'
import { setupDocs } from './middlewares/setupDocs.js'
import { validateOwner } from './middlewares/validateOwner.js'
import { configureLog } from './utils/log.js'
import { Actor } from './validation/owner.js'

export interface AppConfig {
  isBehindProxy: boolean
  port: number
  baseUrl: string
}

await configureLog()

export const createApp = async (config: AppConfig) => {
  const app = new Koa()

  app.proxy = config.isBehindProxy
  const router = new Router()

  router
    .use(solidIdentity('https://example.com', config.baseUrl).routes())
    .get('/', setupDocs)
    .all('/users/:actor/(.+)', validateOwner)
    .all(
      '/users/:actor/(.+)',
      integrateFederation<ContextData>(federation, (ctx: Context) => ({
        config,
        owner: ctx.state.owner.actor,
      })),
    )
    .post<
      {
        user: { webId: string }
        owner: { webId: string; actor: Actor }
        config: AppConfig
      },
      { params: { actor: string } }
    >('/users/:actor/outbox', solidAuth, allowOwner, processOutboxActivity)

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
    .use(loadConfig(config))
    .use(router.routes())
    .use(router.allowedMethods())

  return app
}
