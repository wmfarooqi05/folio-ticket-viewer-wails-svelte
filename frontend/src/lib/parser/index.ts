// Folio parser module: the contract from ticket 04 (docs/issues/04-parser-contract.md,
// types from docs/assets/04-parser-contract-draft.md section 1).
//
// Rules for this folder: no imports at all, no DOM, no Svelte, no Node. It must stay a
// pure module so it can move into the other repo as `scripts/tickets/lib.mjs`. All
// output is plain JSON (no Map, Set, class or Date), so the index can be cached.
//
// Implements ticket 04's contract (draft amended by D2 to D7). Ticket 08.

// ---- input -----------------------------------------------------------------

/** One file as Go sends it. Paths are POSIX and relative to the docs root. */
export interface SourceFile {
  path: string
  text: string
  /** unix ms */
  mtime: number
}

// ---- records ---------------------------------------------------------------

export type Status =
  | 'open'
  | 'in-progress'
  | 'blocked'
  | 'in-review'
  | 'done'
  | 'dropped'
  | 'superseded'
  | 'unknown'
export type Person = 'owner' | 'client' | 'dba' | 'infra' | 'ops'

export interface Index {
  version: 1
  /** by path; every indexed .md, not only tickets */
  files: Record<string, DocRecord>
  /** sorted; used by scanText and the tree */
  spaces: string[]
  /** the name of the space at the docs folder itself (the repo folder's name); '' when the caller gave none */
  rootName: string
  /** "<space> <num padded to 2>" -> path */
  tickets: Record<string, string>
  edges: Edge[]
  /** cross-file: DUP_NUM, FM_REF, LINK */
  diagnostics: Diagnostic[]
}

export interface DocRecord {
  path: string
  mtime: number
  /** ticket: **\/issues/NN-*.md under modules/<space>/; map: map.md; else doc */
  kind: 'ticket' | 'map' | 'doc'
  /** modules/<space>/...; null for handoffs/ and patterns/ */
  space: string | null
  /** digits as written in the filename: "05", "100" */
  num: string | null
  /** "<space> <num padded to >=2>", the ticket ID */
  key: string | null
  /** H1 with a leading "NN — " removed; the filename slug if there is no H1 */
  title: string
  /** per file: no frontmatter */
  legacy: boolean
  meta: TicketMeta | MapMeta | null
  /** which section-3 rule set meta.status (legacy tickets only) */
  legacyRule: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
  /** first body line after the frontmatter */
  bodyLine: number
  headings: Heading[]
  items: Item[]
  links: Link[]
  map: { kanban: boolean; issuesDir: string } | null
  hasMermaid: boolean
  diagnostics: Diagnostic[]
  /** 1-based line of each frontmatter key (or legacy label) that can carry a diagnostic */
  fmLines: Record<string, number>
}

export interface TicketMeta {
  type: string[]
  status: Status
  status_note: string | null
  waiting_on: Person | null
  blocked_by: string[]
  blocked_note: string | null
  related: string[]
  superseded_by: string | null
  pr: number[]
  ado: number[]
  afk: boolean
}

export interface MapMeta {
  status: 'charted' | 'active' | 'closed' | 'superseded' | null
  ado: number | null
  superseded_by: string | null
}

export type Frontmatter = Record<string, unknown>
export interface LegacyMeta extends TicketMeta {
  legacyRule: DocRecord['legacyRule']
  /** per-line warnings (unknown Type tokens); `line` is 1-based in the text given */
  warnings: { line: number; code: string; message: string }[]
  /** 1-based line of the legacy label each field came from, for diagnostics */
  lines: Record<string, number>
}

export interface Heading {
  level: number
  text: string
  slug: string
  line: number
  anchor: string | null
}

export interface Item {
  kind: 'Q' | 'D' | 'AC' | 'R'
  n: number
  /** lowercase, e.g. "q3" */
  id: string
  title: string
  line: number
  endLine: number
  state: 'open' | 'answered' | 'superseded' | 'closed' | 'dropped'
  stateNote: string | null
  anchor: 'inline' | 'above' | 'none'
  /** extra fragments that resolve to this item (legacy "Qn answered" follow-up slugs); id first */
  fragments?: string[]
}

export interface Link {
  href: string
  text: string
  line: number
  image: boolean
  ticketText: boolean
  resolved?: Resolved
}

export interface Resolved {
  kind: 'internal' | 'external' | 'outside'
  path: string | null
  fragment: string | null
  itemId: string | null
  ok: boolean
  problem?: 'no-file' | 'no-anchor' | 'bad-ref' | 'bad-scheme'
}

export interface Edge {
  from: string
  field: 'blocked_by' | 'related' | 'superseded_by'
  ref: string
  to: Resolved
  crossSpace: boolean
}

/** 1-based, inclusive file lines. */
export interface LineRange {
  start: number
  end: number
}

export interface TextRef {
  start: number
  end: number
  kind: 'ticket' | 'item' | 'ado'
  to: Resolved | null
  ado?: number
}

export interface Diagnostic {
  path: string
  line: number
  code: string
  level: 'error' | 'warning'
  message: string
}


// ---- the viewer API ----------------------------------------------------------
// (buildIndex, updateIndex, resolveHref, extractFragment, scanText; the pieces follow)

// ---- small helpers -----------------------------------------------------------

const PERSONS: readonly Person[] = ['owner', 'client', 'dba', 'infra', 'ops']
const STATUSES: readonly Status[] = [
  'open', 'in-progress', 'blocked', 'in-review', 'done', 'dropped', 'superseded', 'unknown',
]
const MAP_STATUSES = ['charted', 'active', 'closed', 'superseded'] as const
const TYPES = ['build', 'decision', 'grilling', 'task', 'bug', 'spike', 'verify']

