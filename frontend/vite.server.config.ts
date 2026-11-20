import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Bundles the Node server (src/server) into one file, folio-web.mjs, for the npm package. It imports
// Node built-ins only, so the output has no dependencies and runs with plain `node`.
const pkg = JSON.parse(readFileSync(new URL('../packages/folio-viewer/package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  publicDir: false,
  define: { __FOLIO_VERSION__: JSON.stringify(pkg.version) },
  build: {
    ssr: 'src/server/bin.ts',
    outDir: '../packages/folio-viewer',
    emptyOutDir: false, // dist/ (the frontend) lives in the same folder
    target: 'node20',
    minify: false, // readable, and it is 30 KB
    rollupOptions: {
      external: [...builtinModules, /^node:/],
      output: { format: 'es', entryFileNames: 'folio-web.mjs', banner: '#!/usr/bin/env node' },
    },
  },
  ssr: { noExternal: true },
})
