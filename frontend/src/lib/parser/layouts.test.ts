// Ticket 25: spaces outside modules/. A space is a folder that holds a map.md or an issues/ folder.
import { describe, expect, it } from 'vitest'
import { questionWhere } from '../views'
import { buildIndex, resolveRef, rootNameFor, scanText, updateIndex, type SourceFile, type TicketMeta } from './index'

const f = (path: string, text = '# x\n'): SourceFile => ({ path, text, mtime: 1 })
const tkt = (num: string, extra = '') => `---\ntype: build\nstatus: open\n${extra}---\n# ${num} — t\n`

describe('generic docs layout', () => {
  const files = [
    f('map.md', '# Map\n'),
    f('issues/01-first.md', tkt('01')),
    f('issues/02-second.md', tkt('02', 'blocked_by: ["01"]\nrelated: ["ticket_ui 01"]\n')),
    f('notes/design.md'),
    f('handoffs/h.md'),
  ]

  it('names the docs-folder space after the repo folder', () => {
    const idx = buildIndex(files, 'ticket_ui')
    expect(idx.spaces).toEqual(['ticket_ui'])
    expect(Object.keys(idx.tickets)).toEqual(['ticket_ui 01', 'ticket_ui 02'])
    expect(idx.files['issues/01-first.md']).toMatchObject({ kind: 'ticket', space: 'ticket_ui', key: 'ticket_ui 01' })
    expect(idx.files['map.md']).toMatchObject({ kind: 'map', space: 'ticket_ui', map: { issuesDir: 'issues' } })
    expect(idx.files['notes/design.md'].space).toBe('ticket_ui') // nearest space above it
    expect(idx.files['handoffs/h.md'].space).toBeNull() // handoffs/ and patterns/ stay outside any space
  })

  it('resolves refs and edges inside the space', () => {
    const idx = buildIndex(files, 'ticket_ui')
    expect(resolveRef('01', 'issues/02-second.md', idx)).toMatchObject({ ok: true, path: 'issues/01-first.md' })
    expect(resolveRef('ticket_ui 01', 'notes/design.md', idx)).toMatchObject({ ok: true, path: 'issues/01-first.md' })
    expect(idx.edges.map((e) => [e.field, e.ref, e.to.ok])).toEqual([
      ['blocked_by', '01', true],
      ['related', 'ticket_ui 01', true],
    ])
    expect(idx.diagnostics.filter((d) => d.code === 'FM_REF')).toEqual([])
    expect((idx.files['issues/02-second.md'].meta as TicketMeta).blocked_by).toEqual(['01'])
    expect(scanText('see ticket_ui 02 and ticket 01', 'notes/design.md', idx).map((r) => r.kind)).toEqual(['ticket', 'ticket'])
  })

  it('without a root name, tickets under the docs folder are plain files', () => {
    const idx = buildIndex(files)
    expect(idx.spaces).toEqual([])
    expect(idx.files['issues/01-first.md'].kind).toBe('doc')
  })

  it('keeps modules/<space> exactly, beside a top-level issues/ folder', () => {
    const idx = buildIndex(
      [f('modules/alpha/map.md'), f('modules/alpha/issues/01-a.md', tkt('01')), f('modules/alpha/sub/issues/02-b.md', tkt('02')), f('issues/01-top.md', tkt('01'))],
      'repo',
    )
    expect(idx.spaces).toEqual(['alpha', 'repo'])
    expect(idx.tickets).toEqual({ 'alpha 01': 'modules/alpha/issues/01-a.md', 'alpha 02': 'modules/alpha/sub/issues/02-b.md', 'repo 01': 'issues/01-top.md' })
  })

  it('a nested space wins over the one above it', () => {
    const idx = buildIndex([f('map.md'), f('issues/01-a.md', tkt('01')), f('area/map.md'), f('area/issues/01-b.md', tkt('01')), f('area/x.md')], 'repo')
    expect(idx.files['area/x.md'].space).toBe('area')
    expect(idx.files['area/issues/01-b.md'].key).toBe('area 01')
    expect(idx.tickets['repo 01']).toBe('issues/01-a.md')
  })

  it('moves a file out of its space when the space goes away', () => {
    const idx = buildIndex([f('map.md'), f('a.md')], 'repo')
    expect(idx.files['a.md'].space).toBe('repo')
    const next = updateIndex(idx, [], ['map.md'])
    expect(next.files['a.md'].space).toBeNull()
  })

  it('resolves space#item to the map of a space outside modules/', () => {
    const idx = buildIndex([f('map.md', '# Map\n\n- [ ] **Q1** — a question\n'), f('issues/01-a.md', tkt('01'))], 'repo')
    expect(resolveRef('repo#q1', 'issues/01-a.md', idx).path).toBe('map.md')
  })

  it('names the root space after the repo folder with either slash, or after a docs folder that is not "docs"', () => {
    expect(rootNameFor('E:' + String.fromCharCode(92) + 'projects' + String.fromCharCode(92) + 'ticket_ui', 'docs')).toBe('ticket_ui')
    expect(rootNameFor('/home/me/ticket_ui/', 'docs')).toBe('ticket_ui')
    expect(rootNameFor('/home/me/repo', 'specs')).toBe('specs')
    expect(rootNameFor('/home/me/repo', 'a/Docs')).toBe('repo')
  })

  it('does not make a space of modules/ itself', () => {
    const idx = buildIndex([f('modules/map.md'), f('modules/a/map.md'), f('modules/a/issues/01-a.md', tkt('01'))], 'repo')
    expect(idx.spaces).toEqual(['a'])
    expect(idx.files['modules/map.md'].space).toBeNull()
  })

  it('keeps spaces apart when their names collide', () => {
    const idx = buildIndex(
      [
        f('modules/x/map.md'), f('modules/x/issues/01-m.md', tkt('01')),
        f('x/map.md'), f('x/issues/01-g.md', tkt('01')),
        f('a/x/issues/01-ax.md', tkt('01')), f('b/x/issues/01-bx.md', tkt('01')),
        f('issues/01-root.md', tkt('01', 'related: ["x 01"]\n')),
      ],
      'x',
    )
    expect(idx.tickets).toEqual({
      'x 01': 'modules/x/issues/01-m.md',
      'x (docs) 01': expect.stringMatching(/^(x|issues)\//),
      'a/x 01': 'a/x/issues/01-ax.md',
      'b/x 01': 'b/x/issues/01-bx.md',
    })
    expect(idx.diagnostics.filter((d) => d.code === 'DUP_NUM')).toHaveLength(1) // the repo root and the x/ folder share "x (docs)"
    expect(resolveRef('b/x 01', 'issues/01-root.md', idx).path).toBe('b/x/issues/01-bx.md')
  })

  it('maps space#item for a collided space to its own map', () => {
    const idx = buildIndex([f('modules/x/map.md'), f('x/map.md', '# M\n\n- [ ] **Q1** — q\n'), f('x/issues/01-g.md', tkt('01'))], 'repo')
    expect(resolveRef('x (docs)#q1', 'x/issues/01-g.md', idx).path).toBe('x/map.md')
  })

  it('answers bad-ref for a name that is no space, as before', () => {
    const idx = buildIndex([f('modules/a/issues/01-a.md', tkt('01'))], 'repo')
    expect(resolveRef('Foo 01', 'modules/a/issues/01-a.md', idx).problem).toBe('bad-ref')
    expect(resolveRef('a b 01', 'modules/a/issues/01-a.md', idx).problem).toBe('bad-ref')
    expect(resolveRef('notes.md#q1', 'modules/a/issues/01-a.md', idx).problem).toBe('bad-ref')
    expect(resolveRef('zzz 01', 'modules/a/issues/01-a.md', idx).problem).toBe('no-file')
  })

  it('words the "where" of a map inside its own space folder', () => {
    const idx = buildIndex([f('area/map.md'), f('area/issues/01-a.md', tkt('01')), f('map.md'), f('modules/m/map.md')], 'repo')
    expect(questionWhere(idx.files['area/map.md'])).toBe('area · map.md')
    expect(questionWhere(idx.files['map.md'])).toBe('repo · map.md')
    expect(questionWhere(idx.files['modules/m/map.md'])).toBe('m · map.md')
  })
})
