// /evidence/<ticket path>/<index>: the files a ticket's factory board block lists, served read-only
// (ticket 39). This is the one route that reads files from OUTSIDE the docs folder, so every rule is here:
//   - the owner declares the evidence root (--evidence, or Settings). Without one, nothing is served;
//   - the request names a ticket and an index, never a path. The server reads the ticket and parses its
//     block itself, so a path comes only from a ticket on disk, never from the URL;
//   - only the kinds image, video, scenarios and write-up, and only these extensions;
//   - the file's real path (links resolved) must be inside the root's real path;
//   - nothing that reaches a network path is touched (a stat on a UNC path starts SMB);
//   - GET and HEAD, single byte ranges for video seeking, no listing, nosniff, a sandbox CSP, no-store.
// The contract is C1 to C3 in docs/handoff/factory-board-reply.md.
import { open, realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { parseFile, rootNameFor, type EvidenceKind } from '../lib/parser'
import { within } from './paths'
import { pathReachesNetwork } from './settings'

export const EVIDENCE_PREFIX = '/evidence/'

/** What a served kind may be, by extension. A `file` kind is listed in the panel and never served (C3). */
const TYPES: Record<string, { type: string; kinds: EvidenceKind[] }> = {
  '.png': { type: 'image/png', kinds: ['image'] },
  '.jpg': { type: 'image/jpeg', kinds: ['image'] },
  '.jpeg': { type: 'image/jpeg', kinds: ['image'] },
  '.webp': { type: 'image/webp', kinds: ['image'] },
  '.gif': { type: 'image/gif', kinds: ['image'] },
  '.webm': { type: 'video/webm', kinds: ['video'] },
  '.mp4': { type: 'video/mp4', kinds: ['video'] },
  // served as plain text: the panel renders it with Folio's own renderer and sanitizer
  '.md': { type: 'text/plain; charset=utf-8', kinds: ['scenarios', 'write-up'] },
}

export type Refusal = 'root not set' | 'not reachable' | 'type not served' | 'outside the root' | 'missing' | 'no such file'

export interface EvidenceEntry {
  index: number
  name: string
  kind: EvidenceKind
  served: boolean
  /** why not, when it is not */
  reason?: Refusal
  /** for a served file: its size, so the panel can say so */
  size?: number
}

export interface EvidenceList {
  /** the declared root, "" when none */
  root: string
  /** the block's folder, as written; null when the ticket has no evidence */
  folder: string | null
  /** false when the block says "(not reachable)" */
  reachable: boolean
  files: EvidenceEntry[]
}

export interface EvidenceDeps {
  /** the effective evidence root, "" when none */
  root: () => string
  /** the docs folder and its repo root, to read the ticket and name the root space */
  docs: () => { docs: string; repoRoot: string; docsDir: string }
  /** reads a ticket by its docs-relative path, with the docs folder's own path rules */
  readTicket: (rel: string) => Promise<string>
}

type Resolved = { ok: true; real: string; size: number; type: string } | { ok: false; reason: Refusal }

async function boardOf(deps: EvidenceDeps, rel: string) {
  const text = await deps.readTicket(rel)
  const d = deps.docs()
  return parseFile({ path: rel, text, mtime: 0 }, rootNameFor(d.repoRoot, d.docsDir)).board
}

/** Every rule but the board lookup: may this listed file be served? */
async function check(root: string, file: { path: string; kind: EvidenceKind }, reachable: boolean): Promise<Resolved> {
  if (root === '') return { ok: false, reason: 'root not set' }
  if (!reachable) return { ok: false, reason: 'not reachable' }
  const t = TYPES[path.extname(file.path).toLowerCase()]
  if (!t || !t.kinds.includes(file.kind)) return { ok: false, reason: 'type not served' }
  const p = path.resolve(file.path)
  if (!path.isAbsolute(file.path) || pathReachesNetwork(p) || pathReachesNetwork(root)) return { ok: false, reason: 'outside the root' }
  let realRoot: string
  let real: string
  try {
    realRoot = await realpath(root)
    real = await realpath(p)
  } catch {
    return { ok: false, reason: 'missing' }
  }
  if (!within(realRoot, real)) return { ok: false, reason: 'outside the root' }
  try {
    const st = await stat(real)
    if (!st.isFile()) return { ok: false, reason: 'missing' }
    return { ok: true, real, size: st.size, type: t.type }
  } catch {
    return { ok: false, reason: 'missing' }
  }
}

/** The panel's view of a ticket's evidence: every listed file, and whether and why it is served. */
export async function listEvidence(deps: EvidenceDeps, rel: string): Promise<EvidenceList> {
  const root = deps.root()
  const board = await boardOf(deps, rel)
  const ev = board?.evidence ?? null
  if (!ev) return { root, folder: null, reachable: true, files: [] }
  const files: EvidenceEntry[] = []
  for (const [index, f] of ev.files.entries()) {
    const r = await check(root, f, ev.reachable)
    files.push(r.ok ? { index, name: f.name, kind: f.kind, served: true, size: r.size } : { index, name: f.name, kind: f.kind, served: false, reason: r.reason })
  }
  return { root, folder: ev.folder, reachable: ev.reachable, files }
}

const notFound = (res: ServerResponse) => {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end('not found')
}

/**
 * A single byte range, as RFC 9110 reads it. null: no usable Range header (serve it all). 'unsatisfiable':
 * a range that starts past the end (416). More than one range is served whole, rather than as multipart.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (m[1] === '') {
    // suffix: the last n bytes
    const n = Number(m[2])
    if (n === 0) return 'unsatisfiable'
    return size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  if (!Number.isSafeInteger(start) || start >= size) return 'unsatisfiable'
  if (end < start) return null
  return { start, end }
}

/** `rawPath` is the request path before decoding. */
export async function serveEvidence(req: IncomingMessage, res: ServerResponse, rawPath: string, deps: EvidenceDeps): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('read-only')
    return
  }
  const rest = rawPath.slice(EVIDENCE_PREFIX.length)
  const cut = rest.lastIndexOf('/')
  if (cut <= 0) return notFound(res)
  const idx = rest.slice(cut + 1)
  if (!/^\d{1,4}$/.test(idx)) return notFound(res)
  let rel: string
  try {
    rel = decodeURIComponent(rest.slice(0, cut))
  } catch {
    return notFound(res)
  }
  let r: Resolved
  try {
    const board = await boardOf(deps, rel)
    const ev = board?.evidence
    const file = ev?.files[Number(idx)]
    if (!ev || !file) return notFound(res)
    r = await check(deps.root(), file, ev.reachable)
  } catch {
    // not a ticket the docs rules allow, unreadable, too large: the same answer as "no such file"
    return notFound(res)
  }
  if (!r.ok) return notFound(res)

  const fh = await open(r.real, 'r').catch(() => null)
  if (!fh) return notFound(res)
  let size: number
  try {
    const st = await fh.stat()
    if (!st.isFile()) throw new Error('not a file')
    size = st.size
  } catch {
    await fh.close()
    return notFound(res)
  }
  const headers: Record<string, string | number> = {
    'Content-Type': r.type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  }
  const range = parseRange(req.headers.range, size)
  if (range === 'unsatisfiable') {
    await fh.close()
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 })
    res.end()
    return
  }
  const start = range ? range.start : 0
  const end = range ? range.end : size - 1
  const length = size === 0 ? 0 : end - start + 1
  res.writeHead(range ? 206 : 200, {
    ...headers,
    'Content-Length': length,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  })
  if (req.method === 'HEAD' || length === 0) {
    await fh.close()
    res.end()
    return
  }
  pipeline(fh.createReadStream({ start, end, autoClose: true }), res, () => void fh.close().catch(() => {}))
}
