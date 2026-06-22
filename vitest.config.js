import { defineConfig } from 'vitest/config'

// Plain-JS unit tests for the data layer — no React plugin needed.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
  },
})
