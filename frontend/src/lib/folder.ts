// The folder-picking flow shared by first run, the Settings dialog and the tree's
// "Change folder": the native picker, then CheckRoot. The caller decides what to do
// with the answer (SetConfig and a rescan, or a draft in the dialog).
import * as api from './api'

export type PickResult =
  /** the picker was cancelled: change nothing */
  | { kind: 'cancelled' }
  /** a usable folder; repoRoot and docsDir are what CheckRoot resolved */
  | { kind: 'ok'; repoRoot: string; docsDir: string; /** set when the folder had none of the roots but a map.md or issues/ folder */ docsRoots?: string[] }
  /**
   * a folder with none of the docs roots: the "no roots" warning. `refused` is set when the folder
   * was turned away for what it is (a network or device path in web mode), not for what it lacks.
   */
  | { kind: 'no-roots'; picked: string; message: string; refused?: boolean }

export interface PickApi {
  pickFolder: () => Promise<string>
  checkRoot: typeof api.checkRoot
}

/**
 * Checks a folder path (from the native picker, or typed in web mode, which has no dialog). Empty means cancelled.
 * `typed` is web mode's box: there a network path is turned away for what it is (`refused`). A network folder
 * picked in the desktop dialog that merely lacks the docs roots gets the ordinary no-roots message.
 */
export async function checkPath(picked: string, deps: Pick<PickApi, 'checkRoot'> = api, typed = false): Promise<PickResult> {
  picked = unquotePath(picked)
  if (!picked) return { kind: 'cancelled' }
  const check = await deps.checkRoot(picked)
  if (!check.ok) return { kind: 'no-roots', picked, message: check.message, ...(typed && isNetworkPath(picked) ? { refused: true } : {}) }
  const suggested = check.suggested ?? []
  return { kind: 'ok', repoRoot: check.repoRoot, docsDir: check.docsDir, ...(suggested.length > 0 ? { docsRoots: [...suggested] } : {}) }
}

/** Trims a typed or pasted path, and drops the quotes File Explorer's "Copy as path" puts around it. */
export const unquotePath = (p: string): string => {
  const t = p.trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t
}

/**
 * A UNC (\\host\share) or device (\\?\, \\.\) path. Display only: Go decides whether one is allowed
 * (only when picked in the native dialog), this lets the UI warn about one that is in use.
 */
export const isNetworkPath = (p: string): boolean => /^[\\/]{2}/.test(p) || p.startsWith('\\??\\')

export async function pickRoot(deps: PickApi = api): Promise<PickResult> {
  return checkPath(await deps.pickFolder(), deps)
}

/** "modules/ · handoffs/ · patterns/", the roots the warning names. "." reads as the docs folder itself. */
/** What a folder lacks, for "This folder has ...": no Markdown at all when the whole docs folder was asked for. */
export const noRootsText = (roots: string[]): string => (roots.includes('.') ? 'no Markdown files' : 'none of ' + rootsLabel(roots))

/** The sidebar note for a folder read whole with no map.md and no issues/ folder among its files (ticket 46). */
export const ANY_FOLDER_NOTE = 'No modules/, map.md or issues/ here, so every Markdown file is shown.'
export const anyFolderNote = (roots: string[], files: { path: string; kind: string }[]): string | null =>
  roots.includes('.') && files.length > 0 && !files.some((f) => f.kind === 'map' || f.path.split('/').includes('issues')) ? ANY_FOLDER_NOTE : null

export const rootsLabel =(roots: string[]) => roots.map((r) => (r === '.' ? 'the docs folder itself' : r + '/')).join(' · ')

