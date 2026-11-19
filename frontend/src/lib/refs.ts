import type { DocRecord, Edge, Index, Status } from './parser'

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
  const target: DocRecord | undefined = to.path ? index.files[to.path] : undefined
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

/** The chips for one frontmatter field of one document. */
export function chipsFor(rec: DocRecord, field: Edge['field'], index: Index): ChipModel[] {
  return index.edges.filter((e) => e.from === rec.path && e.field === field).map((e) => chipFor(e, index, rec.space))
}
