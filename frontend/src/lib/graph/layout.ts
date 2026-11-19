// The dependency graph's layout (ticket 14; 06 D3, 03 spec 1.5 and 6). Pure: ids in, boxes out,
// no DOM and no Svelte, so a test can check every fixture space for overlap (AC1).
//
// Method (hand-rolled, no library):
//   1. longest-path layering: a ticket sits one column right of its deepest blocker
//   2. two barycentre passes (forward, then backward) to cut edge crossings
//   3. columns are stacked top to bottom with a fixed gap, so two boxes in a column cannot touch
//   4. tickets with no edge at all go in a wrapped grid under the layered part (a 40-ticket
//      space would otherwise be one 3 000 px column)
//   5. cross-space stubs sit one column left of the first ticket they block

export const NODE_W = 144
export const NODE_H = 58
export const STUB_W = 136
export const STUB_H = 26
/** column step (spec 1.5) */
export const COL_STEP = 176
/** vertical gap between two boxes; NODE_H + GAP_Y is the 84px row step */
export const GAP_Y = 26
export const PAD = 16
const ISOLATED_GAP = 44
const MIN_ISOLATED_COLS = 4

export interface GraphInput {
  /** ticket ids in display order (ticket number) */
  tickets: string[]
  /** blocker -> blocked, between two tickets of the map */
  edges: { from: string; to: string }[]
  /** an outside ticket (another space or map) that blocks one or more tickets here */
  stubs: { id: string; blocks: string[] }[]
}

export interface Box {
  id: string
  kind: 'ticket' | 'stub'
  /** 0 = no blockers; a stub takes the level of the first ticket it blocks, less one */
  level: number
  x: number
  y: number
  w: number
  h: number
  /** laid out in the grid of tickets with no dependencies */
  isolated: boolean
}

export interface Link {
  from: string
  to: string
  /** SVG cubic path, from the right edge of `from` to the left edge of `to` */
  d: string
  /** level of `from`, for the draw delay */
  level: number
  /** the edge closes a cycle and points backwards */
  back: boolean
}

export interface GraphLayout {
  boxes: Box[]
  links: Link[]
  width: number
  height: number
  /** y of the "no dependencies" caption, or null when the grid is empty */
  isolatedTop: number | null
  /** the deepest ticket level, for the entrance stagger */
  levels: number
}

const sep = '\u0000'

/** Longest-path level per ticket. An edge that would close a cycle is reported in `back`. */
function levelsOf(tickets: string[], preds: Map<string, string[]>): { level: Map<string, number>; back: Set<string> } {
  const level = new Map<string, number>()
  const back = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string): number => {
    const known = level.get(id)
    if (known !== undefined) return known
    visiting.add(id)
    let lv = 0
    for (const p of preds.get(id) ?? []) {
      if (visiting.has(p)) {
        back.add(p + sep + id)
        continue
      }
      lv = Math.max(lv, visit(p) + 1)
    }
    visiting.delete(id)
    level.set(id, lv)
    return lv
  }
  for (const t of tickets) visit(t)
  return { level, back }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const list = m.get(k)
  if (list) list.push(v)
  else m.set(k, [v])
}

