import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildIndex, type Index, type SourceFile } from '../parser'
import { readDocsRoot } from '../parser/node'
import { imagePlaceholder, prepare, renderMarkdown, resolveImagePath } from './markdown'
import { escapeHtml, renderHtmlBlock, renderInlineHtml } from './sanitize'
import { makeUrls } from './urls'

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'docs')

let files: SourceFile[]
let index: Index

beforeAll(async () => {
  files = await readDocsRoot(docsRoot)
  index = buildIndex(files)
})

function render(path: string, opts: { skipTitle?: boolean; ado?: boolean } = {}): string {
  const rec = index.files[path]
  const text = readFileSync(join(docsRoot, path), 'utf8')
  const urls = opts.ado ? makeUrls({ adoWorkItemUrl: 'https://ado.example/wi/{id}' }) : undefined
  return renderMarkdown(text, { path, rec, index, urls, skipTitle: opts.skipTitle })
}

/** Renders an ad-hoc document inside the fixture index (as if it lived at `path`). */
function renderText(text: string, path = 'modules/remove-service-account/issues/99-test.md'): string {
  const idx = buildIndex([...files, { path, text, mtime: 0 }])
  return renderMarkdown(text, { path, rec: idx.files[path], index: idx })
}

const RSA = 'modules/remove-service-account/issues/'
const CHW = 'modules/cash-handling-workflow/'

describe('AC1: anchors on their own line above a heading', () => {
  it('closed form: no empty paragraph, the heading carries the anchor', () => {
    const html = render(RSA + '05-grill-uat-schedule.md')
    expect(html).toMatch(/<h3 data-anchor="q1" class="item-h" data-state="open"><span class="idtag">Q1<\/span>Which jobs run on UAT<\/h3>/)
    expect(html).not.toContain('<p></p>')
    expect(html).not.toContain('&lt;a id')
  })

  it('unclosed form: the heading below is not swallowed as raw HTML', () => {
    const html = render(RSA + '11-vnet-rule.md')
    expect(html).toMatch(/<h3 data-anchor="q1"[^>]*><span class="idtag">Q1<\/span>/)
    expect(html).not.toContain('&lt;a id')
    expect(html).not.toContain('raw-html')
  })

  it('prepare() blanks the line instead of cutting it, so token.map stays a file line', () => {
    const rec = index.files[RSA + '05-grill-uat-schedule.md']
    const src = readFileSync(join(docsRoot, RSA + '05-grill-uat-schedule.md'), 'utf8')
    const out = prepare(src, rec, false)
    expect(out.split('\n').length).toBe(src.split(/\r?\n/).length)
    expect(out).not.toContain('<a id="q1"></a>\n###')
    // frontmatter is blanked too
    expect(out.split('\n').slice(0, rec.bodyLine - 1).every((l) => l === '')).toBe(true)
  })

  it('leaves an anchor inside a code fence alone', () => {
    const html = renderText('# T\n\n```\n<a id="x">\n```\n')
    expect(html).toContain('&lt;a id=&quot;x&quot;&gt;')
  })
})

