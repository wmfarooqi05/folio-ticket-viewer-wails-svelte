// Cross-space views over the parser index (ticket 12, docs/issues/12-cross-space-views.md).
// Pure functions: no DOM, no Svelte, no clock (callers pass `now`). The views are one-line
// filters over `Index`, and the tree's pinned counts come from the same functions, so a
// count and the list it opens cannot disagree.

import type { DocRecord, Index, Item, Person, Status, TicketMeta } from './parser'

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
  /** oldest edit first */
  rows: TicketRec[]
}

/** Tickets with `waiting_on` set and not closed, grouped by person, Owner first. Empty groups are left out. */
export function waitingOn(index: Index): WaitingGroup[] {
  const rows = Object.values(index.files).filter(
    (r): r is TicketRec => isTicket(r) && r.meta.waiting_on !== null && !isClosed(r.meta.status),
  )
  return PEOPLE.map((person) => ({
    person,
    label: PERSON_LABEL[person],
    rows: rows.filter((r) => r.meta.waiting_on === person).sort(byOldest),
  })).filter((g) => g.rows.length > 0)
}

export function waitingCount(index: Index): number {
  return waitingOn(index).reduce((n, g) => n + g.rows.length, 0)
}

/** Distinct spaces among the waiting tickets (the header summary). */
export function waitingSpaces(groups: WaitingGroup[]): number {
  return new Set(groups.flatMap((g) => g.rows.map((r) => r.space))).size
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
  const prefix = `modules/${rec.space}/`
  const rel = rec.space && rec.path.startsWith(prefix) ? rec.path.slice(prefix.length) : rec.path
  return `${rec.space ?? ''} · ${rel}`
}

// ---- Board ---------------------------------------------------------------------

export type ColumnId = 'open' | 'in-progress' | 'blocked' | 'in-review' | 'done'

export const COLUMNS: readonly { id: ColumnId; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'in-review', label: 'In review' },
  { id: 'done', label: 'Done' },
]

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
  const dir = index.files[mapPath]?.map?.issuesDir
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
    const target = e.to.path ? index.files[e.to.path] : undefined
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
  'in-review': 'var(--s-rev)',
  done: 'var(--s-done)',
  dropped: 'var(--s-mute)',
  superseded: 'var(--s-mute)',
  unknown: 'var(--s-open)',
}

// ---- tree pinned entries ---------------------------------------------------------

export interface PinnedCounts {
  waiting: number
  /** with closed tickets hidden, the default (04 D6) */
  questions: number
}

/** Counts for the tree's pinned rows. Same functions as the views. */
export function pinnedCounts(index: Index): PinnedCounts {
  return { waiting: waitingCount(index), questions: openQuestions(index).length }
}
