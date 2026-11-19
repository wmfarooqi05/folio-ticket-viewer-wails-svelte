// The renderer (ticket 10; 06 D1, D2, D6). markdown-it 15.0.3 turns a document body into
// an HTML string, and everything the viewer knows about the document comes from the
// parser's records, joined by file line (token.map). Nothing here re-parses headings,
// slugs or items.
//
// How the pieces fit:
//   prepare()        blanks (does not cut) frontmatter and anchor-only lines, so token.map[0] + 1
//                    is the file line the parser used
//   folio core rule  one pass over the tokens: task lists, plain-text autolinks (scanText),
//                    data-anchor on headings, item tags and markers
//   renderer rules   links become data-attribute markers, images go through /doc/<path>,
//                    html is the allowlist from sanitize.ts

import MarkdownIt from 'markdown-it'
import type { Env, StateCore, Token } from 'markdown-it'
import { resolveHref, scanText } from '../parser'
import type { DocRecord, Heading, Index, Item, Resolved } from '../parser'
import { escapeHtml, ANCHOR_LINE, renderHtmlBlock, renderInlineHtml } from './sanitize'
import { makeUrls, type UrlHelpers } from './urls'

export interface RenderOptions {
  /** docs-relative path of the document */
  path: string
  rec: DocRecord
  index: Index
  urls?: UrlHelpers
  /** drop the first H1 (the header card shows the title) */
  skipTitle?: boolean
}

interface RenderEnv extends Env {
  path: string
  rec: DocRecord
  index: Index
  urls: UrlHelpers
  anchorOpen: number
  /** close tags for open links, innermost last */
  closers: string[]
}

// ---- preparing the source ----------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * Splits the text into lines and blanks the ones that must not reach markdown-it:
 * the frontmatter, every anchor-only line outside a fence (an unclosed `<a id="q1">`
 * line starts an HTML block that swallows the heading below it), and optionally the
 * title. Lines are blanked, never removed, so token.map still gives file lines.
 */
export function prepare(text: string, rec: DocRecord, skipTitle: boolean): string {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const start = Math.max(0, rec.bodyLine - 1)
  for (let i = 0; i < Math.min(start, lines.length); i++) lines[i] = ''
  let fence: { ch: string; len: number } | null = null
  for (let i = start; i < lines.length; i++) {
    const f = FENCE.exec(lines[i])
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null
      continue
    }
    if (f) {
      fence = { ch: f[1][0], len: f[1].length }
      continue
    }
    if (ANCHOR_LINE.test(lines[i])) lines[i] = ''
  }
  if (skipTitle) {
    const h1 = rec.headings.find((h) => h.level === 1)
    if (h1 && rec.headings[0] === h1) lines[h1.line - 1] = ''
  }
  return lines.join('\n')
}

// ---- links -------------------------------------------------------------------

interface LinkMeta {
  resolved?: Resolved
  /** a fully-formed external URL (ADO template link) */
  ext?: string
}

function tag(cls: string, attrs: string, title: string): string {
  return `<a class="${cls}"${attrs} title="${escapeHtml(title)}">`
}

