import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: tests must run without generated Wails
// bindings, and the parser needs no plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
