import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: './src/test/setup.ts',
    testTimeout: 10000,
    // poolOptions: {
    //   threads: { execArgv: ['--env-file=.env.test'] },
    //   // Or another pool:
    //   forks: { execArgv: ['--env-file=.env.test'] },
    // },
  },
})