/** The opening tag for a link, and the matching close tag. */
function linkTags(r: Resolved, href: string): [string, string] {
  const A = '</a>'
  if (r.kind === 'external') {
    if (!r.ok) {
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1] ?? 'this'
      return [tag('lk lk-broken', ' aria-disabled="true"', `Not allowed: ${scheme} links do not open`), A]
    }
    if (/^https?:/i.test(href)) return [tag('lk lk-ext', ` href="#" data-ext="${escapeHtml(href)}"`, href), A]
    // mailto: and vscode: pass the contract, but the shell opens http and https only (ticket 13)
    return [tag('lk lk-inert', ' aria-disabled="true"', `${href} (only http and https links open from Folio)`), A]
  }
  if (r.kind === 'outside') {
    return [`<span class="lk lk-outside" title="${escapeHtml(`Outside the docs folder: ${href}`)}">`, '</span>']
  }
  if (!r.ok) {
    const title =
      r.problem === 'no-anchor'
        ? `No item #${r.fragment ?? ''} in ${r.path ?? href}`
        : r.problem === 'bad-ref'
          ? `Not a valid reference: ${href}`
          : `Not found: ${r.path ?? href}`
    return [tag('lk lk-broken', ' aria-disabled="true"', title), A]
  }
  const frag = r.itemId ?? r.fragment
  const fragAttr = frag ? ` data-frag="${escapeHtml(frag)}"` : ''
  // a bare #fragment stays in this document
  const pathAttr = href.startsWith('#') || !r.path ? '' : ` data-path="${escapeHtml(r.path)}"`
  return [tag('lk', ` href="#"${pathAttr}${fragAttr}`, `${r.path ?? ''}${frag ? '#' + frag : ''}`), A]
}

// ---- images ------------------------------------------------------------------

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * A docs-relative path for an image, or an 'external' / 'none' verdict. Same rules as
 * resolveHref for files: relative to the document, `..` may not leave the docs root.
 */
export function resolveImagePath(src: string, fromPath: string): string | 'external' | null {
  if (/^https?:/i.test(src)) return 'external'
  if (/^[a-z][a-z0-9+.-]+:/i.test(src)) return null
  let raw = src
  const cut = raw.search(/[?#]/)
  if (cut >= 0) raw = raw.slice(0, cut)
  raw = raw.replace(/\\/g, '/')
  if (raw === '') return null
  const given = raw.split('/').map(decode)
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')).split('/') : []
  const segs = raw.startsWith('/') ? given : [...dir, ...given]
  const out: string[] = []
  for (const s of segs) {
    if (s === '' || s === '.') continue
    if (s === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(s)
  }
  return out.length ? out.join('/') : null
}

/** What replaces an image that did not load (06 section 6). Pure, so the test can read it. */
export function imagePlaceholder(href: string): string {
  return `<span class="img-missing"><span class="img-missing-path">${escapeHtml(href)}</span><span>Not in this checkout</span></span>`
}

// ---- the markdown-it instance --------------------------------------------------

const md = new MarkdownIt({ html: true, linkify: true, typographer: false })
// bare https:// URLs only: "README.md" must not become a link to the .md domain
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false })

md.renderer.rules.html_inline = (tokens, idx, _o, e) => {
  const env = e as RenderEnv
  const t = tokens[idx]
  const state = { inHeading: !!t.meta?.inHeading, anchorOpen: env.anchorOpen }
  const out = renderInlineHtml(t.content, state)
  env.anchorOpen = state.anchorOpen
  return out
}
md.renderer.rules.html_block = (tokens, idx) => renderHtmlBlock(tokens[idx].content)

md.renderer.rules.link_open = (tokens, idx, _o, e) => {
  const env = e as RenderEnv
  const t = tokens[idx]
  const meta = (t.meta ?? {}) as LinkMeta
  const href = t.attrGet('href') ?? ''
  let open: string, close: string
  if (meta.ext) {
    ;[open, close] = [tag('lk lk-ext', ` href="#" data-ext="${escapeHtml(meta.ext)}"`, meta.ext), '</a>']
  } else {
    ;[open, close] = linkTags(meta.resolved ?? resolveHref(href, env.path, env.index), href)
  }
  env.closers.push(close)
  return open
}
md.renderer.rules.link_close = (_t, _i, _o, e) => (e as RenderEnv).closers.pop() ?? '</a>'

md.renderer.rules.image = (tokens, idx, _o, e, self) => {
  const env = e as RenderEnv
  const t = tokens[idx]
  const src = t.attrGet('src') ?? ''
  const alt = self.renderInlineAsText(t.children ?? [], md.options, env)
  const p = resolveImagePath(src, env.path)
  if (p === 'external') {
    // an offline app: an external image is a link, never a request
    return `<a class="lk lk-ext" href="#" data-ext="${escapeHtml(src)}" title="${escapeHtml(src)}">${escapeHtml(alt || src)}</a>`
  }
  if (p === null) return imagePlaceholder(src)
  const url = '/doc/' + p.split('/').map(encodeURIComponent).join('/')
  return `<img class="doc-img" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" data-href="${escapeHtml(src)}" loading="lazy">`
}

md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx]
  const lang = /^[\w+#.-]+$/.exec(t.info.trim().split(/\s+/)[0] ?? '')?.[0] ?? ''
  const code = escapeHtml(t.content)
  if (lang.toLowerCase() === 'mermaid') {
    // ticket 14 swaps this for the diagram; until then the source is shown
    return `<div class="code mermaid-ph" data-mermaid><div class="code-head"><span>mermaid</span></div><pre><code>${code}</code></pre></div>\n`
  }
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
  return `<div class="code"><div class="code-head"><span>${escapeHtml(lang || 'text')}</span><button type="button" class="copy" data-copy>copy</button></div><pre><code${cls}>${code}</code></pre></div>\n`
}

