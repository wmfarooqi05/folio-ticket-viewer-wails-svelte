// Ticket 45: which folders the evidence panel offers to allow when no evidence folder is set.
// The suggestions come from the ticket's own `Folder:` line, which an agent wrote, so the owner
// always sees the exact path before clicking, and a drive or filesystem root is never offered:
// that would let every ticket name any image, video or Markdown file on the drive.

export interface AllowChoice {
  /** the folder to save as the evidence root, as written in the ticket (forward slashes) */
  path: string
  /** what the button says it covers */
  covers: 'every ticket' | 'this project' | 'this ticket'
}

/**
 * The ticket's folder and up to two of its parents, broadest first. The factory lays evidence out as
 * `<root>/<project>/<space>-<NN>-<slug>/` (its board D5), so the grandparent is the evidence root that
 * covers every ticket. Folders that are a drive or filesystem root are left out.
 */
export function allowChoices(folder: string): AllowChoice[] {
  const clean = folder.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (clean === '' || clean.includes('\0') || /^\/\//.test(clean)) return []
  const drive = /^[A-Za-z]:/.exec(clean)?.[0] ?? ''
  const rest = clean.slice(drive.length)
  if (!rest.startsWith('/')) return [] // only full paths
  const parts = rest.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) return []
  const at = (n: number) => drive + '/' + parts.slice(0, n).join('/')
  const covers: AllowChoice['covers'][] = ['this ticket', 'this project', 'every ticket']
  const out: AllowChoice[] = []
  for (let up = 0; up < 3; up++) {
    const n = parts.length - up
    if (n < 1) break // never the drive or filesystem root itself
    out.push({ path: at(n), covers: covers[up] })
  }
  return out.reverse()
}
