// Path rules, ported from internal/docs/paths.go (SafeJoin, ResolveMarkdown, skipDir).
// Zero dependencies: Node built-ins only. The contract tests run the same cases against
// the Go services, so the two cannot drift.
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

export class PathError extends Error {}
export const ERR_ESCAPES_ROOT = 'path escapes the docs root'
export const ERR_NOT_MARKDOWN = 'only .md files can be read'

const escapes = () => new PathError(ERR_ESCAPES_ROOT)

/** Windows device names (CON, NUL, COM1 ...), with or without an extension. Node-only hardening. */
const DEVICE = /^(con|prn|aux|nul|conin\$|conout\$|com[1-9]|lpt[1-9])(\..*)?$/i

/** True when `p` is inside `root` (both already resolved). */
export function within(root: string, p: string): boolean {
  const rel = path.relative(root, p)
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
}

const segments = (rel: string) => rel.split(/[/\\]/).filter((s) => s !== '')

/**
 * Resolves a POSIX path relative to root and refuses anything that could leave it:
 * absolute paths, drive letters, UNC and device paths, ".." segments, ":" (NTFS
 * alternate data streams) and symlinks or junctions pointing outside. A path that does not
 * exist yet is fine (the caller finds out when it reads).
 */
export async function safeJoin(root: string, rel: string): Promise<string> {
  if (!root) throw new PathError('no docs root is configured')
  if (rel === '' || rel.includes('\0') || rel.includes(':')) throw escapes()
  if (rel.startsWith('/') || rel.startsWith('\\') || path.isAbsolute(rel) || path.win32.isAbsolute(rel)) throw escapes()
  const segs = segments(rel)
  if (segs.some((s) => s === '..' || DEVICE.test(s))) throw escapes()
  const full = path.join(root, ...segs)
  if (!within(root, full)) throw escapes()

  // lstat every segment on the way: one that cannot be inspected is refused rather than
  // trusted. A missing one ends the walk (the target does not exist yet).
  let cur = root
  for (const seg of segs) {
    cur = path.join(cur, seg)
    try {
      await lstat(cur)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return full
      throw escapes()
    }
  }
  // Symlinks and junctions are followed here: the real target must be inside the real root.
  let realFull: string
  try {
    realFull = await realpath(full)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return full
    throw escapes()
  }
  const realRoot = await realpath(root)
  if (!within(realRoot, realFull)) throw escapes()
  return full
}

/** safeJoin plus the .md-only rule for reads. */
export async function resolveMarkdown(root: string, rel: string): Promise<string> {
  const full = await safeJoin(root, rel)
  if (path.extname(full).toLowerCase() !== '.md') throw new PathError(`${ERR_NOT_MARKDOWN}: ${rel}`)
  return full
}

/** The scope rule shared by the walk and the watcher: node_modules, dot folders and "_" folders. */
export const skipDir = (name: string) => name === 'node_modules' || name.startsWith('.') || name.startsWith('_')

/** True when rel (docs-relative, POSIX) passes through no skipped folder below its configured root. */
export function inScope(rel: string): boolean {
  return !rel.split('/').slice(1).some(skipDir)
}
