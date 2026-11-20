// Ticket 18 review fixes that only the Node side can test directly.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocsService, MAX_FILE_BYTES } from './docs'
import { linkLeadsToNetwork } from './paths'
import { isNetworkLinkTarget, rootShapeError } from './settings'

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

describe('links that lead to the network', () => {
  const links: Record<string, string> = {
    'evil.md': String.raw`\\evil\share\x.md`,
    'dev.md': String.raw`\\?\UNC\evil\share\x.md`,
    'hop.md': 'evil.md',
    'local.md': String.raw`C:\other\a.md`,
    'drive.md': String.raw`\\?\C:\other\a.md`,
    'loop.md': 'loop.md',
  }
  const fs = {
    lstat: async (p: string) => {
      if (!(path.basename(p) in links)) throw new Error('ENOENT')
      return { isSymbolicLink: () => true }
    },
    readlink: async (p: string) => links[path.basename(p)],
  }
  it.each([
    ['evil.md', true],
    ['dev.md', true],
    ['hop.md', true],
    ['local.md', false],
    ['drive.md', false],
    ['loop.md', true],
    ['plain.md', false],
  ])('%s -> %s', async (name, want) => {
    expect(await linkLeadsToNetwork(path.join(tmp, name), fs)).toBe(want)
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
