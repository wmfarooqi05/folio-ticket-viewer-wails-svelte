import { describe, expect, it } from 'vitest'
import { pickRoot, rootsLabel, type PickApi } from './folder'

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

describe('rootsLabel', () => {
  it('lists the roots with a trailing slash', () => {
    expect(rootsLabel(['modules', 'handoffs'])).toBe('modules/ · handoffs/')
  })
})
