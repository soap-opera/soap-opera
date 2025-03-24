import * as dotenv from 'dotenv'
import { afterAll, beforeAll, beforeEach } from 'vitest'

dotenv.config({ path: '.env.test' })

import * as css from '@solid/community-server'
import { IncomingMessage, Server, ServerResponse } from 'http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRandomAccount, getRandomPort } from './helpers/index.js'
import type { Person } from './helpers/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let server: Server<typeof IncomingMessage, typeof ServerResponse>
let person: Person
let person2: Person
let person3: Person
let cssServer: css.App
const testConfig = {
  cssPort: -1,
  cssUrl: '',
}

beforeAll(() => {
  testConfig.cssPort = getRandomPort()
  testConfig.cssUrl = `http://localhost:${testConfig.cssPort}`
})

beforeAll(async () => {
  const start = Date.now()

  // eslint-disable-next-line no-console
  console.log('Starting CSS server')
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
      // seedConfig: css.joinFilePath(__dirname, './css-pod-seed.json'), // set up some Solid accounts
    },
  })
  await cssServer.start()

  // eslint-disable-next-line no-console
  console.log(
    'CSS server started on port',
    testConfig.cssPort,
    'in',
    (Date.now() - start) / 1000,
    'seconds',
  )
}, 60000)

afterAll(async () => {
  await cssServer.stop()
})

/**
 * Before each test, create a new account and authenticate to it
 */
beforeEach(async () => {
  person = await createRandomAccount({ solidServer: testConfig.cssUrl })
  person2 = await createRandomAccount({ solidServer: testConfig.cssUrl })
  person3 = await createRandomAccount({ solidServer: testConfig.cssUrl })
}, 20000)

export { person, person2, testConfig }
