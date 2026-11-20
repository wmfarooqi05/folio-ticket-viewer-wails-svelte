// The file-system side, ported from internal/docs (service.go, cache.go, watcher.go): scan,
// read in batches, the stamps, the cache and the watcher. It never parses a ticket and
// never keeps file text.
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync, watch, type FSWatcher } from 'node:fs'
import { lstat, readFile, readdir, rm, stat, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { inScope, resolveMarkdown, skipDir } from './paths'

export const CHANGED_EVENT = 'docs:changed'
const READ_WORKERS = 4
const DEBOUNCE_QUIET = 200 // ms, trailing
const DEBOUNCE_MAX = 1000 // ms, a flush is forced after this long
const CACHE_VERSION = 1
/** The per-file cap (L6), the same as Go's docs.MaxFileBytes: a .md over this is not read. */
export const MAX_FILE_BYTES = 5 << 20
const megabytes = (n: number) => `${(n / (1 << 20)).toFixed(1)} MB`
const tooLargeMessage = (size: number) => `file is too large (${megabytes(size)}; the limit is ${megabytes(MAX_FILE_BYTES)})`

/** The file's text, or 'grew' if it passed the stat check and was over the cap by the time it was read. */
async function readCapped(full: string): Promise<string | 'grew'> {
  const b = await readFile(full)
  return b.length > MAX_FILE_BYTES ? 'grew' : stripBom(b.toString('utf8'))
}

export interface SourceFile {
  path: string
  text: string
  mtime: number
}
export interface ScanResult {
  changed: string[]
  removed: string[]
  count: number
  walkMs: number
  /** every .md on disk over MAX_FILE_BYTES (not a delta), sorted by path */
  tooLarge: TooLargeFile[]
}
export interface TooLargeFile {
  path: string
  /** bytes */
  size: number
}
export interface BatchResult {
  files: SourceFile[]
  missing: string[]
  failed: string[]
  /** over MAX_FILE_BYTES: stat only, never read */
  tooLarge: TooLargeFile[]
}
export interface ClearResult {
  cacheDir: string
  cacheDeleted: boolean
  /** web mode has no WebView2 profile */
  profileScheduled: boolean
  profileDirs: string[]
}
export interface ChangeSet {
  changed: string[]
  removed: string[]
  rescan: boolean
}
export interface Roots {
  docs: string
  roots: string[]
}

interface Stamp {
  mtime: number
  size: number
}
const same = (a: Stamp, b: Stamp) => a.mtime === b.mtime && a.size === b.size
const stampOf = (st: { mtimeMs: number; size: number }): Stamp => ({ mtime: Math.floor(st.mtimeMs), size: st.size })
const sameRoots = (a: Roots, b: Roots) => a.docs === b.docs && a.roots.length === b.roots.length && a.roots.every((r, i) => r === b.roots[i])

class Superseded extends Error {}

/** Where the cache goes: %LOCALAPPDATA%\Folio\cache, as Go. Never inside the docs root. */
export function defaultCacheDir(): string {
  let base = process.env.LOCALAPPDATA
  if (!base) {
    if (process.platform === 'darwin') base = path.join(os.homedir(), 'Library', 'Caches')
    else base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
  }
  return path.join(base, 'Folio', 'cache')
}

/** True for <something>/Folio/cache: the only folder clearCache will delete. */
export function isFolioCacheDir(dir: string): boolean {
  const d = path.resolve(dir)
  return path.basename(d).toLowerCase() === 'cache' && path.basename(path.dirname(d)).toLowerCase() === 'folio'
}

/** The docs root as the cache sees it: case-insensitive, forward slashes. */
export function normRoot(docs: string): string {
  let n = path.normalize(docs)
  while (n.length > 1 && (n.endsWith('/') || n.endsWith('\\')) && !/^[A-Za-z]:[/\\]$/.test(n)) n = n.slice(0, -1)
  return n.replaceAll('\\', '/').toLowerCase()
}

export class DocsService {
  private stamps = new Map<string, Stamp>() // path -> last delivered (or cached) stamp
  private announced = new Map<string, Stamp>() // what the watcher last reported, so a repeat flush is dropped
  private watcher: Watcher | null = null
  private closed = false
  private gen = 0
  private noSave = false // set by clearCache: nothing is written to the cache again until restart

  constructor(
    private roots: () => Roots,
    private emit: ((cs: ChangeSet) => void) | null,
    private cacheDir: string = defaultCacheDir(),
    private timing = { quiet: DEBOUNCE_QUIET, max: DEBOUNCE_MAX },
  ) {}

  shutdown(): void {
    this.closed = true
    this.watcher?.close()
    this.watcher = null
  }

  private send(cs: ChangeSet) {
    if (!this.closed && this.emit) this.emit(cs)
  }

  /** Drops the stamps and runs a full scan, so every file is in `changed`. */
  async rescan(): Promise<ScanResult> {
    this.stamps = new Map()
    this.announced = new Map()
    return this.scan()
  }

  /** Walks the configured roots and diffs against the known stamps; (re)starts the watcher first. */
  async scan(): Promise<ScanResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.doScan(false)
      } catch (e) {
        if (!(e instanceof Superseded) || attempt >= 3) throw e
      }
    }
  }

  private async doScan(announce: boolean): Promise<ScanResult> {
    const r = this.roots()
    if (r.docs === '') throw new Error('no docs root is configured')
    const gen = this.startWatcher(r)
    const start = Date.now()
    const found = await walkMarkdown(r)
    const walkMs = Date.now() - start
    if (this.gen !== gen || !sameRoots(r, this.roots())) throw new Superseded()
    const res: ScanResult = { changed: [], removed: [], count: found.size, walkMs, tooLarge: [] }
    for (const [p, st] of found) if (st.size > MAX_FILE_BYTES) res.tooLarge.push({ path: p, size: st.size })
    res.tooLarge.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    for (const [p, st] of found) {
      const old = this.stamps.get(p)
      if (!old || !same(old, st)) {
        res.changed.push(p)
        if (announce) this.announced.set(p, st)
      }
    }
    for (const p of [...this.stamps.keys()]) {
      if (!found.has(p)) {
        res.removed.push(p)
        this.stamps.delete(p)
      }
    }
    for (const p of [...this.announced.keys()]) if (!found.has(p)) this.announced.delete(p)
    res.changed.sort()
    res.removed.sort()
    return res
  }

  /** Reads the files with a bounded pool. It stats before reading and records that stamp as delivered. */
  async readBatch(paths: string[]): Promise<BatchResult> {
    const r = this.roots()
    // Validate every path first, so one bad path fails the whole call before any I/O.
    const fulls: string[] = []
    for (const p of paths) fulls.push(await resolveMarkdown(r.docs, p))
    type Out = { file?: SourceFile; stamp?: Stamp; missing?: boolean; err?: unknown; tooBig?: number }
    const out: Out[] = new Array(paths.length)
    let next = 0
    const worker = async () => {
      for (let i = next++; i < paths.length; i = next++) {
        try {
          const st = await stat(fulls[i])
          const stamp = stampOf(st)
          if (st.size > MAX_FILE_BYTES) {
            // Over the cap: reported from the stat alone, so a huge file costs no read.
            out[i] = { tooBig: st.size, stamp }
            continue
          }
          const text = await readCapped(fulls[i])
          if (text === 'grew') {
            out[i] = { tooBig: MAX_FILE_BYTES + 1, stamp }
            continue
          }
          out[i] = { stamp, file: { path: paths[i], text, mtime: stamp.mtime } }
        } catch (e) {
          out[i] = (e as NodeJS.ErrnoException).code === 'ENOENT' ? { missing: true } : { err: e }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(READ_WORKERS, paths.length) }, worker))
    const res: BatchResult = { files: [], missing: [], failed: [], tooLarge: [] }
    paths.forEach((p, i) => {
      const o = out[i]
      if (o.err) {
        // One unreadable file (a sharing violation, say) must not fail the batch.
        res.failed.push(p)
        this.announced.delete(p)
      } else if (o.tooBig !== undefined) {
        // Delivered, as far as the server is concerned: the frontend holds a stub for it, so a later
        // delete is seen by scan and an unchanged file is not read again. scan's tooLarge says why.
        res.tooLarge.push({ path: p, size: o.tooBig })
        this.stamps.set(p, o.stamp!)
      } else if (o.missing) {
        res.missing.push(p)
        this.stamps.delete(p)
        this.announced.delete(p)
      } else {
        res.files.push(o.file!)
        this.stamps.set(p, o.stamp!)
      }
    })
    return res
  }

  /** One file's text for rendering. It does not touch stamps. */
  async readFile(p: string): Promise<string> {
    const full = await resolveMarkdown(this.roots().docs, p)
    const st = await stat(full)
    if (st.size > MAX_FILE_BYTES) throw new Error(tooLargeMessage(st.size))
    const text = await readCapped(full)
    if (text === 'grew') throw new Error(tooLargeMessage(MAX_FILE_BYTES + 1))
    return text
  }

  /**
   * "Clear data" (L5): deletes the cache folder and stops writing it until restart. Only a folder named
   * <something>/Folio/cache is ever deleted, and never through a link.
   */
  async clearCache(): Promise<ClearResult> {
    const dir = this.cacheDir
    const res: ClearResult = { cacheDir: dir, cacheDeleted: false, profileScheduled: false, profileDirs: [] }
    if (!isFolioCacheDir(dir)) throw new Error(`refusing to delete ${dir}: it is not a Folio cache folder`)
    this.noSave = true
    let st
    try {
      st = await lstat(dir)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return res
      throw e
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`refusing to delete ${dir}: it is a link or not a folder`)
    await rm(dir, { recursive: true, force: true })
    res.cacheDeleted = true
    return res
  }

  // ---- cache (cache.go) --------------------------------------------------------

  private cachePath(r: Roots): string {
    const sum = createHash('sha1').update(normRoot(r.docs)).digest('hex').slice(0, 12)
    return path.join(this.cacheDir, sum + '.json')
  }

  /** The cached index, or null (no cache, corrupt, or another parser or root). A hit also loads the stamps. */
  async loadCache(parserVersion: string): Promise<unknown> {
    const r = this.roots()
    if (r.docs === '') throw new Error('no docs root is configured')
    const file = this.cachePath(r)
    // A crash between create and rename leaves a temp file behind: sweep them.
    try {
      for (const f of await readdir(this.cacheDir)) {
        if (f.startsWith(path.basename(file) + '.') && f.endsWith('.tmp')) await unlink(path.join(this.cacheDir, f)).catch(() => {})
      }
    } catch {
      /* no cache folder yet */
    }
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
    let env: { v?: number; parserVersion?: string; docsRoot?: string; roots?: string[]; stamps?: Record<string, [number, number]>; index?: unknown }
    try {
      env = JSON.parse(text)
      if (env.v !== CACHE_VERSION || env.index === undefined || env.index === null) throw new Error('bad envelope')
    } catch {
      await unlink(file).catch(() => {})
      return null
    }
    if (env.parserVersion !== parserVersion || env.docsRoot !== normRoot(r.docs) || !sameList(env.roots ?? [], r.roots)) return null
    this.stamps = new Map(Object.entries(env.stamps ?? {}).map(([p, v]) => [p, { mtime: v[0], size: v[1] }]))
    this.announced = new Map()
    return env.index
  }

  /** Writes {envelope, stamps, index} atomically. */
  async saveCache(parserVersion: string, index: unknown): Promise<void> {
    const r = this.roots()
    if (r.docs === '') throw new Error('no docs root is configured')
    if (index === undefined || index === null) throw new Error('empty index')
    if (this.noSave) return // "Clear data" ran: the cache stays gone until restart
    const stamps: Record<string, [number, number]> = {}
    for (const p of [...this.stamps.keys()].sort()) {
      const s = this.stamps.get(p)!
      stamps[p] = [s.mtime, s.size]
    }
    const env = { v: CACHE_VERSION, parserVersion, docsRoot: normRoot(r.docs), roots: r.roots, stamps, index }
    await writeAtomic(this.cachePath(r), JSON.stringify(env))
  }

  // ---- watcher -----------------------------------------------------------------

  private startWatcher(r: Roots): number {
    const gen = ++this.gen
    if (!this.emit || this.closed) return gen
    const w = new Watcher(r, this, this.timing)
    const old = this.watcher
    this.watcher = w
    old?.close()
    return gen
  }

  /** Paths known (delivered or announced) under a directory prefix. */
  knownUnder(dir: string): string[] {
    const prefix = dir + '/'
    return [...this.stamps.keys(), ...this.announced.keys()].filter((p) => p.startsWith(prefix))
  }

  /**
   * Turns a set of touched paths into a ChangeSet by stat, not by event type. A path whose stamp
   * equals the delivered or the last announced one is dropped, which absorbs no-op saves and
   * duplicate events. A gone path is removed only if it was known.
   */
  async judge(paths: Iterable<string>): Promise<ChangeSet> {
    const cs: ChangeSet = { changed: [], removed: [], rescan: false }
    const docs = this.roots().docs
    type Probe = { path: string; gone: boolean; cur?: Stamp }
    const probes: Probe[] = []
    for (const p of paths) {
      let full: string
      try {
        full = await resolveMarkdown(docs, p)
      } catch {
        continue
      }
      try {
        const st = await stat(full)
        if (st.isDirectory()) continue
        probes.push({ path: p, gone: false, cur: stampOf(st) })
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') probes.push({ path: p, gone: true })
      }
    }
    for (const pr of probes) {
      const p = pr.path
      if (pr.gone) {
        if (this.stamps.has(p) || this.announced.has(p)) {
          cs.removed.push(p)
          this.stamps.delete(p)
          this.announced.delete(p)
        }
        continue
      }
      const cur = pr.cur!
      const old = this.stamps.get(p)
      if (old && same(old, cur)) continue
      const a = this.announced.get(p)
      if (a && same(a, cur)) continue
      this.announced.set(p, cur)
      cs.changed.push(p)
    }
    cs.changed.sort()
    cs.removed.sort()
    return cs
  }

  /** After a watcher error: a fresh watcher and a full diff, retried with backoff. Sent with rescan set. */
  async rescanAfterError(failing: Watcher, backoff = [1000, 2000, 4000, 8000, 15000]): Promise<void> {
    let expect: Watcher | null = failing
    for (let attempt = 0; ; attempt++) {
      if (this.closed || this.watcher !== expect) return
      try {
        const res = await this.doScan(true)
        this.send({ changed: res.changed, removed: res.removed, rescan: true })
        return
      } catch (e) {
        if (e instanceof Superseded || attempt >= backoff.length) return
        await new Promise((ok) => setTimeout(ok, backoff[attempt]))
        expect = this.watcher // our own failed attempt may have installed a new watcher
      }
    }
  }

  /** @internal for the watcher */
  deliver(cs: ChangeSet) {
    this.send(cs)
  }
}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** The stamp of every .md file under the configured roots, keyed by POSIX path relative to the docs root. */
async function walkMarkdown(r: Roots): Promise<Map<string, Stamp>> {
  const found = new Map<string, Stamp>()
  const walk = async (dir: string, top: boolean): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (e) {
      if (top) throw e
      return // unreadable subfolder: skip it
    }
    for (const d of entries) {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) {
        if (!skipDir(d.name)) await walk(p, false)
      } else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) {
        try {
          found.set(path.relative(r.docs, p).split(path.sep).join('/'), stampOf(await stat(p)))
        } catch {
          /* vanished */
        }
      }
    }
  }
  for (const root of r.roots) {
    const base = path.join(r.docs, root)
    try {
      if (!(await stat(base)).isDirectory()) continue
    } catch {
      continue // a missing root is skipped
    }
    await walk(base, true)
  }
  return found
}

