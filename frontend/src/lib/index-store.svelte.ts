// The reactive face of the index engine. Components read `indexStore.index`,
// `indexStore.status` and `indexStore.docVersion`; only the engine writes them.
//
// `index` is $state.raw on purpose (05 D1): one copy of the index, never proxied.
import * as api from './api'
import { createIndexEngine, type IndexEngine, type StartTimings } from './index-engine'
import { buildIndex, updateIndex, type Index } from './parser'

class IndexStore {
  /** The only index. Replaced, never mutated. */
  index = $state.raw<Index | null>(null)
  /** Footer text, and whether a warm start is still reconciling. */
  status = $state.raw({ text: '', checking: false })
  /**
   * Bumps whenever the text of some file changed or vanished. Read it inside an
   * $effect and call `touched(path)` to learn whether your document is affected.
   */
  docVersion = $state(0)
  /** Files on disk and the walk time of the latest scan, for Settings. */
  scanInfo = $state.raw<{ count: number; walkMs: number } | null>(null)

  #engine: IndexEngine | null = null
  #gen = 0 // bumped by every start(); an older engine can no longer write here
  #unsubscribe: (() => void) | null = null
  #changed = new Set<string>()
  #removed = new Set<string>()

  /** True when `path` changed or was deleted in the most recent docVersion bump. */
  touched(path: string): boolean {
    return this.#changed.has(path) || this.#removed.has(path)
  }
  /** True when `path` was deleted in the most recent docVersion bump. */
  removed(path: string): boolean {
    return this.#removed.has(path)
  }

  /** Warm or cold start, then live refresh. Safe to call again after a root change. */
  start(): Promise<StartTimings> {
    this.stop(false) // a newer generation follows: the old engine must not save its index
    this.index = null
    const gen = ++this.#gen
    const live = () => gen === this.#gen
    this.#engine = createIndexEngine(
      {
        loadCache: api.loadCache,
        saveCache: api.saveCache,
        scan: async () => normalise(await api.scan()),
        rescan: async () => normalise(await api.rescan()),
        readBatch: api.readBatch,
        updateIndex,
        emptyIndex: () => buildIndex([]),
        parserVersion: __PARSER_VERSION__,
        now: () => performance.now(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        log: (m) => console.info(m),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
      {
        onIndex: (i) => live() && (this.index = i),
        onStatus: (s) => live() && (this.status = s),
        onScan: (i) => live() && (this.scanInfo = i),
        onTouched: (changed, removed) => {
          if (!live()) return
          this.#changed = new Set(changed)
          this.#removed = new Set(removed)
          this.docVersion++
        },
      },
    )
    const engine = this.#engine
    this.#unsubscribe = api.onDocsChanged((cs) =>
      void engine
        .applyChangeSet({ changed: cs.changed ?? [], removed: cs.removed ?? [], rescan: !!cs.rescan })
        .catch((err) => console.error('docs:changed failed', err)),
    )
    return engine.start().then((t) => {
      // The start timings go to the Go log once; nothing else crosses IPC for logging.
      void api
        .logTimings(
          `${t.warm ? 'warm' : 'cold'} start: cache paint ${t.cachePaintMs ?? 'n/a'} ms, scan ${t.scanMs} ms, current ${t.currentMs} ms, ${t.count} files`,
        )
        .catch(() => {})
      return t
    })
  }

  /** Ctrl+R, and a root change in Settings. Rebuilds from every file. */
  rescan(): Promise<void> {
    return this.#engine ? this.#engine.rescan() : Promise.resolve()
  }

  stop(save = true) {
    this.#gen++ // invalidates the running engine's hooks at once
    this.#unsubscribe?.()
    this.#unsubscribe = null
    void this.#engine?.dispose(save)
    this.#engine = null
  }
}

function normalise(s: api.ScanResult) {
  return { changed: s.changed ?? [], removed: s.removed ?? [], count: s.count, walkMs: s.walkMs }
}

export const indexStore = new IndexStore()
