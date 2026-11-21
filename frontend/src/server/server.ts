// The web-mode HTTP server: the built frontend, one JSON endpoint per backend call
// (POST /api/<name>, body = the argument list), Server-Sent Events for docs:changed, and
// /doc/ for images, /evidence/ for a ticket's factory evidence (ticket 39). Node built-ins only.
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { DOC_PREFIX, serveDocAsset } from './assets'
import { CHANGED_EVENT, DocsService, defaultCacheDir, type ChangeSet } from './docs'
import { EVIDENCE_PREFIX, listEvidence, serveEvidence, type EvidenceDeps } from './evidence'
import { within } from './paths'
import { SECURITY_HEADERS, checkOrigin, cookieName, cookieOf, newToken, tokenMatches } from './security'
import { settingsPath } from './settings'
import { ShellService } from './shell'

export interface Options {
  /** the built frontend (index.html and assets/) */
  distDir: string
  /** a docs folder or repo root, applied in memory only (never written to settings.json) */
  docs?: string
  /** the evidence root, applied in memory only like `docs` (ticket 39) */
  evidence?: string
  /** 0 picks a free port */
  port?: number
  settingsFile?: string
  cacheDir?: string
  token?: string
  /** watcher debounce, for tests */
  timing?: { quiet: number; max: number }
}

export interface Running {
  port: number
  /** the link's token: it works once, to get the session cookie */
  token: string
  /** the value of the session cookie (a different secret from the token); for tests */
  session: string
  /** the URL to open: it carries the token */
  url: string
  server: Server
  shell: ShellService
  docs: DocsService
  close(): Promise<void>
}

const MAX_BODY = 64 << 20

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

class BadRequest extends Error {}

