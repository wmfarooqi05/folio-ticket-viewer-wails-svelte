import { describe, expect, it } from 'vitest'
import { checkPath, isNetworkPath, pickRoot, rootsLabel, type PickApi } from './folder'

const fake = (picked: string, check: Partial<Awaited<ReturnType<PickApi['checkRoot']>>>): PickApi => ({
  pickFolder: async () => picked,
  checkRoot: async () => ({ ok: false, message: '', repoRoot: '', docsDir: '', found: [], missing: [], ...check }) as never,
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
    const r = await checkPath(String.raw`\\host\share\repo`, { checkRoot: async () => ({ ok: false, message: 'network and device paths are not allowed', repoRoot: '', docsDir: '', found: [], missing: [] }) })
    expect(r).toMatchObject({ kind: 'no-roots', refused: true })
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
    const deps = { checkRoot: async (p: string) => ((asked = p), { ok: true, repoRoot: 'E:/repo', docsDir: 'docs', found: [], missing: [], message: '' }) }
    expect(await checkPath('  E:/repo ', deps)).toEqual({ kind: 'ok', repoRoot: 'E:/repo', docsDir: 'docs' })
    expect(asked).toBe('E:/repo')
  })
})
