import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: './src/test/setup.ts',
    include: ['./src/test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    testTimeout: 10_000,
    disableConsoleIntercept: true,
    printConsoleTrace: true,
    silent: false,
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  },
})
