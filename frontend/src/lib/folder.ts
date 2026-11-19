// The folder-picking flow shared by first run, the Settings dialog and the tree's
// "Change folder": the native picker, then CheckRoot. The caller decides what to do
// with the answer (SetConfig and a rescan, or a draft in the dialog).
import * as api from './api'

export type PickResult =
  /** the picker was cancelled: change nothing */
  | { kind: 'cancelled' }
  /** a usable folder; repoRoot and docsDir are what CheckRoot resolved */
  | { kind: 'ok'; repoRoot: string; docsDir: string }
  /** a folder with none of the docs roots: the "no roots" warning */
  | { kind: 'no-roots'; picked: string; message: string }

export interface PickApi {
  pickFolder: () => Promise<string>
  checkRoot: typeof api.checkRoot
}

export async function pickRoot(deps: PickApi = api): Promise<PickResult> {
  const picked = await deps.pickFolder()
  if (!picked) return { kind: 'cancelled' }
  const check = await deps.checkRoot(picked)
  if (!check.ok) return { kind: 'no-roots', picked, message: check.message }
  return { kind: 'ok', repoRoot: check.repoRoot, docsDir: check.docsDir }
}

/** "modules/ · handoffs/ · patterns/", the roots the warning names. */
export const rootsLabel = (roots: string[]) => roots.map((r) => r + '/').join(' · ')
