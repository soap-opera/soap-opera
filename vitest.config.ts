import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: './src/test/setup.ts',
    testTimeout: 15000,
    disableConsoleIntercept: true,
    printConsoleTrace: true,
    silent: false,
  },
})
