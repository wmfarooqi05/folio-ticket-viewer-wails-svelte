// Ticket 47: which file is a folder's map. map.md always; any other listed name (README.md) only with tickets in issues/ beside it.
import { describe, expect, it } from 'vitest'
import { questionWhere } from '../views'
import { buildIndex, DEFAULT_MAP_FILES, parseFile, resolveRef, updateIndex, type MapMeta, type SourceFile } from './index'

const f = (path: string, text = '# x\n'): SourceFile => ({ path, text, mtime: 1 })
const tkt = (num: string) => `---\ntype: build\nstatus: open\n---\n# ${num} — t\n`
const readme = '---\nstatus: draft\n---\n# Readme\n'
const kinds = (idx: ReturnType<typeof buildIndex>, ...paths: string[]) => paths.map((p) => idx.files[p].kind)

describe('map files', () => {
  it('a README.md beside issues/ is a map, and a ref to the space resolves to it', () => {
    const idx = buildIndex([f('README.md', '# R\n\n- Q1: why?\n'), f('issues/01-a.md', tkt('01'))], 'repo')
    expect(idx.files['README.md']).toMatchObject({ kind: 'map', map: { issuesDir: 'issues' }, space: 'repo' })
    expect(resolveRef('repo#q1', 'issues/01-a.md', idx).path).toBe('README.md')
  })

  it('a README.md with no tickets beside it is a plain doc, and its frontmatter is not read as a map', () => {
    const idx = buildIndex([f('README.md', readme), f('docs/evidence/x/README.md', readme), f('docs/evidence/x/a.md')], 'repo')
    for (const p of ['README.md', 'docs/evidence/x/README.md']) {
      expect(idx.files[p]).toMatchObject({ kind: 'doc', map: null, meta: null })
      expect(idx.files[p].diagnostics.filter((d) => d.code === 'FM_ENUM')).toEqual([])
    }
    expect(idx.diagnostics.filter((d) => d.code === 'FM_ENUM')).toEqual([])
  })

  it('matches names in any case', () => {
    const idx = buildIndex(
      [f('a/Readme.md'), f('a/issues/01-a.md', tkt('01')), f('b/README.MD'), f('b/issues/01-b.md', tkt('01')), f('c/Map.md')],
      'repo',
    )
    expect(kinds(idx, 'a/Readme.md', 'b/README.MD', 'c/Map.md')).toEqual(['map', 'map', 'map'])
  })

  it('precedence: the earliest qualifying name in the list wins', () => {
    const files = [f('map.md'), f('README.md'), f('issues/01-a.md', tkt('01'))]
    expect(kinds(buildIndex(files, 'repo'), 'map.md', 'README.md')).toEqual(['map', 'doc'])
    expect(kinds(buildIndex(files, 'repo', ['README.md', 'map.md']), 'map.md', 'README.md')).toEqual(['doc', 'map'])
    const noTickets = [f('map.md'), f('README.md')]
    expect(kinds(buildIndex(noTickets, 'repo', ['README.md', 'map.md']), 'map.md', 'README.md')).toEqual(['map', 'doc'])
  })

  it('follows the tickets when they come and go, from a fresh or a cached index', () => {
    const base = buildIndex([f('README.md', readme), f('x.md')], 'repo')
    expect(base.files['README.md'].kind).toBe('doc')
    for (const start of [base, JSON.parse(JSON.stringify(base)) as typeof base]) {
      const withTickets = updateIndex(start, [f('issues/01-a.md', tkt('01'))], [])
      const rec = withTickets.files['README.md']
      expect(rec.kind).toBe('map')
      expect((rec.meta as MapMeta).status).toBeNull()
      expect(rec.diagnostics.map((d) => d.code)).toEqual(['FM_ENUM'])
      const again = updateIndex(JSON.parse(JSON.stringify(withTickets)), [f('y.md')], [])
      expect(again.files['README.md'].kind).toBe('map')
      expect(again.files['README.md'].diagnostics.map((d) => d.code)).toEqual(['FM_ENUM'])
      const gone = updateIndex(withTickets, [], ['issues/01-a.md'])
      expect(gone.files['README.md']).toMatchObject({ kind: 'doc', map: null, meta: null })
      expect(gone.files['README.md'].diagnostics).toEqual([])
    }
  })

  it('a custom list replaces the default, and the index remembers it', () => {
    const idx = buildIndex([f('map.md'), f('index.md'), f('issues/01-a.md', tkt('01'))], 'repo', ['index.md'])
    expect(kinds(idx, 'map.md', 'index.md')).toEqual(['doc', 'map'])
    expect(idx.mapFiles).toEqual(['index.md'])
    expect(updateIndex(idx, [f('z.md')], []).mapFiles).toEqual(['index.md'])
    expect(buildIndex([], 'repo').mapFiles).toEqual([...DEFAULT_MAP_FILES])
  })

  it('parseFile alone: map.md is a map; README.md is a doc that carries what it would hold as a map', () => {
    expect(parseFile(f('map.md'))).toMatchObject({ kind: 'map', map: { issuesDir: 'issues' } })
    const r = parseFile(f('README.md', readme))
    expect(r).toMatchObject({ kind: 'doc', map: null })
    expect(r.mapForm).not.toBeNull()
  })

  it('labels a README map "space · README.md"', () => {
    const idx = buildIndex([f('README.md'), f('issues/01-a.md', tkt('01'))], 'repo')
    expect(questionWhere(idx.files['README.md'])).toBe('repo · README.md')
  })

  it('a folder with only README.md and issues/ is a space for files beside it', () => {
    const idx = buildIndex([f('area/README.md'), f('area/issues/01-a.md', tkt('01')), f('area/notes.md')], 'repo')
    expect(idx.files['area/notes.md'].space).toBe('area')
    expect(idx.files['area/README.md'].space).toBe('area')
  })
})

describe('the map of a space with a README map (ticket 47)', () => {
  const q = '# R\n\n- Q1: why?\n'
  it('a README beside issues/ is x#q1, over a nested map.md', () => {
    const idx = buildIndex([f('modules/x/README.md', q), f('modules/x/issues/01-a.md', tkt('01')), f('modules/x/step2b/map.md', '# Plan\n\n- Q1: other\n')])
    expect(idx.files['modules/x/README.md'].kind).toBe('map')
    expect(resolveRef('x#q1', 'modules/x/issues/01-a.md', idx).path).toBe('modules/x/README.md')
  })
  it('the README wins over a nested map.md with a shorter path too', () => {
    const idx = buildIndex([f('modules/x/README.md', q), f('modules/x/issues/01-a.md', tkt('01')), f('modules/x/a/map.md', '# P\n')])
    expect(resolveRef('x#q1', 'modules/x/issues/01-a.md', idx).path).toBe('modules/x/README.md')
  })
  it('modules/<space>/map.md still wins when it is a map', () => {
    const idx = buildIndex([f('modules/x/map.md', q), f('modules/x/README.md'), f('modules/x/issues/01-a.md', tkt('01'))])
    expect(resolveRef('x#q1', 'modules/x/issues/01-a.md', idx).path).toBe('modules/x/map.md')
  })
})