/** "5", "05", "005" -> "05"; "100" stays "100". */
function pad2(n: string | number): string {
  return String(parseInt(String(n), 10)).padStart(2, '0')
}

function splitLines(text: string): string[] {
  return text.replace(/^﻿/, '').split(/\r?\n/)
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

const TICKET_PATH = /^modules\/([^/]+)\/(?:.+\/)?issues\/(\d{2,})-[^/]+\.md$/
const SPACE_PATH = /^modules\/([^/]+)\//
/** A ticket outside modules/: the space is the folder that holds the nearest issues/ folder ('' is the docs folder itself). */
const GENERIC_TICKET_PATH = /^(?:(.*)\/)?issues\/(\d{2,})-[^/]+\.md$/
/** These two top-level folders are cross-cutting: they never belong to a space. */
const CROSS_CUTTING = /^(?:handoffs|patterns)\//

/** The space a ticket path belongs to: modules/<x>/ gives x, otherwise the folder holding issues/. null when it has none. */
function ticketSpace(path: string, rootName: string): { space: string; num: string } | null {
  const m = TICKET_PATH.exec(path)
  if (m) return { space: m[1], num: m[2] }
  const g = GENERIC_TICKET_PATH.exec(path)
  if (!g || CROSS_CUTTING.test(path) || path.startsWith('modules/')) return null
  const dir = g[1] ?? ''
  const space = dir === '' ? rootName : dir.slice(dir.lastIndexOf('/') + 1)
  return space === '' ? null : { space, num: g[2] }
}

function isHidden(path: string): boolean {
  return path.split('/').some((seg) => seg.startsWith('_'))
}

// ---- frontmatter (the YAML subset of conventions section 3) -------------------

interface FmBlock {
  data: Frontmatter
  diagnostics: { line: number; code: string; message: string }[]
  /** 1-based line of the first body line */
  bodyLine: number
  /** 1-based line of each key */
  keyLines: Record<string, number>
}

/** Reference fields keep their raw token text, so `[02]` stays "02" and not the number 2. */
const REF_KEYS = ['blocked_by', 'related', 'superseded_by']

/** True when the text opens a frontmatter block that never closes. */
function hasUnclosedFrontmatter(text: string): boolean {
  const lines = splitLines(text)
  return lines[0].trimEnd() === '---' && !lines.slice(1).some((l) => l.trimEnd() === '---')
}

/** null when the text does not start with `---` and have a closing `---` line. */
function readFrontmatter(text: string): FmBlock | null {
  const lines = splitLines(text)
  if (lines[0].trimEnd() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      end = i
      break
    }
  }
  if (end < 0) return null
  // no prototype: a key named __proto__ must be an ordinary key, not a way to reach Object.prototype
  const data: Frontmatter = Object.create(null)
  const diagnostics: FmBlock['diagnostics'] = []
  const keyLines: Record<string, number> = Object.create(null)
  for (let i = 1; i < end; i++) {
    const raw = lines[i]
    if (raw.trim() === '' || /^\s*#/.test(raw)) continue
    const m = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(raw.trimEnd())
    if (!m) {
      diagnostics.push({ line: i + 1, code: 'FM_PARSE', message: `Not in the frontmatter subset: ${raw.trim()}` })
      continue
    }
    const value = parseFmValue(stripComment(m[2] ?? ''), REF_KEYS.includes(m[1]))
    if (value === UNPARSEABLE) {
      diagnostics.push({ line: i + 1, code: 'FM_PARSE', message: `Cannot read the value of "${m[1]}"` })
      continue
    }
    data[m[1]] = value
    keyLines[m[1]] = i + 1
  }
  return { data, diagnostics, bodyLine: end + 2, keyLines }
}

export function parseFrontmatter(text: string): Frontmatter | null {
  return readFrontmatter(text)?.data ?? null
}

const UNPARSEABLE = Symbol('unparseable')

function stripComment(s: string): string {
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trim()
  }
  return s.trim()
}

function parseFmScalar(s: string, raw = false): unknown {
  const t = s.trim()
  if (t === '' || t === 'null' || t === '~') return null
  if (t === 'true') return true
  if (t === 'false') return false
  if (raw && /^-?\d+$/.test(t)) return t
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t)
  if (t.startsWith('"')) {
    if (t.length < 2 || !t.endsWith('"')) return UNPARSEABLE
    try {
      return JSON.parse(t)
    } catch {
      return t.slice(1, -1)
    }
  }
  if (t.startsWith("'")) {
    if (t.length < 2 || !t.endsWith("'")) return UNPARSEABLE
    return t.slice(1, -1).replace(/''/g, "'")
  }
  return t
}

function parseFmValue(s: string, raw = false): unknown {
  if (!s.startsWith('[')) return parseFmScalar(s, raw)
  if (!s.endsWith(']')) return UNPARSEABLE
  const inner = s.slice(1, -1)
  const parts: string[] = []
  let quote = ''
  let cur = ''
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) {
      cur += c
      if (c === '\\' && quote === '"') cur += inner[++i] ?? ''
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if (c === ',') {
      parts.push(cur)
      cur = ''
    } else cur += c
  }
  if (quote) return UNPARSEABLE
  if (cur.trim() !== '' || parts.length > 0) parts.push(cur)
  const out: unknown[] = []
  for (const p of parts) {
    const v = parseFmScalar(p, raw)
    if (v === UNPARSEABLE) return UNPARSEABLE
    out.push(v)
  }
  return out
}

// ---- the line scan: headings, items, links (section 2.1 to 2.3) ----------------

interface Scan {
  headings: Heading[]
  items: Item[]
  links: Link[]
  hasMermaid: boolean
  diagnostics: { line: number; code: string; level: 'error' | 'warning'; message: string }[]
}

