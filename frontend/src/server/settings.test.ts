import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as S from './settings'

let dir: string
beforeEach(() => void (dir = mkdtempSync(path.join(os.tmpdir(), 'folio-set-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('isRelativeInside (internal/settings isRelativeInside)', () => {
  it.each(['docs', 'docs/modules', 'a\\b', 'a/./b', 'a/b/..', 'x/../y'])('accepts %j', (p) => expect(S.isRelativeInside(p)).toBe(true))
  it.each(['', '.', '..', '../x', 'a/../..', '/abs', '\\abs', 'C:\\x', 'C:x', '\\\\server\\share', 'a/../../b'])('rejects %j', (p) => expect(S.isRelativeInside(p)).toBe(false))
})

describe('settings file', () => {
  it('writes sorted keys, a window in struct order, two-space indent and a final newline, like Go', () => {
    const f = path.join(dir, 's.json')
    S.save(f, S.defaults(), { zzz: 1 })
    const text = readFileSync(f, 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(Object.keys(JSON.parse(text))).toEqual(['adoPrUrl', 'adoWorkItemUrl', 'docsDir', 'docsRoots', 'panelWidth', 'repoRoot', 'showMemory', 'sidebarCollapsed', 'sidebarWidth', 'theme', 'v', 'window', 'zzz'])
    expect(text).toContain('  "window": {\n    "x": 0,\n    "y": 0,\n    "width": 1440,\n    "height": 900,\n    "maximised": false\n  }')
  })

  it('keeps defaults for missing keys, strips a BOM, and keeps unknown keys', () => {
    const f = path.join(dir, 's.json')
    writeFileSync(f, '\ufeff{"theme":"dark","window":{"width":800},"extra":[1]}')
    const l = S.load(f)
    expect(l.settings).toMatchObject({ theme: 'dark', docsDir: 'docs', showMemory: false, v: 1 })
    expect(l.settings.window).toEqual({ x: 0, y: 0, width: 800, height: 900, maximised: false })
    expect(l.extra).toEqual({ extra: [1] })
  })

  it('moves a file that is not a JSON object aside and gives the defaults', () => {
    for (const text of ['{ nope', '[]', 'null', '7']) {
      const f = path.join(dir, 's.json')
      writeFileSync(f, text)
      const l = S.load(f)
      expect(l.corrupt, text).toContain('corrupt')
      expect(l.settings).toEqual(S.defaults())
      expect(existsSync(f + '.bad')).toBe(true)
      rmSync(f + '.bad')
    }
  })

  it('keeps the rest of the file and falls back field by field (L2)', () => {
    const f = path.join(dir, 's.json')
    writeFileSync(
      f,
      JSON.stringify({
        theme: 5, // wrong type
        docsDir: '../x',
        docsRoots: ['modules', '..'],
        adoWorkItemUrl: 'http://x.example.com/{id}',
        adoPrUrl: 'https://ok.example.com/{id}',
        repoRoot: String.raw`\\host\share\repo`,
        sidebarWidth: 1.5,
        showMemory: 'yes',
        window: { width: 'big', height: 700 },
      }),
    )
    const l = S.load(f)
    expect(l.corrupt).toBeUndefined()
    expect(existsSync(f + '.bad')).toBe(false)
    expect(l.settings).toMatchObject({ theme: 'system', docsDir: 'docs', docsRoots: S.DEFAULT_DOCS_ROOTS, adoWorkItemUrl: '', adoPrUrl: 'https://ok.example.com/{id}', repoRoot: '', sidebarWidth: 0, showMemory: false })
    expect(l.settings.window).toEqual({ x: 0, y: 0, width: 1440, height: 700, maximised: false })
    expect(l.rejected.map((r) => r.field).sort()).toEqual(['adoWorkItemUrl', 'docsDir', 'docsRoots', 'repoRoot', 'showMemory', 'sidebarWidth', 'theme', 'window.width'])
  })

  it.each([String.raw`\\host\share`, '//host/share', String.raw`\\?\C:\x`, String.raw`\\.\C:\x`, String.raw`\??\C:\x`])('treats %j as a network or device path', (p) => {
    expect(S.isNetworkPath(p)).toBe(true)
  })
  it.each([String.raw`C:\repo`, 'C:/repo', '/home/me/repo', 'repo', String.raw`\one`, ''])('treats %j as a local path', (p) => {
    expect(S.isNetworkPath(p)).toBe(false)
  })

  it('validate refuses a network repo root before looking at the disk', () => {
    const s = { ...S.defaults(), repoRoot: String.raw`\\folio-no-such-host\share\repo` }
    expect(() => S.validate(s)).toThrow(S.NETWORK_ROOT_MESSAGE)
  })
})