async function writeAtomic(file: string, data: string): Promise<void> {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeFileSync(fd, data)
    fsyncSync(fd)
  } catch (e) {
    closeSync(fd)
    try {
      unlinkSync(tmp)
    } catch {
      /* gone */
    }
    throw e
  }
  closeSync(fd)
  // Antivirus and indexers briefly hold files on Windows: retry the rename a few times.
  let last: unknown
  for (let i = 0; i < 5; i++) {
    try {
      renameSync(tmp, file)
      return
    } catch (e) {
      last = e
      await new Promise((ok) => setTimeout(ok, (i + 1) * 20))
    }
  }
  try {
    unlinkSync(tmp)
  } catch {
    /* gone */
  }
  throw last
}

/**
 * One recursive fs.watch per configured root, with the ticket 09 rules: events only collect paths;
 * a flush stats them against the stamps (200 ms trailing, 1 s maximum); a directory that vanished
 * sweeps the known paths beneath it; a new directory is walked for the files already in it; a
 * watcher error ends in a full rescan.
 */
class Watcher {
  private fws: FSWatcher[] = []
  private pending = new Set<string>()
  private gone: string[] = []
  private quiet: ReturnType<typeof setTimeout> | null = null
  private forced: ReturnType<typeof setTimeout> | null = null
  private done = false
  /** directory events still being stat'ed or walked: a flush waits for them, so a rename is one event */
  private busy = 0