interface RawHeading {
  level: number
  raw: string
  line: number
  /** a line holding only `<a id>` above the heading */
  above: { id: string; line: number } | null
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/
const ANCHOR_ONLY = /^\s*<a\s+id=["']([^"']+)["']\s*>(?:\s*<\/a>)?\s*$/i
const INLINE_ANCHOR = /^<a\s+id=["']([^"']+)["']\s*>(?:\s*<\/a>)?\s*/i
const AC_LINE = /^\s*[-*+]\s+<a\s+id=["'](ac(\d+))["']\s*>(?:\s*<\/a>)?\s*\*\*AC\d+\*\*\s*(?:[—–]|-)?\s*(.*)$/i
const LINK_RE = /(!?)\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g
const TICKET_TEXT = /^(?:[a-z0-9-]+ )?\d{2,}(?: (?:[QDR]\d+|AC\d+))?$|^(?:[QDR]|AC)\d+$/

/** GitHub-style slug of a heading's text (before the duplicate suffix). */
function slugOf(raw: string): string {
  const text = raw
    .replace(/<[^>]*>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]|~~/g, '')
    .toLowerCase()
  return text.replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '').replace(/ /g, '-')
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim()
}

/** The marker at the start of an item body: **Answered 2026-10-14 (client):** ... */
const MARKER = /\*\*(Answered|Superseded(?: by)?|Closed|Dropped)\b([^*]*)\*\*/i
const STATE_OF: Record<string, Item['state']> = {
  answered: 'answered',
  superseded: 'superseded',
  closed: 'closed',
  dropped: 'dropped',
}

function readMarker(m: RegExpExecArray): { state: Item['state']; note: string | null } {
  const word = m[1].toLowerCase().split(' ')[0]
  const note = m[2]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*by\b/i, '')
    .replace(/:\s*$/, '')
    .trim()
  return { state: STATE_OF[word] ?? 'open', note: note === '' ? null : note }
}