describe('AC1: duplicate Q35 headings', () => {
  const path = CHW + 'step2b-payment-identification/issues/41-grill-payment-ids.md'

  it('both headings render, each with its own data-anchor (no id collision)', () => {
    const html = render(path)
    const h3 = [...html.matchAll(/<h3 data-anchor="([^"]+)"[^>]*>(.*?)<\/h3>/g)]
    expect(h3.map((m) => m[1])).toEqual(['q35', 'q35-answered--2026-10-14'])
    // the follow-up is not an item, so it has no id tag and keeps its text
    expect(h3[1][2]).toBe('Q35 answered — 2026-10-14')
    expect(h3[0][2]).toContain('<span class="idtag">Q35</span>')
    expect(html).not.toMatch(/\sid="/)
  })

  it('the first heading is the item and gets the id tag', () => {
    const html = render(path)
    expect(html).toMatch(/data-anchor="q35"[^>]*><span class="idtag">Q35<\/span>/)
  })
})

describe('AC1: links', () => {
  it('remove-service-account 07: ../notes/gone.md is the broken state (clickable: data-broken, no real href); cross-space links resolve', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(RSA + '07-'))!
    const html = render(path)
    expect(html).toMatch(
      /<a class="lk lk-broken" href="#" data-broken="no-file" data-path="modules\/remove-service-account\/notes\/gone\.md" title="Not found: modules\/remove-service-account\/notes\/gone\.md">/,
    )
    expect(html).not.toMatch(/href="[^"]*gone\.md/)
    // an internal link that works is a marker, not a real href
    expect(html).toMatch(/<a class="lk" href="#" data-path="modules\/one-cash-mover\/issues\/05-[^"]+\.md" data-frag="q3"/)
  })

  it('cash-handling-workflow 16: 15-gone-ticket.md is broken', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(CHW + 'issues/16-'))!
    expect(render(path)).toContain('lk-broken')
  })

  it('a missing anchor in an existing file is broken with its own message', () => {
    const html = renderText('[x](./05-grill-uat-schedule.md#nope)')
    expect(html).toMatch(/lk-broken[^>]*title="No item #nope in modules\/remove-service-account\/issues\/05-grill-uat-schedule\.md"/)
  })

  it('external http links are markers handled by one listener, never real hrefs', () => {
    const html = renderText('[site](https://example.com/a?b=1&c=2)')
    expect(html).toContain('<a class="lk lk-ext" href="#" data-ext="https://example.com/a?b=1&amp;c=2"')
    expect(html).not.toContain('href="https://')
  })

  it('bad schemes are broken; javascript: and file: never become links', () => {
    expect(renderText('[a](ftp://host/file)')).toContain('lk-broken')
    for (const bad of ['javascript:alert(1)', 'file:///c:/x', 'vbscript:x', 'data:text/html,x']) {
      const html = renderText(`[a](${bad})`)
      expect(html).not.toMatch(/<a[^>]*(href|data-ext)=/)
    }
  })

  it('mailto and vscode pass the contract but are inert (the shell opens http and https only)', () => {
    const html = renderText('[m](mailto:a@b.co) [v](vscode://file/x)')
    expect(html.match(/lk-inert/g)).toHaveLength(2)
    expect(html).not.toContain('data-ext')
  })

  it('a bare #fragment stays in the document', () => {
    const html = renderText('# T\n\n## Why\n\n[up](#why)')
    expect(html).toContain('data-frag="why"')
    expect(html).not.toContain('data-path')
  })

  it('a link that leaves the docs root is plain text with a title', () => {
    const html = renderText('[x](../../../../outside.md)')
    expect(html).toContain('<span class="lk lk-outside"')
    expect(html).not.toContain('<a ')
  })

  it('closers match: nested emphasis inside a link keeps the markup balanced', () => {
    const html = renderText('[**bold** and `code`](https://example.com) after [gone](missing.md) end')
    expect(html.match(/<a /g)).toHaveLength(2)
    expect(html.match(/<\/a>/g)).toHaveLength(2)
  })
})

