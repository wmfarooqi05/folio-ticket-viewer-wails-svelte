// The docs root path shown in the header.

/** repoRoot plus docsDir, joined with the separator repoRoot already uses. "" when no repo. */
export function docsRootPath(repoRoot: string, docsDir: string): string {
  if (!repoRoot) return ''
  const sep = repoRoot.includes('\\') ? '\\' : '/'
  const root = repoRoot.replace(/[\\/]+$/, '')
  const dir = docsDir.replace(/^[\\/]+|[\\/]+$/g, '').replace(/[\\/]+/g, sep)
  return dir ? root + sep + dir : root
}

/**
 * Splits a path for middle truncation: the tail (the last `keep` segments, with the
 * separator before each) never shrinks, the head gets the ellipsis when space runs out.
 * "E:\projects\ticket_ui\docs" gives head "E:\projects" and tail "\ticket_ui\docs".
 */
export function splitPath(path: string, keep = 2): { head: string; tail: string } {
  const re = /[\\/]/g
  const cuts: number[] = []
  for (let m = re.exec(path); m; m = re.exec(path)) if (m.index > 0) cuts.push(m.index)
  if (cuts.length < keep) return { head: path, tail: '' }
  const at = cuts[cuts.length - keep]
  return { head: path.slice(0, at), tail: path.slice(at) }
}
