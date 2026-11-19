import { describe, expect, it } from 'vitest'
import { back, canBack, close, label, popTo, promote, push, toggle, MAX_DEPTH, type PanelStack } from './panel'

const e = (path: string, fragment: string | null = null) => ({ path, fragment })

describe('panel stack', () => {
  it('push opens the panel and puts the entry on top', () => {
    expect(push([], e('a.md', 'q3'))).toEqual([e('a.md', 'q3')])
  })

  it('the same entry as the one on show is not pushed twice', () => {
    const s = push([], e('a.md', 'q3'))
    expect(push(s, e('a.md', 'q3'))).toBe(s)
    expect(push(s, { path: 'a.md', fragment: 'q3' })).toBe(s)
    expect(push(s, e('a.md', 'q4'))).toHaveLength(2) // another item of the same file is a new hop
    expect(push(s, e('a.md'))).toHaveLength(2) // the whole file differs from one item
  })

  it('goes back through three hops and stops at the first entry', () => {
    let s: PanelStack = []
    for (const p of ['a.md', 'b.md', 'c.md', 'd.md']) s = push(s, e(p, 'q1'))
    expect(s).toHaveLength(4)
    s = back(s)
    expect(s[s.length - 1].path).toBe('c.md')
    s = back(s)
    expect(s[s.length - 1].path).toBe('b.md')
    s = back(s)
    expect(s).toEqual([e('a.md', 'q1')])
    expect(canBack(s)).toBe(false)
    expect(back(s)).toBe(s)
  })

  it('popTo drops everything after the chosen entry', () => {
    const s = ['a.md', 'b.md', 'c.md'].reduce<PanelStack>((acc, p) => push(acc, e(p)), [])
    expect(popTo(s, 0).map((x) => x.path)).toEqual(['a.md'])
    expect(popTo(s, 2)).toBe(s)
    expect(popTo(s, 9)).toBe(s)
  })

  it('promote returns the entry on show and closes the panel', () => {
    const s = push(push([], e('a.md')), e('b.md', 'q3'))
    expect(promote(s)).toEqual({ entry: e('b.md', 'q3'), stack: [] })
    expect(promote([])).toEqual({ entry: null, stack: [] })
  })

  it('close empties the stack', () => {
    expect(close()).toEqual([])
  })

  it('keeps at most MAX_DEPTH entries, dropping the oldest', () => {
    let s: PanelStack = []
    for (let i = 0; i < MAX_DEPTH + 5; i++) s = push(s, e(`f${i}.md`))
    expect(s).toHaveLength(MAX_DEPTH)
    expect(s[0].path).toBe('f5.md')
  })

  it('toggle (]) closes and remembers the stack, then brings it back', () => {
    const s = push(push([], e('a.md')), e('b.md'))
    const closed = toggle(s, [])
    expect(closed).toEqual({ stack: [], lastClosed: s })
    expect(toggle(closed.stack, closed.lastClosed).stack).toBe(s)
    expect(toggle([], []).stack).toEqual([]) // nothing to bring back
  })

  it('labels entries for the trail', () => {
    expect(label(e('modules/x/issues/05-build.md', 'q3'))).toBe('05 Q3')
    expect(label(e('modules/x/issues/07-a.md'))).toBe('07')
    expect(label(e('modules/x/map.md', 'scope'))).toBe('map #scope')
    expect(label(e('docs/handoffs/ocm-cutover-handoff.md'))).toBe('ocm-cutover-handoff')
  })
})
