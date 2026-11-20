// Two drivers with one shape: the Node server (in process) and the Go services (the harness in
// cmd/contract-server, built once and spawned). Both are spoken to over HTTP, with the same calls
// that frontend/src/lib/backend-http.ts makes.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { start as startNode, type Running } from '../src/server/server'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const fixturesDocs = path.join(repoRoot, 'fixtures', 'docs')

export interface ChangeSet {
  changed: string[]
  removed: string[]
  rescan: boolean
}

export interface Raw {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

export interface Sandbox {
  /** a fresh temp folder; removed by the caller */
  dir: string
  settingsFile: string
  /** %LOCALAPPDATA% for the Go harness; the cache is in <local>/Folio/cache for both backends */
  local: string
  cacheDir: string
  /** set by a case before the backend starts: the repo root given as --docs (Node) or FOLIO_ROOT (Go) */
  override?: string
}

export function sandbox(): Sandbox {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'folio-contract-'))
  const local = path.join(dir, 'local')
  mkdirSync(local, { recursive: true })
  return { dir, settingsFile: path.join(dir, 'settings.json'), local, cacheDir: path.join(local, 'Folio', 'cache') }
}

export class Events {
  frames: ChangeSet[] = []
  private waiters: ((c: ChangeSet) => void)[] = []
  private req: http.ClientRequest | null = null

  static async open(port: number, headers: http.OutgoingHttpHeaders): Promise<Events> {
    const ev = new Events()
    await new Promise<void>((ok, fail) => {
      ev.req = http.get({ host: '127.0.0.1', port, path: '/api/events', headers }, (res) => {
        let buf = ''
        res.setEncoding('utf8')
        res.on('data', (d: string) => {
          buf += d
          let i
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i)
            buf = buf.slice(i + 2)
            const data = frame.split('\n').find((l) => l.startsWith('data: '))
            if (data) ev.push(JSON.parse(data.slice(6)) as ChangeSet)
          }
        })
        ok()
      })
      ev.req.on('error', fail)
    })
    return ev
  }

  private push(c: ChangeSet) {
    const w = this.waiters.shift()
    if (w) w(c)
    else this.frames.push(c)
  }

  /** The next ChangeSet, or null after `ms`. */
  next(ms: number): Promise<ChangeSet | null> {
    const queued = this.frames.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((ok) => {
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w)
        ok(null)
      }, ms)
      const w = (c: ChangeSet) => {
        clearTimeout(t)
        ok(c)
      }
      this.waiters.push(w)
    })
  }

  close() {
    this.req?.destroy()
  }
}

export interface Handle {
  readonly name: string
  readonly port: number
  /** One backend call. Resolves to the result; rejects with the server's error message. */
  call<T = any>(name: string, ...args: unknown[]): Promise<T>
  /** A raw request, with the path exactly as given (no normalising). */
  raw(method: string, urlPath: string): Promise<Raw>
  events(): Promise<Events>
  stop(): Promise<void>
}

export interface Driver {
  name: 'go' | 'node'
  available(): boolean
  prepare?(): void
  start(sb: Sandbox): Promise<Handle>
}

function makeHandle(name: string, port: number, headers: http.OutgoingHttpHeaders, stop: () => Promise<void>): Handle {
  const raw = (method: string, urlPath: string, body?: string) =>
    new Promise<Raw>((ok, fail) => {
      const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) } }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      })
      req.on('error', fail)
      req.end(body)
    })
  return {
    name,
    port,
    raw: (m, p) => raw(m, p),
    events: () => Events.open(port, headers),
    async call(call, ...args) {
      const res = await raw('POST', '/api/' + call, JSON.stringify(args))
      const body = res.body.length ? JSON.parse(res.body.toString('utf8')) : null
      if (res.status !== 200) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
      return body
    },
    stop,
  }
}

// ---- the Node server, in process ------------------------------------------------

export const nodeDriver: Driver = {
  name: 'node',
  available: () => true,
  async start(sb) {
    const dist = path.join(sb.dir, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>x</title>')
    const token = 'contract-token'
    const running: Running = await startNode({
      distDir: dist,
      settingsFile: sb.settingsFile,
      docs: sb.override,
      cacheDir: sb.cacheDir,
      token,
      timing: { quiet: 200, max: 1000 },
    })
    return makeHandle('node', running.port, { cookie: `folio_session_${running.port}=${running.session}` }, () => running.close())
  },
}

// ---- the Go services, through the harness -----------------------------------------

let goExe = ''
export const goDriver: Driver = {
  name: 'go',
  available: () => spawnSync('go', ['version'], { stdio: 'ignore' }).status === 0,
  prepare() {
    if (goExe) return
    const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'folio-contract-bin-')), 'contract-server.exe')
    const r = spawnSync('go', ['build', '-o', out, './cmd/contract-server'], { cwd: repoRoot, encoding: 'utf8' })
    if (r.status !== 0) throw new Error('go build of the contract harness failed:\n' + r.stderr)
    goExe = out
  },
  async start(sb) {
    const env: NodeJS.ProcessEnv = { ...process.env, LOCALAPPDATA: sb.local, XDG_CACHE_HOME: sb.local }
    delete env.FOLIO_ROOT
    if (sb.override) env.FOLIO_ROOT = sb.override
    const child: ChildProcess = spawn(goExe, ['-settings', sb.settingsFile], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const port = await new Promise<number>((ok, fail) => {
      let out = ''
      child.stdout!.on('data', (d: Buffer) => {
        out += d.toString()
        const m = /LISTENING (\d+)/.exec(out)
        if (m) ok(Number(m[1]))
      })
      child.on('exit', (code) => fail(new Error('the Go harness exited early: ' + code)))
      setTimeout(() => fail(new Error('the Go harness did not start')), 15_000)
    })
    return makeHandle('go', port, {}, async () => {
      child.removeAllListeners('exit')
      child.kill()
      await new Promise((ok) => (child.exitCode !== null ? ok(null) : child.once('exit', ok)))
    })
  },
}
