import { describe, expect, it } from 'vitest'
import { ANY_FOLDER_NOTE, anyFolderNote, checkPath, isNetworkPath, pickRoot, rootsLabel, unquotePath, type PickApi } from './folder'

const fake = (picked: string, check: Partial<Awaited<ReturnType<PickApi['checkRoot']>>>): PickApi => ({
  pickFolder: async () => picked,
  checkRoot: async () => ({ ok: false, message: '', repoRoot: '', docsDir: '', found: [], missing: [], suggested: [], folders: [], ...check }) as never,
})

describe('pickRoot', () => {
  it('reports a cancelled picker and never checks', async () => {
    let checked = false
    const api: PickApi = {
      pickFolder: async () => '',
      checkRoot: async () => {
        checked = true
        return {} as never
      },
    }
    expect(await pickRoot(api)).toEqual({ kind: 'cancelled' })
    expect(checked).toBe(false)
  })
  it('returns the resolved root for a good folder', async () => {
    const r = await pickRoot(fake('E:\\repo\\docs', { ok: true, repoRoot: 'E:\\repo', docsDir: 'docs' }))
    expect(r).toEqual({ kind: 'ok', repoRoot: 'E:\\repo', docsDir: 'docs' })
  })
  it('returns the picked folder and the message when it has no roots', async () => {
    const r = await pickRoot(fake('E:\\empty', { ok: false, message: 'expects modules/ inside the folder' }))
    expect(r).toEqual({ kind: 'no-roots', picked: 'E:\\empty', message: 'expects modules/ inside the folder' })
  })
})

describe('network and device paths', () => {
  it('are told apart from local ones', () => {
    for (const p of [String.raw`\\host\share`, '//host/share', String.raw`\\?\C:\x`, String.raw`\\.\C:\x`]) expect(isNetworkPath(p), p).toBe(true)
    for (const p of [String.raw`C:\repo`, 'C:/repo', '/home/me', '']) expect(isNetworkPath(p), p).toBe(false)
  })
  it('a refused network folder is marked, so the UI does not say it "has none of the roots"', async () => {
    const deps = { checkRoot: async () => ({ ok: false, message: 'network and device paths are not allowed', repoRoot: '', docsDir: '', found: [], missing: [] }) as never }
    expect(await checkPath(String.raw`\\host\share\repo`, deps, true)).toMatchObject({ kind: 'no-roots', refused: true })
  })
  it('a network folder picked in the desktop dialog that lacks the roots is an ordinary no-roots, not refused', async () => {
    const r = await pickRoot(fake(String.raw`\\host\share\empty`, { ok: false, message: 'expects modules/ inside the folder' }))
    expect(r).toEqual({ kind: 'no-roots', picked: String.raw`\\host\share\empty`, message: 'expects modules/ inside the folder' })
  })
})

describe('rootsLabel', () => {
  it('lists the roots with a trailing slash', () => {
    expect(rootsLabel(['modules', 'handoffs'])).toBe('modules/ · handoffs/')
  })
})

describe('checkPath (the typed path of web mode)', () => {
  it('treats an empty or blank box as cancelled', async () => {
    expect(await checkPath('  ', fake('', {}))).toEqual({ kind: 'cancelled' })
  })
  it('trims the path and returns the resolved root', async () => {
    let asked = ''
    const deps = { checkRoot: async (p: string) => ((asked = p), { ok: true, repoRoot: 'E:/repo', docsDir: 'docs', found: [], missing: [], message: '', suggested: [], folders: [] }) }
    expect(await checkPath('  E:/repo ', deps)).toEqual({ kind: 'ok', repoRoot: 'E:/repo', docsDir: 'docs' })
    expect(asked).toBe('E:/repo')
  })
  it('drops the quotes of File Explorer\'s "Copy as path"', async () => {
    let asked = ''
    const deps = { checkRoot: async (p: string) => ((asked = p), { ok: true, repoRoot: 'E:/repo', docsDir: 'docs', found: [], missing: [], message: '', suggested: [], folders: [] }) }
    await checkPath(' "E:\\projects\\ticket_ui" ', deps)
    expect(asked).toBe('E:\\projects\\ticket_ui')
    expect(unquotePath('"')).toBe('"')
    expect(unquotePath('E:\\a "b"')).toBe('E:\\a "b"')
  })
  it('passes on the roots CheckRoot suggested for a map.md or issues/ layout', async () => {
    const r = await pickRoot(fake('E:\repo', { ok: true, repoRoot: 'E:\repo', docsDir: 'docs', suggested: ['.'] }))
    expect(r).toEqual({ kind: 'ok', repoRoot: 'E:\repo', docsDir: 'docs', docsRoots: ['.'] })
  })
})

describe('anyFolderNote (ticket 46)', () => {
  const doc = { path: 'notes/a.md', kind: 'doc' }
  it('notes a folder read whole with no map.md and no issues/', () => expect(anyFolderNote(['.'], [doc])).toBe(ANY_FOLDER_NOTE))
  it('is silent when a map.md is there, even with no tickets yet', () => expect(anyFolderNote(['.'], [doc, { path: 'map.md', kind: 'map' }])).toBeNull())
  it('is silent when a file sits in an issues/ folder', () => expect(anyFolderNote(['.'], [{ path: 'issues/readme.md', kind: 'doc' }])).toBeNull())
  it('is silent for the usual roots', () => expect(anyFolderNote(['modules', 'handoffs', 'patterns'], [doc])).toBeNull())
  it('is silent for an empty folder', () => expect(anyFolderNote(['.'], [])).toBeNull())
})
