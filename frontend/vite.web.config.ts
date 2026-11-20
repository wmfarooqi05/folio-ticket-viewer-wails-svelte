import { existsSync, renameSync, rmSync } from 'node:fs'
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
    // The manifest feeds scripts/size-check.mjs (ticket 26: it checks this bundle by default).
    manifest: true,
  },
  define: { __PARSER_VERSION__: JSON.stringify(await parserVersion()) },
  plugins: [
    elkStub,
    {
      // Vite writes the manifest into dist/.vite, and dist/ is what `npm publish` ships. Move it to
      // frontend/.vite-web (gitignored) once the bundle is written; size-check.mjs reads it there.
      name: 'folio-manifest-out',
      apply: 'build',
      closeBundle() {
        const from = fileURLToPath(new URL('../packages/folio-viewer/dist/.vite', import.meta.url))
        const to = fileURLToPath(new URL('./.vite-web', import.meta.url))
        if (!existsSync(from)) return
        rmSync(to, { recursive: true, force: true })
        renameSync(from, to)
      },
    },
    tailwindcss(),
    svelte(),
  ],
}))
