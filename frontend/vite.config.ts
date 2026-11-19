import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import wails from '@wailsio/runtime/plugins/vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    svelte(),
    wails('./bindings'),
    {
      // The CSP in index.html is the production one. Vite's hot reload needs a loopback websocket.
      name: 'folio-dev-csp',
      apply: 'serve',
      transformIndexHtml: (html: string) =>
        html.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*"),
    },
  ],
})
