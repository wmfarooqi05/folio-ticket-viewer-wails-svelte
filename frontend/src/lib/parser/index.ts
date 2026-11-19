// Folio parser module: the contract from ticket 04 (docs/issues/04-parser-contract.md,
// types from docs/assets/04-parser-contract-draft.md section 1).
//
// Rules for this folder: no imports at all, no DOM, no Svelte, no Node. It must stay a
// pure module so it can move into the other repo as `scripts/tickets/lib.mjs`. All
// output is plain JSON (no Map, Set, class or Date), so the index can be cached.
//
// Walking skeleton: only buildIndex is real, and it is trivial (path, kind, title).
// Everything else throws until its slice lands. TODO(ticket 04): the real parser.

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
  map: { kanban: boolean; issuesDir: string | null } | null
  hasMermaid: boolean
  diagnostics: Diagnostic[]
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
export type LegacyMeta = Partial<TicketMeta> & { legacyRule: DocRecord['legacyRule'] }

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
  problem?: 'no-file' | 'no-anchor' | 'bad-ref'
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

// ---- the viewer API (5 functions) -------------------------------------------

/** Trivial for now: every file becomes a DocRecord with a path, kind and title. */
export function buildIndex(files: Iterable<SourceFile>): Index {
  const records: Record<string, DocRecord> = {}
  const spaces = new Set<string>()
  const tickets: Record<string, string> = {}

  for (const file of files) {
    const rec = skeletonRecord(file)
    records[rec.path] = rec
    if (rec.space) spaces.add(rec.space)
    if (rec.key) tickets[rec.key] = rec.path
  }

  return {
    version: 1,
    files: records,
    spaces: [...spaces].sort(),
    tickets,
    edges: [],
    diagnostics: [],
  }
}

export function updateIndex(_index: Index, _changed: SourceFile[], _removed: string[]): Index {
  throw new Error('not implemented: ticket 04 (parser slices)')
}

export function resolveHref(_href: string, _fromPath: string, _index: Index): Resolved {
  throw new Error('not implemented: ticket 04 (link resolution slice)')
}

export function extractFragment(_text: string, _rec: DocRecord, _fragment: string): LineRange | null {
  throw new Error('not implemented: ticket 04 (right panel slice)')
}

export function scanText(_text: string, _fromPath: string, _index: Index): TextRef[] {
  throw new Error('not implemented: ticket 04 (autolink slice)')
}

// ---- the pieces (used by the CLI, the tests, and the functions above) --------

export function parseFile(_file: SourceFile): DocRecord {
  throw new Error('not implemented: ticket 04 (parseFile slice)')
}

export function parseFrontmatter(_text: string): Frontmatter | null {
  throw new Error('not implemented: ticket 04 (frontmatter slice)')
}

export function parseLegacy(_body: string): LegacyMeta {
  throw new Error('not implemented: ticket 04 (legacy fallback slice)')
}

export function parseItems(_body: string, _lineOffset: number, _legacy: boolean): Item[] {
  throw new Error('not implemented: ticket 04 (items slice)')
}

export function parseLinks(_body: string, _lineOffset: number): Link[] {
  throw new Error('not implemented: ticket 04 (links slice)')
}

export function resolveRef(_ref: string, _fromPath: string, _index: Index): Resolved {
  throw new Error('not implemented: ticket 04 (link resolution slice)')
}

// ---- trivial helpers (replaced by parseFile) ---------------------------------

const TICKET_PATH = /^modules\/([^/]+)\/(?:.+\/)?issues\/(\d+)-[^/]+\.md$/
const SPACE_PATH = /^modules\/([^/]+)\//

function skeletonRecord(file: SourceFile): DocRecord {
  const ticket = TICKET_PATH.exec(file.path)
  const space = SPACE_PATH.exec(file.path)?.[1] ?? null
  const isMap = file.path.endsWith('/map.md') || file.path === 'map.md'
  const num = ticket ? ticket[2] : null
  const slug = file.path.split('/').pop()!.replace(/\.md$/i, '')

  return {
    path: file.path,
    mtime: file.mtime,
    kind: ticket ? 'ticket' : isMap ? 'map' : 'doc',
    space,
    num,
    key: ticket && num ? `${ticket[1]} ${num.padStart(2, '0')}` : null,
    title: firstH1(file.text) ?? slug,
    legacy: !file.text.startsWith('---'),
    meta: null,
    legacyRule: null,
    bodyLine: 1,
    headings: [],
    items: [],
    links: [],
    map: null,
    hasMermaid: false,
    diagnostics: [],
  }
}

/** The first level-1 heading outside a code fence, without a leading "NN — ". */
function firstH1(text: string): string | null {
  let fenced = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) return m[1].replace(/^\d+\s*[—–-]\s+/, '')
  }
  return null
}
