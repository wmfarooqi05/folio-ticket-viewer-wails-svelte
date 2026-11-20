// @vitest-environment happy-dom
// Ticket 19: the hostile corpus (fixtures/hostile) through the real pipeline: parser, markdown-it, the
// sanitiser. Nothing outside the allowlist may survive and no URL outside #, /doc/ and http(s) may be made.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildIndex, extractFragment, type Index, type SourceFile } from '../parser'
import { readDocsRoot } from '../parser/node'
import { violations } from './allowlist'
import { renderMarkdown } from './markdown'
import { sanitizeSvg } from './mermaid'
import { makeUrls } from './urls'
import { validateExternalUrl } from '../external'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const hostileRoot = join(repo, 'fixtures', 'hostile', 'docs')
const normalRoot = join(repo, 'fixtures', 'docs')

let hostile: SourceFile[]
let index: Index

beforeAll(async () => {
  hostile = await readDocsRoot(hostileRoot)
  index = buildIndex(hostile, 'hostile-repo')
})

const parse = (html: string) => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html').body

// an ADO template, so the ADO link path is exercised too (only https templates are ever accepted)
const urls = makeUrls({ adoWorkItemUrl: 'https://ado.example/wi/{id}', adoPrUrl: 'https://ado.example/pr/{id}' })

