// Ticket 19: property tests for the server's path and settings rules, with the seeded generator in
// src/lib/fuzz.ts. Nothing safeJoin returns may resolve outside the docs root, the link resolver must
// never touch a network path, and settings.json can hold anything without breaking a rule on load.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RUNS, SEED, forAll, rng, type Rng } from '../lib/fuzz'
import { PathError, safeJoin, within } from './paths'
import * as S from './settings'

// FOLIO_FUZZ_N scales the runs, so the time limit scales with it
vi.setConfig({ testTimeout: 30_000 * Math.max(1, Number(process.env.FOLIO_FUZZ_N ?? 400) / 400) })

let tmp: string
let root: string
let junction = false

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-fuzz-'))
  root = path.join(tmp, 'repo', 'docs')
  for (const d of ['modules/a/issues', 'modules/b', 'PROGRA~1', 'a b']) mkdirSync(path.join(root, d), { recursive: true })
  writeFileSync(path.join(root, 'modules', 'a', 'issues', '01-x.md'), '# x')
  mkdirSync(path.join(tmp, 'secret'))
  writeFileSync(path.join(tmp, 'secret', 's.md'), 'secret')
  try {
    // a junction inside the root that leads out, and one that stays in (no admin right needed on Windows)
    symlinkSync(path.join(tmp, 'secret'), path.join(root, 'modules', 'out'), 'junction')
    symlinkSync(path.join(root, 'modules', 'b'), path.join(root, 'modules', 'in'), 'junction')
    junction = true
  } catch {
    /* no links here: the other properties still run */
  }
})

