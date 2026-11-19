import type { DocRecord, TicketMeta } from './parser'
import { isOpenStatus } from './status'

export type TreeRow =
  | { kind: 'dir'; key: string; path: string; name: string; depth: number; count: number }
  | { kind: 'file'; key: string; name: string; depth: number; rec: DocRecord }

/** Folders and files whose name starts with "_" (the _templates folder) are not shown. */
const hidden = (path: string): boolean => path.split('/').some((seg) => seg.startsWith('_'))

/** True for a ticket whose status still needs someone (the open-count badge, 03 spec). */
export function isOpenTicket(rec: DocRecord): boolean {
  return rec.kind === 'ticket' && !!rec.meta && isOpenStatus((rec.meta as TicketMeta).status)
}

/**
 * Flattens records into display rows: a directory row whenever the folder changes.
 * A directory row carries `count`, the open tickets anywhere below it.
 */
export function buildRows(records: DocRecord[]): TreeRow[] {
  const sorted = records
    .filter((r) => !hidden(r.path))
    .sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
  const rows: TreeRow[] = []
  const open: string[] = []
  const dirRow = new Map<string, Extract<TreeRow, { kind: 'dir' }>>()

  for (const rec of sorted) {
    const parts = rec.path.split('/')
    const dirs = parts.slice(0, -1)

    let common = 0
    while (common < open.length && common < dirs.length && open[common] === dirs[common]) common++
    open.length = common
    for (let d = common; d < dirs.length; d++) {
      open.push(dirs[d])
      const path = dirs.slice(0, d + 1).join('/')
      const row = { kind: 'dir' as const, key: 'd:' + path, path, name: dirs[d], depth: d, count: 0 }
      dirRow.set(path, row)
      rows.push(row)
    }
    rows.push({ kind: 'file', key: rec.path, name: parts[parts.length - 1], depth: dirs.length, rec })
    if (isOpenTicket(rec)) for (let d = 0; d < dirs.length; d++) dirRow.get(dirs.slice(0, d + 1).join('/'))!.count++
  }
  return rows
}

/** Hides the rows under a folder that is not in `open`. */
export function visibleRows(rows: TreeRow[], open: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = []
  let skipBelow = Infinity // depth at which a closed folder hides what follows
  for (const r of rows) {
    if (r.depth <= skipBelow) skipBelow = Infinity
    if (r.depth > skipBelow) continue
    out.push(r)
    if (r.kind === 'dir' && !open.has(r.path)) skipBelow = r.depth
  }
  return out
}

/** The folders on the way to a file, so a selected document is never hidden in a closed folder. */
export function ancestors(path: string): string[] {
  const dirs = path.split('/').slice(0, -1)
  return dirs.map((_, i) => dirs.slice(0, i + 1).join('/'))
}

/** Records whose title or path contains the query (case-insensitive), in path order. */
export function searchRecords(records: DocRecord[], query: string): DocRecord[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return records
    .filter((r) => !hidden(r.path) && (r.title.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)))
    .sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
}
