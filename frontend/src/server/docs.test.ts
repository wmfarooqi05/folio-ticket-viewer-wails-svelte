// What only the Node side needs: the cases the contract suite cannot share with Go (renaming a folder
// that Go's per-directory watcher holds open), and the recovery path after a watcher error.
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocsService, normRoot, type ChangeSet } from './docs'
import { safeJoin } from './paths'

let tmp: string
let docs: string
let svc: DocsService
let events: ChangeSet[]
const ROOTS = ['modules', 'handoffs', 'patterns']

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-docs-'))
  docs = path.join(tmp, 'docs')
  cpSync(path.join(__dirname, '..', '..', '..', 'fixtures', 'docs'), docs, { recursive: true })
  events = []
  svc = new DocsService(() => ({ docs, roots: ROOTS }), (cs) => events.push(cs), path.join(tmp, 'cache'), { quiet: 100, max: 500 })
})
afterEach(() => {
  svc.shutdown()
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const until = async (ok: () => boolean, ms = 3000) => {
  for (const t0 = Date.now(); !ok() && Date.now() - t0 < ms; ) await new Promise((r) => setTimeout(r, 20))
}

// until no change set has arrived for `ms`
const settled = async (ms = 400) => {
  for (let n = -1, t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 20)))
    if (events.length !== n) (n = events.length), (t = Date.now())
}

describe('watcher', () => {
  it('reports a renamed folder as removed plus changed', async () => {
    mkdirSync(path.join(docs, 'modules', 'fresh', 'issues'), { recursive: true })
    writeFileSync(path.join(docs, 'modules', 'fresh', 'issues', '01-a.md'), '# a\n')
    const s = await svc.scan()
    await svc.readBatch(s.changed)
    // On a slow runner the OS can still deliver the events for the folder created above after the scan,
    // and they would then show up as a change of modules/fresh/... Let them flush first (quiet is 100 ms).
    await settled()
    events.length = 0
    renameSync(path.join(docs, 'modules', 'fresh'), path.join(docs, 'modules', 'fresher'))
    // the removal and the walk of the new folder may land in one flush or two: look at the union
    const all = () => ({
      removed: [...new Set(events.flatMap((e) => e.removed))],
      changed: [...new Set(events.flatMap((e) => e.changed))],
    })
    await until(() => all().removed.length > 0 && all().changed.includes('modules/fresher/issues/01-a.md'))
    expect(all().removed).toEqual(['modules/fresh/issues/01-a.md'])
    expect(all().changed).toEqual(['modules/fresher/issues/01-a.md'])
  })

  it('treats an event with no file name (events the OS dropped) as an overflow: a full rescan with rescan:true', async () => {
    const s = await svc.scan()
    await svc.readBatch(s.changed)
    writeFileSync(path.join(docs, 'modules', 'one-cash-mover', 'zz-missed.md'), '# z')
    ;(svc as any).watcher.onEvent(path.join(docs, 'modules'), null)
    await until(() => events.some((e) => e.rescan))
    expect(events.find((e) => e.rescan)!.changed).toContain('modules/one-cash-mover/zz-missed.md')
  })

  it('does a full rescan with rescan:true after the watched folder is replaced', async () => {
    const s = await svc.scan()
    await svc.readBatch(s.changed)
    ;(svc as any).watcher.onError() // what an fs.watch error does
    writeFileSync(path.join(docs, 'modules', 'one-cash-mover', 'zz-after-error.md'), '# z\n')
    await until(() => events.some((e) => e.rescan))
    const cs = events.find((e) => e.rescan)!
    expect(cs.changed).toContain('modules/one-cash-mover/zz-after-error.md')
  })

  it('stops reporting after shutdown', async () => {
    await svc.scan()
    svc.shutdown()
    writeFileSync(path.join(docs, 'modules', 'one-cash-mover', 'late.md'), '# late\n')
    await new Promise((r) => setTimeout(r, 400))
    expect(events).toEqual([])
  })
})

describe('cache', () => {
  it.skipIf(process.platform !== 'win32')('keys the file by the lower-cased, slashed root, like Go', () => {
    expect(normRoot('E:\\Projects\\Docs\\')).toBe('e:/projects/docs')
    expect(normRoot('E:/Projects/Docs')).toBe('e:/projects/docs')
  })
})

describe('safeJoin', () => {
  it('refuses a Windows device name and a segment that cannot be inspected', async () => {
    await expect(safeJoin(docs, 'modules/CON.png')).rejects.toThrow()
    await expect(safeJoin(docs, 'modules/nul')).rejects.toThrow()
    await expect(safeJoin(docs, 'modules/aux.txt')).rejects.toThrow()
  })
  it('allows a path that does not exist yet', async () => {
    await expect(safeJoin(docs, 'modules/not/there.md')).resolves.toBe(path.join(docs, 'modules', 'not', 'there.md'))
  })
})