describe('AC1: images', () => {
  it('a relative image becomes /doc/<docs-relative path>, lazy, with the as-written href kept', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(RSA + '02-'))!
    const html = render(path)
    expect(html).toMatch(/<img class="doc-img" src="\/doc\/modules\/remove-service-account\/issues\/evidence\/02-lastused-before\.png"[^>]*data-href="evidence\/02-lastused-before\.png" loading="lazy">/)
  })

  it('the placeholder for a missing image names the path as written', () => {
    const html = imagePlaceholder('evidence/02-lastused-before.png')
    expect(html).toContain('evidence/02-lastused-before.png')
    expect(html).toContain('Not in this checkout')
  })

  it('image path resolution is relative to the document, and cannot leave the root', () => {
    const from = 'modules/a/issues/01-x.md'
    expect(resolveImagePath('evidence/a b.png', from)).toBe('modules/a/issues/evidence/a b.png')
    expect(resolveImagePath('../img/p.png?raw=1#x', from)).toBe('modules/a/img/p.png')
    expect(resolveImagePath('/modules/a/p.png', from)).toBe('modules/a/p.png')
    expect(resolveImagePath('..\\..\\p.png', from)).toBe('modules/p.png')
    expect(resolveImagePath('../../../../p.png', from)).toBeNull()
    expect(resolveImagePath('data:image/png;base64,AAAA', from)).toBeNull()
    expect(resolveImagePath('https://x.test/p.png', from)).toBe('external')
  })

  it('an external image is a link, never an <img>; an encoded path stays encoded', () => {
    const ext = renderText('![logo](https://x.test/p.png)')
    expect(ext).not.toContain('<img')
    expect(ext).toContain('data-ext="https://x.test/p.png"')
    const spaced = renderText('![a](evidence/a%20b.png)')
    expect(spaced).toContain('src="/doc/modules/remove-service-account/issues/evidence/a%20b.png"')
  })

  it('an image that leaves the root gets the placeholder, not a request', () => {
    const html = renderText('![x](../../../../../etc/p.png)')
    expect(html).not.toContain('<img')
    expect(html).toContain('img-missing')
  })
})

describe('AC1: plain-text references', () => {
  it('"cloud-migration 07" is autolinked (remove-service-account 07)', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(RSA + '07-'))!
    const html = render(path)
    const target = index.tickets['cloud-migration 07']
    expect(html).toMatch(new RegExp(`<a class="lk" href="#" data-path="${target}"[^>]*>cloud-migration 07</a>`))
  })

  it('"cash-movement-engine ticket 08" is autolinked as one link', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(CHW + 'issues/14-'))!
    const html = render(path)
    expect(html).toMatch(/>cash-movement-engine ticket 08<\/a>/)
  })

  it('"ticket 77" names no ticket, so it stays plain text; "ticket 01" in a space resolves', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(CHW + 'issues/22-'))!
    const html = render(path)
    expect(html).toContain('with ticket 77')
    expect(html).not.toMatch(/ticket 77<\/a>/)
    const ocm = Object.keys(index.files).find((p) => p.startsWith('modules/one-cash-mover/issues/06-'))!
    expect(render(ocm)).toMatch(/>ticket 01<\/a>/)
  })

  it('card 84997 is plain mono text without a template, a link with one; 5 digits alone never link', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(RSA + '10-'))!
    const plain = render(path)
    expect(plain).toContain('<span class="ref-plain">card 84997</span>')
    expect(plain).not.toContain('84997</a>')
    const linked = render(path, { ado: true })
    expect(linked).toContain('data-ext="https://ado.example/wi/84997"')
    expect(linked).toContain('>card 84997</a>')
    // "order 51234" is a random number: never wrapped, with or without a template
    for (const html of [plain, linked]) {
      expect(html).toContain('order 51234')
      expect(html).not.toMatch(/51234<\/(a|span)>/)
      expect(html).not.toMatch(/>[^<]*order 51234<\/a>/)
    }
  })

  it('"invoice 90817" stays plain text', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(CHW + 'issues/13-'))!
    const html = render(path, { ado: true })
    expect(html).toContain('invoice 90817')
    expect(html).not.toMatch(/90817<\/a>/)
    expect(html).not.toContain('ref-plain">invoice')
  })

  it('references inside links and code are left alone', () => {
    const html = renderText('[cloud-migration 07](https://example.com) and `cloud-migration 07`')
    expect(html.match(/data-path/g)).toBeNull()
  })

  it('a plain ref with a Q item links to the item fragment', () => {
    const html = renderText('see one-cash-mover 05 Q3 for it')
    expect(html).toMatch(/data-frag="q3"[^>]*>one-cash-mover 05 Q3<\/a>/)
  })
})

