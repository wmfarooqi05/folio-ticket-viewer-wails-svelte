import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { elkStub, parserVersion } from './vite.shared'

// The browser build for web mode (ticket 24). Same app as the desktop build, with two differences:
//  - lib/backend.ts is swapped for lib/backend-http.ts, so @wailsio/runtime and the generated
//    bindings are never imported (no wails plugin, and the output has no trace of them);
//  - it goes to ../packages/folio-viewer/dist, the folder the npm package ships.
// The desktop build (vite.config.ts) is untouched.
export default defineConfig(async () => ({
  resolve: {
    alias: [
      {
        find: /^\.\/backend$/,
        replacement: fileURLToPath(new URL('./src/lib/backend-http.ts', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: '../packages/folio-viewer/dist',
    emptyOutDir: true,
  },
  define: { __PARSER_VERSION__: JSON.stringify(await parserVersion()) },
  plugins: [elkStub, tailwindcss(), svelte()],
}))
