import type { DocRecord } from './parser'

export type TreeRow =
  | { kind: 'dir'; key: string; name: string; depth: number }
  | { kind: 'file'; key: string; name: string; depth: number; rec: DocRecord }

/** Flattens records into display rows: a directory row whenever the folder changes. */
export function buildRows(records: DocRecord[]): TreeRow[] {
  const sorted = [...records].sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
  const rows: TreeRow[] = []
  const open: string[] = []

  for (const rec of sorted) {
    const parts = rec.path.split('/')
    const dirs = parts.slice(0, -1)

    let common = 0
    while (common < open.length && common < dirs.length && open[common] === dirs[common]) common++
    open.length = common
    for (let d = common; d < dirs.length; d++) {
      open.push(dirs[d])
      rows.push({ kind: 'dir', key: 'd:' + dirs.slice(0, d + 1).join('/'), name: dirs[d], depth: d })
    }
    rows.push({ kind: 'file', key: rec.path, name: parts[parts.length - 1], depth: dirs.length, rec })
  }
  return rows
}
