// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
// Ticket 19: property tests with a seeded generator (src/lib/fuzz.ts). Hostile Markdown built from
// pieces of HTML, links, schemes and Markdown syntax must render inside the allowlist; the link
// validators must only ever hand out what they promise; the parser must never throw or pollute.
import { describe, expect, it, vi } from 'vitest'
import { forAll, type Rng } from '../fuzz'
import { validateExternalUrl, vscodeUrl } from '../external'
import { buildIndex, parseFile, resolveHref, scanText, updateIndex, type Index } from '../parser'
import { violations } from './allowlist'
import { renderMarkdown, resolveImagePath } from './markdown'
import { sanitizeSvg } from './mermaid'
import { makeUrls } from './urls'

// FOLIO_FUZZ_N scales the runs, so the time limit scales with it
vi.setConfig({ testTimeout: 30_000 * Math.max(1, Number(process.env.FOLIO_FUZZ_N ?? 400) / 400) })

const parse = (html: string) => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html').body

const SCHEMES = ['javascript:', 'JaVaScRiPt:', 'java\tscript:', ' javascript:', 'data:text/html,', 'data:image/svg+xml,', 'vbscript:', 'file:///C:/', 'file://evil/', '\\\\evil\\share\\', '//evil/', 'vscode://file/', 'vscode://vscode.git/clone?url=', 'ms-officecmd:', 'search-ms:', 'mailto:', 'https://', 'http://', 'HTTPS://', 'https:///', 'https://u:p@', '', '#', '/', '../', '..%2f', '%2e%2e/', 'C:/', 'C:', '&#106;avascript:', '&#x6A;avascript:', 'jav&#x09;ascript:']
const TARGETS = ['alert(1)', 'evil.example/x', 'x.md', 'x.png', 'a/b.md#q1', '__proto__', 'constructor#q1', '..', 'CON.png', 'x.png::$DATA', '%5c%5cevil%5cs', 'api%2fevents', '"onmouseover="alert(1)', "'><img src=x onerror=alert(1)>", '<script>', ' "t"', '\u202e', '%00', '?q=<x>', '#//evil']
const TAGS = ['script', 'img', 'svg', 'iframe', 'object', 'embed', 'meta', 'base', 'link', 'style', 'form', 'input', 'button', 'a', 'br', 'div', 'span', 'math', 'mglyph', 'template', 'noscript', 'textarea', 'title', 'xmp', 'details', 'video', 'image', 'use', 'foreignObject', 'table', 'select', 'option', 'p', 'b']
const ATTRS = ['onerror=alert(1)', 'onload="alert(1)"', "onclick='x'", 'src=x', 'href="javascript:alert(1)"', 'xlink:href=//evil', 'id="q1"', "id='a b'", 'style="background:url(//evil)"', 'srcdoc="<script>"', 'data-ext="javascript:alert(1)"', 'data-path="../../x.md"', 'formaction=//evil', 'http-equiv=refresh content="0;url=//evil"', 'autofocus', '/', 'x=">"', '']

function html(r: Rng): string {
  const t = r.pick(TAGS)
  const attrs = Array.from({ length: r.int(3) }, () => r.pick(ATTRS)).join(' ')
  const close = r.int(3) === 0 ? '' : `</${r.int(4) === 0 ? r.pick(TAGS) : t}>`
  return `<${r.int(5) === 0 ? t.toUpperCase() : t}${attrs ? ' ' + attrs : ''}${r.int(4) === 0 ? '/' : ''}>${r.pick(['', 'x', '<!--', '-->', '&lt;/style&gt;'])}${close}`
}

function url(r: Rng): string {
  return r.pick(SCHEMES) + r.pick(TARGETS)
}

