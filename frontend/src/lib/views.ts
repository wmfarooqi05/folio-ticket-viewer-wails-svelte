// Cross-space views over the parser index (ticket 12, docs/issues/12-cross-space-views.md).
// Pure functions: no DOM, no Svelte, no clock (callers pass `now`). The views are one-line
// filters over `Index`, and the tree's pinned counts come from the same functions, so a
// count and the list it opens cannot disagree.

import { fileAt, type DocRecord, type Index, type Item, type Person, type Status, type TicketMeta } from './parser'

/** The cross-space views reachable from the tree's pinned rows. */
export type ViewId = 'waiting' | 'questions'

export const PEOPLE: readonly Person[] = ['owner', 'client', 'dba', 'infra', 'ops']

export const PERSON_LABEL: Record<Person, string> = {
  owner: 'Owner',
  client: 'Client',
  dba: 'DBA',
  infra: 'Infra',
  ops: 'Ops',
}

const CLOSED: readonly Status[] = ['done', 'dropped', 'superseded']

/** done, dropped and superseded tickets are closed (04 D6, A9). */
export function isClosed(status: Status): boolean {
  return CLOSED.includes(status)
}

type TicketRec = DocRecord & { meta: TicketMeta }

function isTicket(rec: DocRecord): rec is TicketRec {
  return rec.kind === 'ticket' && rec.meta !== null
}

/** Numeric-aware: "05" < "10" < "100". Ties broken by path so the order is total. */
function byNum(a: DocRecord, b: DocRecord): number {
  const d = parseInt(a.num ?? '0', 10) - parseInt(b.num ?? '0', 10)
  return d !== 0 ? d : a.path.localeCompare(b.path)
}

/** Oldest edit first, then by path so the order is total. */
function byOldest(a: DocRecord, b: DocRecord): number {
  return a.mtime - b.mtime || a.path.localeCompare(b.path)
}

const DAY = 86_400_000

/** "Edited N days ago" (03 D4): whole days since mtime, never negative. */
export function ageDays(mtime: number, now: number): number {
  return Math.max(0, Math.floor((now - mtime) / DAY))
}

export function ageLabel(days: number): string {
  return days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
}

/** Spec 1.2: bar tone and fill fraction (age/20, capped). */
export function ageTone(days: number): 'block' | 'rev' | 'idle' {
  return days >= 14 ? 'block' : days >= 7 ? 'rev' : 'idle'
}
export function ageFill(days: number): number {
  return Math.min(1, days / 20)
}

// ---- Waiting on --------------------------------------------------------------

export interface WaitingGroup {
  person: Person
  label: string
  /**
   * Owner only (ticket 41, ticket 37 D4): the Needs verification tickets, lifted above the rest of the
   * group, oldest first. Empty for everyone else.
   */
  verify: TicketRec[]
  /** the rest, oldest first */
  rows: TicketRec[]
}

/**
 * When a ticket started waiting, for its age (unix ms), or null for no age (ticket 41, Q3). A ticket in the
 * factory's mirror is rewritten on every factory write, so its mtime means nothing: it has an age only
 * when its board block says `Waiting since`. Any other ticket keeps its mtime (03 D4).
 */
export function waitingSince(rec: DocRecord): number | null {
  if (!rec.board) return rec.mtime
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(rec.board.waitingSince ?? '')
  if (!m) return null
  const t = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0).getTime()
  return Number.isNaN(t) ? null : t
}

/** Oldest wait first; tickets with no known age last, by path. */
function byWaiting(a: DocRecord, b: DocRecord): number {
  const x = waitingSince(a)
  const y = waitingSince(b)
  if (x === null || y === null) return x === y ? a.path.localeCompare(b.path) : x === null ? 1 : -1
  return x - y || a.path.localeCompare(b.path)
}

