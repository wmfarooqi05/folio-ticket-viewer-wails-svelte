import { describe, expect, it } from 'vitest'
import { createIndexEngine, formatSize, tooLargeStub, type EngineDeps, type TooLargeInfo } from './index-engine'
import { buildIndex, updateIndex } from './parser'

// AC2 (ticket 18, L6): an over-cap file stays in the tree as a stub, tagged "too large" with its size.
function rig(huge: TooLargeInfo) {
  const sent: Record<string, number>[] = []
  const deps: EngineDeps = {
    parserVersion: 'x',
    loadCache: async () => null,
    saveCache: async () => {},
    scan: async () => ({ changed: ['modules/a/01-small.md', huge.path], removed: [], count: 2, walkMs: 1, tooLarge: [huge] }),
    rescan: async () => ({ changed: ['modules/a/01-small.md', huge.path], removed: [], count: 2, walkMs: 1, tooLarge: [huge] }),
    readBatch: async (paths) => ({
      files: paths.filter((p) => p !== huge.path).map((p) => ({ path: p, text: '# small\n', mtime: 1 })),
      missing: [],
      tooLarge: paths.includes(huge.path) ? [huge] : [],
    }),
    sleep: async () => {},
    updateIndex,
    emptyIndex: () => buildIndex([]),
    now: () => 0,
    log: () => {},
    setTimer: () => 0,
    clearTimer: () => {},
  }
  const engine = createIndexEngine(deps, { onIndex: () => {}, onStatus: () => {}, onTouched: () => {}, onTooLarge: (f) => sent.push(f) })
  return { engine, sent }
}

describe('files over the size cap', () => {
  const huge = { path: 'modules/a/issues/02-huge.md', size: 10 * 1024 * 1024 }

  it('get a stub record in the index, so the tree lists them, and are reported with their size', async () => {
    const { engine, sent } = rig(huge)
    await engine.start()
    const idx = engine.current()!
    expect(Object.keys(idx.files).sort()).toEqual(['modules/a/01-small.md', huge.path])
    expect(idx.files[huge.path].title).toBe('huge')
    expect(sent).toEqual([{ [huge.path]: huge.size }])
    await engine.dispose(false)
  })

  it('are reported once per change, not on every call', async () => {
    const { engine, sent } = rig(huge)
    await engine.start()
    await engine.rescan()
    expect(sent).toHaveLength(1)
    await engine.dispose(false)
  })
})

describe('the stub', () => {
  it('says why there is nothing to read', () => {
    const s = tooLargeStub({ path: 'modules/a/big.md', size: 10 * 1024 * 1024 })
    expect(s.text).toContain('10.0 MB')
    expect(s.text.startsWith('# big\n')).toBe(true)
  })
  it('formats sizes like the backends do', () => {
    expect(formatSize(5 * 1024 * 1024 + 1)).toBe('5.0 MB')
    expect(formatSize(12.34 * 1024 * 1024)).toBe('12.3 MB')
  })
})
