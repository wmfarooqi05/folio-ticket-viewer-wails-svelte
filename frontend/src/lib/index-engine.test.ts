import { describe, expect, it } from 'vitest'
import { BATCH_SIZE, SAVE_DELAY_MS, createIndexEngine, type EngineDeps, type ScanInfo } from './index-engine'
import { buildIndex, updateIndex, type Index, type SourceFile } from './parser'

const PV = 'lib-test'

/** A fake disk plus fake Go: files by path, a log of every call, controllable timers. */
function rig(initial: string[] = [], opts: { cache?: Index | null; delivered?: boolean; loadFails?: boolean; failRead?: boolean; unreadable?: Map<string, number> } = {}) {
  const disk = new Map<string, string>(initial.map((p) => [p, `# ${p}\n`]))
  const calls: string[] = []
  const batches: string[][] = []
  let inflight = 0
  let maxInflight = 0
  let cache: unknown = opts.cache ?? null
  const saved: Index[] = []
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = []
  let scanGate: Promise<void> | null = null
  // what Go thinks it handed out; with a warm cache Go loaded these stamps from the file
  let delivered = new Map<string, string>(opts.delivered ? disk : [])

  const scanInfo = (): ScanInfo => {
    const changed = [...disk.keys()].filter((p) => delivered.get(p) !== disk.get(p)).sort()
    const removed = [...delivered.keys()].filter((p) => !disk.has(p)).sort()
    for (const p of removed) delivered.delete(p)
    return { changed, removed, count: disk.size, walkMs: 1 }
  }

  const deps: EngineDeps = {
    parserVersion: PV,
    async loadCache(v) {
      calls.push(`load:${v}`)
      if (opts.loadFails) throw new Error('disk gone')
      return cache
    },
    async saveCache(v, index) {
      calls.push(`save:${v}`)
      saved.push(index)
      cache = index
    },
    async scan() {
      calls.push('scan')
      if (scanGate) await scanGate
      return scanInfo()
    },
    async rescan() {
      calls.push('rescan')
      delivered = new Map()
      return scanInfo()
    },
    async readBatch(paths) {
      calls.push(`read:${paths.length}`)
      if (opts.failRead) {
        opts.failRead = false
        throw new Error('io')
      }
      batches.push(paths)
      inflight++
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise((r) => setTimeout(r, 1))
      inflight--
      const files: SourceFile[] = []
      const missing: string[] = []
      const failed: string[] = []
      for (const p of paths) {
        const left = opts.unreadable?.get(p) ?? 0
        if (left > 0) {
          opts.unreadable!.set(p, left - 1)
          failed.push(p)
          continue
        }
        if (disk.has(p)) {
          files.push({ path: p, text: disk.get(p)!, mtime: 1 })
          delivered.set(p, disk.get(p)!)
        } else missing.push(p)
      }
      return { files, missing, failed }
    },
    sleep: async () => {},
    updateIndex(index, changed, removed) {
      calls.push(`update:${changed.length}/${removed.length}`)
      return updateIndex(index, changed, removed)
    },
    emptyIndex: () => buildIndex([]),
    now: () => performance.now(),
    log: () => {},
    setTimer(fn, ms) {
      const t = { fn, ms, id: timers.length, live: true }
      timers.push(t)
      return t.id
    },
    clearTimer(h) {
      timers[h as number].live = false
    },
  }

  const indexes: Index[] = []
  const statuses: { text: string; checking: boolean }[] = []
  const touched: { changed: string[]; removed: string[] }[] = []
  const engine = createIndexEngine(deps, {
    onIndex: (i) => {
      calls.push('onIndex')
      indexes.push(i)
    },
    onStatus: (s) => statuses.push(s),
    onTouched: (changed, removed) => touched.push({ changed, removed }),
  })
  return {
    disk, calls, batches, saved, timers, indexes, statuses, touched, engine,
    get maxInflight() { return maxInflight },
    gateScan() {
      let open!: () => void
      scanGate = new Promise<void>((r) => (open = r))
      return () => { scanGate = null; open() }
    },
    fireTimers() {
      for (const t of timers.filter((x) => x.live)) { t.live = false; t.fn() }
    },
  }
}

const paths = (n: number) => Array.from({ length: n }, (_, i) => `modules/a/issues/${String(i + 1).padStart(3, '0')}-t.md`)

describe('cold start', () => {
  it('reads in batches of 100 with one batch in flight, filling the tree progressively', async () => {
    const r = rig(paths(250))
    const t = await r.engine.start()
    expect(t.warm).toBe(false)
    expect(r.batches.map((b) => b.length)).toEqual([100, 100, 50])
    expect(BATCH_SIZE).toBe(100)
    expect(r.maxInflight).toBe(1)
    expect(Object.keys(r.engine.current()!.files)).toHaveLength(250)
    // progressive: an index per batch before the end
    expect(r.indexes.length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(r.indexes[0].files)).toHaveLength(100)
  })

  it('issues the next read before parsing the previous batch', async () => {
    const r = rig(paths(150))
    await r.engine.start()
    const reads = r.calls.filter((c) => c.startsWith('read') || c.startsWith('update'))
    expect(reads).toEqual(['read:100', 'read:50', 'update:100/0', 'update:50/0'])
  })

  it('saves once, right after the cold build, under the parser version', async () => {
    const r = rig(paths(3))
    await r.engine.start()
    r.fireTimers()
    await r.engine.flushSave()
    expect(r.calls.filter((c) => c.startsWith('save'))).toEqual([`save:${PV}`])
  })

  it('treats a cache that is not an index as cold', async () => {
    const r = rig(paths(2), { cache: { nope: true } as unknown as Index })
    const t = await r.engine.start()
    expect(t.warm).toBe(false)
    expect(Object.keys(r.engine.current()!.files)).toHaveLength(2)
  })
})

