// The app-level calls, ported from internal/shell/service.go: config, the folder checks and the
// vscode:// link. The native dialog, "open external" and "open settings file" have no
// server side: the browser does those itself.
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { vscodeUrl } from '../lib/external'
import type { Roots } from './docs'
import { resolveMarkdown } from './paths'
import * as S from './settings'

export interface ConfigPatch {
  repoRoot?: string
  docsDir?: string
  docsRoots?: string[]
  adoWorkItemUrl?: string
  adoPrUrl?: string
  theme?: string
  showMemory?: boolean
}

/**
 * Checks the types of a patch before it touches settings.json (Go gets the same from its typed
 * decode). A wrong type in the file would make the desktop app move the whole file aside.
 * null means "not mentioned", as for Go's pointer fields.
 */
export function parsePatch(p: unknown): ConfigPatch {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) throw new Error('the patch must be an object')
  const o = p as Record<string, unknown>
  const out: ConfigPatch = {}
  const bad = (k: string, want: string) => new Error(`${k} must be ${want}`)
  for (const k of ['repoRoot', 'docsDir', 'adoWorkItemUrl', 'adoPrUrl', 'theme'] as const) {
    const v = o[k]
    if (v === undefined || v === null) continue
    if (typeof v !== 'string') throw bad(k, 'a string')
    out[k] = v
  }
  if (o.showMemory !== undefined && o.showMemory !== null) {
    if (typeof o.showMemory !== 'boolean') throw bad('showMemory', 'true or false')
    out.showMemory = o.showMemory
  }
  if (o.docsRoots !== undefined && o.docsRoots !== null) {
    if (!Array.isArray(o.docsRoots) || o.docsRoots.some((r) => typeof r !== 'string')) throw bad('docsRoots', 'a list of strings')
    out.docsRoots = [...(o.docsRoots as string[])]
  }
  return out
}

export interface RootCheck {
  ok: boolean
  repoRoot: string
  docsDir: string
  found: string[]
  missing: string[]
  message: string
}

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Go's filepath.Clean for the result of a folder pick: no trailing separator. */
const clean = (p: string) => {
  const n = path.normalize(p)
  return n.length > path.parse(n).root.length ? n.replace(/[\\/]+$/, '') : n
}

const probe = (dir: string, roots: string[]) => {
  const found: string[] = []
  const missing: string[] = []
  for (const r of roots) (isDir(path.join(dir, r)) ? found : missing).push(r)
  return { found, missing }
}

const joinRoots = (roots: string[]) => roots.map((r) => r + '/').join(' · ')

/** The pure part of CheckRoot: a repo root that contains docs/<root>, or the docs folder itself. */
export function inspectRoot(abs: string, roots: string[]): RootCheck {
  if (roots.length === 0) roots = S.DEFAULT_DOCS_ROOTS
  const fail: RootCheck = { ok: false, repoRoot: '', docsDir: '', found: [], missing: [...roots], message: 'expects ' + joinRoots(roots) + ' inside the folder' }
  // Web mode has no native folder dialog, so no network folder is ever "picked": always refused,
  // and before any file-system call (a stat on a UNC path starts SMB with the user's credentials).
  if (S.isNetworkPath(abs)) return { ...fail, message: S.NETWORK_ROOT_MESSAGE }
  if (!isDir(abs)) return { ...fail, message: 'that is not a folder' }
  abs = clean(abs)
  let p = probe(path.join(abs, S.DEFAULT_DOCS_DIR), roots)
  if (p.found.length > 0) return { ok: true, repoRoot: abs, docsDir: S.DEFAULT_DOCS_DIR, ...p, message: '' }
  p = probe(abs, roots)
  if (p.found.length > 0) return { ok: true, repoRoot: path.dirname(abs), docsDir: path.basename(abs), ...p, message: '' }
  return fail
}

/** The pure part of CheckDocs: which roots exist under repoRoot/docsDir. OK means at least one. */
export function inspectDocs(repoRoot: string, docsDir: string, roots: string[]): RootCheck {
  if (roots.length === 0) roots = S.DEFAULT_DOCS_ROOTS
  const rc: RootCheck = { ok: false, repoRoot, docsDir, found: [], missing: [...roots], message: '' }
  if (S.isNetworkPath(repoRoot)) return { ...rc, message: S.NETWORK_ROOT_MESSAGE }
  if (!isDir(repoRoot)) return { ...rc, message: 'that is not a folder' }
  if (docsDir === '') docsDir = S.DEFAULT_DOCS_DIR
  if (!S.isRelativeInside(docsDir)) return { ...rc, message: 'the docs folder must be inside the repo root' }
  if (roots.some((r) => !S.isRelativeInside(r))) return { ...rc, message: 'the docs roots must be folders inside the docs folder' }
  const p = probe(path.join(repoRoot, docsDir), roots)
  rc.found = p.found
  rc.missing = p.missing
  rc.ok = p.found.length > 0
  if (!rc.ok) rc.message = 'expects ' + joinRoots(roots) + ' inside the folder'
  return rc
}