md.renderer.rules.table_open = () => '<div class="tbl"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'

md.renderer.rules.folio_idtag = (tokens, idx) => `<span class="idtag">${escapeHtml(tokens[idx].content)}</span>`
md.renderer.rules.folio_checkbox = (tokens, idx) =>
  `<input type="checkbox" class="task-box" disabled${tokens[idx].meta?.checked ? ' checked' : ''}>`
md.renderer.rules.folio_plainref = (tokens, idx) => `<span class="ref-plain">${escapeHtml(tokens[idx].content)}</span>`

// ---- the core rule ---------------------------------------------------------------

const ITEM_PREFIX = /^(?:Q|D|R)\d+\s*(?:[—–:]|-)?\s*/
const MARKER_START = /^\*\*(?:Answered|Superseded|Closed|Dropped)\b/i
const TASK = /^\[([ xX])\][ \t]+/

function mk(state: StateCore, type: string, content = ''): Token {
  const t = new state.Token(type, '', 0)
  t.content = content
  return t
}

function folio(state: StateCore): void {
  const env = state.env as RenderEnv
  const { rec } = env
  const toks = state.tokens

  const headingByLine = new Map<number, Heading>()
  for (const h of rec.headings) headingByLine.set(h.line, h)
  // item <-> heading by line: an inline or no anchor puts Item.line on the heading; an
  // 'above' anchor puts it on the anchor line, so the heading is the next one with that anchor
  const itemByHeading = new Map<number, Item>()
  const acByLine = new Map<number, Item>()
  for (const it of rec.items) {
    if (it.kind === 'AC') acByLine.set(it.line, it)
    else if (it.anchor !== 'above') itemByHeading.set(it.line, it)
    else {
      const h = rec.headings.find((x) => x.line > it.line && x.anchor === it.id)
      if (h) itemByHeading.set(h.line, it)
    }
  }

  const lists: Token[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    switch (t.type) {
      case 'bullet_list_open':
      case 'ordered_list_open':
        lists.push(t)
        break
      case 'bullet_list_close':
      case 'ordered_list_close':
        lists.pop()
        break
      case 'list_item_open': {
        const ac = t.map ? acByLine.get(t.map[0] + 1) : undefined
        if (ac) {
          t.attrJoin('class', 'ac')
          t.attrSet('data-state', ac.state)
        }
        break
      }
      case 'heading_open': {
        const line = (t.map?.[0] ?? -1) + 1
        const h = headingByLine.get(line)
        const inline = toks[i + 1]
        if (inline?.type === 'inline') for (const c of inline.children ?? []) if (c.type === 'html_inline') c.meta = { inHeading: true }
        if (!h) break
        const item = itemByHeading.get(line)
        t.attrSet('data-anchor', item?.id ?? h.anchor ?? h.slug)
        if (item && inline?.type === 'inline' && inline.children) {
          t.attrJoin('class', 'item-h')
          t.attrSet('data-state', item.state)
          const kids = inline.children
          const first = kids.find((c) => c.type === 'text')
          if (first) first.content = first.content.replace(ITEM_PREFIX, '')
          kids.unshift(mk(state, 'folio_idtag', `${item.kind}${item.n}`))
          // the marker line under the heading: **Answered 2026-10-14 (client):** ...
          const after = toks[i + 3]
          const body = toks[i + 4]
          if (after?.type === 'paragraph_open' && body?.type === 'inline' && MARKER_START.test(body.content)) {
            after.attrJoin('class', 'marker')
            after.attrSet('data-state', item.state)
          }
        }
        break
      }
      case 'inline': {
        const kids = t.children
        if (!kids) break
        const prev = toks[i - 1]
        // task list: "[ ] text" or "[x] text" at the start of a list item
        if (prev?.type === 'paragraph_open' && toks[i - 2]?.type === 'list_item_open') {
          const c0 = kids[0]
          const m = c0?.type === 'text' ? TASK.exec(c0.content) : null
          if (m) {
            c0.content = c0.content.slice(m[0].length)
            const box = mk(state, 'folio_checkbox')
            box.meta = { checked: m[1] !== ' ' }
            kids.unshift(box)
            toks[i - 2].attrJoin('class', 'task-item')
            const list = lists.at(-1)
            if (list && !list.attrGet('class')?.includes('task-list')) list.attrJoin('class', 'task-list')
          }
        }
        t.children = autolink(state, kids, env)
        break
      }
    }
  }
}