afterAll(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

const PARTS = ['..', '.', '', 'modules', 'a', 'issues', '01-x.md', 'b', 'out', 'in', 's.md', 'secret', 'repo', 'docs', 'PROGRA~1', 'MODULE~1', 'a b', 'CON', 'con.md', 'NUL.png', 'COM1', 'x.md::$DATA', 'C:', 'c:', '%2e%2e', '．．', '..\u0000', '\u202e', '...', '.. ', ' ..', '~', '$DATA', 'x.md.', 'x.md ']
const SEPS = ['/', '\\', '//', '\\\\', '/./', '']
const PREFIXES = ['', '', '', '/', '\\', '\\\\evil\\share\\', '//evil/share/', '\\\\?\\C:\\', '\\\\.\\', 'C:', 'C:\\', 'file:', '\\??\\']

describe('fuzz: safeJoin', () => {
  it('never returns a path outside the docs root, on a real disk with junctions', async () => {
    const realRoot = realpathSync(root)
    const runs = RUNS * 2
    for (let i = 0; i < runs; i++) {
      const r = rng(SEED + i * 7919)
      const rel = r.pick(PREFIXES) + Array.from({ length: 1 + r.int(7) }, () => r.pick(PARTS)).join(r.pick(SEPS))
      let full: string
      try {
        full = await safeJoin(root, rel)
      } catch (e) {
        expect(e, rel).toBeInstanceOf(PathError)
        continue
      }
      expect(within(root, path.resolve(full)), `${rel} -> ${full}`).toBe(true)
      expect(full.startsWith('\\\\') || full.startsWith('//'), rel).toBe(false)
      let real: string | null = null
      try {
        real = realpathSync(full)
      } catch {
        /* does not exist: fine */
      }
      if (real !== null) expect(within(realRoot, real), `${rel} -> ${real}`).toBe(true)
    }
  })

  it('refuses the junction that leads out, and serves the one that stays in', async () => {
    if (!junction) return
    await expect(safeJoin(root, 'modules/out/s.md')).rejects.toBeInstanceOf(PathError)
    await expect(safeJoin(root, 'modules/in')).resolves.toBe(path.join(root, 'modules', 'in'))
  })
})

describe('fuzz: the folder rules', () => {
  const P = ['..', '.', 'a', 'docs', '', 'C:', 'c:', '\\', '/', '\\\\', '//', '?', '~1', ' ', 'x:y', '\u0000', '%2e']
  it('isRelativeInside and isRootInside accept only folders inside the base', () => {
    forAll('relative', (r) => {
      const p = r.string(P, 8)
      const base = 'C:\\base\\repo'
      if (S.isRootInside(p)) {
        const at = path.win32.resolve(base, p)
        expect(at === base || at.startsWith(base + '\\'), `${JSON.stringify(p)} -> ${at}`).toBe(true)
        expect(path.posix.resolve('/base/repo', p.replaceAll('\\', '/')).startsWith('/base/repo'), p).toBe(true)
      }
      if (S.isRelativeInside(p)) expect(path.win32.resolve(base, p).startsWith(base + '\\'), JSON.stringify(p)).toBe(true)
    }, 4000)
  })

  it('rootShapeError lets through no network or device path, and on Windows only a full drive path', () => {
    forAll('shape', (r) => {
      const p = r.string(['\\', '/', '?', '.', 'C', ':', 'evil', 'share', 'UNC', ' ', 'x', '\\??\\'], 8)
      if (S.rootShapeError(p) !== '' || p === '') return
      expect(S.isNetworkPath(p), JSON.stringify(p)).toBe(false)
      if (process.platform === 'win32') expect(p, JSON.stringify(p)).toMatch(/^[A-Za-z]:[\\/]/)
    }, 4000)
  })
})

describe('fuzz: pathReachesNetwork', () => {
  const NET = ['\\\\evil\\share', '//evil/share', '\\\\?\\UNC\\evil\\share', '\\??\\UNC\\evil\\s', '\\\\.\\pipe\\x', '\\/evil/share']
  it('finds a network target at the end of any chain of links, and never asks the disk about one', () => {
    forAll('links', (r) => {
      const n = 1 + r.int(6)
      const links = new Map<string, string>()
      const forms = [(i: number) => `C:\\l${i}`, (i: number) => `..\\l${i}`, (i: number) => `\\l${i}`, (i: number) => `\\\\?\\C:\\l${i}`, (i: number) => `C:/l${i}`]
      for (let i = 0; i < n; i++) links.set(`c:\\l${i}`, r.pick(forms)(i + 1))
      const toNet = r.int(2) === 0
      links.set(`c:\\l${n}`, toNet ? r.pick(NET) : 'C:\\real')
      const touched: string[] = []
      const fs: S.LinkFs = {
        lstat: (p) => {
          touched.push(p)
          return { isSymbolicLink: () => links.has(p.toLowerCase().replaceAll('/', '\\')) }
        },
        readlink: (p) => {
          touched.push(p)
          return links.get(p.toLowerCase().replaceAll('/', '\\'))!
        },
      }
      const got = S.pathReachesNetwork(`C:\\l0\\${r.pick(['x.md', 'a\\b.md', '..\\y.md', '.'])}`, fs)
      expect(got, JSON.stringify([...links])).toBe(toNet)
      for (const t of touched) expect(S.isNetworkPath(t) && !/^[\\/]{2}[?.][\\/][A-Za-z]:/.test(t), t).toBe(false)
    }, 3000)
  })
})

describe('fuzz: settings.json on load', () => {
  let dir: string
  beforeAll(() => void (dir = mkdtempSync(path.join(os.tmpdir(), 'folio-fuzz-set-'))))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const KEYS = ['v', 'repoRoot', 'docsDir', 'docsRoots', 'adoWorkItemUrl', 'adoPrUrl', 'theme', 'showMemory', 'window', 'sidebarWidth', 'panelWidth', 'sidebarCollapsed', '__proto__', 'constructor', 'prototype', 'x']
  const STR = ['', '.', '..', 'docs', '../x', 'C:\\repo', 'C:/repo', 'relative', '\\\\evil\\share', '//evil/s', '\\\\?\\C:\\x', 'https://ado.example/{id}', 'http://ado.example/{id}', 'javascript:alert(1)//{id}', 'https://{id}', 'https:///{id}', 'dark', 'light', 'system', '<script>', 'a/..', '\u202e']
  const value = (r: Rng, depth = 0): unknown => {
    switch (r.int(depth > 2 ? 6 : 9)) {
      case 0:
        return r.pick(STR)
      case 1:
        return r.pick([0, -1, 1, 200, 480, 4001, 1e21, 0.5, -0])
      case 2:
        return r.pick([true, false, null])
      case 3:
        return r.pick(['1e3', '1.0', '9007199254740993', '-0'])
      case 4:
      case 5:
        return Array.from({ length: r.int(4) }, () => r.pick(STR))
      case 6:
        return Array.from({ length: r.int(4) }, () => value(r, depth + 1))
      default:
        return Object.fromEntries(Array.from({ length: r.int(5) }, () => [r.pick([...KEYS, 'x', 'y', 'width', 'maximised']), value(r, depth + 1)]))
    }
  }

  it('never throws, never pollutes, and every field that survives obeys validate()', () => {
    forAll('settings', (r, i) => {
      const f = path.join(dir, `s${i}.json`)
      let text: string
      if (r.int(8) === 0) text = r.string(['{', '}', '[', '"', ':', ',', 'x', '1e3', '\ufeff', 'null', ' '], 20)
      else {
        const pairs = Array.from({ length: r.int(14) }, () => `${JSON.stringify(r.pick(KEYS))}: ${r.int(5) === 0 ? r.pick(['1e3', '1.0', '01', '-0']) : JSON.stringify(value(r))}`)
        text = `${r.int(10) === 0 ? '\ufeff' : ''}{${pairs.join(', ')}}`
      }
      writeFileSync(f, text)
      const l = S.load(f)
      const s = l.settings
      expect(['system', 'light', 'dark']).toContain(s.theme)
      expect(S.isRelativeInside(s.docsDir), s.docsDir).toBe(true)
      expect(s.docsRoots.length).toBeGreaterThan(0)
      for (const d of s.docsRoots) expect(S.isRootInside(d), d).toBe(true)
      for (const t of [s.adoWorkItemUrl, s.adoPrUrl]) if (t !== '') expect(t, text).toMatch(/^https:\/\/[^/]/)
      expect(S.rootShapeError(s.repoRoot), s.repoRoot).toBe('')
      expect(s.sidebarWidth === 0 || (s.sidebarWidth >= S.MIN_SIDEBAR && s.sidebarWidth <= S.MAX_SIDEBAR), String(s.sidebarWidth)).toBe(true)
      expect(s.panelWidth === 0 || (s.panelWidth >= S.MIN_PANEL && s.panelWidth <= S.MAX_PANEL), String(s.panelWidth)).toBe(true)
      for (const n of [s.v, s.sidebarWidth, s.panelWidth, s.window.x, s.window.width]) expect(Number.isSafeInteger(n), text).toBe(true)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'x')).toBe(false)
      // the file written back is still a JSON object with every known key, whatever came in
      const back = JSON.parse(S.marshal(s, l.extra))
      expect(typeof back).toBe('object')
      expect(Object.keys(back)).toEqual(expect.arrayContaining(['docsDir', 'docsRoots', 'theme', 'window']))
    }, RUNS * 2)
  })
})