export function layoutGraph(input: GraphInput): GraphLayout {
  const known = new Set(input.tickets)

  // adjacency over tickets, deduplicated, self edges and unknown ids dropped
  const preds = new Map<string, string[]>()
  const seen = new Set<string>()
  const edges: { from: string; to: string }[] = []
  for (const e of input.edges) {
    if (e.from === e.to || !known.has(e.from) || !known.has(e.to) || seen.has(e.from + sep + e.to)) continue
    seen.add(e.from + sep + e.to)
    edges.push(e)
    push(preds, e.to, e.from)
  }
  const stubs = input.stubs
    .map((s) => ({ id: s.id, blocks: [...new Set(s.blocks.filter((b) => known.has(b)))] }))
    .filter((s) => s.blocks.length > 0 && !known.has(s.id))

  const { level, back } = levelsOf(input.tickets, preds)
  const linked = new Set<string>()
  for (const e of edges) {
    linked.add(e.from)
    linked.add(e.to)
  }
  for (const s of stubs) for (const b of s.blocks) linked.add(b)

  // a stub one column left of a level-0 ticket needs a column of its own
  const shift = stubs.some((s) => s.blocks.some((b) => (level.get(b) ?? 0) === 0)) ? 1 : 0
  const col = new Map<string, number>()
  for (const t of input.tickets) if (linked.has(t)) col.set(t, (level.get(t) ?? 0) + shift)
  for (const s of stubs) col.set(s.id, Math.min(...s.blocks.map((b) => col.get(b)!)) - 1)

  const size = (id: string) => (known.has(id) ? { w: NODE_W, h: NODE_H } : { w: STUB_W, h: STUB_H })
  // every link, tickets and stubs alike
  const all: { from: string; to: string }[] = [...edges]
  for (const s of stubs) for (const b of s.blocks) all.push({ from: s.id, to: b })
  const inN = new Map<string, string[]>()
  const outN = new Map<string, string[]>()
  for (const e of all) {
    push(inN, e.to, e.from)
    push(outN, e.from, e.to)
  }

  const ncols = col.size ? Math.max(...col.values()) + 1 : 0
  const columns: string[][] = Array.from({ length: ncols }, () => [])
  for (const t of input.tickets) if (col.has(t)) columns[col.get(t)!].push(t)
  for (const s of stubs) columns[col.get(s.id)!].push(s.id)

  const top = new Map<string, number>()
  const centre = (id: string) => top.get(id)! + size(id).h / 2
  /** stack every column from the top, centred on the tallest one */
  const stack = () => {
    const heights = columns.map((c) => c.reduce((n, id) => n + size(id).h, 0) + Math.max(0, c.length - 1) * GAP_Y)
    const tallest = Math.max(0, ...heights)
    columns.forEach((c, i) => {
      let y = (tallest - heights[i]) / 2
      for (const id of c) {
        top.set(id, y)
        y += size(id).h + GAP_Y
      }
    })
    return tallest
  }
  let tallest = stack()

  const sweep = (c: number, nb: Map<string, string[]>) => {
    const keyed = columns[c].map((id, i) => {
      const ns = nb.get(id)?.filter((n) => top.has(n)) ?? []
      return { id, i, k: ns.length ? ns.reduce((s, n) => s + centre(n), 0) / ns.length : centre(id) }
    })
    keyed.sort((a, b) => a.k - b.k || a.i - b.i)
    columns[c] = keyed.map((x) => x.id)
    tallest = stack()
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c < ncols; c++) sweep(c, inN)
    for (let c = ncols - 2; c >= 0; c--) sweep(c, outN)
  }

  const boxes: Box[] = []
  const boxOf = new Map<string, Box>()
  const add = (b: Box) => {
    boxes.push(b)
    boxOf.set(b.id, b)
  }
  columns.forEach((c, ci) => {
    for (const id of c) {
      const { w, h } = size(id)
      add({
        id,
        kind: known.has(id) ? 'ticket' : 'stub',
        level: known.has(id) ? (level.get(id) ?? 0) : Math.max(0, ci - shift),
        x: PAD + ci * COL_STEP,
        y: PAD + top.get(id)!,
        w,
        h,
        isolated: false,
      })
    }
  })

  let width = ncols > 0 ? PAD * 2 + (ncols - 1) * COL_STEP + NODE_W : PAD * 2
  let height = ncols > 0 ? PAD * 2 + tallest : PAD * 2

  // tickets without an edge: a wrapped grid under the layered part
  const loose = input.tickets.filter((t) => !linked.has(t))
  let isolatedTop: number | null = null
  if (loose.length > 0) {
    const perRow = Math.max(MIN_ISOLATED_COLS, Math.floor((width - PAD * 2 - NODE_W) / COL_STEP) + 1)
    const startY = ncols > 0 ? height - PAD + ISOLATED_GAP : PAD
    isolatedTop = startY
    const gridTop = startY + 22
    loose.forEach((id, i) => {
      add({
        id,
        kind: 'ticket',
        level: 0,
        x: PAD + (i % perRow) * COL_STEP,
        y: gridTop + Math.floor(i / perRow) * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
        isolated: true,
      })
    })
    const rows = Math.ceil(loose.length / perRow)
    width = Math.max(width, PAD * 2 + (Math.min(perRow, loose.length) - 1) * COL_STEP + NODE_W)
    height = gridTop + rows * NODE_H + (rows - 1) * GAP_Y + PAD
  }

  const links: Link[] = all.map((e) => {
    const a = boxOf.get(e.from)!
    const b = boxOf.get(e.to)!
    const x1 = a.x + a.w
    const y1 = a.y + a.h / 2
    const x2 = b.x
    const y2 = b.y + b.h / 2
    const isBack = back.has(e.from + sep + e.to) || x2 <= x1
    const dx = isBack ? 48 : (x2 - x1) / 2
    const d = `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`
    return { from: e.from, to: e.to, d, level: a.level, back: isBack }
  })

  return { boxes, links, width, height, isolatedTop, levels: boxes.reduce((n, b) => Math.max(n, b.level), 0) }
}

/** The first two boxes that overlap (or come within `gap` px), or null. Used by the tests. */
export function findOverlap(boxes: Box[], gap = 0): [Box, Box] | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap) return [a, b]
    }
  }
  return null
}
