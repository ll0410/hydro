import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/fixtures/**'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
      },
    },
  },
})
