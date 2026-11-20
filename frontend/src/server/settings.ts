// settings.json: the same file, format and validation as internal/settings (Go).
// It writes only the app's own config, never a ticket file.
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export const VERSION = 1
export const DEFAULT_DOCS_DIR = 'docs'
export const DEFAULT_DOCS_ROOTS = ['modules', 'handoffs', 'patterns']
export const MIN_SIDEBAR = 200
export const MAX_SIDEBAR = 480
export const MIN_PANEL = 320
export const MAX_PANEL = 4000

export interface Window {
  x: number
  y: number
  width: number
  height: number
  maximised: boolean
}

export interface Settings {
  v: number
  repoRoot: string
  docsDir: string
  docsRoots: string[]
  adoWorkItemUrl: string
  adoPrUrl: string
  theme: string
  showMemory: boolean
  window: Window
  sidebarWidth: number
  panelWidth: number
  sidebarCollapsed: boolean
}

/** Keys this version does not know: written back unchanged, like Go's Extra. */
export type Extra = Record<string, unknown>
export type Loaded = { settings: Settings; extra: Extra }

export const clampSidebarWidth = (w: number) => Math.min(Math.max(w, MIN_SIDEBAR), MAX_SIDEBAR)
export const clampPanelWidth = (w: number) => Math.min(Math.max(w, MIN_PANEL), MAX_PANEL)

export function defaults(): Settings {
  return {
    v: VERSION,
    repoRoot: '',
    docsDir: DEFAULT_DOCS_DIR,
    docsRoots: [...DEFAULT_DOCS_ROOTS],
    adoWorkItemUrl: '',
    adoPrUrl: '',
    theme: 'system',
    showMemory: true,
    window: { x: 0, y: 0, width: 1440, height: 900, maximised: false },
    sidebarWidth: 0,
    panelWidth: 0,
    sidebarCollapsed: false,
  }
}

/** The absolute docs root (repoRoot/docsDir), or "" when no repo is set. */
export const docsPath = (s: Settings) => (s.repoRoot === '' ? '' : path.join(s.repoRoot, s.docsDir))

/** The settings file: the same place as Go's os.UserConfigDir()/Folio/settings.json. */
export function settingsPath(): string {
  let dir: string
  if (process.platform === 'win32') dir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  else if (process.platform === 'darwin') dir = path.join(os.homedir(), 'Library', 'Application Support')
  else dir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(dir, 'Folio', 'settings.json')
}

const KNOWN = ['v', 'repoRoot', 'docsDir', 'docsRoots', 'adoWorkItemUrl', 'adoPrUrl', 'theme', 'showMemory', 'window', 'sidebarWidth', 'panelWidth', 'sidebarCollapsed']

export class CorruptError extends Error {}

/** Applies a parsed file over `s` the way Go's json.Unmarshal does: null is skipped, a wrong type is an error. */
function apply(s: Settings, o: Record<string, unknown>): void {
  const bad = (k: string) => new Error(`json: cannot unmarshal into field ${k}`)
  const str = (k: 'repoRoot' | 'docsDir' | 'adoWorkItemUrl' | 'adoPrUrl' | 'theme') => {
    const v = o[k]
    if (v === undefined || v === null) return
    if (typeof v !== 'string') throw bad(k)
    s[k] = v
  }
  const int = (target: Record<string, unknown>, src: Record<string, unknown>, k: string) => {
    const v = src[k]
    if (v === undefined || v === null) return
    if (typeof v !== 'number' || !Number.isInteger(v)) throw bad(k)
    target[k] = v
  }
  const bool = (target: Record<string, unknown>, src: Record<string, unknown>, k: string) => {
    const v = src[k]
    if (v === undefined || v === null) return
    if (typeof v !== 'boolean') throw bad(k)
    target[k] = v
  }
  str('repoRoot')
  str('docsDir')
  str('adoWorkItemUrl')
  str('adoPrUrl')
  str('theme')
  int(s as unknown as Record<string, unknown>, o, 'v')
  int(s as unknown as Record<string, unknown>, o, 'sidebarWidth')
  int(s as unknown as Record<string, unknown>, o, 'panelWidth')
  bool(s as unknown as Record<string, unknown>, o, 'showMemory')
  bool(s as unknown as Record<string, unknown>, o, 'sidebarCollapsed')
  if (o.docsRoots !== undefined && o.docsRoots !== null) {
    if (!Array.isArray(o.docsRoots) || o.docsRoots.some((r) => typeof r !== 'string')) throw bad('docsRoots')
    s.docsRoots = [...(o.docsRoots as string[])]
  }
  const w = o.window
  if (w !== undefined && w !== null) {
    if (typeof w !== 'object' || Array.isArray(w)) throw bad('window')
    const wo = w as Record<string, unknown>
    const tw = s.window as unknown as Record<string, unknown>
    for (const k of ['x', 'y', 'width', 'height']) int(tw, wo, k)
    bool(tw, wo, 'maximised')
  }
}

