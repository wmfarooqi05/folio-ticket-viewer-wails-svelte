import { describe, expect, it } from 'vitest'
import { buildIndex } from './parser'
import { buildRows } from './tree'

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
