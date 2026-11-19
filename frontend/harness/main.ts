// Dev-only page: Tree and DocView over fixtures/docs, with no Wails. It exists so the
// document view can be screenshotted in a plain Chromium, for example with the GPU off:
//   npx vite --config vite.harness.config.ts
//   msedge --headless --disable-gpu --disable-gpu-compositing --window-size=1440,2400 \
//     --screenshot=out.png "http://127.0.0.1:9246/harness/index.html?doc=<path>&theme=dark"
// It is not part of the production build (vite.config.ts builds index.html only).
import '../src/app.css'
import { mount } from 'svelte'
import { buildIndex } from '../src/lib/parser'
import { applyTheme } from '../src/lib/theme/theme'
import Harness from './Harness.svelte'

const raw = import.meta.glob('../../fixtures/docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const texts: Record<string, string> = {}
for (const [k, v] of Object.entries(raw)) texts[k.replace('../../fixtures/docs/', '')] = v
const index = buildIndex(Object.entries(texts).map(([path, text]) => ({ path, text, mtime: Date.now() - 12 * 86_400_000 })))

const q = new URLSearchParams(location.search)
applyTheme((q.get('theme') as 'light' | 'dark' | 'system') ?? 'light')
mount(Harness, {
  target: document.getElementById('app')!,
  props: { index, texts, start: q.get('doc') ?? 'modules/remove-service-account/issues/02-cutover.md' },
})