function piece(r: Rng): string {
  switch (r.int(14)) {
    case 0:
    case 1:
      return html(r)
    case 2:
      return `[${r.pick(['x', '01', 'hostile 01', '‮gpj.exe', html(r)])}](${url(r)}${r.int(3) === 0 ? ' "t"' : ''})`
    case 3:
      return `![${r.pick(['a', 'b" onerror="x', html(r)])}](${url(r)})`
    case 4:
      return `<${url(r)}>`
    case 5:
      return url(r)
    case 6:
      return `\n[ref${r.int(3)}]: ${url(r)}\n[x][ref${r.int(3)}]`
    case 7:
      return `\n\`\`\`${r.pick(['', 'mermaid', 'typescript', 'html" onload="x', 'x<y'])}\n${html(r)}\n\`\`\`\n`
    case 8:
      return `\n${'#'.repeat(1 + r.int(6))} ${r.pick(['Q1 — x', 'AC1', '<a id="q2"></a>', html(r)])}\n`
    case 9:
      return `\n- ${r.pick(['[ ] ', '[x] ', ''])}${r.pick(['<a id="ac1"></a> **AC1** — x', html(r), 'x'])}\n`
    case 10:
      return `\n| a | ${html(r)} |\n|:-|-:|\n| ${url(r)} | x |\n`
    case 11:
      return r.pick(['&lt;', '&#60;', '&amp;', '&#x3C;script&#x3E;', '\\<', '`', '*', '_', '~~', '>', '\n\n', '\n', '<!-- x -->', '<!-->', '--!>'])
    case 12:
      return r.pick(['hostile 01', 'hostile 01#q1', 'constructor 01', '__proto__ 12', '#ac1', 'AB#123', 'PR 12', '!12'])
    default:
      return r.pick(['text', ' ', 'more text', '\u200b', '\u202e'])
  }
}

function doc(r: Rng): string {
  const fm = r.int(2) === 0 ? `---\n${Array.from({ length: r.int(5) }, () => `${r.pick(['status', 'type', 'blocked_by', 'related', '__proto__', 'constructor', 'superseded_by'])}: ${r.pick(['open', '[01, 02]', '"x"', '[__proto__]', '{a: 1}', '[', '"'])}`).join('\n')}\n---\n` : ''
  return fm + Array.from({ length: 1 + r.int(25) }, () => piece(r)).join(r.pick(['', ' ', '\n']))
}

const urls = makeUrls({ adoWorkItemUrl: 'https://ado.example/wi/{id}', adoPrUrl: 'https://ado.example/pr/{id}' })