/** Plain-text references (scanText) become links, outside links and code. */
function autolink(state: StateCore, kids: Token[], env: RenderEnv): Token[] {
  const out: Token[] = []
  let depth = 0
  for (const c of kids) {
    if (c.type === 'link_open') depth++
    else if (c.type === 'link_close') depth--
    if (c.type !== 'text' || depth > 0 || c.content === '') {
      out.push(c)
      continue
    }
    const refs = scanText(c.content, env.path, env.index)
    if (refs.length === 0) {
      out.push(c)
      continue
    }
    const text = (s: string) => {
      const t = mk(state, 'text', s)
      t.level = c.level
      return t
    }
    let pos = 0
    for (const r of refs) {
      if (r.start < pos) continue
      if (r.start > pos) out.push(text(c.content.slice(pos, r.start)))
      const label = c.content.slice(r.start, r.end)
      if (r.kind === 'ado') {
        const url = r.ado === undefined ? null : env.urls.ado(r.ado)
        if (url) {
          const open = mk(state, 'link_open')
          open.nesting = 1
          open.meta = { ext: url } satisfies LinkMeta
          const close = mk(state, 'link_close')
          close.nesting = -1
          out.push(open, text(label), close)
        } else out.push(mk(state, 'folio_plainref', label))
      } else if (r.to) {
        const open = mk(state, 'link_open')
        open.nesting = 1
        open.meta = { resolved: r.to } satisfies LinkMeta
        const close = mk(state, 'link_close')
        close.nesting = -1
        out.push(open, text(label), close)
      } else out.push(text(label))
      pos = r.end
    }
    if (pos < c.content.length) out.push(text(c.content.slice(pos)))
  }
  return out
}

md.core.ruler.push('folio', folio)

/** Renders one document body to an HTML string. */
export function renderMarkdown(text: string, o: RenderOptions): string {
  const env: RenderEnv = {
    path: o.path,
    rec: o.rec,
    index: o.index,
    urls: o.urls ?? makeUrls(null),
    anchorOpen: 0,
    closers: [],
  }
  return md.render(prepare(text, o.rec, o.skipTitle ?? false), env)
}