export async function start(opts: Options): Promise<Running> {
  const token = opts.token ?? newToken()
  // What the browser holds after the exchange. It is not the URL token: the URL ends up in browser
  // history and in the arguments of the command that opened it, and must stop working once used.
  const session = newToken()
  let tokenUsed = false
  const MAX_STREAMS = 4
  const shell = new ShellService(opts.settingsFile ?? settingsPath(), opts.docs, opts.evidence)
  const clients = new Set<ServerResponse>()
  const broadcast = (cs: ChangeSet) => {
    const frame = `event: ${CHANGED_EVENT}\ndata: ${JSON.stringify(cs)}\n\n`
    for (const c of clients) c.write(frame)
  }
  const docs = new DocsService(shell.roots, broadcast, opts.cacheDir ?? defaultCacheDir(), opts.timing)
  const distRoot = await realpath(opts.distDir)
  let port = 0
  const evidence: EvidenceDeps = {
    root: shell.evidenceRoot,
    docs: () => {
      const c = shell.getConfig()
      return { docs: shell.roots().docs, repoRoot: c.repoRoot, docsDir: c.docsDir }
    },
    readTicket: (rel) => docs.readFile(rel),
  }

  // One entry per call api.ts makes. Arguments arrive as a JSON array.
  const calls: Record<string, (a: any[]) => unknown> = {
    getConfig: () => shell.getConfig(),
    setConfig: ([p]) => shell.setConfig(p),
    docsFromCommandLine: () => shell.docsFromCommandLine(),
    getEvidence: () => shell.getEvidence(),
    setEvidence: ([p]) => shell.setEvidence(str(p)),
    evidenceFiles: ([p]) => listEvidence(evidence, str(p)),
    setSidebarWidth: ([w]) => shell.setSidebarWidth(num(w)),
    setPanelWidth: ([w]) => shell.setPanelWidth(num(w)),
    setSidebarCollapsed: ([c]) => shell.setSidebarCollapsed(c === true),
    checkRoot: ([p]) => shell.checkRoot(str(p)),
    checkDocs: ([r, d, roots]) => shell.checkDocs(str(r), str(d), strs(roots)),
    vscodeUrl: ([p, line]) => shell.vscodeUrl(str(p), num(line ?? 0)),
    scan: () => docs.scan(),
    rescan: () => docs.rescan(),
    readFile: ([p]) => docs.readFile(str(p)),
    readBatch: ([ps]) => docs.readBatch(strs(ps)),
    loadCache: ([v]) => docs.loadCache(str(v)),
    saveCache: ([v, index]) => docs.saveCache(str(v), index).then(() => null),
    // Web mode keeps no WebView2 profile: "Clear data" is the cache only.
    clearData: () => docs.clearCache(),
    logTimings: () => null,
  }

  async function api(req: IncomingMessage, res: ServerResponse, name: string) {
    if (req.method !== 'POST') return text(res, 405, 'POST only', { Allow: 'POST' })
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return text(res, 415, 'JSON only')
    const call = Object.hasOwn(calls, name) ? calls[name] : undefined
    if (!call) return text(res, 404, 'unknown call')
    try {
      const body = await readBody(req)
      const args = body === '' ? [] : JSON.parse(body)
      if (!Array.isArray(args)) throw new BadRequest('the body must be a list of arguments')
      const out = await call(args)
      json(res, 200, out === undefined ? null : out)
    } catch (e) {
      // The message is what the UI shows (for example Go's "invalid settings: ..." sentence).
      json(res, 400, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  function events(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'GET') return text(res, 405, 'GET only', { Allow: 'GET' })
    // A few tabs are plenty. A fifth closes the oldest, so a runaway page cannot pile up connections.
    while (clients.size >= MAX_STREAMS) {
      const oldest = clients.values().next().value!
      clients.delete(oldest)
      oldest.end()
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(': folio\n\n')
    clients.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
    req.on('close', () => {
      clearInterval(ping)
      clients.delete(res)
    })
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse, rawPath: string) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'read-only', { Allow: 'GET, HEAD' })
    let rel: string
    try {
      rel = decodeURIComponent(rawPath)
    } catch {
      return text(res, 404, 'not found')
    }
    if (rel.includes('\0') || rel.includes('\\') || rel.includes(':') || rel.split('/').includes('..')) return text(res, 404, 'not found')
    if (rel.endsWith('/')) rel += 'index.html'
    try {
      const full = path.join(distRoot, rel)
      const real = await realpath(full)
      if (!within(distRoot, real) || !(await stat(real)).isFile()) return text(res, 404, 'not found')
      const body = await readFile(real)
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      text(res, 404, 'not found')
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
    const origin = checkOrigin(req, port)
    if (!origin.ok) return text(res, origin.status, origin.message)

    // Not the parsed URL: it would collapse "/doc/a/../../x" before the path rules see it.
    const target = req.url ?? '/'
    const q = target.indexOf('?')
    const rawPath = q < 0 ? target : target.slice(0, q)
    const query = new URLSearchParams(q < 0 ? '' : target.slice(q + 1))
    // A browser never sends a raw backslash (it turns it into "/"), and the token exchange's Location
    // is this path: "/\evil.com" there would be read as "//evil.com", another site (ticket 19).
    if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\')) return text(res, 400, 'bad request')

    // The one-time exchange: the printed URL carries the token; it becomes a cookie and leaves the URL.
    if (req.method === 'GET' && query.has('token')) {
      // The link works once. After that only the cookie is accepted, so the URL left in history is dead.
      if (!tokenUsed && tokenMatches(query.get('token') ?? undefined, token)) {
        tokenUsed = true
        query.delete('token')
        const rest = query.toString()
        res.writeHead(302, {
          'Set-Cookie': `${cookieName(port)}=${session}; HttpOnly; SameSite=Strict; Path=/`,
          Location: rawPath + (rest ? '?' + rest : ''),
          'Cache-Control': 'no-store',
        })
        return res.end()
      }
    }
    if (!tokenMatches(cookieOf(req, cookieName(port)), session)) {
      return text(res, 401, 'Unauthorized. The link that folio printed works once. Use the tab it opened, or restart folio for a new link.')
    }

    if (rawPath === '/api/events') return events(req, res)
    if (rawPath.startsWith('/api/')) return api(req, res, rawPath.slice(5))
    if (rawPath.startsWith(DOC_PREFIX)) return serveDocAsset(req, res, rawPath, shell.roots().docs)
    if (rawPath.startsWith(EVIDENCE_PREFIX)) return serveEvidence(req, res, rawPath, evidence)
    return serveStatic(req, res, rawPath)
  }

  const server = createHttpServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) text(res, 500, 'server error')
      else res.destroy()
    })
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(opts.port ?? 0, '127.0.0.1', ok) // loopback only, never 0.0.0.0
  })
  port = (server.address() as AddressInfo).port

  return {
    port,
    token,
    session,
    url: `http://127.0.0.1:${port}/?token=${token}`,
    server,
    shell,
    docs,
    async close() {
      docs.shutdown()
      for (const c of clients) c.end()
      clients.clear()
      await new Promise<void>((ok) => {
        server.close(() => ok())
        server.closeAllConnections()
      })
    },
  }
}

function text(res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
  res.end(body)
}

function json(res: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let n = 0
  for await (const c of req) {
    n += (c as Buffer).length
    if (n > MAX_BODY) throw new BadRequest('request too large')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const num = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BadRequest('expected a number')
  return v
}
const str = (v: unknown) => {
  if (typeof v !== 'string') throw new BadRequest('expected a string')
  return v
}
const strs = (v: unknown) => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new BadRequest('expected a list of strings')
  return v as string[]
}