/** "2h", "1d", "12d": a short age for the Needs verification rows (the mockup's). */
export function shortAge(since: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - since) / 60_000))
  if (mins < 60) return mins <= 1 ? 'now' : `${mins}m`
  const hours = Math.floor(mins / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

/**
 * Tickets with `waiting_on` set and not closed, grouped by person, Owner first. Empty groups are left
 * out. The owner's Needs verification tickets come first in their group, in `verify`.
 */
export function waitingOn(index: Index): WaitingGroup[] {
  const rows = Object.values(index.files).filter(
    (r): r is TicketRec => isTicket(r) && r.meta.waiting_on !== null && !isClosed(r.meta.status),
  )
  return PEOPLE.map((person) => {
    const mine = rows.filter((r) => r.meta.waiting_on === person)
    const verify = person === 'owner' ? mine.filter((r) => r.meta.status === 'needs-verification').sort(byWaiting) : []
    return {
      person,
      label: PERSON_LABEL[person],
      verify,
      rows: mine.filter((r) => !verify.includes(r)).sort(byWaiting),
    }
  }).filter((g) => g.verify.length + g.rows.length > 0)
}

export function waitingCount(index: Index): number {
  return waitingOn(index).reduce((n, g) => n + g.verify.length + g.rows.length, 0)
}

/** Needs verification tickets waiting on the owner: the tree's "N to verify" (ticket 41). */
export function verifyCount(index: Index): number {
  return waitingOn(index).find((g) => g.person === 'owner')?.verify.length ?? 0
}

/** Distinct spaces among the waiting tickets (the header summary). */
export function waitingSpaces(groups: WaitingGroup[]): number {
  return new Set(groups.flatMap((g) => [...g.verify, ...g.rows].map((r) => r.space))).size
}

/** The docs folder is the factory's mirror when any ticket in it has a board block (ticket 41, Q2). */
export const isMirror = (index: Index): boolean => Object.values(index.files).some((r) => r.board !== null && r.board !== undefined)

/** "1 video · 3 images", from the board block itself (no server call): the Needs you rows' evidence summary. */
export function evidenceCounts(rec: DocRecord): string {
  const files = rec.board?.evidence?.reachable ? rec.board.evidence.files : []
  const n = (k: string) => files.filter((f) => f.kind === k).length
  const parts: string[] = []
  const v = n('video')
  const i = n('image')
  if (v) parts.push(`${v} ${v === 1 ? 'video' : 'videos'}`)
  if (i) parts.push(`${i} ${i === 1 ? 'image' : 'images'}`)
  return parts.join(' · ')
}

// ---- Open questions ------------------------------------------------------------

export interface QuestionRow {
  rec: DocRecord
  item: Item
  /** the owning file is a closed ticket (hidden by default, 04 D6) */
  closed: boolean
}

/**
 * Q items with no Answered marker (state "open"), oldest file edit first. Q items of done,
 * dropped or superseded tickets are hidden unless `includeClosed` (04 D6).
 */
export function openQuestions(index: Index, includeClosed = false): QuestionRow[] {
  const rows: QuestionRow[] = []
  for (const rec of Object.values(index.files)) {
    const closed = isTicket(rec) && isClosed(rec.meta.status)
    if (closed && !includeClosed) continue
    for (const item of rec.items) if (item.kind === 'Q' && item.state === 'open') rows.push({ rec, item, closed })
  }
  return rows.sort((a, b) => byOldest(a.rec, b.rec) || a.item.line - b.item.line)
}

export function questionSpaces(rows: QuestionRow[]): number {
  return new Set(rows.map((r) => r.rec.space)).size
}

/** "Where" label: the ticket key, or "space · map.md" for a map. */
export function questionWhere(rec: DocRecord): string {
  if (rec.key) return rec.key
  // A nested map shows its path inside the space: "space · step2b/map.md"
  // inside the space's folder: modules/<space>/ or, for a space found by its map.md or issues/, <space>/
  const prefixes = [`modules/${rec.space}/`, `${rec.space}/`]
  const prefix = rec.space ? prefixes.find((p) => rec.path.startsWith(p)) : undefined
  const rel = prefix ? rec.path.slice(prefix.length) : rec.path
  return `${rec.space ?? ''} · ${rel}`
}

// ---- Board ---------------------------------------------------------------------

export type ColumnId = 'open' | 'in-progress' | 'blocked' | 'needs-verification' | 'in-review' | 'done'

export const COLUMNS: readonly { id: ColumnId; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'needs-verification', label: 'Needs verification' },
  { id: 'in-review', label: 'In review' },
  { id: 'done', label: 'Done' },
]

/** Board column sizes (ticket 37 D6): a full column, a folded rail, and the gap between them. */
export const COLUMN_MIN = 168
export const RAIL = 40
export const COLUMN_GAP = 8
/** The order columns fold in when the board is narrow. In progress and Needs verification never fold. */
export const FOLD_ORDER: readonly ColumnId[] = ['done', 'open', 'in-review', 'blocked']

/** The width the board needs with `folded` columns as rails. */
export const boardWidth = (folded: number, columns = COLUMNS.length): number =>
  (columns - folded) * COLUMN_MIN + folded * RAIL + (columns - 1) * COLUMN_GAP

