import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// The dev-only harness (harness/main.ts): no Wails plugin, fixtures read from the repo root.
export default defineConfig({
  server: { host: '127.0.0.1', port: 9246, strictPort: true, fs: { allow: ['..'] } },
  plugins: [tailwindcss(), svelte()],
})