describe('the hostile corpus', () => {
  it('has the files the README lists', () => {
    expect(hostile.map((f) => f.path).sort()).toEqual([
      'modules/hostile/issues/01-html-svg.md',
      'modules/hostile/issues/02-mermaid.md',
      'modules/hostile/issues/03-schemes.md',
      'modules/hostile/issues/04-paths.md',
      'modules/hostile/issues/05-labels.md',
      'modules/hostile/issues/06-frontmatter-bomb.md',
      'modules/hostile/issues/07-nesting.md',
      'modules/hostile/issues/08-escape-links.md',
      'modules/hostile/map.md',
    ])
  })

  it('indexes without throwing and without touching Object.prototype', () => {
    expect(Object.keys(index.files)).toHaveLength(hostile.length)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain('polluted')
  })

  it.each(['01-html-svg', '02-mermaid', '03-schemes', '04-paths', '05-labels', '06-frontmatter-bomb', '07-nesting', '08-escape-links'])('%s renders inside the allowlist', (name) => {
    const path = `modules/hostile/issues/${name}.md`
    const f = hostile.find((x) => x.path === path)!
    for (const skipTitle of [false, true]) {
      const html = renderMarkdown(f.text, { path, rec: index.files[path], index, urls, skipTitle })
      expect(violations(parse(html)), `${name} skipTitle=${skipTitle}`).toEqual([])
    }
  })

  it('renders the map and every item fragment inside the allowlist', () => {
    const map = hostile.find((x) => x.path.endsWith('map.md'))!
    expect(violations(parse(renderMarkdown(map.text, { path: map.path, rec: index.files[map.path], index, urls })))).toEqual([])
    for (const f of hostile) {
      const rec = index.files[f.path]
      for (const it of rec.items) {
        const range = extractFragment(f.text, rec, it.id)
        if (!range) continue
        expect(violations(parse(renderMarkdown(f.text, { path: f.path, rec, index, urls, range }))), `${f.path}#${it.id}`).toEqual([])
      }
    }
  })

  it('makes no element that can fetch or run anything: only /doc/ images and # links', () => {
    for (const f of hostile) {
      const body = parse(renderMarkdown(f.text, { path: f.path, rec: index.files[f.path], index, urls }))
      for (const sel of ['script', 'iframe', 'object', 'embed', 'meta', 'base', 'link', 'style', 'form', 'svg', 'math', 'video', 'audio', 'template', 'noscript'])
        expect(body.querySelector(sel), `${f.path} <${sel}>`).toBeNull()
      for (const img of body.querySelectorAll('img')) expect(img.getAttribute('src'), f.path).toMatch(/^\/doc\//)
      for (const a of body.querySelectorAll('a[href]')) expect(a.getAttribute('href'), f.path).toBe('#')
      for (const el of body.querySelectorAll('*')) for (const a of el.attributes) expect(a.name, f.path).not.toMatch(/^on/i)
    }
  })

  it('shows refused schemes as inert text, never as a link the click handler would open', () => {
    const path = 'modules/hostile/issues/03-schemes.md'
    const body = parse(renderMarkdown(hostile.find((x) => x.path === path)!.text, { path, rec: index.files[path], index, urls }))
    const ext = [...body.querySelectorAll('[data-ext]')].map((a) => a.getAttribute('data-ext')!)
    expect(ext.length).toBeGreaterThan(0)
    for (const u of ext) expect(u).toMatch(/^https?:\/\//i)
    // the javascript:, file:, vscode:, ms-* and UNC links are text, spans or disabled anchors
    const opens = new Set([...body.querySelectorAll('[data-ext]')].map((a) => a.textContent))
    for (const label of ['javascript', 'data html', 'vbscript', 'file local', 'file unc', 'vscode open', 'vscode git clone', 'ms-officecmd', 'ms-msdt', 'search-ms', 'ms-word', 'unc backslash', 'unc forward', 'smb'])
      expect(opens.has(label), label).toBe(false)
    for (const label of ['http', 'https', 'ip', 'localhost']) expect(opens.has(label), label).toBe(true)
    // these carry data-ext, but the click handler's validateExternalUrl refuses them
    for (const label of ['credentials', 'no host']) {
      const a = [...body.querySelectorAll('[data-ext]')].find((x) => x.textContent === label)!
      expect(() => validateExternalUrl(a.getAttribute('data-ext')!), label).toThrow()
    }
  })

  it('keeps every image path inside the docs root, or refuses it', () => {
    const path = 'modules/hostile/issues/04-paths.md'
    const body = parse(renderMarkdown(hostile.find((x) => x.path === path)!.text, { path, rec: index.files[path], index, urls }))
    const srcs = [...body.querySelectorAll('img')].map((i) => i.getAttribute('src')!)
    for (const s of srcs) {
      const rel = decodeURIComponent(s.slice('/doc/'.length))
      // what the server's safeJoin will see: no part may be "..", and a ":" or a device name is refused there
      expect(rel.split(/[/\\]/), s).not.toContain('..')
      expect(rel.startsWith('/') || rel.startsWith('\\'), s).toBe(false)
    }
    // every one is a request to this origin under /doc/ ("//evil.example/x.png" is the docs-relative evil.example/x.png)
    for (const s of srcs) {
      const u = new URL(s, 'http://127.0.0.1:1/')
      expect(u.origin, s).toBe('http://127.0.0.1:1')
      expect(u.pathname.startsWith('/doc/'), s).toBe(true)
    }
    // and the network ones became placeholders or links, not images
    for (const bad of ['\\\\', 'file:', 'smb:', 'https:', 'HTTPS:']) expect(srcs.some((s) => decodeURIComponent(s).includes(bad)), bad).toBe(false)
  })

  it('the allowlist is not too tight: the normal fixtures render inside it too', async () => {
    const files = await readDocsRoot(normalRoot)
    const idx = buildIndex(files)
    for (const f of files.filter((x) => idx.files[x.path])) expect(violations(parse(renderMarkdown(f.text, { path: f.path, rec: idx.files[f.path], index: idx, urls }))), f.path).toEqual([])
  })
})

describe('sanitizeSvg with hostile SVG', () => {
  const cases = [
    '<svg id="m" onload="alert(1)"><script>alert(2)</script><g onclick="alert(3)"><text>x</text></g></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a><a xlink:href="https://evil.example/x"><text>y</text></a><a href="#ok"><text>z</text></a></svg>',
    '<svg><image href="https://evil.example/i.png"/><use href="https://evil.example/u.svg#a"/><use href="#local"/></svg>',
    '<svg><foreignObject><div><img src="https://evil.example/fo.png" onerror="alert(1)"><iframe src="https://evil.example/f"></iframe><a href="https://evil.example" data-ext="https://evil.example" data-path="x.md">l</a></div></foreignObject></svg>',
    '<svg><style>@import url(https://evil.example/i.css); .a{fill:url(https://evil.example/f)} .b{fill:url(#grad)}</style><rect style="fill:url(https://evil.example/s)"/><rect style="fill:url(#g)"/></svg>',
    '<svg><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onmouseover" to="alert(1)"/></svg>',
    '<svg><foreignObject><form action="https://evil.example"><input formaction="https://evil.example" onfocus="alert(1)" autofocus></form><meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="prefetch" href="https://evil.example"><base href="https://evil.example/"></foreignObject></svg>',
    '<svg><foreignObject><div style="background:url(//evil.example/a)">x</div><div style="width:expression(alert(1))">y</div><iframe srcdoc="<script>alert(1)</script>"></iframe></foreignObject></svg>',
  ]
  it.each(cases)('cleans %s', (svg) => {
    const out = sanitizeSvg(svg)!
    const body = parse(out)
    for (const el of body.querySelectorAll('*')) {
      const tag = el.localName.toLowerCase()
      expect(['script', 'iframe', 'image', 'img', 'animate', 'set', 'meta', 'link', 'base', 'object', 'embed']).not.toContain(tag)
      for (const a of el.attributes) {
        expect(a.name).not.toMatch(/^on/i)
        if (['href', 'xlink:href', 'src', 'action', 'formaction', 'data'].includes(a.name)) expect(a.value.trim().startsWith('#'), `${tag} ${a.name}=${a.value}`).toBe(true)
        if (a.name === 'style') expect(a.value).not.toMatch(/url\(\s*(?!['"]?#)|expression\(/i)
        expect(['data-ext', 'data-path', 'srcdoc']).not.toContain(a.name)
      }
      if (tag === 'style') expect(el.textContent).not.toMatch(/@import|url\(\s*(?!['"]?#)/i)
    }
  })
})