function scanDoc(text: string, lineOffset: number, legacy: boolean): Scan {
  const lines = splitLines(text)
  const total = lines.length
  const fileLine = (i: number) => i + 1 + lineOffset
  const diagnostics: Scan['diagnostics'] = []
  const raws: RawHeading[] = []
  const acs: Item[] = []
  const links: Link[] = []
  let hasMermaid = false
  let fence: { ch: string; len: number } | null = null
  let pending: { id: string; line: number } | null = null
  let inDoneWhen = false

  for (let i = 0; i < total; i++) {
    const line = lines[i]
    const f = FENCE.exec(line)
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null
      continue
    }
    if (f) {
      fence = { ch: f[1][0], len: f[1].length }
      if (/^\s*\{?\s*mermaid\b/i.test(f[2])) hasMermaid = true
      pending = null
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      raws.push({ level: h[1].length, raw: h[2], line: fileLine(i), above: pending })
      if (h[1].length <= 2) inDoneWhen = h[1].length === 2 && /^done when\b/i.test(stripHtml(h[2]))
      pending = null
    } else {
      const a = ANCHOR_ONLY.exec(line)
      if (a) pending = { id: a[1].toLowerCase(), line: fileLine(i) }
      else if (line.trim() !== '') pending = null
    }

    if (inDoneWhen && !h) {
      const m = AC_LINE.exec(line)
      if (m) {
        let end = i
        for (let j = i + 1; j < total; j++) {
          const nx = lines[j]
          if (nx.trim() === '' || !/^\s+\S/.test(nx) || /^\s*[-*+]\s/.test(nx)) break
          end = j
        }
        const whole = lines.slice(i, end + 1).join('\n')
        const mk = MARKER.exec(whole)
        const rest = m[3]
        const cut = MARKER.exec(rest)
        const marker = mk && /^(closed|dropped)/i.test(mk[1]) ? readMarker(mk) : null
        acs.push({
          kind: 'AC',
          n: Number(m[2]),
          id: m[1].toLowerCase(),
          title: (cut ? rest.slice(0, cut.index) : rest).replace(/~~/g, '').trim(),
          line: fileLine(i),
          endLine: fileLine(end),
          state: marker?.state ?? 'open',
          stateNote: marker?.note ?? null,
          anchor: 'inline',
        })
      }
    }

    // links: mask inline code first
    const masked = line.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length))
    LINK_RE.lastIndex = 0
    let lm: RegExpExecArray | null
    while ((lm = LINK_RE.exec(masked))) {
      const href = lm[3].replace(/^<|>$/g, '')
      links.push({
        href,
        text: lm[2],
        line: fileLine(i),
        image: lm[1] === '!',
        ticketText: TICKET_TEXT.test(lm[2].trim()),
      })
    }
  }

  // headings, slugs, anchors
  const headings: Heading[] = []
  const slugCount: Record<string, number> = Object.create(null) // a heading called __proto__ or constructor is a plain key
  const startOf: number[] = []
  const labelInfo: ({ kind: 'Q' | 'D' | 'R'; n: number; rest: string; anchor: string | null } | null)[] = []
  const seenIds = new Set<string>()
  for (const r of raws) {
    let rest = r.raw
    let anchor: string | null = null
    const ia = INLINE_ANCHOR.exec(rest)
    if (ia) {
      anchor = ia[1].toLowerCase()
      rest = rest.slice(ia[0].length)
    } else if (r.above) anchor = r.above.id
    const base = slugOf(r.raw)
    const seen = slugCount[base]
    slugCount[base] = (seen ?? -1) + 1
    const slug = seen === undefined ? base : `${base}-${seen + 1}`
    headings.push({ level: r.level, text: stripHtml(r.raw), slug, line: r.line, anchor })
    startOf.push(r.above ? r.above.line : r.line)
    if (r.above) {
      diagnostics.push({
        line: r.above.line,
        code: 'ANCHOR_ABOVE',
        level: 'warning',
        message: `Anchor "${r.above.id}" sits on its own line above the heading; put it inside the heading`,
      })
    }
    if (anchor) {
      if (seenIds.has(anchor)) {
        diagnostics.push({ line: r.line, code: 'DUP_ANCHOR', level: 'warning', message: `Duplicate anchor "${anchor}"` })
      }
      seenIds.add(anchor)
    }
    const lm = /^(Q|D|R)(\d+)\b/.exec(stripHtml(rest))
    labelInfo.push(lm ? { kind: lm[1] as 'Q' | 'D' | 'R', n: Number(lm[2]), rest: stripHtml(rest), anchor } : null)
  }

  const lastNonBlank = (fromLine: number, beforeLine: number): number => {
    let e = Math.min(beforeLine - 1, total + lineOffset)
    while (e > fromLine && (lines[e - 1 - lineOffset] ?? '').trim() === '') e--
    return e
  }
  const sectionEnd = (k: number): number => {
    for (let j = k + 1; j < raws.length; j++) if (raws[j].level <= raws[k].level) return lastNonBlank(raws[k].line, startOf[j])
    return lastNonBlank(raws[k].line, total + lineOffset + 1)
  }

  // Q, D, R items from headings
  const items: Item[] = []
  const byId = new Map<string, Item>()
  const itemHeading = new Map<Item, number>()
  for (let k = 0; k < raws.length; k++) {
    const info = labelInfo[k]
    const fu = legacy ? /^Q(\d+)\s+answered\b(.*)$/i.exec(stripHtml(raws[k].raw)) : null
    const target = fu ? byId.get(`q${Number(fu[1])}`) : undefined
    if (fu && target) {
      // legacy follow-up heading: not an item, it answers Qn and extends its range
      const date = /\d{4}-\d{2}-\d{2}/.exec(fu[2])
      target.state = 'answered'
      target.stateNote = date ? date[0] : target.stateNote
      target.endLine = Math.max(target.endLine, sectionEnd(k))
      target.fragments = [...(target.fragments ?? [target.id]), headings[k].slug]
      continue
    }
    if (!info) continue
    const id = (info.anchor ?? `${info.kind}${info.n}`).toLowerCase()
    const anchorKind: Item['anchor'] = info.anchor ? (raws[k].above && !INLINE_ANCHOR.test(raws[k].raw) ? 'above' : 'inline') : 'none'
    if (byId.has(id)) {
      diagnostics.push({ line: raws[k].line, code: 'DUP_ANCHOR', level: 'warning', message: `Duplicate item id "${id}"; the first one wins` })
      continue
    }
    let title = info.rest.replace(/^(Q|D|R)\d+\b\s*(?:[—–:]|-)?\s*/, '')
    let state: Item['state'] = 'open'
    let stateNote: string | null = null
    if (legacy) {
      const sm = /\s*\(answered\s+(\d{4}-\d{2}-\d{2})[^)]*\)\s*$/i.exec(title)
      if (sm) {
        title = title.slice(0, sm.index).trim()
        state = 'answered'
        stateNote = sm[1]
      }
    }
    // marker: the first non-blank line after the heading
    for (let j = raws[k].line - lineOffset; j < total; j++) {
      if (lines[j].trim() === '') continue
      const mk = MARKER.exec(lines[j])
      if (mk && mk.index === lines[j].search(/\S/)) {
        const r = readMarker(mk)
        state = r.state
        stateNote = r.note
      }
      break
    }
    const item: Item = {
      kind: info.kind,
      n: info.n,
      id,
      title,
      line: startOf[k],
      endLine: 0,
      state,
      stateNote,
      anchor: anchorKind,
    }
    byId.set(id, item)
    itemHeading.set(item, k)
    items.push(item)
  }
  // ranges: to the next heading at the same or a higher level, or the next item of the same kind
  for (const it of items) {
    const k = itemHeading.get(it)!
    let bound = total + lineOffset + 1
    for (let j = k + 1; j < raws.length; j++) {
      const lbl = labelInfo[j]
      if (raws[j].level <= raws[k].level || (lbl && lbl.kind === it.kind && byId.get((lbl.anchor ?? `${lbl.kind}${lbl.n}`).toLowerCase())?.line === startOf[j])) {
        bound = startOf[j]
        break
      }
    }
    it.endLine = Math.max(it.endLine, lastNonBlank(raws[k].line, bound))
  }
  for (const ac of acs) {
    if (byId.has(ac.id)) {
      diagnostics.push({ line: ac.line, code: 'DUP_ANCHOR', level: 'warning', message: `Duplicate item id "${ac.id}"; the first one wins` })
      continue
    }
    byId.set(ac.id, ac)
    items.push(ac)
  }
  items.sort((a, b) => a.line - b.line)
  return { headings, items, links, hasMermaid, diagnostics }
}

export function parseItems(body: string, lineOffset: number, legacy: boolean): Item[] {
  return scanDoc(body, lineOffset, legacy).items
}

export function parseLinks(body: string, lineOffset: number): Link[] {
  return scanDoc(body, lineOffset, false).links
}

// ---- legacy fallback (handoff section 3, amended by 04 D2 to D5) ----------------

const LEGACY_LINE = /^\s*(?:\*\*)?(Status|Type|Blocked by)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*?)\s*$/i

