// Ticket 18 review fixes that only the Node side can test directly.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocsService, MAX_FILE_BYTES } from './docs'
import { isNetworkLinkTarget, pathReachesNetwork, rootShapeError, type LinkFs } from './settings'

let tmp: string
let docs: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-hard-'))
  docs = path.join(tmp, 'docs')
  mkdirSync(path.join(docs, 'modules', 'a'), { recursive: true })
  writeFileSync(path.join(docs, 'modules', 'a', '01.md'), '# a\n')
})
afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

const service = (cache: string) => new DocsService(() => ({ docs, roots: ['modules'] }), null, cache)

describe('clear data and a save in flight', () => {
  it('waits for the save, and the save cannot bring the cache back', async () => {
    const cache = path.join(tmp, 'Folio', 'cache')
    const svc = service(cache)
    let release!: () => void
    let inWrite!: () => void
    const entered = new Promise<void>((ok) => (inWrite = ok))
    svc.testHooks.beforeCacheWrite = () =>
      new Promise<void>((ok) => {
        inWrite()
        release = ok
      })
    const saving = svc.saveCache('p1', { a: 1 })
    await entered
    let cleared = false
    const clearing = svc.clearCache().then((r) => ((cleared = true), r))
    await new Promise((r) => setTimeout(r, 150))
    expect(cleared, 'clearCache did not wait for the save in flight').toBe(false)
    release()
    await saving
    expect((await clearing).cacheDeleted).toBe(true)
    expect(existsSync(cache)).toBe(false)
    await svc.saveCache('p1', { a: 2 })
    expect(existsSync(cache)).toBe(false)
  })
})

describe('files that are not plain files', () => {
  it('a folder named *.md is not read, and readFile refuses it', async () => {
    mkdirSync(path.join(docs, 'modules', 'a', 'folder.md'))
    const svc = service(path.join(tmp, 'Folio', 'cache'))
    const res = await svc.readBatch(['modules/a/folder.md'])
    expect(res.failed).toEqual(['modules/a/folder.md'])
    expect(res.files).toEqual([])
    await expect(svc.readFile('modules/a/folder.md')).rejects.toThrow('regular')
  })

  it('a file over the cap is reported with a size read from a fresh stat', async () => {
    writeFileSync(path.join(docs, 'modules', 'a', 'big.md'), 'x'.repeat(MAX_FILE_BYTES + 10))
    const svc = service(path.join(tmp, 'Folio', 'cache'))
    expect((await svc.readBatch(['modules/a/big.md'])).tooLarge).toEqual([{ path: 'modules/a/big.md', size: MAX_FILE_BYTES + 10 }])
  })
})

describe.skipIf(process.platform !== 'win32')('links that lead to the network', () => {
  const dirs = new Set([String.raw`C:\r`, String.raw`C:\r\docs`, String.raw`C:\r\docs\modules`, String.raw`C:\r\docs\modules\a`, String.raw`C:\other`, String.raw`C:\r\ok`])
  const links: Record<string, string> = {
    // a link whose target passes through another link: ..\..\..\evil\y.md, evil -> \\host\share
    [String.raw`C:\r\docs\modules\a\x.md`]: String.raw`..\..\..\evil\y.md`,
    [String.raw`C:\r\evil`]: String.raw`\\host\share`,
    // the docs folder is a link to a share
    [String.raw`C:\bad`]: String.raw`\\host\share\docs`,
    // a rooted target is taken on the link's own drive: \x\b.md, with C:\x a link to a share
    [String.raw`C:\r\rooted.md`]: String.raw`\x\b.md`,
    [String.raw`C:\x`]: String.raw`\\evil\s`,
    [String.raw`C:\r\ok\l.md`]: String.raw`C:\other\a.md`,
    [String.raw`C:\r\ok\rel.md`]: String.raw`..\..\other\a.md`,
    [String.raw`C:\r\ok\dev.md`]: String.raw`\\?\C:\other\a.md`,
    [String.raw`C:\r\loop.md`]: 'loop.md',
  }
  const asked: string[] = []
  const fs: LinkFs = {
    lstat: (p) => {
      asked.push(p)
      if (p in links) return { isSymbolicLink: () => true }
      return dirs.has(p) ? { isSymbolicLink: () => false } : null
    },
    readlink: (p) => links[p],
  }
  it.each([
    [String.raw`C:\r\docs\modules\a\x.md`, true],
    [String.raw`C:\bad\modules`, true],
    [String.raw`C:\bad`, true],
    [String.raw`C:\r\rooted.md`, true],
    [String.raw`C:\r\ok\l.md`, false],
    [String.raw`C:\r\ok\rel.md`, false],
    [String.raw`C:\r\ok\dev.md`, false],
    [String.raw`C:\r\loop.md`, true],
    [String.raw`C:\r\docs\modules\a\y.md`, false],
    [String.raw`C:\r\docs\..\ok`, false],
    [String.raw`\\host\share\repo`, false],
  ])('%s -> %s', (p, want) => {
    asked.length = 0
    expect(pathReachesNetwork(p, fs)).toBe(want)
    // never asked about a path that lies behind a link: that lstat would follow it
    for (const q of asked) for (const l of Object.keys(links)) expect(q.toLowerCase().startsWith(l.toLowerCase() + '\\'), `${q} is behind ${l}`).toBe(false)
  })
  it('refuses a junction or link that cannot be read', () => {
    const bad: LinkFs = {
      lstat: (p) => (p === String.raw`C:\j` ? { isSymbolicLink: () => true } : null),
      readlink: () => {
        throw new Error('EINVAL')
      },
    }
    expect(pathReachesNetwork(String.raw`C:\j\x`, bad)).toBe(true)
  })
  it('knows a local drive written as a device path', () => {
    expect(isNetworkLinkTarget(String.raw`\\?\C:\x`)).toBe(false)
    expect(isNetworkLinkTarget(String.raw`\\?\UNC\h\s`)).toBe(true)
  })
})

describe.skipIf(process.platform !== 'win32')('repo root shape (Windows)', () => {
  it.each(['repo', String.raw`\repo`, 'C:repo', './repo', '..\\repo'])('refuses %j', (p) => expect(rootShapeError(p)).toContain('drive letter'))
  it.each([String.raw`C:\repo`, 'D:/repo', ''])('accepts %j', (p) => expect(rootShapeError(p)).toBe(''))
})
