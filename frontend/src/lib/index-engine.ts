// The index mutation queue and the warm/cold start logic (ticket 09, 05 D1 to D3).
//
// Pure TypeScript with injected dependencies, so it runs under vitest without Svelte
// or Wails. The reactive wrapper is index-store.svelte.ts.
//
// One serial queue holds every mutation of the index: the start, each ChangeSet, a
// rescan and each cache save. Nothing else assigns the index.
import type { Index, SourceFile } from './parser'

/** Files per ReadBatch call, one batch in flight at a time. */
export const BATCH_SIZE = 100
/** SaveCache runs this long after the last mutation (05 section 3.5). */
export const SAVE_DELAY_MS = 2000

export interface ScanInfo {
  changed: string[]
  removed: string[]
  count: number
  walkMs: number
}
export interface ChangeInfo {
  changed: string[]
  removed: string[]
  rescan: boolean
}

/** What the engine needs from Go and from the parser. */
export interface EngineDeps {
  loadCache(parserVersion: string): Promise<unknown>
  saveCache(parserVersion: string, index: Index): Promise<void>
  scan(): Promise<ScanInfo>
  rescan(): Promise<ScanInfo>
  readBatch(paths: string[]): Promise<{ files: SourceFile[]; missing: string[] }>
  updateIndex(index: Index, changed: SourceFile[], removed: string[]): Index
  emptyIndex(): Index
  parserVersion: string
  now(): number
  log(msg: string): void
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

export interface EngineHooks {
  /** The index was replaced. */
  onIndex(index: Index): void
  /** Footer text changes. `checking` is set while a warm start reconciles. */
  onStatus(s: { text: string; checking: boolean }): void
  /** Paths whose file text changed or vanished, after the index has been updated. */
  onTouched(changed: string[], removed: string[]): void
  /** The latest scan or rescan answered: files on disk and how long the walk took. */
  onScan?(info: { count: number; walkMs: number }): void
}

export interface StartTimings {
  /** ms from start() to the cached tree being handed to the UI, or null on a cold start */
  cachePaintMs: number | null
  /** ms from start() to the scan answering */
  scanMs: number
  /** ms from start() to the index being fully current */
  currentMs: number
  warm: boolean
  count: number
  walkMs: number
}

export function isIndex(x: unknown): x is Index {
  const i = x as Index | null
  return !!i && typeof i === 'object' && i.version === 1 && !!i.files && typeof i.files === 'object' && Array.isArray(i.spaces)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function createIndexEngine(deps: EngineDeps, hooks: EngineHooks) {
  let index: Index | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let saveTimer: unknown = null
  let disposed = false
  let dirty = false

  /** Runs fn after everything queued before it. A failure rejects the caller only. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn)
    queue = run.catch(() => undefined)
    return run
  }

  function publish(next: Index) {
    index = next
    hooks.onIndex(next)
  }

  /** Reads the paths in batches of 100, keeping one read in flight while the last is parsed. */
  async function applyPaths(
    base: Index,
    paths: string[],
    removed: string[],
    progressive: boolean,
    label: (done: number, total: number) => string,
  ): Promise<{ index: Index; touched: string[]; gone: string[] }> {
    const batches = chunk(paths, BATCH_SIZE)
    let cur = removed.length ? deps.updateIndex(base, [], removed) : base
    const touched: string[] = []
    const gone = [...removed]
    let done = 0
    let inflight = batches.length ? deps.readBatch(batches[0]) : null
    for (let i = 0; i < batches.length; i++) {
      const res = await inflight!
      // Start the next read before parsing this one: one batch in flight, parse overlaps IPC.
      inflight = i + 1 < batches.length ? deps.readBatch(batches[i + 1]) : null
      const missing = res.missing ?? []
      cur = deps.updateIndex(cur, res.files ?? [], missing)
      touched.push(...(res.files ?? []).map((f) => f.path))
      gone.push(...missing)
      done += batches[i].length
      if (progressive) {
        publish(cur)
        hooks.onStatus({ text: label(done, paths.length), checking: false })
      }
    }
    return { index: cur, touched, gone }
  }

  function scheduleSave(immediately = false) {
    dirty = true
    if (saveTimer !== null) deps.clearTimer(saveTimer)
    saveTimer = deps.setTimer(() => {
      saveTimer = null
      void flushSave()
    }, immediately ? 0 : SAVE_DELAY_MS)
  }

  /** Saves through the queue, so the stamps Go holds match the index being written. */
  function flushSave(): Promise<void> {
    if (disposed) return Promise.resolve()
    return enqueue(async () => {
      if (!dirty || !index) return
      dirty = false
      const t = deps.now()
      try {
        await deps.saveCache(deps.parserVersion, index)
        deps.log(`index: SaveCache ${Math.round(deps.now() - t)} ms`)
      } catch (err) {
        dirty = true
        deps.log(`index: SaveCache failed: ${String(err)}`)
      }
    })
  }

  /**
   * Cold or warm start. A cache hit paints at once, then a stat-only scan reconciles.
   * Resolves with both timings (AC1).
   */
  function start(): Promise<StartTimings> {
    return enqueue(async () => {
      const t0 = deps.now()
      let cachePaintMs: number | null = null
      let cached: unknown = null
      try {
        cached = await deps.loadCache(deps.parserVersion)
      } catch (err) {
        deps.log(`index: LoadCache failed, cold start: ${String(err)}`)
      }
      const hit = isIndex(cached) ? cached : null
      const warm = hit !== null
      let base: Index
      if (hit) {
        base = hit
        publish(base)
        cachePaintMs = Math.round(deps.now() - t0)
        hooks.onStatus({ text: `Checking ${Object.keys(base.files).length} files…`, checking: true })
        deps.log(`index: warm start, tree painted from cache in ${cachePaintMs} ms`)
      } else {
        base = deps.emptyIndex()
        hooks.onStatus({ text: 'Scanning…', checking: false })
      }

      const scan = await deps.scan()
      const scanMs = Math.round(deps.now() - t0)
      deps.log(`index: scan returned in ${scanMs} ms (walk ${scan.walkMs} ms, ${scan.changed.length} changed, ${scan.removed.length} removed)`)

      hooks.onScan?.({ count: scan.count, walkMs: scan.walkMs })
      const r = await applyPaths(base, scan.changed, scan.removed, !warm, (d, n) => `Reading ${d} of ${n} files…`)
      if (r.index !== index) publish(r.index)
      if (!warm || scan.changed.length || scan.removed.length) scheduleSave(!warm)
      const currentMs = Math.round(deps.now() - t0)
      hooks.onStatus({ text: `${scan.count} files`, checking: false })
      deps.log(`index: ${warm ? 'warm' : 'cold'} start current in ${currentMs} ms`)
      if (warm && (r.touched.length || r.gone.length)) hooks.onTouched(r.touched, r.gone)
      return { cachePaintMs, scanMs, currentMs, warm, count: scan.count, walkMs: scan.walkMs }
    })
  }

  /** A debounced docs:changed from Go: read what changed, update, tell the UI. */
  function applyChangeSet(cs: ChangeInfo): Promise<void> {
    return enqueue(async () => {
      if (!index || (!cs.changed.length && !cs.removed.length)) return
      const r = await applyPaths(index, cs.changed, cs.removed, false, () => '')
      publish(r.index)
      hooks.onTouched(r.touched, r.gone)
      scheduleSave()
    })
  }

  /** Ctrl+R and root changes: forget every stamp, list all files, rebuild from nothing. */
  function rescan(): Promise<void> {
    return enqueue(async () => {
      hooks.onStatus({ text: 'Rescanning…', checking: true })
      const scan = await deps.rescan()
      hooks.onScan?.({ count: scan.count, walkMs: scan.walkMs })
      // Built privately and published once, so the tree does not flash empty.
      const r = await applyPaths(deps.emptyIndex(), scan.changed, [], false, () => '')
      const before = index
      publish(r.index)
      hooks.onStatus({ text: `${scan.count} files`, checking: false })
      // Every previously known or new path may have changed text.
      const all = new Set<string>([...r.touched, ...Object.keys(before?.files ?? {})])
      hooks.onTouched([...all], [])
      scheduleSave(true)
    })
  }

  /** Flushes a pending save now (window close) and stops the timer. */
  async function dispose() {
    if (saveTimer !== null) {
      deps.clearTimer(saveTimer)
      saveTimer = null
    }
    await flushSave()
    disposed = true
  }

  return {
    start,
    applyChangeSet,
    rescan,
    flushSave,
    dispose,
    current: (): Index | null => index,
  }
}

export type IndexEngine = ReturnType<typeof createIndexEngine>
