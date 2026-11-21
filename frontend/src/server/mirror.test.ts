// Ticket 34: the factory's mirror. It lives under the repo's .git folder
// (<repo>/.git/factory/board/docs/) and is rewritten file by file, each file written as .<name>.tmp
// and renamed over the old one (the contract's C2). Folio must read it there and follow the renames.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocsService, type ChangeSet } from './docs'
import { inspectRoot } from './shell'

const fixture = path.join(__dirname, '..', '..', '..', 'fixtures', 'board-mirror')
const ROOTS = ['modules', 'handoffs', 'patterns']

let tmp: string
let mirror: string
let svc: DocsService
let events: ChangeSet[]

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-mirror-'))
  mirror = path.join(tmp, 'repo', '.git', 'factory', 'board', 'docs')
  mkdirSync(mirror, { recursive: true })
  cpSync(fixture, mirror, { recursive: true })
  events = []
  svc = new DocsService(() => ({ docs: mirror, roots: ROOTS }), (cs) => events.push(cs), path.join(tmp, 'cache'), { quiet: 100, max: 500 })
})
afterEach(() => {
  svc.shutdown()
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const until = async (ok: () => boolean, ms = 5000) => {
  for (const t0 = Date.now(); !ok() && Date.now() - t0 < ms; ) await new Promise((r) => setTimeout(r, 20))
}
const settled = async (ms = 400) => {
  for (let n = -1, t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 20)))
    if (events.length !== n) (n = events.length), (t = Date.now())
}

describe('a docs folder under .git (ticket 34)', () => {
  it('--docs and the path box accept it: inspectRoot finds modules/ and makes it the docs folder', () => {
    const rc = inspectRoot(mirror, [])
    expect(rc).toMatchObject({ ok: true, repoRoot: path.dirname(mirror), docsDir: 'docs', found: ['modules'] })
  })

  it('also under another dot folder', () => {
    const other = path.join(tmp, '.cache', 'docs')
    cpSync(fixture, other, { recursive: true })
    expect(inspectRoot(other, []).ok).toBe(true)
  })

  it('the scan lists every mirror file', async () => {
    const s = await svc.scan()
    expect(s.changed.sort()).toEqual([
      'modules/pay/issues/01-card-capture.md',
      'modules/pay/issues/02-payment-intents.md',
      'modules/pay/issues/03-provider-webhooks.md',
      'modules/pay/issues/04-refund-screen.md',
      'modules/pay/issues/05-receipts.md',
      'modules/pay/issues/06-currency-table.md',
      'modules/pay/issues/07-legacy-charge-api.md',
      'modules/pay/issues/08-chargebacks.md',
      'modules/pay/issues/09-payouts.md',
      'modules/pay/map.md',
    ])
  })
})

describe('a mirror rewritten by temporary file and rename (ticket 34, contract C2)', () => {
  it('a burst of 60 rename-over writes ends with every file at its last content, and no .tmp is ever reported', async () => {
    const issues = path.join(mirror, 'modules', 'pay', 'issues')
    const names = Array.from({ length: 20 }, (_, i) => `${String(i + 10).padStart(2, '0')}-burst-${i}.md`)
    for (const n of names) writeFileSync(path.join(issues, n), '# start\n')
    const s = await svc.scan()
    await svc.readBatch(s.changed)
    await settled()
    events.length = 0

    const want = names.map((n) => `modules/pay/issues/${n}`)
    // Folio reading while the factory renames, as the browser does when change events arrive: on
    // Windows a rename over a file another process holds open fails, so this is the locking check.
    let writing = true
    let reads = 0
    const reader = (async () => {
      while (writing) {
        await svc.readBatch(want)
        reads++
        await new Promise((r) => setImmediate(r))
      }
    })()

    // three rounds over 20 files, as fast as the factory could write them, yielding now and then
    const content = (n: string, round: number) => `---\nstatus: in-progress\n---\n\n# ${n} round ${round}\n`
    for (let round = 1; round <= 3; round++) {
      for (const n of names) {
        const tmpFile = path.join(issues, `.${n}.tmp`)
        writeFileSync(tmpFile, content(n, round))
        renameSync(tmpFile, path.join(issues, n))
        await new Promise((r) => setImmediate(r))
      }
    }
    writing = false
    await reader
    expect(reads).toBeGreaterThan(0)

    const changed = () => new Set(events.flatMap((e) => e.changed))
    await settled()

    const all = events.flatMap((e) => [...e.changed, ...e.removed])
    expect(all.filter((p) => !p.endsWith('.md'))).toEqual([])
    expect(events.flatMap((e) => e.removed)).toEqual([])
    // No change set is required here: the reader above may already hold each file's last content, and
    // then the watcher rightly has nothing new to report. What must hold is the next read (below).
    expect([...changed()].every((p) => want.includes(p))).toBe(true)

    const batch = await svc.readBatch(want)
    expect(batch.missing).toEqual([])
    expect(batch.failed).toEqual([])
    for (const f of batch.files) expect(f.text).toContain('round 3')
    // nothing left behind, and Folio held no file open: every rename above succeeded on Windows
    expect(readdirSync(issues).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })
})

describe('a rename-over the stamp alone cannot see (ticket 34)', () => {
  it('reports a file replaced in the same millisecond with the same size', async () => {
    const issues = path.join(mirror, 'modules', 'pay', 'issues')
    const target = path.join(issues, '01-card-capture.md')
    const when = new Date('2026-11-21T10:00:00.123Z')
    writeFileSync(target, '# aaaa\n')
    utimesSync(target, when, when)
    const s = await svc.scan()
    await svc.readBatch(s.changed)
    await settled()
    events.length = 0

    // the factory's next write, same size, and (as a fast writer can) the same millisecond
    const tmpFile = path.join(issues, '.01-card-capture.md.tmp')
    writeFileSync(tmpFile, '# bbbb\n')
    utimesSync(tmpFile, when, when)
    renameSync(tmpFile, target)

    await until(() => events.some((e) => e.changed.includes('modules/pay/issues/01-card-capture.md')))
    expect(events.flatMap((e) => e.changed)).toContain('modules/pay/issues/01-card-capture.md')
    const b = await svc.readBatch(['modules/pay/issues/01-card-capture.md'])
    expect(b.files[0].text).toBe('# bbbb\n')
  })
})
