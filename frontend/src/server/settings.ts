// settings.json: the same file, format and validation as internal/settings (Go).
// It writes only the app's own config, never a ticket file.
import { lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, statSync, writeFileSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export const VERSION = 1
export const DEFAULT_DOCS_DIR = 'docs'
export const DEFAULT_DOCS_ROOTS = ['modules', 'handoffs', 'patterns']
/** The docs root that means "the whole docs folder" (ticket 25). The scope skips still apply under it. */
export const WHOLE_DOCS_ROOT = '.'
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
    showMemory: false, // L1: process enumeration can trip endpoint security, so it is opt-in
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

export interface Rejected {
  field: string
  message: string
}

/** What a rejected network or device repo root says. The same sentence as Go's settings.NetworkRootMessage. */
export const NETWORK_ROOT_MESSAGE = String.raw`network and device paths (\\server\share, \\?\, \\.\) are not allowed as the repo root`

/** A UNC path (\\host\share) or a device path (\\?\, \\.\, \??\). Either slash counts, as on Windows. */
export const LOCAL_ROOT_MESSAGE = String.raw`the repo root must be a full path that starts with a drive letter, such as C:\repo`

/**
 * "" when p can be a repo root, otherwise the message to show: the same allow-list as Go's
 * settings.RootShapeError. On Windows a full path with a drive letter; a relative, root-relative or
 * drive-relative path would resolve against whatever folder Folio runs in, and a UNC or device path is
 * SMB. Web mode has no dialog, so no network folder is ever allowed here.
 */
export function rootShapeError(p: string): string {
  if (p === '') return ''
  if (isNetworkPath(p)) return NETWORK_ROOT_MESSAGE
  if (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(p)) return LOCAL_ROOT_MESSAGE
  return ''
}

/** The target of a symlink that names a network or device path (a local drive as \\?\C:\ does not count). */
export const isNetworkLinkTarget = (t: string) => isNetworkPath(t) && !/^[\\/]{2}[?.][\\/][A-Za-z]:([\\/]|$)/.test(t)

export const isNetworkPath = (p: string) => /^[\\/]{2}/.test(p) || p.startsWith('\\??\\')

/** Numbers whose source text was not a plain integer literal (1e3, 1.0), by holder object and key. */
let notPlain = new WeakMap<object, Set<string>>()

/**
 * Applies a parsed file over `s` the way Go's LoadReport does: field by field. A missing or null key
 * is skipped; a wrong type is rejected (the field keeps its default), and so is a value that validate()
 * would refuse (L2). Returns what was rejected.
 */
function apply(s: Settings, o: Record<string, unknown>): Rejected[] {
  const rejected: Rejected[] = []
  const reject = (field: string, message: string) => rejected.push({ field, message })
  const present = (v: unknown) => v !== undefined && v !== null
  const take = <T,>(src: Record<string, unknown>, field: string, key: string, ok: (v: unknown) => v is T): T | undefined => {
    const v = src[key]
    if (!present(v)) return undefined
    // 1e3 and 1.0 are not whole-number literals: Go refuses them for an int, so do we.
    if (!ok(v) || (typeof v === 'number' && notPlain.get(src)?.has(key))) {
      reject(field, 'wrong type')
      return undefined
    }
    return v
  }
  const isStr = (v: unknown): v is string => typeof v === 'string'
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

  for (const k of ['repoRoot', 'docsDir', 'adoWorkItemUrl', 'adoPrUrl', 'theme'] as const) s[k] = take(o, k, k, isStr) ?? s[k]
  for (const k of ['v', 'sidebarWidth', 'panelWidth'] as const) s[k] = take(o, k, k, isInt) ?? s[k]
  for (const k of ['showMemory', 'sidebarCollapsed'] as const) s[k] = take(o, k, k, isBool) ?? s[k]
  const roots = take(o, 'docsRoots', 'docsRoots', isStrs)
  if (roots) s.docsRoots = [...roots]
  const w = take(o, 'window', 'window', isObj)
  if (w) {
    for (const k of ['x', 'y', 'width', 'height'] as const) s.window[k] = take(w, 'window.' + k, k, isInt) ?? s.window[k]
    s.window.maximised = take(w, 'window.maximised', 'maximised', isBool) ?? s.window.maximised
  }

  // Values of the right type that validate() would refuse. repoRoot is checked for its shape only.
  const d = defaults()
  if (!['system', 'light', 'dark'].includes(s.theme)) {
    reject('theme', 'must be system, light or dark')
    s.theme = d.theme
  }
  if (!isRelativeInside(s.docsDir)) {
    reject('docsDir', 'must be a relative folder inside the repo root')
    s.docsDir = d.docsDir
  }
  const rootsMsg = rootsError(s.docsRoots)
  if (rootsMsg) {
    reject('docsRoots', rootsMsg)
    s.docsRoots = d.docsRoots
  }
  const w1 = templateError(s.adoWorkItemUrl)
  if (w1) {
    reject('adoWorkItemUrl', w1)
    s.adoWorkItemUrl = ''
  }
  const p1 = templateError(s.adoPrUrl)
  if (p1) {
    reject('adoPrUrl', p1)
    s.adoPrUrl = ''
  }
  const shape = rootShapeError(s.repoRoot)
  if (shape) {
    reject('repoRoot', shape)
    s.repoRoot = ''
  }
  if (s.sidebarWidth !== 0 && clampSidebarWidth(s.sidebarWidth) !== s.sidebarWidth) {
    reject('sidebarWidth', 'out of range')
    s.sidebarWidth = clampSidebarWidth(s.sidebarWidth)
  }
  if (s.panelWidth !== 0 && clampPanelWidth(s.panelWidth) !== s.panelWidth) {
    reject('panelWidth', 'out of range')
    s.panelWidth = clampPanelWidth(s.panelWidth)
  }
  return rejected
}

/** "" when there is at least one docs root and each is a relative folder inside the docs folder. */
function rootsError(roots: string[]): string {
  if (roots.length === 0) return 'must list at least one folder'
  for (const r of roots) if (!isRootInside(r)) return `${JSON.stringify(r)} must be a relative folder inside the docs folder`
  return ''
}

/**
 * Reads path. A missing file gives the defaults. A file that is not a JSON object is renamed to
 * <path>.bad and the defaults come back with `corrupt` set (Go returns an error wrapping ErrCorrupt).
 * A bad field keeps its default and is listed in `rejected`; the rest of the file is kept (L2).
 */
export function load(file: string): Loaded & { corrupt?: string; rejected: Rejected[] } {
  const s = defaults()
  let data: string
  try {
    data = readFileSync(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { settings: s, extra: {}, rejected: [] }
    throw e
  }
  if (data.charCodeAt(0) === 0xfeff) data = data.slice(1)
  try {
    notPlain = new WeakMap()
    const o = JSON.parse(data, function (this: object, key: string, value: unknown, ctx?: { source?: string }) {
      if (typeof value === 'number' && ctx?.source !== undefined && !/^-?\d+$/.test(ctx.source)) {
        const set = notPlain.get(this) ?? new Set<string>()
        set.add(key)
        notPlain.set(this, set)
      }
      return value
    }) as unknown
    if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object')
    const rejected = apply(s, o as Record<string, unknown>)
    const extra: Extra = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (!KNOWN.includes(k)) extra[k] = v
    if (s.v === 0) s.v = VERSION
    return { settings: s, extra, rejected }
  } catch (cause) {
    const bad = file + '.bad'
    let note = `${(cause as Error).message}; moved to ${bad}`
    try {
      renameSync(file, bad)
    } catch (e) {
      note = `${(cause as Error).message}; could not move it aside: ${(e as Error).message}`
    }
    return { settings: defaults(), extra: {}, rejected: [], corrupt: `settings file is corrupt (${note})` }
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

/** isRelativeInside for a docs root: "." (the whole docs folder) is allowed too. */
export const isRootInside = (p: string) => isWholeRoot(p) || isRelativeInside(p)

/** A relative path that names the base folder itself: ".", "./", "a/..". */
export function isWholeRoot(p: string): boolean {
  if (p === '' || p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p) || path.win32.isAbsolute(p)) return false
  return path.posix.normalize(p.replaceAll('\\', '/')).replace(/\/+$/, '') === '.'
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

/** The two calls pathReachesNetwork makes, so tests can inject a fake disk. Neither may follow a link. */
export interface LinkFs {
  /** null when the path does not exist */
  lstat(p: string): { isSymbolicLink(): boolean } | null
  readlink(p: string): string
}
export const realLinks: LinkFs = {
  lstat: (p) => {
    try {
      return lstatSync(p)
    } catch {
      return null
    }
  },
  readlink: (p) => readlinkSync(p),
}

const linkParts = (s: string) => s.split(/[\\/]/).filter((x) => x !== '')

/**
 * True when resolving p would reach a network or device path (\\host\share) through a symlink or
 * junction anywhere on the way. Same algorithm as Go's settings.PathReachesNetwork: resolve one part
 * at a time from the left, lstat each part, readlink every link, run the network check on its target
 * before touching it and continue from the target, at most 16 links. A p that is itself a network
 * path returns false (that is rootShapeError's business); a part that does not exist ends the walk.
 */
export function pathReachesNetwork(p: string, fs: LinkFs = realLinks): boolean {
  if (p === '' || isNetworkPath(p)) return false
  const root = path.parse(p).root
  if (root === '') return false // not absolute: callers pass absolute paths
  let cur = root
  let pending = linkParts(p.slice(root.length))
  let hops = 0
  while (pending.length > 0) {
    const part = pending.shift()!
    if (part === '.') continue
    if (part === '..') {
      cur = path.dirname(cur) // cur holds no links: it is already resolved
      continue
    }
    const next = path.join(cur, part)
    const st = fs.lstat(next)
    if (!st) return false
    if (!st.isSymbolicLink()) {
      cur = next
      continue
    }
    if (++hops > 16) return true
    let target: string
    try {
      target = fs.readlink(next)
    } catch {
      return true // a link that cannot be read cannot be shown to be local
    }
    if (isNetworkLinkTarget(target)) return true
    const device = /^[\\/]{2}[?.][\\/](?=[A-Za-z]:)/.exec(target) // \\?\C:\x is a local drive
    if (device) target = target.slice(device[0].length)
    if (/^[A-Za-z]:[\\/]/.test(target)) {
      cur = target.slice(0, 3)
      target = target.slice(3)
    } else if (/^[\\/]/.test(target)) {
      cur = path.parse(cur).root // \x\b.md is on the drive of the folder the link is in
      target = target.slice(1)
    }
    pending = [...linkParts(target), ...pending]
  }
  return false
}

const isDir = (p: string) => {
  if (pathReachesNetwork(p)) return false
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
    if (!isRootInside(r)) {
      add('docsRoots', `${JSON.stringify(r)} must be a relative folder inside the docs folder`)
      pathsOK = false
    }
  }
  const w = templateError(s.adoWorkItemUrl)
  if (w) add('adoWorkItemUrl', w)
  const p = templateError(s.adoPrUrl)
  if (p) add('adoPrUrl', p)
  const shape = rootShapeError(s.repoRoot)
  if (shape) {
    // Web mode has no native folder dialog, so there is no explicit pick: always refused, and before
    // any file-system call (a stat on a UNC path starts SMB with the user's credentials).
    add('repoRoot', shape)
  } else if (s.repoRoot !== '') {
    if (!isDir(s.repoRoot)) add('repoRoot', 'must be an existing folder')
    else if (pathsOK) {
      const docs = docsPath(s)
      if (!s.docsRoots.some((r) => isDir(path.join(docs, r)))) add('docsRoots', 'none of the selected folders exist under ' + docs)
    }
  }
  if (errs.length) throw new ValidationError(errs)
}