describe('fuzz: the sanitiser', () => {
  it('renders random hostile Markdown inside the allowlist', () => {
    forAll('render', (r) => {
      const text = doc(r)
      const path = r.pick(['modules/hostile/issues/01-a.md', 'modules/hostile/map.md', 'handoffs/x.md', 'a.md'])
      const other = { path: 'modules/hostile/issues/02-b.md', text: '# 02\n\n### Q1 — x\n', mtime: 0 }
      const index = buildIndex([{ path, text, mtime: 0 }, other], 'repo')
      const html = renderMarkdown(text, { path, rec: index.files[path], index, urls, skipTitle: r.int(2) === 0 })
      const bad = violations(parse(html))
      if (bad.length) throw new Error(`${JSON.stringify(text)}\n-> ${bad.join(', ')}`)
    })
  })

  it('keeps sanitizeSvg output free of scripts, handlers and outside URLs', () => {
    forAll('svg', (r) => {
      // no <template>: happy-dom's serialiser throws on its content (a happy-dom bug, not ours; the browser
      // run in ticket 19 covers real Chromium parsing)
      const inner = Array.from({ length: 1 + r.int(8) }, () => html(r))
        .join('')
        .replace(/<\/?template\b/gi, '<x-t')
      const out = sanitizeSvg(`<svg id="m">${r.int(2) ? '<foreignObject>' : ''}${inner}</svg>`)
      if (out === null) return
      for (const el of parse(out).querySelectorAll('*')) {
        const tag = el.localName.toLowerCase()
        expect(['script', 'iframe', 'object', 'embed', 'img', 'image', 'meta', 'base', 'link'], out).not.toContain(tag)
        for (const a of el.attributes) {
          expect(a.name, out).not.toMatch(/^on/i)
          if (['href', 'xlink:href', 'src', 'action', 'formaction', 'data'].includes(a.name)) expect(a.value.trim().startsWith('#'), out).toBe(true)
          if (a.name === 'style') expect(a.value, out).not.toMatch(/url\(\s*(?!['"]?#)|expression\(|javascript:/i)
          expect(['srcdoc', 'data-ext', 'data-path', 'data-frag', 'data-broken'], out).not.toContain(a.name)
        }
      }
    })
  })
})

describe('fuzz: image paths', () => {
  it('only ever gives a docs-relative path with no "..", or refuses', () => {
    const parts = ['..', '.', '', 'a', 'b.png', '%2e%2e', '%2E%2e', '..%2f', '%2f', '%5c', '\\', 'C:', '::$DATA', '%00', '~1', 'CON', '?x', '#y', '%', '%zz', 'https:', '//evil', 'file:']
    forAll('image', (r) => {
      const src = Array.from({ length: 1 + r.int(8) }, () => r.pick(parts)).join(r.pick(['/', '\\', '']))
      const from = r.pick(['modules/a/issues/01.md', 'a.md', 'x/y/z/w.md'])
      const p = resolveImagePath(src, from)
      if (p === null || p === 'external') return
      const segs = p.split('/')
      expect(segs, src).not.toContain('..')
      expect(segs, src).not.toContain('')
      expect(p, src).not.toContain('\\')
      // the URL markdown.ts builds stays under /doc/ once a browser has normalised it
      const u = new URL('/doc/' + segs.map(encodeURIComponent).join('/'), 'http://127.0.0.1:1/')
      expect(u.origin + ' ' + u.pathname.startsWith('/doc/'), src).toBe('http://127.0.0.1:1 true')
    })
  })
})

describe('fuzz: the external-link and vscode validators', () => {
  const chunks = ['http', 'https', 'HTTP', 'javascript', 'file', 'vscode', 'ms-officecmd', ':', '//', '/', '\\', '@', 'user:pass@', 'evil.example', '127.0.0.1', '[::1]', 'xn--pypal-4ve.com', '%00', '\0', '\t', '\n', ' ', '?', '#', '<', '>', '"', '`', '{', '|', '^', 'a', '1', '\u202e', 'а', '.', '..', ':80', ':99999']
  it('validateExternalUrl returns an http(s) URL with a host and no credentials, or throws', () => {
    forAll('external', (r) => {
      const input = r.string(chunks, 10)
      let out: string
      try {
        out = validateExternalUrl(input)
      } catch {
        return
      }
      const u = new URL(out)
      expect(['http:', 'https:'], input).toContain(u.protocol)
      expect(u.hostname, input).not.toBe('')
      expect(u.username + u.password, input).toBe('')
      expect(out, input).not.toMatch(/[\0-\x1f\x7f]/)
    }, 4000)
  })

  it('vscodeUrl gives vscode://file/ and nothing a protocol handler could read as more arguments', () => {
    const p = ['C:', 'D:', '\\', '/', 'a b', 'x.md', '#', '?', '%', '&', '"', "'", '<', '>', '|', '^', '`', ' ', '\u202e', 'ü', '..', ':', '$', '+', '=', '@', '\n', '\t', '\0']
    forAll('vscode', (r) => {
      const abs = r.string(p, 12)
      const out = vscodeUrl(abs, r.int(3) - 1)
      expect(out.startsWith('vscode://file/'), abs).toBe(true)
      expect(out, abs).not.toMatch(/[\0-\x20"'<>\\^`{|}#?\x7f]/)
    }, 2000)
  })
})

describe('fuzz: the parser', () => {
  const KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__', 'status', 'type', 'blocked_by', 'related', 'superseded_by', 'waiting_on', 'pr', 'ado']
  const VALUES = ['open', 'closed', '[]', '[01]', '[__proto__, constructor]', '"__proto__"', '{"polluted": true}', '[', ']', '"', "'", '[[[]]]', '1e999', '-0', 'null', '~', 'true', '[a, "b, c]', '\u202e', ' # c', '']
  it('never throws, never pollutes Object.prototype, and resolves only own keys', () => {
    forAll('parser', (r) => {
      const fm = Array.from({ length: r.int(12) }, () => `${r.pick(KEYS)}:${r.pick([' ', '', '  '])}${r.pick(VALUES)}`).join('\n')
      const body = Array.from({ length: r.int(10) }, () => piece(r)).join('\n')
      const text = (r.int(4) ? `---\n${fm}\n${r.int(5) ? '---\n' : ''}` : '') + body
      const path = r.pick(['modules/s/issues/01-a.md', 'modules/s/map.md', 'a.md', 'handoffs/h.md'])
      parseFile({ path, text, mtime: 0 })
      let index: Index = buildIndex([{ path, text, mtime: 0 }], r.pick(['', 'repo', '__proto__', 'constructor']))
      index = updateIndex(JSON.parse(JSON.stringify(index)) as Index, [{ path, text: text + '\n', mtime: 1 }], [])
      for (const href of ['/__proto__#q1', '/constructor', r.pick(TARGETS)]) resolveHref(href, path, index)
      scanText(body, path, index)
      renderMarkdown(text, { path, rec: index.files[path], index })
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(Object.getOwnPropertyNames(Object.prototype).filter((k) => !['constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty', '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable', 'toString', 'valueOf', '__proto__', 'toLocaleString'].includes(k))).toEqual([])
    })
  })
})
