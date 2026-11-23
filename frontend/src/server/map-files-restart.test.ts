// Ticket 47: new map names change the cache key. A restart with them must still list every file, and so must
// a later start from the cache it saved (the first fix of the review: the index used to come back empty).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createIndexEngine, type EngineDeps } from '../lib/index-engine'
import { cacheKey } from '../lib/index-store.svelte'
import { buildIndex, updateIndex, type Index } from '../lib/parser'
import { DocsService } from './docs'

let tmp: string
let docs: string
const svcs: DocsService[] = []
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-restart-'))
  docs = path.join(tmp, 'docs')
  mkdirSync(path.join(docs, 'modules/x/issues'), { recursive: true })
  writeFileSync(path.join(docs, 'modules/x/README.md'), '# X\n')
  writeFileSync(path.join(docs, 'modules/x/map.md'), '# Map\n')
  writeFileSync(path.join(docs, 'modules/x/issues/01-a.md'), '---\nstatus: open\n---\n# 01 a\n')
})
afterEach(async () => {
  for (const s of svcs.splice(0)) s.shutdown()
  await new Promise((r) => setTimeout(r, 50))
  rmSync(tmp, { recursive: true, force: true })
})

const service = () => {
  const s = new DocsService(() => ({ docs, roots: ['modules'] }), null, path.join(tmp, 'cache'))
  svcs.push(s)
  return s
}

async function start(svc: DocsService, names: string[]): Promise<Index> {
  let last: Index | null = null
  const deps: EngineDeps = {
    loadCache: (v) => svc.loadCache(v),
    saveCache: (v, i) => svc.saveCache(v, i),
    scan: () => svc.scan() as never,
    rescan: () => svc.rescan() as never,
    readBatch: (p) => svc.readBatch(p) as never,
    updateIndex,
    emptyIndex: () => buildIndex([], '', names),
    parserVersion: cacheKey('v', names),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: () => {},
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as never),
  }
  const eng = createIndexEngine(deps, { onIndex: (i: Index) => (last = i), onStatus: () => {}, onTouched: () => {} } as never)
  await eng.start()
  await eng.dispose(true)
  return last!
}

describe('restarting with other map names', () => {
  it('lists every file, now and from the cache it saved', async () => {
    const svc = service()
    const a = await start(svc, ['map.md', 'README.md'])
    expect(Object.keys(a.files)).toHaveLength(3)
    const b = await start(svc, ['README.md'])
    expect(Object.keys(b.files)).toHaveLength(3)
    expect(b.files['modules/x/README.md'].kind).toBe('map')
    expect(b.files['modules/x/map.md'].kind).toBe('doc')
    const c = await start(service(), ['README.md']) // a new server reading the cache written under the new key
    expect(Object.keys(c.files)).toHaveLength(3)
    expect(c.mapFiles).toEqual(['README.md'])
  })
})
