import { ServerType } from '@hono/node-server'
import { getLogger } from '@logtape/logtape'
import * as css from '@solid/community-server'
import * as dotenv from 'dotenv'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { AppConfig } from '../app.js'
import { start } from '../server.js'
import { createRandomAccount, getRandomPort } from './helpers/index.js'
import type { Person } from './helpers/types.js'

const logger = getLogger(['soap-tests', 'setup'])

dotenv.config({ path: '.env.test' })
const __dirname = dirname(fileURLToPath(import.meta.url))

const appConfig: AppConfig = {
  isBehindProxy: false,
  port: -1,
  baseUrl: '',
}

let server: ServerType
let person: Person
let person2: Person
let cssServer: css.App
const testConfig = {
  cssPort: -1,
  cssUrl: '',
}

beforeAll(() => {
  testConfig.cssPort = getRandomPort()
  testConfig.cssUrl = `http://localhost:${testConfig.cssPort}`

  appConfig.port = getRandomPort()
  appConfig.baseUrl = `http://localhost:${appConfig.port}`
})

beforeAll(async () => {
  const start = Date.now()
  logger.info('Starting CSS server')
  // Community Solid Server (CSS) set up following example in https://github.com/CommunitySolidServer/hello-world-component/blob/main/test/integration/Server.test.ts
  cssServer = await new css.AppRunner().create({
    loaderProperties: {
      mainModulePath: css.joinFilePath(__dirname, '../../'), // ?
      typeChecking: false, // ?
      dumpErrorState: false, // disable CSS error dump
    },
    config: css.joinFilePath(__dirname, './css-default-config.json'), // CSS appConfig
    variableBindings: {},
    // CSS cli options
    // https://github.com/CommunitySolidServer/CommunitySolidServer/tree/main#-parameters
    shorthand: {
      port: testConfig.cssPort,
      loggingLevel: 'off',
      baseUrl: testConfig.cssUrl,
      // seedConfig: css.joinFilePath(__dirname, './css-pod-seed.json'), // set up some Solid accounts
    },
  })
  await cssServer.start()

  logger.info(
    `CSS server started on port ${testConfig.cssPort} in ${(Date.now() - start) / 1000} seconds`,
  )
}, 60000)

afterAll(async () => {
  await cssServer.stop()
})

beforeAll(async () => {
  server = start(appConfig)
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

/**
 * Before each test, create a new account and authenticate to it
 */
beforeEach(async () => {
  person = await createRandomAccount({ solidServer: testConfig.cssUrl })
  person2 = await createRandomAccount({ solidServer: testConfig.cssUrl })
}, 20000)

export { appConfig, person, person2, testConfig }