/** Replace smart quotes, then strip bold, backticks and check marks (A3, A13, A21). */
function cleanStatus(raw: string): string {
  return raw.replace(/[‘’]/g, "'").replace(/[*`✅]/g, '').trim()
}

const BRANCH_WORDS = ['on branch', 'on claude/', 'not merged', 'not yet run', 'on the provisional']

/** Typography-only normalisation for matching (D5): curly double quotes, dash variants, leading quotes. */
function matchForm(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, '-')
    .replace(/^["'\s]+/, '')
    .toLowerCase()
}

function legacyStatus(text: string): { status: Status; rule: NonNullable<DocRecord['legacyRule']> } {
  const t = matchForm(text)
  if (/^superseded\b/.test(t) || /\bsuperseded by (?:ticket )?\d{2,}/.test(t)) return { status: 'superseded', rule: 1 }
  if (/^(dropped|won't|wontfix|cancel)/.test(t)) return { status: 'dropped', rule: 2 }
  if (/^blocked/.test(t)) return { status: 'blocked', rule: 3 }
  // D3: "merged" with no "not" before it (in the same clause) wins over rule 4
  const merged = /\bmerged\b/.test(t) && !/\bnot\b[^.;]*\bmerged\b/.test(t)
  if (/^built/.test(t) && BRANCH_WORDS.some((w) => t.includes(w)) && !merged) return { status: 'in-review', rule: 4 }
  if (/^not merged/.test(t)) return { status: 'in-review', rule: 4 }
  if (/^(in[ -]progress|building)/.test(t)) return { status: 'in-progress', rule: 5 }
  if (/^(resolved|decided|settled|done|built|merged|answered)/.test(t)) return { status: 'done', rule: 6 }
  if (/^(open|not started|charted)/.test(t)) return { status: 'open', rule: 7 }
  return { status: 'unknown', rule: 8 }
}

function parseBlockedBy(raw: string): { refs: string[]; note: string | null } {
  const t = raw.trim()
  if (t === '' || /^(none|—|–|-|n\/a)$/i.test(t)) return { refs: [], note: null }
  const refs: string[] = []
  for (const part of t.split(',')) {
    const p = part.trim()
    let m = /^(\d{2,})$/.exec(p)
    if (m) {
      refs.push(pad2(m[1]))
      continue
    }
    m = /^(\d{2,})\s*[–-]\s*(\d{2,})$/.exec(p)
    if (m && Number(m[1]) <= Number(m[2]) && Number(m[2]) - Number(m[1]) < 500) {
      for (let n = Number(m[1]); n <= Number(m[2]); n++) refs.push(pad2(n))
      continue
    }
    return { refs: [], note: t }
  }
  return { refs, note: null }
}

export function parseLegacy(body: string): LegacyMeta {
  const lines = splitLines(body)
  const found: Partial<Record<'status' | 'type' | 'blocked by', { text: string; line: number }>> = {}
  let fence: { ch: string; len: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = FENCE.exec(line)
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null
      continue
    }
    if (f) {
      fence = { ch: f[1][0], len: f[1].length }
      continue
    }
    if (/^##\s/.test(line)) break
    const m = LEGACY_LINE.exec(line)
    if (!m) continue
    const label = m[1].toLowerCase() as 'status' | 'type' | 'blocked by'
    if (!found[label]) found[label] = { text: m[2], line: i + 1 }
  }

  const warnings: LegacyMeta['warnings'] = []
  const statusText = cleanStatus(found.status?.text ?? '')
  const { status, rule } = legacyStatus(statusText)
  let superseded_by: string | null = null
  if (status === 'superseded') {
    const m = /\bsuperseded by (?:ticket )?(\d{2,})/i.exec(statusText)
    if (m) superseded_by = pad2(m[1])
  }

  const type: string[] = []
  let afk = false
  let typePerson: Person | null = null
  for (const tok of (found.type?.text ?? '').split(/[+,]/)) {
    let t = tok.trim().toLowerCase()
    if (t === '') continue
    const am = /^(.*?)\s*\(afk\)$/.exec(t)
    if (am) {
      afk = true
      t = am[1].trim()
    }
    if (t === 'fix') t = 'bug'
    if (TYPES.includes(t)) {
      if (!type.includes(t)) type.push(t)
    } else if ((PERSONS as readonly string[]).includes(t)) {
      typePerson ??= t as Person
    } else {
      warnings.push({ line: found.type!.line, code: 'LEGACY_TYPE', message: `Unknown Type token "${tok.trim()}" dropped` })
    }
  }

  const closed = status === 'done' || status === 'dropped' || status === 'superseded'
  let waiting_on: Person | null = null
  if (!closed) {
    if (typePerson) waiting_on = typePerson
    else if (status === 'blocked') {
      const pm = /\b(owner|client|dba|infra|ops)\b/i.exec(statusText)
      if (pm) waiting_on = pm[1].toLowerCase() as Person
    }
  }

  const blocked = parseBlockedBy(found['blocked by']?.text ?? '')
  return {
    type,
    status,
    status_note: statusText === '' ? null : statusText,
    waiting_on,
    blocked_by: blocked.refs,
    blocked_note: blocked.note,
    related: [],
    superseded_by,
    pr: [],
    ado: [],
    afk,
    legacyRule: rule,
    warnings,
    lines: {
      ...(found.status ? { status: found.status.line, superseded_by: found.status.line, waiting_on: found.status.line } : {}),
      ...(found['blocked by'] ? { blocked_by: found['blocked by'].line } : {}),
    },
  }
}

// ---- parseFile ---------------------------------------------------------------

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : v == null ? null : String(v)
}
function strList(v: unknown): string[] {
  if (v == null) return []
  return (Array.isArray(v) ? v : [v]).filter((x) => x != null).map(String)
}
function numList(v: unknown): number[] {
  return (Array.isArray(v) ? v : v == null ? [] : [v]).map(Number).filter((n) => Number.isFinite(n))
}

type FmDiag = (code: string, message: string, key: string) => void

function fmTicketMeta(fm: Frontmatter, diag: FmDiag): TicketMeta {
  let status = strOrNull(fm.status) as Status | null
  if (status === null || !STATUSES.includes(status)) {
    if (status !== null) diag('FM_ENUM', `Unknown status "${status}"`, 'status')
    status = 'unknown'
  }
  let waiting_on = strOrNull(fm.waiting_on) as Person | null
  if (waiting_on !== null && !PERSONS.includes(waiting_on)) {
    diag('FM_ENUM', `Unknown waiting_on "${waiting_on}"`, 'waiting_on')
    waiting_on = null
  }
  const type = strList(fm.type)
  for (const t of type) if (!TYPES.includes(t)) diag('FM_ENUM', `Unknown type "${t}"`, 'type')
  return {
    type,
    status,
    status_note: strOrNull(fm.status_note),
    waiting_on,
    blocked_by: strList(fm.blocked_by),
    blocked_note: strOrNull(fm.blocked_note),
    related: strList(fm.related),
    superseded_by: strOrNull(fm.superseded_by),
    pr: numList(fm.pr),
    ado: numList(fm.ado),
    afk: fm.afk === true,
  }
}

function fmMapMeta(fm: Frontmatter, diag: FmDiag): MapMeta {
  let status = strOrNull(fm.status) as MapMeta['status']
  if (status !== null && !(MAP_STATUSES as readonly string[]).includes(status)) {
    diag('FM_ENUM', `Unknown map status "${status}"`, 'status')
    status = null
  }
  const ado = numList(fm.ado)[0]
  return { status, ado: ado ?? null, superseded_by: strOrNull(fm.superseded_by) }
}

/**
 * `rootName` names the space at the docs folder itself (the repo folder's name); the parser has no
 * file system, so the caller says it. Without it, a ticket straight under the docs folder is not a ticket.
 * A space that is not under modules/ is settled for non-ticket files in the cross-file pass.
 */
export function parseFile(file: SourceFile, rootName = ''): DocRecord {
  const { path, text } = file
  const ts = ticketSpace(path, rootName)
  const space = ts?.space ?? SPACE_PATH.exec(path)?.[1] ?? null
  const base = path.split('/').pop()!
  const kind: DocRecord['kind'] = ts ? 'ticket' : base === 'map.md' ? 'map' : 'doc'
  const num = ts ? ts.num : null
  const key = ts && num ? `${ts.space} ${pad2(num)}` : null

  const fm = readFrontmatter(text)
  const legacy = fm === null
  const bodyLine = fm ? fm.bodyLine : 1
  const body = fm ? splitLines(text).slice(bodyLine - 1).join('\n') : text
  const scan = scanDoc(body, bodyLine - 1, legacy)

  const diagnostics: Diagnostic[] = []
  const push = (line: number, code: string, level: 'error' | 'warning', message: string) =>
    diagnostics.push({ path, line, code, level, message })
  if (!fm && hasUnclosedFrontmatter(text)) {
    push(1, 'FM_PARSE', 'error', 'The frontmatter block opens with --- but never closes; the file is read as legacy')
  }
  for (const d of fm?.diagnostics ?? []) push(d.line, d.code, 'error', d.message)
  for (const d of scan.diagnostics) push(d.line, d.code, d.level, d.message)

  let meta: DocRecord['meta'] = null
  let legacyRule: DocRecord['legacyRule'] = null
  let fmLines: Record<string, number> = {}
  const diagAt: FmDiag = (c, m, key) => push(fm?.keyLines[key] ?? 1, c, 'error', m)
  if (kind === 'ticket') {
    if (fm) {
      meta = fmTicketMeta(fm.data, diagAt)
      fmLines = fm.keyLines
    } else {
      const lg = parseLegacy(text)
      legacyRule = lg.legacyRule
      fmLines = lg.lines
      for (const w of lg.warnings) push(w.line, w.code, 'warning', w.message)
      const { legacyRule: _r, warnings: _w, lines: _l, ...rest } = lg
      meta = rest
    }
  } else if (kind === 'map') {
    meta = fm ? fmMapMeta(fm.data, diagAt) : { status: null, ado: null, superseded_by: null }
    if (fm) fmLines = fm.keyLines
  }

  const h1 = scan.headings.find((h) => h.level === 1)
  const title = h1 ? h1.text.replace(/^\d{2,}\s*[—–-]\s*/, '') : base.replace(/\.md$/i, '')

  return {
    path,
    mtime: file.mtime,
    kind,
    space,
    num,
    key,
    title,
    legacy,
    meta,
    legacyRule,
    bodyLine,
    headings: scan.headings,
    items: scan.items,
    links: scan.links,
    map: kind === 'map' ? { kanban: /<!--\s*tickets:begin\b[^>]*\bview=kanban\b/.test(text), issuesDir: dirname(path) === '' ? 'issues' : `${dirname(path)}/issues` } : null,
    hasMermaid: scan.hasMermaid,
    diagnostics,
    fmLines,
  }
}

// ---- references and links (section 2.4 to 2.6) --------------------------------

/** Item ids, then explicit anchors, then heading slugs (lowercase fragment). */
function lookupFragment(rec: DocRecord, fragment: string): { ok: boolean; itemId: string | null } {
  const f = fragment.toLowerCase()
  for (const it of rec.items) if (it.id === f || it.fragments?.includes(f)) return { ok: true, itemId: it.id }
  for (const h of rec.headings) if (h.anchor === f) return { ok: true, itemId: null }
  for (const h of rec.headings) if (h.slug === f) return { ok: true, itemId: null }
  return { ok: false, itemId: null }
}

function resolveInFile(path: string, fragment: string | null, index: Index): Resolved {
  const rec = index.files[path]
  if (!rec) return { kind: 'internal', path, fragment, itemId: null, ok: false, problem: 'no-file' }
  if (!fragment) return { kind: 'internal', path, fragment: null, itemId: null, ok: true }
  const r = lookupFragment(rec, fragment)
  return r.ok
    ? { kind: 'internal', path, fragment, itemId: r.itemId, ok: true }
    : { kind: 'internal', path, fragment, itemId: null, ok: false, problem: 'no-anchor' }
}

function spaceOf(path: string, index: Index): string | null {
  return index.files[path]?.space ?? SPACE_PATH.exec(path)?.[1] ?? null
}

/** The map of a space: modules/<space>/map.md, else the shortest map.md path of that space. */
function mapOfSpace(space: string, index: Index): string | null {
  const modular = `modules/${space}/map.md`
  if (index.files[modular]) return modular
  let best: string | null = null
  for (const rec of Object.values(index.files)) {
    if (rec.kind === 'map' && rec.space === space && (best === null || rec.path.length < best.length)) best = rec.path
  }
  return best
}

export function resolveRef(ref: string, fromPath: string, index: Index): Resolved {
  const bad: Resolved = { kind: 'internal', path: null, fragment: null, itemId: null, ok: false, problem: 'bad-ref' }
  const noFile = (frag: string | null): Resolved => ({ kind: 'internal', path: null, fragment: frag, itemId: null, ok: false, problem: 'no-file' })
  let m = /^(\d+)(?:#([a-z]+\d+))?$/.exec(ref)
  let space: string | null
  if (m) {
    space = spaceOf(fromPath, index)
    if (!space) return bad
    const path = index.tickets[`${space} ${pad2(m[1])}`]
    return path ? resolveInFile(path, m[2] ?? null, index) : noFile(m[2] ?? null)
  }
  m = /^([^\s#][^#]*?) (\d+)(?:#([a-z]+\d+))?$/.exec(ref)
  if (m) {
    const path = index.tickets[`${m[1]} ${pad2(m[2])}`]
    return path ? resolveInFile(path, m[3] ?? null, index) : noFile(m[3] ?? null)
  }
  m = /^([^\s#][^#]*)#([a-z]+\d+)$/.exec(ref)
  if (m) {
    const path = mapOfSpace(m[1], index)
    return path ? resolveInFile(path, m[2], index) : noFile(m[2])
  }
  return bad
}

export function resolveHref(href: string, fromPath: string, index: Index): Resolved {
  const scheme = /^([a-z][a-z0-9+.-]+):/i.exec(href)
  if (scheme) {
    // only these four are links the viewer may open (spec 2.5.1); javascript:, file: and the rest are refused
    return ['http', 'https', 'mailto', 'vscode'].includes(scheme[1].toLowerCase())
      ? { kind: 'external', path: null, fragment: null, itemId: null, ok: true }
      : { kind: 'external', path: null, fragment: null, itemId: null, ok: false, problem: 'bad-scheme' }
  }
  const hash = href.indexOf('#')
  let rawPath = hash < 0 ? href : href.slice(0, hash)
  let fragment = hash < 0 ? '' : href.slice(hash + 1)
  const q = rawPath.indexOf('?')
  if (q >= 0) rawPath = rawPath.slice(0, q)
  rawPath = rawPath.replace(/\\/g, '/')
  const decode = (s: string): string => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s // keep the raw text
    }
  }
  fragment = decode(fragment)
  const frag = fragment === '' ? null : fragment.toLowerCase()
  if (rawPath === '') return resolveInFile(fromPath, frag, index)
  const out: string[] = []
  // split first, then decode per segment, so an encoded slash stays inside its segment
  const given = rawPath.split('/').map(decode)
  const segs = rawPath.startsWith('/') ? given : [...dirname(fromPath).split('/').filter(Boolean), ...given]
  for (const s of segs) {
    if (s === '' || s === '.') continue
    if (s === '..') {
      if (out.length === 0) return { kind: 'outside', path: null, fragment: frag, itemId: null, ok: false }
      out.pop()
    } else out.push(s)
  }
  return resolveInFile(out.join('/'), frag, index)
}

// ---- fragments and plain-text refs (section 2.4, 2.7) --------------------------

export function extractFragment(text: string, rec: DocRecord, fragment: string): LineRange | null {
  const f = fragment.toLowerCase()
  for (const it of rec.items) if (it.id === f || it.fragments?.includes(f)) return { start: it.line, end: it.endLine }
  let k = rec.headings.findIndex((h) => h.anchor === f)
  if (k < 0) k = rec.headings.findIndex((h) => h.slug === f)
  if (k < 0) return null
  const h = rec.headings[k]
  const lines = splitLines(text)
  let bound = lines.length + 1
  for (let j = k + 1; j < rec.headings.length; j++) {
    if (rec.headings[j].level <= h.level) {
      bound = rec.headings[j].line
      break
    }
  }
  let end = Math.min(bound - 1, lines.length)
  while (end > h.line && (lines[end - 1] ?? '').trim() === '') end--
  return { start: h.line, end }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One compiled space regex per index.spaces array (a new array comes with every new index). */
const SPACE_RE_CACHE = new WeakMap<string[], RegExp>()

function spaceRegex(spaces: string[]): RegExp {
  let re = SPACE_RE_CACHE.get(spaces)
  if (!re) {
    const names = [...spaces].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
    re = new RegExp(`(?<![\\w-])(${names})(?: ticket)? (\\d{2,})(?: (Q|D|AC|R)(\\d+))?(?![\\w-])`, 'g')
    SPACE_RE_CACHE.set(spaces, re)
  }
  re.lastIndex = 0
  return re
}

export function scanText(text: string, fromPath: string, index: Index): TextRef[] {
  const out: TextRef[] = []
  const overlaps = (s: number, e: number) => out.some((r) => s < r.end && e > r.start)
  const fromSpace = spaceOf(fromPath, index)

  if (index.spaces.length > 0) {
    const re = spaceRegex(index.spaces)
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const path = index.tickets[`${m[1]} ${pad2(m[2])}`]
      if (!path) continue
      if (m[3]) {
        const to = resolveInFile(path, `${m[3]}${m[4]}`.toLowerCase(), index)
        if (to.ok) {
          out.push({ start: m.index, end: m.index + m[0].length, kind: 'item', to })
          continue
        }
        const end = m.index + m[0].length - (m[3].length + m[4].length + 1)
        out.push({ start: m.index, end, kind: 'ticket', to: resolveInFile(path, null, index) })
        continue
      }
      out.push({ start: m.index, end: m.index + m[0].length, kind: 'ticket', to: resolveInFile(path, null, index) })
    }
  }

  if (fromSpace) {
    const re = /(?<![\w-])ticket (\d{2,})(?![\w-])/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length
      if (overlaps(m.index, end)) continue
      const path = index.tickets[`${fromSpace} ${pad2(m[1])}`]
      if (path) out.push({ start: m.index, end, kind: 'ticket', to: resolveInFile(path, null, index) })
    }
  }

  const ado = /(?<![\w-])(?:card|ado|work item) (\d{5})(?![\w-])/gi
  let m: RegExpExecArray | null
  while ((m = ado.exec(text))) {
    out.push({ start: m.index, end: m.index + m[0].length, kind: 'ado', to: null, ado: Number(m[1]) })
  }
  return out.sort((a, b) => a.start - b.start)
}

// ---- the index (build, update, cross-file pass) --------------------------------

const EMPTY_INDEX: Index = { version: 1, files: {}, spaces: [], rootName: '', tickets: {}, edges: [], diagnostics: [] }

/** `rootName` is the repo folder's name: the space of tickets and maps at the docs folder itself. */
export function buildIndex(files: Iterable<SourceFile>, rootName = ''): Index {
  return updateIndex({ ...EMPTY_INDEX, rootName }, [...files], [])
}

/** Re-parses only `changed`, drops `removed`, then reruns the cross-file pass in full. */
export function updateIndex(index: Index, changed: SourceFile[], removed: string[]): Index {
  const parsed: Record<string, DocRecord> = { ...index.files }
  for (const p of removed) delete parsed[p]
  for (const f of changed) {
    if (isHidden(f.path)) delete parsed[f.path]
    else parsed[f.path] = parseFile(f, index.rootName)
  }
  return crossFile(parsed, index.rootName ?? '')
}

/**
 * The folders that count as a space outside modules/: one that holds a map.md or an issues/ folder.
 * '' is the docs folder itself. Only files that modules/ does not already place are looked at.
 */
function spaceDirs(parsed: Record<string, DocRecord>): Set<string> {
  const dirs = new Set<string>()
  for (const p of Object.keys(parsed)) {
    if (SPACE_PATH.test(p) || CROSS_CUTTING.test(p)) continue
    const segs = p.split('/')
    segs.pop()
    if (p.endsWith('/map.md') || p === 'map.md') dirs.add(segs.join('/'))
    segs.forEach((seg, i) => {
      if (seg === 'issues') dirs.add(segs.slice(0, i).join('/'))
    })
  }
  return dirs
}

function crossFile(parsed: Record<string, DocRecord>, rootName: string): Index {
  const paths = Object.keys(parsed).sort()
  // A file outside modules/ that is not a ticket belongs to the nearest folder above it that is a space.
  const dirs = spaceDirs(parsed)
  for (const p of paths) {
    const rec = parsed[p]
    if (rec.kind === 'ticket' || SPACE_PATH.test(p) || CROSS_CUTTING.test(p)) continue
    const segs = p.split('/')
    segs.pop()
    let space: string | null = null
    for (let n = segs.length; n >= 0 && space === null; n--) {
      if (dirs.has(segs.slice(0, n).join('/'))) space = n === 0 ? rootName || null : segs[n - 1]
    }
    if (space !== rec.space) parsed[p] = { ...rec, space }
  }
  const spaces = new Set<string>()
  const tickets: Record<string, string> = {}
  const diagnostics: Diagnostic[] = []
  for (const p of paths) {
    const rec = parsed[p]
    if (rec.space) spaces.add(rec.space)
    if (rec.key) {
      if (tickets[rec.key]) {
        diagnostics.push({
          path: p, line: 1, code: 'DUP_NUM', level: 'error',
          message: `Ticket ${rec.key} is also ${tickets[rec.key]}`,
        })
      } else tickets[rec.key] = p
    }
  }
  const index: Index = { version: 1, files: {}, spaces: [...spaces].sort(), rootName, tickets, edges: [], diagnostics }

  // The records are shared with the previous index, so work on copies of the parts we fill in.
  for (const p of paths) index.files[p] = { ...parsed[p] }
  for (const p of paths) {
    const rec = index.files[p]
    rec.links = rec.links.map((l) => (l.image ? { ...l, resolved: undefined } : { ...l, resolved: resolveHref(l.href, p, index) }))
    for (const l of rec.links) {
      const r = l.resolved
      if (r && r.kind === 'internal' && !r.ok) {
        diagnostics.push({
          path: p, line: l.line, code: 'LINK', level: 'warning',
          message: `${r.problem === 'no-anchor' ? 'No such anchor' : 'No such file'}: ${l.href}`,
        })
      }
    }
    if (rec.kind === 'ticket' && rec.meta) {
      const m = rec.meta as TicketMeta
      const fields: [Edge['field'], string[]][] = [
        ['blocked_by', m.blocked_by],
        ['related', m.related],
        ['superseded_by', m.superseded_by ? [m.superseded_by] : []],
      ]
      for (const [field, refs] of fields) {
        for (const ref of refs) {
          const to = resolveRef(ref, p, index)
          const toSpace = to.path ? index.files[to.path]?.space ?? null : null
          index.edges.push({ from: p, field, ref, to, crossSpace: to.path !== null && toSpace !== rec.space })
          if (!to.ok) {
            diagnostics.push({
              path: p, line: rec.fmLines[field] ?? 1, code: 'FM_REF', level: rec.legacy ? 'warning' : 'error',
              message: `${field} "${ref}" does not resolve (${to.problem})`,
            })
          }
        }
      }
    }
  }
  return index
}