/**
 * Reads path. A missing file gives the defaults. A corrupt one is renamed to <path>.bad and
 * the defaults come back with `corrupt` set (Go returns an error wrapping ErrCorrupt).
 */
export function load(file: string): Loaded & { corrupt?: string } {
  const s = defaults()
  let data: string
  try {
    data = readFileSync(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { settings: s, extra: {} }
    throw e
  }
  if (data.charCodeAt(0) === 0xfeff) data = data.slice(1)
  try {
    const o = JSON.parse(data) as unknown
    if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object')
    apply(s, o as Record<string, unknown>)
    const extra: Extra = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (!KNOWN.includes(k)) extra[k] = v
    if (s.v === 0) s.v = VERSION
    return { settings: s, extra }
  } catch (cause) {
    const bad = file + '.bad'
    let note = `${(cause as Error).message}; moved to ${bad}`
    try {
      renameSync(file, bad)
    } catch (e) {
      note = `${(cause as Error).message}; could not move it aside: ${(e as Error).message}`
    }
    return { settings: defaults(), extra: {}, corrupt: `settings file is corrupt (${note})` }
  }
}

/** Indented JSON with keys sorted like Go's map encoding; window keeps its struct order. */
export function marshal(s: Settings, extra: Extra = {}): string {
  const merged: Record<string, unknown> = { ...s }
  for (const [k, v] of Object.entries(extra)) if (!(k in merged)) merged[k] = v
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k]
  return JSON.stringify(sorted, null, 2)
}

/** Writes atomically: a temp file in the same folder, then a rename. */
export function save(file: string, s: Settings, extra: Extra = {}): void {
  const data = marshal(s, extra) + '\n'
  const dir = path.dirname(file)
  mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.settings-${randomBytes(6).toString('hex')}.tmp`)
  try {
    const fd = openSync(tmp, 'w')
    try {
      writeFileSync(fd, data)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, file)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {
      /* already gone */
    }
    throw e
  }
}

export interface FieldError {
  field: string
  message: string
}

/** The list of everything wrong with a Settings value. Its message is what Go's ValidationError says. */
export class ValidationError extends Error {
  constructor(public errors: FieldError[]) {
    super('invalid settings: ' + errors.map((f) => `${f.field}: ${f.message}`).join('; '))
  }
}

/** A non-empty relative path that stays inside its base (Windows rules, as Go on Windows). */
export function isRelativeInside(p: string): boolean {
  if (p === '' || p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p) || path.win32.isAbsolute(p)) return false
  const clean = path.posix.normalize(p.replaceAll('\\', '/')).replace(/\/+$/, '')
  return clean !== '' && clean !== '.' && clean !== '..' && !clean.startsWith('../')
}

/** "" or an https:// URL that contains {id}. */
function templateError(t: string): string | null {
  if (t === '') return null
  if (!t.includes('{id}')) return 'must contain {id}'
  try {
    const u = new URL(t.replaceAll('{id}', '0'))
    if (u.protocol === 'https:' && u.host !== '') return null
  } catch {
    /* falls through */
  }
  return 'must be an https:// URL'
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** An empty repoRoot is valid (first run). Otherwise it must exist and hold at least one docs root. */
export function validate(s: Settings): void {
  const errs: FieldError[] = []
  const add = (field: string, message: string) => errs.push({ field, message })
  if (!['system', 'light', 'dark'].includes(s.theme)) add('theme', 'must be system, light or dark')
  let pathsOK = true
  if (!isRelativeInside(s.docsDir)) {
    add('docsDir', 'must be a relative folder inside the repo root')
    pathsOK = false
  }
  for (const r of s.docsRoots ?? []) {
    if (!isRelativeInside(r)) {
      add('docsRoots', `"${r}" must be a relative folder inside the docs folder`)
      pathsOK = false
    }
  }
  const w = templateError(s.adoWorkItemUrl)
  if (w) add('adoWorkItemUrl', w)
  const p = templateError(s.adoPrUrl)
  if (p) add('adoPrUrl', p)
  if (s.repoRoot !== '') {
    if (!isDir(s.repoRoot)) add('repoRoot', 'must be an existing folder')
    else if (pathsOK) {
      const docs = docsPath(s)
      if (!s.docsRoots.some((r) => isDir(path.join(docs, r)))) add('docsRoots', 'none of the selected folders exist under ' + docs)
    }
  }
  if (errs.length) throw new ValidationError(errs)
}