/**
 * Which columns fold to rails at `width` (D6). 1,048px holds all six; below that, Done folds first, then
 * Open, In review, Blocked. A rail the owner opened stays open and nothing folds in its place: the board
 * scrolls sideways instead, as the design says.
 */
export function foldedColumns(width: number, opened: ReadonlySet<ColumnId> = new Set()): Set<ColumnId> {
  const folded = new Set<ColumnId>()
  for (const id of FOLD_ORDER) {
    if (boardWidth(folded.size) <= width) break
    folded.add(id)
  }
  for (const id of opened) folded.delete(id)
  return folded
}

export interface Blocker {
  /** the ref as written: "05", "cloud-migration 07#q3" */
  ref: string
  /** target ticket path, or null when it does not resolve to a file */
  path: string | null
}

export interface BoardData {
  columns: { id: ColumnId; label: string; cards: TicketRec[] }[]
  /** dropped and superseded */
  strip: TicketRec[]
  total: number
  /** blocker chips by ticket path (cards with none have no entry) */
  blockers: Record<string, Blocker[]>
  /** header line: "N tickets · N open · N blocked", open = not done, dropped or superseded */
  summary: { total: number; open: number; blocked: number }
}

/** The tickets of a map: the files directly in its issues folder. */
export function mapTickets(index: Index, mapPath: string): TicketRec[] {
  const dir = fileAt(index, mapPath)?.map?.issuesDir
  if (dir === undefined) return []
  return Object.values(index.files)
    .filter((r): r is TicketRec => isTicket(r) && r.path.slice(0, r.path.lastIndexOf('/')) === dir)
    .sort(byNum)
}

/**
 * Kanban columns for one map. Dropped and superseded go to the strip. A ticket whose status the
 * parser could not read (`unknown`) is shown in Open, so no ticket disappears from the board.
 */
export function boardFor(index: Index, mapPath: string): BoardData {
  const tickets = mapTickets(index, mapPath)
  const columns = COLUMNS.map((c) => ({
    ...c,
    cards: tickets.filter((t) => (t.meta.status === 'unknown' ? c.id === 'open' : t.meta.status === c.id)),
  }))
  const strip = tickets.filter((t) => t.meta.status === 'dropped' || t.meta.status === 'superseded')
  const blocked = tickets.filter((t) => t.meta.status === 'blocked').length
  const open = tickets.filter((t) => !isClosed(t.meta.status)).length
  return {
    columns,
    strip,
    total: tickets.length,
    blockers: blockersByTicket(index, new Set(tickets.map((t) => t.path))),
    summary: { total: tickets.length, open, blocked },
  }
}

/**
 * Blocker chips per ticket path, from one pass over the edges. A chip is left out when its
 * target ticket is closed, or when it points at an item (`05#q3`) that is no longer open.
 */
function blockersByTicket(index: Index, paths: Set<string>): Record<string, Blocker[]> {
  const out: Record<string, Blocker[]> = {}
  for (const e of index.edges) {
    if (e.field !== 'blocked_by' || !paths.has(e.from)) continue
    const target = e.to.path ? fileAt(index, e.to.path) : undefined
    if (target && isTicket(target) && isClosed(target.meta.status)) continue
    if (target && e.to.itemId) {
      const item = target.items.find((i) => i.id === e.to.itemId || i.fragments?.includes(e.to.itemId!))
      if (item && item.state !== 'open') continue
    }
    ;(out[e.from] ??= []).push({ ref: e.ref, path: target ? target.path : null })
  }
  return out
}

// ---- presentation helpers --------------------------------------------------------

/** The CSS variable that colours a status (spec 1.2). `unknown` is drawn as an outline dot by the views. */
export const STATUS_VAR: Record<Status, string> = {
  open: 'var(--s-open)',
  'in-progress': 'var(--s-prog)',
  blocked: 'var(--s-block)',
  'needs-verification': 'var(--s-verify)',
  'in-review': 'var(--s-rev)',
  done: 'var(--s-done)',
  dropped: 'var(--s-mute)',
  superseded: 'var(--s-mute)',
  unknown: 'var(--s-open)',
}

// ---- tree pinned entries ---------------------------------------------------------

export interface PinnedCounts {
  waiting: number
  /** Needs verification tickets waiting on the owner (ticket 41) */
  verify: number
  /** with closed tickets hidden, the default (04 D6) */
  questions: number
}

/** Counts for the tree's pinned rows. Same functions as the views. */
export function pinnedCounts(index: Index): PinnedCounts {
  return { waiting: waitingCount(index), verify: verifyCount(index), questions: openQuestions(index).length }
}
