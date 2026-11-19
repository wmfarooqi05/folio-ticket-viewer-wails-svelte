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
  plugins: [
    {
      // Mermaid registers the ELK layout by default, and elkjs is 466 KB gzip on its own (ticket 14,
      // AC2). Diagrams use dagre (mermaid.ts pins it); a stub keeps the elk chunk to a few bytes.
      name: 'folio-no-elk',
      enforce: 'pre',
      resolveId: (id) => (id === 'elkjs/lib/elk.bundled.js' ? '\0folio-elk-stub' : null),
      load: (id) =>
        id === '\0folio-elk-stub'
          ? "export default class ELK { constructor() { throw new Error('the ELK layout is not bundled') } }"
          : null,
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
