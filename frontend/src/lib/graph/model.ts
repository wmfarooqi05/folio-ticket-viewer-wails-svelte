// From the parser index to the graph's input: which tickets are shown, which edges are live
// and which blockers live outside the map (stubs). Pure, so the tests read it without a DOM.

import { fileAt, type DocRecord, type Index, type TicketMeta } from '../parser'
import { isClosed, mapTickets } from '../views'
import type { GraphInput } from './layout'

type TicketRec = DocRecord & { meta: TicketMeta }

export interface StubInfo {
  /** docs-relative path of the outside document; null for a ref that resolves to no file */
  path: string | null
  /** "space 07" for a ticket, the file name otherwise, the ref as written when unresolved */
  label: string
  title: string
  closed: boolean
  unresolved?: boolean
}

export interface GraphModel {
  input: GraphInput
  tickets: Map<string, TicketRec>
  stubs: Map<string, StubInfo>
  /** "from\0to" of the edges whose blocker is still open; the rest are resolved */
  live: Set<string>
  /** dropped and superseded tickets left out (03 spec, screen 5) */
  hidden: number
}

export const linkKey = (from: string, to: string): string => from + '\u0000' + to
export const stubId = (path: string): string => 'stub:' + path

/** One map's dependency graph, from `blocked_by` edges. Dropped and superseded tickets are hidden. */
export function graphFor(index: Index, mapPath: string): GraphModel {
  const all = mapTickets(index, mapPath)
  const inMap = new Set(all.map((t) => t.path))
  const shown = all.filter((t) => t.meta.status !== 'dropped' && t.meta.status !== 'superseded')
  const shownSet = new Set(shown.map((t) => t.path))

  const edges: GraphInput['edges'] = []
  const stubBlocks = new Map<string, Set<string>>()
  const stubs = new Map<string, StubInfo>()
  const live = new Set<string>()

  for (const e of index.edges) {
    if (e.field !== 'blocked_by' || !shownSet.has(e.from)) continue
    const target = e.to.path ? fileAt(index, e.to.path) : undefined
    if (!target) {
      // a blocker that does not resolve still blocks: a dashed "unresolved" stub, not a ticket
      // that looks free (the header card flags the same ref as not found)
      const id = 'unresolved:' + e.ref
      ;(stubBlocks.get(id) ?? stubBlocks.set(id, new Set()).get(id)!).add(e.from)
      if (!stubs.has(id)) stubs.set(id, { path: null, label: e.ref, title: `Not found: ${e.ref}`, closed: false, unresolved: true })
      continue
    }
    let open = !(target.kind === 'ticket' && target.meta && isClosed((target.meta as TicketMeta).status))
    if (open && e.to.itemId) {
      const item = target.items.find((i) => i.id === e.to.itemId || i.fragments?.includes(e.to.itemId!))
      if (item && item.state !== 'open') open = false
    }
    if (inMap.has(target.path)) {
      if (!shownSet.has(target.path)) continue
      edges.push({ from: target.path, to: e.from })
      if (open) live.add(linkKey(target.path, e.from))
    } else {
      const id = stubId(target.path)
      ;(stubBlocks.get(id) ?? stubBlocks.set(id, new Set()).get(id)!).add(e.from)
      if (!stubs.has(id)) {
        stubs.set(id, {
          path: target.path,
          label: target.key ?? target.path.slice(target.path.lastIndexOf('/') + 1),
          title: target.title,
          closed: !open,
        })
      } else if (open) stubs.get(id)!.closed = false
    }
  }

  return {
    input: {
      tickets: shown.map((t) => t.path),
      edges,
      stubs: [...stubBlocks].map(([id, blocks]) => ({ id, blocks: [...blocks] })).sort((a, b) => a.id.localeCompare(b.id)),
    },
    tickets: new Map(shown.map((t) => [t.path, t])),
    stubs,
    live,
    hidden: all.length - shown.length,
  }
}