describe('warm start then reconcile', () => {
  const files = paths(5)
  async function cachedIndex() {
    const first = rig(files)
    await first.engine.start()
    return first.engine.current()!
  }

  it('paints the cached tree before the scan returns, then reads only what changed', async () => {
    const cached = await cachedIndex()
    const r = rig(files, { cache: cached, delivered: true })
    r.disk.set(files[1], '# edited\n')
    r.disk.delete(files[2])
    r.disk.set('modules/a/issues/900-new.md', '# new\n')
    const open = r.gateScan()
    const started = r.engine.start()
    await new Promise((res) => setTimeout(res, 5))

    // The scan has not returned, yet the tree is already on screen.
    expect(r.calls.indexOf('onIndex')).toBeGreaterThan(-1)
    expect(r.calls.indexOf('onIndex')).toBeLessThan(r.calls.indexOf('scan'))
    expect(r.engine.current()).toBe(cached)
    expect(r.statuses.at(-1)).toEqual({ text: 'Checking 5 files…', checking: true })

    open()
    const t = await started
    expect(t.warm).toBe(true)
    expect(t.cachePaintMs).not.toBeNull()
    expect(t.cachePaintMs!).toBeLessThanOrEqual(t.scanMs)

    // Only the edited and the new file were read; the delete came from the scan.
    expect(r.batches).toEqual([[files[1], 'modules/a/issues/900-new.md'].sort()])
    const idx = r.engine.current()!
    expect(idx.files[files[2]]).toBeUndefined()
    expect(idx.files['modules/a/issues/900-new.md']).toBeDefined()
    expect(r.statuses.at(-1)).toEqual({ text: '5 files', checking: false })
    expect(r.touched).toHaveLength(1)
    expect(r.touched[0].removed).toEqual([files[2]])
    // and the new index is saved, debounced
    expect(r.timers.filter((x) => x.live)).toHaveLength(1)
  })

  it('does not read, notify or save when nothing changed', async () => {
    const r = rig(files, { cache: await cachedIndex(), delivered: true })
    const t = await r.engine.start()
    expect(t.warm).toBe(true)
    expect(r.calls.some((c) => c.startsWith('read'))).toBe(false)
    expect(r.touched).toHaveLength(0)
    expect(r.timers).toHaveLength(0)
  })

  it('falls back to a cold start when LoadCache throws', async () => {
    const r = rig(files, { loadFails: true })
    const t = await r.engine.start()
    expect(t.warm).toBe(false)
    expect(Object.keys(r.engine.current()!.files)).toHaveLength(5)
  })
})

describe('mutation queue', () => {
  it('applies ChangeSets one at a time, in arrival order, never overlapping reads', async () => {
    const r = rig(paths(3))
    await r.engine.start()
    r.disk.set('modules/a/issues/010-x.md', '# x\n')
    r.disk.set('modules/a/issues/011-y.md', '# y\n')
    r.disk.delete(paths(3)[0])
    const a = r.engine.applyChangeSet({ changed: ['modules/a/issues/010-x.md'], removed: [], rescan: false })
    const b = r.engine.applyChangeSet({ changed: ['modules/a/issues/011-y.md'], removed: [paths(3)[0]], rescan: false })
    await Promise.all([a, b])
    expect(r.maxInflight).toBe(1)
    expect(r.touched.map((t) => t.changed)).toEqual([['modules/a/issues/010-x.md'], ['modules/a/issues/011-y.md']])
    const idx = r.engine.current()!
    expect(Object.keys(idx.files)).toContain('modules/a/issues/010-x.md')
    expect(Object.keys(idx.files)).toContain('modules/a/issues/011-y.md')
    expect(idx.files[paths(3)[0]]).toBeUndefined()
  })

  it('waits for the start to finish before applying an early ChangeSet', async () => {
    const r = rig(paths(2))
    const open = r.gateScan()
    const started = r.engine.start()
    r.disk.set('modules/a/issues/020-z.md', '# z\n')
    const early = r.engine.applyChangeSet({ changed: ['modules/a/issues/020-z.md'], removed: [], rescan: false })
    await new Promise((res) => setTimeout(res, 5))
    expect(r.touched).toHaveLength(0) // queued behind the start
    open()
    await Promise.all([started, early])
    expect(Object.keys(r.engine.current()!.files)).toContain('modules/a/issues/020-z.md')
  })

  it('a failing step rejects its caller only and does not wedge the queue', async () => {
    const opts = { failRead: false }
    const r = rig(paths(2), opts)
    await r.engine.start()
    r.disk.set('modules/a/issues/040-w.md', '# w\n')
    opts.failRead = true
    const bad = r.engine.applyChangeSet({ changed: ['modules/a/issues/040-w.md'], removed: [], rescan: false })
    const good = r.engine.applyChangeSet({ changed: ['modules/a/issues/040-w.md'], removed: [], rescan: false })
    await expect(bad).rejects.toThrow('io')
    await good
    expect(Object.keys(r.engine.current()!.files)).toContain('modules/a/issues/040-w.md')
  })

  it('ignores an empty ChangeSet', async () => {
    const r = rig(paths(2))
    await r.engine.start()
    const before = r.calls.length
    await r.engine.applyChangeSet({ changed: [], removed: [], rescan: false })
    expect(r.calls.length).toBe(before)
  })
})

