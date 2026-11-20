import { defineConfig } from 'vitest/config'

// The contract suite (ticket 24): the same cases against the Go services and the Node server.
// Kept out of `npm test` because it builds the Go harness (cmd/contract-server) and needs Windows
// for the junction case. Run it with `npm run test:contract` or `task test:contract`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['contract/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
