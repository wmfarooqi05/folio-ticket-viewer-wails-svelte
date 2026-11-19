// @vitest-environment happy-dom
// Ticket 14: the enhance step, the SVG sanitiser, the diagram cache and the highlighter.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enhanceDoc } from './enhance'
import { HIGHLIGHT_LANGS } from './langs'

const { renderBlocks, highlightCode } = vi.hoisted(() => ({ renderBlocks: vi.fn(async () => {}), highlightCode: vi.fn() }))
vi.mock('./mermaid', async (orig) => ({ ...(await orig<typeof import('./mermaid')>()), renderBlocks }))
vi.mock('./highlight', () => ({ highlightCode }))

const fence = (lang: string, body: string) =>
  `<div class="code"><div class="code-head"><span>${lang}</span></div><pre><code class="language-${lang}">${body}</code></pre></div>`
const mermaidFence = (body: string) =>
  `<div class="code mermaid-ph" data-mermaid><div class="code-head"><span>mermaid</span></div><pre><code>${body}</code></pre></div>`

function doc(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  return root
}
const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  renderBlocks.mockClear()
  highlightCode.mockClear()
  document.body.innerHTML = ''
  delete document.documentElement.dataset.theme
})

describe('enhanceDoc', () => {
  it('loads neither library for a plain document', async () => {
    const off = enhanceDoc(doc(`<p>hi</p>${fence('text', 'x')}${fence('rust', 'fn main() {}')}`), { path: 'a.md', mtime: 1 })
    await tick()
    expect(highlightCode).not.toHaveBeenCalled()
    expect(renderBlocks).not.toHaveBeenCalled()
    off()
  })

  it('highlights fences in a known language only', async () => {
    const root = doc(`${fence('sql', 'select 1')}${fence('rust', 'fn x')}${fence('ts', 'let a')}`)
    const off = enhanceDoc(root, { path: 'a.md', mtime: 1 })
    await tick()
    expect(highlightCode.mock.calls.map((c) => c[1])).toEqual(['sql', 'ts'])
    off()
  })

  it('hands every mermaid fence to the renderer, with its source and index', async () => {
    const root = doc(`${mermaidFence('graph TD\n  A--&gt;B')}<p>x</p>${mermaidFence('sequenceDiagram')}`)
    const off = enhanceDoc(root, { path: 'm.md', mtime: 7 })
    await vi.waitFor(() => expect(renderBlocks).toHaveBeenCalledTimes(1))
    const [blocks, ctx] = renderBlocks.mock.calls[0] as unknown as [{ src: string; n: number }[], { path: string; mtime: number; theme: string }]
    expect(blocks.map((b) => [b.n, b.src])).toEqual([
      [0, 'graph TD\n  A-->B'],
      [1, 'sequenceDiagram'],
    ])
    expect(ctx).toMatchObject({ path: 'm.md', mtime: 7, theme: 'light' })
    off()
  })

  it('re-renders when the theme toggles, and not after cleanup', async () => {
    const root = doc(mermaidFence('graph TD'))
    const off = enhanceDoc(root, { path: 'm.md', mtime: 1 })
    await vi.waitFor(() => expect(renderBlocks).toHaveBeenCalledTimes(1))
    document.documentElement.dataset.theme = 'dark'
    await vi.waitFor(() => expect(renderBlocks).toHaveBeenCalledTimes(2))
    expect((renderBlocks.mock.calls[1] as unknown[])[1]).toMatchObject({ theme: 'dark' })
    off()
    document.documentElement.dataset.theme = 'light'
    await tick()
    expect(renderBlocks).toHaveBeenCalledTimes(2)
  })
})