export class ShellService {
  private saved: S.Settings
  private extra: S.Extra = {}
  private override: { repoRoot: string; docsDir: string } | null = null
  /** Set when settings.json was corrupt and moved aside (the first-run screen follows). */
  loadError: string | null = null
  /** One line per settings.json field that was rejected on load and replaced by its default (L2). */
  loadWarnings: string[] = []

  constructor(
    private file: string,
    docsOverride?: string,
  ) {
    const l = S.load(file)
    this.saved = l.settings
    this.extra = l.extra
    this.loadError = l.corrupt ?? null
    this.loadWarnings = l.rejected.map((r) => `settings: ${file}: ${r.field}: ${r.message}; using the default`)
    if (docsOverride) {
      const rc = inspectRoot(docsOverride, this.saved.docsRoots)
      if (!rc.ok) throw new Error(`--docs ${docsOverride}: ${rc.message}`)
      this.override = { repoRoot: rc.repoRoot, docsDir: rc.docsDir }
    }
  }

  private effective(): S.Settings {
    const cfg = { ...this.saved }
    if (this.override) Object.assign(cfg, this.override)
    return cfg
  }

  /** What DocsService reads on every call. */
  roots = (): Roots => {
    const cfg = this.effective()
    return { docs: S.docsPath(cfg), roots: [...cfg.docsRoots] }
  }

  getConfig(): S.Settings {
    return this.effective()
  }

  /** The folder given with --docs, which wins over the saved one for this session; null without it. */
  docsFromCommandLine(): string | null {
    return this.override ? S.docsPath(this.effective()) : null
  }

  /** Picks up hand edits to settings.json, keeping the UI state held in memory. */
  private fresh(keep: (keyof S.Settings)[]): S.Settings {
    let base = this.saved
    if (existsSync(this.file)) {
      try {
        const l = S.load(this.file)
        if (l.corrupt) throw new Error(l.corrupt)
        const disk = l.settings
        for (const k of keep) (disk as unknown as Record<string, unknown>)[k] = this.saved[k]
        this.extra = l.extra
        base = disk
      } catch {
        /* an unreadable file keeps what is in memory */
      }
    }
    return base
  }

  setConfig(patch: unknown): S.Settings {
    const p = parsePatch(patch)
    const base = this.fresh(['window', 'sidebarWidth', 'panelWidth', 'sidebarCollapsed'])
    const next: S.Settings = { ...base, docsRoots: [...base.docsRoots] }
    if (p.repoRoot !== undefined) next.repoRoot = p.repoRoot
    if (p.docsDir !== undefined) next.docsDir = p.docsDir
    if (p.docsRoots !== undefined) next.docsRoots = [...p.docsRoots]
    if (p.adoWorkItemUrl !== undefined) next.adoWorkItemUrl = p.adoWorkItemUrl
    if (p.adoPrUrl !== undefined) next.adoPrUrl = p.adoPrUrl
    if (p.showMemory !== undefined) next.showMemory = p.showMemory
    if (p.theme !== undefined) next.theme = p.theme
    S.validate(next)
    S.save(this.file, next, this.extra)
    this.saved = next
    return this.effective()
  }

  private updateUI(change: (s: S.Settings) => void) {
    const base = { ...this.fresh(['window']) }
    change(base)
    S.save(this.file, base, this.extra)
    this.saved = base
  }

  setSidebarWidth(width: number): number {
    const w = S.clampSidebarWidth(Math.trunc(width))
    this.updateUI((c) => (c.sidebarWidth = w))
    return w
  }

  setPanelWidth(width: number): number {
    const w = S.clampPanelWidth(Math.trunc(width))
    this.updateUI((c) => (c.panelWidth = w))
    return w
  }

  setSidebarCollapsed(collapsed: boolean): boolean {
    this.updateUI((c) => (c.sidebarCollapsed = !!collapsed))
    return !!collapsed
  }

  checkRoot(abs: string): RootCheck {
    return inspectRoot(abs, this.saved.docsRoots)
  }

  checkDocs(repoRoot: string, docsDir: string, roots: string[]): RootCheck {
    return inspectDocs(repoRoot, docsDir, roots)
  }

  /** The vscode:// URL for a ticket (path relative to the docs root). The browser opens it. */
  async vscodeUrl(p: string, line: number): Promise<string> {
    const full = await resolveMarkdown(S.docsPath(this.effective()), p)
    return vscodeUrl(path.resolve(full), Math.trunc(line) || 0)
  }
}
