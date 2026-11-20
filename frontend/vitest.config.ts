import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: tests must run without generated Wails
// bindings, and the parser needs no plugins. The Svelte plugin is only for the few component
// render tests (src/components/*.test.ts, which opt in to happy-dom).
export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