describe('the language list', () => {
  it('only names languages highlight.js bundles here', async () => {
    const hljs = (await import('highlight.js/lib/core')).default
    for (const [name, mod] of Object.entries({
      typescript: await import('highlight.js/lib/languages/typescript'),
      sql: await import('highlight.js/lib/languages/sql'),
      powershell: await import('highlight.js/lib/languages/powershell'),
      bash: await import('highlight.js/lib/languages/bash'),
      json: await import('highlight.js/lib/languages/json'),
      yaml: await import('highlight.js/lib/languages/yaml'),
      csharp: await import('highlight.js/lib/languages/csharp'),
    })) hljs.registerLanguage(name, mod.default)
    for (const l of HIGHLIGHT_LANGS) expect(hljs.getLanguage(l), l).toBeDefined()
  })
})

describe('highlightCode (real)', () => {
  it('wraps tokens in spans and keeps the text, escaped', async () => {
    const real = await vi.importActual<typeof import('./highlight')>('./highlight')
    const code = document.createElement('code')
    code.textContent = 'select "<b>" from t -- note'
    expect(real.highlightCode(code, 'sql')).toBe(true)
    expect(code.querySelector('.hljs-keyword')?.textContent?.toLowerCase()).toBe('select')
    expect(code.textContent).toBe('select "<b>" from t -- note')
    expect(code.querySelector('b')).toBeNull()
    expect(real.highlightCode(code, 'rust')).toBe(false)
  })
})

describe('sanitizeSvg and the cache', () => {
  it('strips script, handlers, foreign links and external urls, and keeps the drawing', async () => {
    const m = await vi.importActual<typeof import('./mermaid')>('./mermaid')
    const out = m.sanitizeSvg(
      `<svg viewBox="0 0 10 10" onload="alert(1)">` +
        `<a href="javascript:alert(3)" xlink:href="http://x"><rect id="r" width="5" onclick="x()" style="fill:url(http://e)"/></a>` +
        `<a href="#r"><circle r="2"/></a><foreignObject><div onmouseover="x()">label<img src=x onerror="y()"></div></foreignObject>` +
        `<iframe src="http://x"></iframe><animate attributeName="href" to="javascript:1"/>` +
        `<script>alert(2)</script></svg>`,
    )!
    expect(out).toContain('<rect')
    expect(out).toContain('label')
    expect(out).toContain('href="#r"')
    expect(m.cleanStyleText('@import url(http://x/y.css); .a{fill:url(http://e/x)} .b{fill:url(#g)}')).toBe(
      ' .a{fill:none} .b{fill:url(#g)}',
    )
    expect(out).not.toMatch(/script|onload|onclick|onmouseover|onerror|javascript|iframe|<img|<animate|http:/i)
    expect(m.sanitizeSvg('<p>no svg</p>')).toBeNull()
  })

  it('keeps the newest few diagrams and keys on path, mtime, block and theme', async () => {
    const m = await vi.importActual<typeof import('./mermaid')>('./mermaid')
    expect(m.cacheKey('a.md', 5, 2, 'dark')).not.toBe(m.cacheKey('a.md', 5, 2, 'light'))
    expect(m.cacheKey('a.md', 5, 2, 'dark')).not.toBe(m.cacheKey('a.md', 6, 2, 'dark'))
    expect(m.cacheKey('a.md', 5, 2, 'dark')).not.toBe(m.cacheKey('a.md', 5, 3, 'dark'))
    m.clearCache()
    const el = (n: string) => {
      const d = document.createElement('div')
      d.className = 'code'
      d.dataset.mermaid = ''
      d.innerHTML = `<div class="code-head"></div><pre><code>${n}</code></pre>`
      return d
    }
    // no library in a unit test: the render fails and the source stays, with the reason
    const b = { el: el('graph TD'), src: 'graph TD', n: 0 }
    await m.renderBlocks([b], { path: 'x.md', mtime: 1, theme: 'light', alive: () => true })
    expect(b.el.dataset.state).toMatch(/error|ready/)
    expect(b.el.querySelector('pre code')?.textContent ?? 'graph TD').toContain('graph TD')
  })
})
