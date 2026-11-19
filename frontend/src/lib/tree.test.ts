import { describe, expect, it } from 'vitest'
import { buildIndex } from './parser'
import { ancestors, buildRows, searchRecords, visibleRows } from './tree'

describe('buildRows', () => {
  it('emits a directory row when the folder changes and sorts numerically', () => {
    const idx = buildIndex(
      ['modules/a/issues/10-b.md', 'modules/a/issues/2-a.md', 'modules/a/map.md', 'patterns/p.md'].map((path) => ({
        path,
        text: '# T\n',
        mtime: 0,
      })),
    )
    const rows = buildRows(Object.values(idx.files))
    expect(rows.map((r) => `${r.depth}:${r.kind}:${r.name}`)).toEqual([
      '0:dir:modules',
      '1:dir:a',
      '2:dir:issues',
      '3:file:2-a.md',
      '3:file:10-b.md',
      '2:file:map.md',
      '0:dir:patterns',
      '1:file:p.md',
    ])
  })
})

describe('tree rows, folding, search', () => {
  const mk = (path: string, status?: string) => ({
    path,
    mtime: 0,
    text: status
      ? `---\ntype: [build]\nstatus: ${status}\nstatus_note: null\nwaiting_on: null\nblocked_by: []\nblocked_note: null\nrelated: []\nsuperseded_by: null\npr: []\nado: []\nafk: false\n---\n# 01 — T ${path}\n`
      : `# T ${path}\n`,
  })
  const idx = buildIndex([
    mk('modules/a/issues/01-x.md', 'open'),
    mk('modules/a/issues/02-y.md', 'done'),
    mk('modules/a/issues/03-z.md', 'in-progress'),
    mk('modules/a/map.md'),
    mk('modules/b/issues/01-q.md', 'blocked'),
    mk('handoffs/h.md'),
  ])
  const recs = Object.values(idx.files)
  const rows = buildRows(recs)

  it('counts open tickets on every folder above them', () => {
    const count = (p: string) => (rows.find((r) => r.kind === 'dir' && r.path === p) as { count: number }).count
    expect(count('modules')).toBe(3)
    expect(count('modules/a')).toBe(2)
    expect(count('modules/a/issues')).toBe(2)
    expect(count('handoffs')).toBe(0)
  })

  it('hides _templates', () => {
    const withTpl = [...recs, { ...recs[0], path: 'modules/_templates/ticket.md' }]
    expect(buildRows(withTpl).some((r) => r.key.includes('_templates'))).toBe(false)
  })

  it('a closed folder hides everything below it and keeps its siblings', () => {
    const shown = (open: string[]) => visibleRows(rows, new Set(open)).map((r) => r.key)
    expect(shown([])).toEqual(['d:handoffs', 'd:modules'])
    expect(shown(['modules'])).toEqual(['d:handoffs', 'd:modules', 'd:modules/a', 'd:modules/b'])
    expect(shown(['modules', 'modules/a'])).toContain('modules/a/map.md')
    expect(shown(['modules', 'modules/a'])).not.toContain('modules/a/issues/01-x.md')
    expect(ancestors('modules/a/issues/01-x.md')).toEqual(['modules', 'modules/a', 'modules/a/issues'])
  })

  it('search matches the title or the path, case-insensitively; an empty query matches nothing', () => {
    expect(searchRecords(recs, 'ISSUES/01').map((r) => r.path)).toEqual(['modules/a/issues/01-x.md', 'modules/b/issues/01-q.md'])
    expect(searchRecords(recs, 't handoffs').map((r) => r.path)).toEqual(['handoffs/h.md'])
    expect(searchRecords(recs, '  ')).toEqual([])
  })
})
