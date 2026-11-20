// /doc/<docs-relative path>: images from the docs folder, ported from internal/shell/docassets.go.
// Read-only (GET and HEAD), image extensions only, nothing that leaves the root, nosniff, and a
// sandbox CSP so an SVG opened as a document runs nothing.
import { open, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { safeJoin, within } from './paths'

export const DOC_PREFIX = '/doc/'

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

const notFound = (res: ServerResponse) => {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('not found')
}

/** `rawPath` is the request path before any decoding or dot-segment removal, so ".." is still visible. */
export async function serveDocAsset(req: IncomingMessage, res: ServerResponse, rawPath: string, docsRoot: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('read-only')
    return
  }
  let rel: string
  try {
    rel = decodeURIComponent(rawPath.slice(DOC_PREFIX.length))
  } catch {
    return notFound(res)
  }
  const ctype = IMAGE_TYPES[path.posix.extname(rel).toLowerCase()]
  if (!ctype) return notFound(res)
  try {
    const full = await safeJoin(docsRoot, rel)
    // the file must resolve, and resolve to somewhere inside the root (symlinks, junctions)
    const realFull = await realpath(full)
    if (!within(await realpath(docsRoot), realFull)) return notFound(res)
    const fh = await open(realFull, 'r')
    const st = await fh.stat().catch(async (e) => (await fh.close(), Promise.reject(e)))
    if (!st.isFile()) {
      await fh.close()
      return notFound(res)
    }
    res.writeHead(200, {
      'Content-Type': ctype,
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      // An SVG opened as a document must not run anything.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'no-cache',
      'Last-Modified': st.mtime.toUTCString(),
    })
    if (req.method === 'HEAD') {
      await fh.close()
      res.end()
      return
    }
    // pipeline destroys both ends on a read error or a client that goes away; the stream closes the handle
    pipeline(fh.createReadStream(), res, () => {})
  } catch {
    if (!res.headersSent) notFound(res)
    else res.destroy()
  }
}
