// Ticket 46: any local folder opens, read whole. The frozen Go app still refuses these.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DRIVE_ROOT_MESSAGE, inspectRoot, ShellService } from './shell'
import * as S from './settings'

let dir: string
beforeEach(() => void (dir = mkdtempSync(path.join(os.tmpdir(), 'folio-any-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const put = (rel: string, text = '# x\n') => {
  const f = path.join(dir, rel)
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, text)
}

describe('inspectRoot opens any local folder (ticket 46)', () => {
  it('a folder of plain notes is read whole', () => {
    put('notes/a.md')
    const abs = path.join(dir, 'notes')
    expect(inspectRoot(abs, [])).toMatchObject({ ok: true, repoRoot: path.dirname(abs), docsDir: 'notes', found: ['.'], suggested: ['.'], folders: [], message: '' })
    expect(inspectRoot(dir, [])).toMatchObject({ ok: true, found: ['.'], suggested: ['.'], folders: ['notes'], message: '' })
  })
  it('docs/ with Markdown is preferred', () => {
    put('docs/x.md')
    put('y.md')
    expect(inspectRoot(dir, [])).toMatchObject({ ok: true, repoRoot: dir, docsDir: 'docs', found: ['.'], suggested: ['.'] })
  })
  it('an empty docs/ falls back to the folder', () => {
    mkdirSync(path.join(dir, 'docs'))
    put('y.md')
    expect(inspectRoot(dir, [])).toMatchObject({ ok: true, repoRoot: path.dirname(dir), docsDir: path.basename(dir), found: ['.'] })
  })
  it('an empty folder opens', () => {
    expect(inspectRoot(dir, [])).toMatchObject({ ok: true, found: [], suggested: ['.'], folders: [], message: '' })
  })
  it('not a folder is still refused', () => {
    expect(inspectRoot(path.join(dir, 'nope'), [])).toMatchObject({ ok: false, message: 'that is not a folder' })
  })
  it('a network path is still refused', () => {
    const unc = String.raw`\\server\share`
    expect(inspectRoot(unc, [])).toMatchObject({ ok: false, message: S.NETWORK_ROOT_MESSAGE })
    expect(S.rootShapeError(unc)).toBe(S.NETWORK_ROOT_MESSAGE)
  })
  it('a drive root is refused', () => {
    expect(inspectRoot(path.parse(process.cwd()).root, [])).toMatchObject({ ok: false, message: DRIVE_ROOT_MESSAGE })
  })
  it('known layouts are unchanged', () => {
    put('docs/modules/x/map.md')
    expect(inspectRoot(dir, [])).toMatchObject({ ok: true, repoRoot: dir, docsDir: 'docs', found: ['modules'], suggested: [] })
  })
  it('a saved "." still re-detects', () => {
    put('docs/modules/x/map.md')
    expect(inspectRoot(dir, ['.']).suggested).toEqual(S.DEFAULT_DOCS_ROOTS)
    const plain = path.join(dir, 'plain')
    mkdirSync(plain)
    writeFileSync(path.join(plain, 'a.md'), '# a\n')
    expect(inspectRoot(plain, ['.']).suggested).toEqual(['.'])
  })
  it('custom saved roots do not hide a known layout', () => {
    put('docs/modules/x/map.md')
    expect(inspectRoot(dir, ['specs'])).toMatchObject({ ok: true, repoRoot: dir, docsDir: 'docs', found: ['modules'], suggested: S.DEFAULT_DOCS_ROOTS })
  })
  it('a custom root that exists still wins and suggests nothing', () => {
    put('docs/specs/a.md')
    expect(inspectRoot(dir, ['specs'])).toMatchObject({ ok: true, found: ['specs'], suggested: [] })
  })
  it('a junction or symlink to a drive root is refused', (ctx) => {
    const link = path.join(dir, 'to-root')
    try {
      symlinkSync(path.parse(os.tmpdir()).root, link, 'junction')
    } catch {
      return ctx.skip()
    }
    expect(inspectRoot(link, [])).toMatchObject({ ok: false, message: DRIVE_ROOT_MESSAGE })
  })
  it('--docs opens a plain folder', () => {
    put('plain/a.md')
    const sh = new ShellService(path.join(dir, 'settings.json'), path.join(dir, 'plain'))
    expect(sh.roots().roots).toEqual(['.'])
    expect(sh.docsFromCommandLine()).toBe(path.join(dir, 'plain'))
  })
})