describe('SaveCache debounce', () => {
  it('is one save, 2 s after the last mutation', async () => {
    const r = rig(paths(2))
    await r.engine.start()
    r.fireTimers() // the cold-start save
    await r.engine.flushSave()
    const base = r.saved.length

    for (let i = 0; i < 3; i++) {
      r.disk.set(`modules/a/issues/05${i}-n.md`, '# n\n')
      await r.engine.applyChangeSet({ changed: [`modules/a/issues/05${i}-n.md`], removed: [], rescan: false })
    }
    const live = r.timers.filter((t) => t.live)
    expect(live).toHaveLength(1) // each mutation reset the same timer
    expect(live[0].ms).toBe(SAVE_DELAY_MS)
    expect(r.saved.length).toBe(base)
    r.fireTimers()
    await r.engine.flushSave()
    expect(r.saved.length).toBe(base + 1)
    expect(Object.keys(r.saved.at(-1)!.files)).toHaveLength(5)
  })
})

describe('rescan', () => {
  it('rebuilds from every file and drops files that vanished, publishing once', async () => {
    const r = rig(paths(3))
    await r.engine.start()
    r.disk.delete(paths(3)[1])
    r.disk.set('modules/a/issues/030-q.md', '# q\n')
    const before = r.indexes.length
    await r.engine.rescan()
    expect(r.indexes.length).toBe(before + 1)
    const idx = r.engine.current()!
    expect(Object.keys(idx.files).sort()).toEqual([paths(3)[0], paths(3)[2], 'modules/a/issues/030-q.md'].sort())
    expect(r.calls).toContain('rescan')
    expect(r.touched.at(-1)!.changed).toContain(paths(3)[1]) // the open doc is told to re-check
  })
})

describe('failures heal themselves', () => {
  it('a file that cannot be read is retried once and then lands', async () => {
    const unreadable = new Map([['modules/a/issues/050-lock.md', 1]])
    const r = rig(paths(2), { unreadable })
    await r.engine.start()
    r.disk.set('modules/a/issues/050-lock.md', '# lock\n')
    await r.engine.applyChangeSet({ changed: ['modules/a/issues/050-lock.md'], removed: [], rescan: false })
    expect(Object.keys(r.engine.current()!.files)).toContain('modules/a/issues/050-lock.md')
    expect(r.calls).not.toContain('rescan')
    expect(r.calls.filter((c) => c === 'read:1')).toHaveLength(2) // the read and its one retry
  })

  it('a file still unreadable after the retry queues a rescan', async () => {
    const unreadable = new Map([['modules/a/issues/051-lock.md', 2]])
    const r = rig(paths(2), { unreadable })
    await r.engine.start()
    r.disk.set('modules/a/issues/051-lock.md', '# lock\n')
    await r.engine.applyChangeSet({ changed: ['modules/a/issues/051-lock.md'], removed: [], rescan: false })
    await new Promise((res) => setTimeout(res, 20))
    expect(r.calls).toContain('rescan')
    expect(Object.keys(r.engine.current()!.files)).toContain('modules/a/issues/051-lock.md')
  })

  it('a ChangeSet that throws queues a rescan', async () => {
    const opts = { failRead: false }
    const r = rig(paths(2), opts)
    await r.engine.start()
    opts.failRead = true
    await expect(r.engine.applyChangeSet({ changed: [paths(2)[0]], removed: [], rescan: false })).rejects.toThrow('io')
    await new Promise((res) => setTimeout(res, 20))
    expect(r.calls).toContain('rescan')
  })

  it('a cache payload that is not an index triggers a full rescan, not a diff', async () => {
    const r = rig(paths(4), { cache: { nope: true } as unknown as Index, delivered: true })
    const t = await r.engine.start()
    expect(t.warm).toBe(false)
    expect(r.calls).toContain('rescan')
    expect(r.calls).not.toContain('scan')
    expect(Object.keys(r.engine.current()!.files)).toHaveLength(4)
  })

  it('does nothing after dispose', async () => {
    const r = rig(paths(2))
    await r.engine.start()
    await r.engine.dispose()
    const before = r.calls.length
    await r.engine.applyChangeSet({ changed: [paths(2)[0]], removed: [], rescan: false })
    expect(r.calls.length).toBe(before)
  })
})
