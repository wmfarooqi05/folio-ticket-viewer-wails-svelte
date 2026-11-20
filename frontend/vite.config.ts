import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import wails from '@wailsio/runtime/plugins/vite'
import { elkStub, parserVersion } from './vite.shared'

export default defineConfig(async () => ({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  // The manifest feeds scripts/size-check.mjs. It goes outside dist/ so it is not embedded in the exe.
  build: { manifest: true },
  define: { __PARSER_VERSION__: JSON.stringify(await parserVersion()) },
  plugins: [
    elkStub,
    {
      // Vite writes the manifest into dist/.vite, which main.go would embed in the exe. Move it to
      // frontend/.vite (gitignored) once the bundle is written; size-check.mjs reads it there.
      name: 'folio-manifest-out',
      apply: 'build',
      closeBundle() {
        const from = fileURLToPath(new URL('./dist/.vite', import.meta.url))
        const to = fileURLToPath(new URL('./.vite', import.meta.url))
        if (!existsSync(from)) return
        rmSync(to, { recursive: true, force: true })
        renameSync(from, to)
      },
    },
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
}))
