import { configure, getConsoleSink } from '@logtape/logtape'
import { AsyncLocalStorage } from 'node:async_hooks'

// https://fedify.dev/manual/log#setting-up-logtape
export const configureLog = async () => {
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [
      { category: 'soap-opera', sinks: ['console'], lowestLevel: 'debug' },
      { category: 'fedify', sinks: ['console'], lowestLevel: 'error' },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
  })
}
