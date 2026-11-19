import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build, defineConfig, type Rollup } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import wails from '@wailsio/runtime/plugins/vite'

/**
 * The cache key for the parser (ticket 09, 05 D2): a hash of the compiled lib.mjs. It
 * builds the library in memory from vite.lib.config.ts, so it needs no prior
 * `npm run build:lib` and no file is written.
 */
async function parserVersion(): Promise<string> {
  const out = (await build({
    configFile: fileURLToPath(new URL('./vite.lib.config.ts', import.meta.url)),
    logLevel: 'silent',
    build: { write: false, emptyOutDir: false },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[]
  const first = (Array.isArray(out) ? out[0] : out).output[0]
  return 'lib-' + createHash('sha1').update(first.code).digest('hex').slice(0, 12)
}

export default defineConfig(async () => ({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  define: { __PARSER_VERSION__: JSON.stringify(await parserVersion()) },
  plugins: [tailwindcss(), svelte(), wails('./bindings')],
}))
