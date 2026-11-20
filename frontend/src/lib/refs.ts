import { fileAt, type DocRecord, type Edge, type Index, type Status } from './parser'

/** What a blocker, related or superseded-by chip shows (03 spec, RefChip). */
export interface ChipModel {
  label: string
  /** the target's title, or why it does not resolve */
  title: string
  path: string | null
  fragment: string | null
  ok: boolean
  /** the target's status, for its dot */
  status: Status | null
  /** a blocker that is already done fades to .55 */
  resolved: boolean
}

/** Same space shows `05`, another space shows `space 05` (03 spec). */
export function chipFor(edge: Edge, index: Index, fromSpace: string | null): ChipModel {
  const to = edge.to
  const target: DocRecord | undefined = to.path ? fileAt(index, to.path) : undefined
  const frag = to.fragment ? `#${to.fragment}` : ''
  let label = edge.ref
  if (target?.key && target.num) {
    label = (target.space === fromSpace ? target.num : target.key) + frag
  }
  const status = target?.kind === 'ticket' && target.meta && 'status' in target.meta ? (target.meta.status as Status) : null
  return {
    label,
    title: !to.ok ? `Not found: ${edge.ref}` : (target?.title ?? edge.ref),
    path: to.ok ? to.path : null,
    fragment: to.ok ? (to.itemId ?? to.fragment) : null,
    ok: to.ok,
    status,
    resolved: edge.field === 'blocked_by' && status === 'done',
  }
}

function statusOf(rec: DocRecord | undefined): Status | null {
  return rec?.kind === 'ticket' && rec.meta && 'status' in rec.meta ? (rec.meta.status as Status) : null
}

/** Documents that name `rec` in blocked_by, related or superseded_by ("used by"), one chip each. */
export function usedBy(rec: DocRecord, index: Index): ChipModel[] {
  const seen = new Set<string>()
  const out: ChipModel[] = []
  for (const e of index.edges) {
    if (e.to.path !== rec.path || !e.to.ok || e.from === rec.path || seen.has(e.from)) continue
    seen.add(e.from)
    const from = index.files[e.from]
    if (!from) continue
    out.push({
      label: from.space === rec.space ? (from.num ?? from.key ?? from.path) : (from.key ?? from.path),
      title: from.title ?? from.path,
      path: from.path,
      fragment: null,
      ok: true,
      status: statusOf(from),
      resolved: false,
    })
  }
  return out
}

/** The document's own question items, as chips that open that item. */
export function questionChips(rec: DocRecord): ChipModel[] {
  return rec.items
    .filter((i) => i.kind === 'Q')
    .map((i) => ({ label: `Q${i.n}`, title: i.title, path: rec.path, fragment: i.id, ok: true, status: null, resolved: i.state !== 'open' }))
}

/** The chips for one frontmatter field of one document. */
export function chipsFor(rec: DocRecord, field: Edge['field'], index: Index): ChipModel[] {
  return index.edges.filter((e) => e.from === rec.path && e.field === field).map((e) => chipFor(e, index, rec.space))
}