  constructor(
    private r: Roots,
    private svc: DocsService,
    private timing: { quiet: number; max: number },
  ) {
    for (const root of r.roots) {
      const base = path.join(r.docs, root)
      try {
        const fw = watch(base, { recursive: true }, (_type, name) => this.onEvent(base, name))
        fw.on('error', () => this.onError())
        this.fws.push(fw)
      } catch {
        /* a root that is missing or unwatchable: the scan already skips it */
      }
    }
  }

  close() {
    if (this.done) return
    this.done = true
    if (this.quiet) clearTimeout(this.quiet)
    if (this.forced) clearTimeout(this.forced)
    for (const fw of this.fws) {
      try {
        fw.close()
      } catch {
        /* already closed */
      }
    }
    this.fws = []
  }

  private arm() {
    if (this.quiet) clearTimeout(this.quiet)
    this.quiet = setTimeout(() => void this.flush(), this.timing.quiet)
    this.forced ??= setTimeout(() => void this.flush(), this.timing.max)
  }

  private onEvent(base: string, name: string | Buffer | null) {
    if (this.done) return
    // A null name is what libuv reports when the OS dropped events (a buffer overflow on Windows):
    // no 'error' event comes with it. The pending set cannot be trusted, so diff the whole tree.
    if (name === null) return this.onError()
    const abs = path.join(base, name.toString())
    const rel = path.relative(this.r.docs, abs).split(path.sep).join('/')
    if (rel === '' || rel.startsWith('..') || !inScope(rel)) return
    if (rel.toLowerCase().endsWith('.md')) {
      this.pending.add(rel)
      this.arm()
      return
    }
    // No .md extension: a new directory (walk it for files made before the watch saw it), or one
    // deleted or renamed away (the event names only the directory, so sweep what is known beneath it).
    this.busy++
    stat(abs).then(
      (st) => {
        if (st.isDirectory() && !skipDir(path.basename(abs))) void this.walkNew(abs).finally(() => this.busy--)
        else this.busy--
      },
      (e: NodeJS.ErrnoException) => {
        this.busy--
        if (e.code === 'ENOENT' && !this.done) {
          this.gone.push(rel)
          this.arm()
        }
      },
    )
  }

  private async walkNew(dir: string) {
    const walk = async (d: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) {
          if (!skipDir(e.name)) await walk(p)
        } else if (e.name.toLowerCase().endsWith('.md')) this.pending.add(path.relative(this.r.docs, p).split(path.sep).join('/'))
      }
    }
    await walk(dir)
    if (!this.done && this.pending.size > 0) this.arm()
  }

  private async flush() {
    if (this.quiet) clearTimeout(this.quiet)
    if (this.forced) clearTimeout(this.forced)
    this.quiet = this.forced = null
    if (this.done) return
    if (this.busy > 0) {
      // directory events are still being resolved: look again shortly (they finish in milliseconds)
      this.quiet = setTimeout(() => void this.flush(), 20)
      return
    }
    for (const dir of this.gone) for (const p of this.svc.knownUnder(dir)) this.pending.add(p)
    this.gone = []
    const paths = this.pending
    this.pending = new Set()
    const cs = await this.svc.judge(paths)
    if (!this.done && (cs.changed.length > 0 || cs.removed.length > 0)) this.svc.deliver(cs)
  }

  private onError() {
    if (this.done) return
    this.close()
    void this.svc.rescanAfterError(this)
  }
}
