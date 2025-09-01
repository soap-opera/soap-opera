import { bodyParser } from '@koa/bodyparser'
import cors from '@koa/cors'
import Router from '@koa/router'
import { solidIdentity } from '@soid/koa'
import Koa from 'koa'
import koaHelmet from 'koa-helmet'
import {
  allowOwner,
  solidAuth,
  verifyHttpSignature,
} from './middlewares/auth.js'
import { readFollowers } from './middlewares/followers.js'
import { readFollowing } from './middlewares/following.js'
import { processActivity } from './middlewares/inbox.js'
import { loadConfig } from './middlewares/loadConfig.js'
import { processActivity as processOutboxActivity } from './middlewares/outbox.js'
import { setupDocs } from './middlewares/setupDocs.js'
import { validateActivity } from './middlewares/validateActivity.js'
import { Actor, validateOwner } from './middlewares/validateOwner.js'
import { configureLog } from './utils/log.js'

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
    .post(
      '/users/:actor/inbox',
      verifyHttpSignature,
      validateActivity,
      validateOwner,
      processActivity,
    )
    .post<
      {
        user: { webId: string }
        owner: { webId: string; actor: Actor }
        config: AppConfig
      },
      { params: { actor: string } }
    >(
      '/users/:actor/outbox',
      solidAuth,
      validateOwner,
      allowOwner,
      processOutboxActivity,
    )
    .get('/users/:actor/followers', validateOwner, readFollowers)
    .get('/users/:actor/following', validateOwner, readFollowing)
    .get('/', setupDocs)

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
