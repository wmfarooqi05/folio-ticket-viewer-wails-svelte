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
    expect(l.settings).toMatchObject({ theme: 'dark', docsDir: 'docs', showMemory: true, v: 1 })
    expect(l.settings.window).toEqual({ x: 0, y: 0, width: 800, height: 900, maximised: false })
    expect(l.extra).toEqual({ extra: [1] })
  })

  it('moves a corrupt or mistyped file aside and gives the defaults', () => {
    for (const text of ['{ nope', '{"theme": 5}', '[]', '{"sidebarWidth": 1.5}']) {
      const f = path.join(dir, 's.json')
      writeFileSync(f, text)
      const l = S.load(f)
      expect(l.corrupt, text).toContain('corrupt')
      expect(l.settings).toEqual(S.defaults())
      expect(existsSync(f + '.bad')).toBe(true)
      rmSync(f + '.bad')
    }
  })
})
