import { defineConfig } from 'vite'

// Builds the parser alone into dist-lib/lib.mjs: no plugins, no imports in the output.
// The upstream CLI drops this file in as scripts/tickets/lib.mjs.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    lib: {
      entry: 'src/lib/parser/index.ts',
      formats: ['es'],
      fileName: () => 'lib.mjs',
    },
  },
})