describe('AC1: tables, task lists, items, code', () => {
  it('a GFM table is wrapped for scrolling', () => {
    const path = Object.keys(index.files).find((p) => p.startsWith(RSA + '02-'))!
    expect(render(path)).toMatch(/<div class="tbl"><table>[\s\S]*<\/table><\/div>/)
  })

  it('task lists render display-only checkboxes', () => {
    const html = renderText('- [ ] open\n- [x] done\n- plain\n')
    expect(html).toContain('<ul class="task-list">')
    expect(html).toContain('<li class="task-item"><input type="checkbox" class="task-box" disabled>open</li>')
    expect(html).toContain('<input type="checkbox" class="task-box" disabled checked>done')
    expect(html).not.toContain('[ ]')
  })

  it('an answered item gets its marker row and state', () => {
    const html = render(RSA + '05-grill-uat-schedule.md')
    expect(html).toMatch(/<h3 data-anchor="q2" class="item-h" data-state="answered"><span class="idtag">Q2<\/span>Is the nightly job still needed<\/h3>\n<p class="marker" data-state="answered"><strong>Answered/)
    expect(html).toMatch(/<h3 data-anchor="q3"[^>]*data-state="open"/)
  })

  it('an AC list item is decorated and its anchor is a data-anchor, not an id', () => {
    const html = render(RSA + '05-grill-uat-schedule.md')
    expect(html).toMatch(/<li class="ac" data-state="open"><a data-anchor="ac1"><\/a><strong>AC1<\/strong>/)
    expect(html).not.toMatch(/\sid="/)
  })

  it('headings outside the parser records get no data-anchor, and no id is ever emitted', () => {
    const html = renderText('# T\n\n> ### nested\n')
    expect(html).not.toMatch(/data-anchor="nested/)
    expect(html).not.toMatch(/\sid="/)
  })

  it('a legacy ticket does not repeat Status, Type and Blocked by in the body', () => {
    const html = render(CHW + 'issues/04-build-movecash.md')
    expect(html).not.toMatch(/Status:|Type: build|Blocked by:/)
    expect(html).toContain('Why')
    // only the first of each label before the first "##" is blanked
    const later = renderText('# T\n\nStatus: open\nType: build\n\n## Notes\n\nStatus: shown later\n', CHW + 'issues/98-legacy.md')
    expect(later).toContain('Status: shown later')
    expect(later).not.toContain('Type: build')
  })

  it('the first H1 is dropped for the header card, others stay', () => {
    const path = RSA + '05-grill-uat-schedule.md'
    expect(render(path)).toContain('<h1')
    expect(render(path, { skipTitle: true })).not.toContain('<h1')
  })

  it('code fences get a copy button; mermaid keeps its source for ticket 14', () => {
    const html = renderText('```ts\nconst a = 1 < 2\n```\n\n```mermaid\nflowchart LR\nA-->B\n```\n')
    expect(html).toContain('<code class="language-ts">const a = 1 &lt; 2')
    expect(html).toContain('data-copy')
    expect(html).toContain('data-mermaid')
    expect(html).toContain('A--&gt;B')
  })

  it('a fixture with a Mermaid block renders without error', () => {
    expect(render(CHW + 'issues/04-build-movecash.md')).toContain('data-mermaid')
  })

  it('the generated map block comments vanish', () => {
    const html = render('modules/remove-service-account/map.md')
    expect(html).not.toContain('tickets:begin')
    expect(html).not.toContain('&lt;!--')
  })

  it('every fixture document renders without throwing or emitting an id attribute or raw script', () => {
    for (const path of Object.keys(index.files)) {
      const html = render(path)
      expect(html, path).not.toMatch(/\sid="/)
      expect(html, path).not.toMatch(/<script|<iframe|onerror=|javascript:/i)
    }
  })
})

describe('sanitiser allowlist', () => {
  const st = () => ({ inHeading: false })

  it('re-serialises <a id> from the captured id as a closed, empty anchor', () => {
    expect(renderInlineHtml('<a id="Q1">', st())).toBe('<a data-anchor="q1"></a>')
    expect(renderInlineHtml("<a id='x.y-z_1'>", st())).toBe('<a data-anchor="x.y-z_1"></a>')
  })

  it('an <a id> inside a heading emits nothing (the heading carries data-anchor)', () => {
    expect(renderInlineHtml('<a id="q1">', { inHeading: true })).toBe('')
    expect(renderInlineHtml('</a>', { inHeading: true })).toBe('')
  })

  it('every </a> emits nothing', () => {
    expect(renderInlineHtml('</a>', st())).toBe('')
    expect(renderInlineHtml('</A >', st())).toBe('')
  })

  it('an unclosed <a id> cannot wrap the rest of the document', () => {
    const html = renderText('<a id="q9">unclosed\n\n# Heading\n\npara\n\n- item\n')
    expect(html).toContain('<a data-anchor="q9"></a>unclosed')
    expect(html.match(/<a\b/g)).toHaveLength(1)
    expect(html.match(/<\/a>/g)).toHaveLength(1)
  })

  it('an <a> with anything else is escaped: href, onclick, extra attributes, odd ids', () => {
    for (const bad of [
      '<a href="https://evil.test">',
      '<a id="x" onclick="alert(1)">',
      '<a id="x" href="javascript:alert(1)">',
      '<a id="x y">',
      '<a id="x&quot; onmouseover=&quot;y">',
      '<a id=x>',
    ]) {
      const out = renderInlineHtml(bad, st())
      expect(out, bad).not.toMatch(/<a\b/)
      expect(out, bad).toBe(escapeHtml(bad))
    }
  })

  it('<br> is allowed bare, with no attributes carried over', () => {
    expect(renderInlineHtml('<br>', st())).toBe('<br>')
    expect(renderInlineHtml('<br/>', st())).toBe('<br>')
    expect(renderInlineHtml('<BR />', st())).toBe('<br>')
    expect(renderInlineHtml('<br onclick="x">', st())).toBe('&lt;br onclick=&quot;x&quot;&gt;')
  })

  it('everything else is escaped to visible text', () => {
    for (const bad of ['<script>', '<img src=x onerror=alert(1)>', '<iframe src="x">', '<style>', '<svg onload=x>', '<b>']) {
      expect(renderInlineHtml(bad, st())).toBe(escapeHtml(bad))
    }
    expect(renderHtmlBlock('<div onclick="x">hi</div>')).toBe('<p class="raw-html">&lt;div onclick=&quot;x&quot;&gt;hi&lt;/div&gt;</p>\n')
    expect(renderHtmlBlock('<script>alert(1)</script>')).not.toContain('<script')
  })

  it('text between two comments on one line survives', () => {
    const html = renderText('a <!-- one --> visible <!-- two --> b')
    expect(html).toContain('visible')
    expect(html).not.toContain('one')
    expect(html).not.toContain('two')
    expect(renderInlineHtml('<!-- a --> x <!-- b -->', { inHeading: false })).not.toBe('')
  })

  it('HTML comments vanish', () => {
    expect(renderInlineHtml('<!-- note -->', st())).toBe('')
    expect(renderHtmlBlock('<!-- tickets:begin view=kanban -->')).toBe('')
  })

  it('end to end: no raw tag from the source survives except <br> and our anchors', () => {
    const html = renderText(
      'a <br> b <b>bold</b> <a href="javascript:x">x</a> <img src=x onerror=1>\n\n<div onclick="1">block</div>\n\n<script>alert(1)</script>\n',
    )
    expect(html).toContain('a <br> b')
    expect(html).not.toMatch(/<(b|img|div|script)\b/)
    expect(html).not.toMatch(/<[^>]*\s(onclick|onerror)=/)
  })
})

describe('urls', () => {
  it('uses a template only when it is http(s) and has {id}', () => {
    expect(makeUrls({ adoPrUrl: 'https://x.test/pr/{id}' }).pr(208)).toBe('https://x.test/pr/208')
    expect(makeUrls({ adoPrUrl: 'https://x.test/pr/' }).pr(208)).toBeNull()
    expect(makeUrls({ adoPrUrl: 'javascript:{id}' }).pr(1)).toBeNull()
    expect(makeUrls(null).ado(1)).toBeNull()
    expect(makeUrls({ adoWorkItemUrl: '' }).ado(1)).toBeNull()
  })
})
