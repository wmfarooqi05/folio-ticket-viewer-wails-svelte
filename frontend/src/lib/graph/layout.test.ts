// AC1 (ticket 14): the graph lays out every fixture space without overlapping nodes.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildIndex, type Index } from '../parser'
import { readDocsRoot } from '../parser/node'
import { COL_STEP, GAP_Y, NODE_H, NODE_W, findOverlap, layoutGraph, type GraphInput } from './layout'
import { graphFor } from './model'

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'docs')

let index: Index
beforeAll(async () => {
  index = buildIndex((await readDocsRoot(docsRoot)).map((f) => ({ ...f, mtime: 1000 })))
})

const input = (tickets: string[], edges: [string, string][] = [], stubs: GraphInput['stubs'] = []): GraphInput => ({
  tickets,
  edges: edges.map(([from, to]) => ({ from, to })),
  stubs,
})

describe('fixture spaces', () => {
  it('has maps to lay out', () => {
    const maps = Object.values(index.files).filter((r) => r.kind === 'map')
    expect(maps.length).toBeGreaterThanOrEqual(3)
  })

  it('places no two nodes on top of each other, and keeps a gap between them', () => {
    let checked = 0
    for (const rec of Object.values(index.files)) {
      if (rec.kind !== 'map') continue
      const m = graphFor(index, rec.path)
      const g = layoutGraph(m.input)
      expect(g.boxes.length, rec.path).toBe(m.input.tickets.length + m.input.stubs.length)
      expect(findOverlap(g.boxes), rec.path).toBeNull()
      // a column keeps the 26px gap, not only "no overlap"
      expect(findOverlap(g.boxes, GAP_Y - 1), rec.path).toBeNull()
      for (const b of g.boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w).toBeLessThanOrEqual(g.width)
        expect(b.y + b.h).toBeLessThanOrEqual(g.height)
      }
      checked += g.boxes.length
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('hides dropped and superseded tickets and counts them', () => {
    const chw = graphFor(index, 'modules/cash-handling-workflow/map.md')
    expect(chw.hidden).toBeGreaterThan(0)
    for (const t of chw.tickets.values()) expect(['dropped', 'superseded']).not.toContain(t.meta.status)
  })

  it('draws a blocker from another space as a stub', () => {
    // one-cash-mover 06 is blocked by a ticket in cash-movement-engine or cash-handling-workflow
    let stubs = 0
    for (const rec of Object.values(index.files)) {
      if (rec.kind !== 'map') continue
      const m = graphFor(index, rec.path)
      stubs += m.stubs.size
      const g = layoutGraph(m.input)
      for (const s of g.boxes.filter((b) => b.kind === 'stub')) {
        const to = g.links.filter((l) => l.from === s.id)
        expect(to.length).toBeGreaterThan(0)
        // a stub is to the left of everything it blocks
        for (const l of to) expect(g.boxes.find((b) => b.id === l.to)!.x).toBeGreaterThan(s.x + s.w)
      }
    }
    expect(stubs).toBeGreaterThan(0)
  })
})

describe('blockers that do not resolve', () => {
  it('every ticket with a blocked_by ref is linked to something, so none looks free', () => {
    let unresolved = 0
    for (const rec of Object.values(index.files)) {
      if (rec.kind !== 'map') continue
      const m = graphFor(index, rec.path)
      const linked = new Set<string>()
      for (const e of m.input.edges) linked.add(e.to)
      for (const s of m.input.stubs) for (const b of s.blocks) linked.add(b)
      for (const e of index.edges) {
        if (e.field !== 'blocked_by' || !m.tickets.has(e.from)) continue
        const target = e.to.path ? index.files[e.to.path] : undefined
        // a hidden (dropped or superseded) in-map blocker is the only case that leaves no link
        const hiddenInMap = target && !m.tickets.has(target.path) && target.path.startsWith(rec.path.replace(/map\.md$/, 'issues/'))
        if (!hiddenInMap) expect(linked.has(e.from), `${e.from} <- ${e.ref}`).toBe(true)
        if (!target) unresolved++
      }
      for (const [id, s] of m.stubs) if (s.unresolved) expect(id.startsWith('unresolved:')).toBe(true)
    }
    expect(unresolved).toBeGreaterThanOrEqual(0)
  })
})

describe('layering', () => {
  it('puts a ticket one column right of its deepest blocker', () => {
    const g = layoutGraph(input(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['a', 'c'], ['a', 'd']]))
    const lv = Object.fromEntries(g.boxes.map((b) => [b.id, b.level]))
    expect(lv).toEqual({ a: 0, b: 1, c: 2, d: 1 })
    const x = Object.fromEntries(g.boxes.map((b) => [b.id, b.x]))
    expect(x.b - x.a).toBe(COL_STEP)
    expect(x.c - x.a).toBe(2 * COL_STEP)
  })

  it('lays tickets with no edge in a wrapped grid below, never in the layered columns', () => {
    const ids = Array.from({ length: 30 }, (_, i) => 't' + i)
    const g = layoutGraph(input(ids, [['t0', 't1']]))
    expect(findOverlap(g.boxes)).toBeNull()
    const loose = g.boxes.filter((b) => b.isolated)
    expect(loose).toHaveLength(28)
    expect(g.isolatedTop).not.toBeNull()
    expect(Math.min(...loose.map((b) => b.y))).toBeGreaterThan(g.boxes.find((b) => b.id === 't0')!.y + NODE_H)
    // wrapped: much shorter than one 28-row column
    expect(g.height).toBeLessThan(28 * (NODE_H + GAP_Y) / 2)
  })

  it('survives a cycle, a self edge, duplicate edges and unknown ids', () => {
    const g = layoutGraph(input(['a', 'b', 'c'], [['a', 'b'], ['b', 'a'], ['c', 'c'], ['a', 'b'], ['x', 'a']]))
    expect(g.boxes).toHaveLength(3)
    expect(findOverlap(g.boxes)).toBeNull()
    expect(g.links.filter((l) => l.back)).toHaveLength(1)
  })

  it('lays out a 60-ticket tangle without overlap', () => {
    const ids = Array.from({ length: 60 }, (_, i) => 't' + i)
    const edges: [string, string][] = []
    for (let i = 1; i < 60; i++) {
      edges.push([ids[(i * 7) % i], ids[i]])
      if (i > 3) edges.push([ids[(i * 5) % (i - 1)], ids[i]])
    }
    const g = layoutGraph(input(ids, edges))
    expect(findOverlap(g.boxes, GAP_Y - 1)).toBeNull()
  })

  it('sweeps order a column by the mean of its blockers', () => {
    // b2 is blocked by a2 (the lower one), b1 by a1: the sweep keeps b1 above b2
    const g = layoutGraph(input(['a1', 'a2', 'b2', 'b1'], [['a1', 'b1'], ['a2', 'b2']]))
    const y = Object.fromEntries(g.boxes.map((b) => [b.id, b.y]))
    expect(y.b1).toBeLessThan(y.b2)
    expect(y.a1).toBeLessThan(y.a2)
  })

  it('shifts ticket columns right when a stub needs a column of its own', () => {
    const g = layoutGraph(input(['a', 'b'], [['a', 'b']], [{ id: 's', blocks: ['a'] }]))
    const x = Object.fromEntries(g.boxes.map((b) => [b.id, b.x]))
    expect(x.s).toBeLessThan(x.a)
    expect(x.a - x.s).toBe(COL_STEP)
    expect(g.boxes.find((b) => b.id === 's')!.w).toBeLessThan(NODE_W)
  })

  it('handles an empty map', () => {
    const g = layoutGraph(input([]))
    expect(g.boxes).toEqual([])
    expect(g.links).toEqual([])
  })
})
