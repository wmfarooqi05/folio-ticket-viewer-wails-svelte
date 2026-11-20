// The folio command: argument parsing, the browser launch and the shutdown. The bundled
// folio-web.mjs is this file plus the server, with no dependencies.
import { spawn, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { start, type Running } from './server'

export interface Args {
  docs?: string
  port: number
  open: boolean
  /** open an Edge app window (no tabs or address bar) instead of a browser tab; Windows only */
  app: boolean
  help: boolean
  version: boolean
}

export const HELP = `folio: a read-only viewer for Markdown tickets, in your browser

Usage:
  folio --docs <path> [--port <n>] [--app] [--no-open]

Options:
  --docs <path>   the repo root or its docs folder: one that holds modules/, handoffs/ or patterns/,
                  or any docs folder with a map.md or an issues/ folder (then the whole docs folder is read)
  --port <n>      listen on this port (default: a random free port)
  --app           open Folio in an Edge app window (no tabs or address bar). Windows only: on other
                  systems, or when Edge is not found, the normal browser opens instead
  --no-open       print the URL but do not open the browser (it wins over --app)
  --version       print the version
  --help          show this text

The server listens on 127.0.0.1 only. Open the printed link: it carries a token that works once.
`

export function parseArgs(argv: string[]): Args {
  const a: Args = { port: 0, open: true, app: false, help: false, version: false }
  const value = (i: number, name: string) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].startsWith('--') && argv[i].includes('=') ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)] : [argv[i], undefined]
    const take = () => {
      if (inline !== undefined) return inline
      const v = value(i, flag)
      i++
      return v
    }
    switch (flag) {
      case '--docs':
        a.docs = take()
        break
      case '--port': {
        const v = take()
        if (!/^\d+$/.test(v) || Number(v) > 65535) throw new Error(`--port must be a number from 0 to 65535, not "${v}"`)
        a.port = Number(v)
        break
      }
      case '--app':
        a.app = true
        break
      case '--no-open':
        a.open = false
        break
      case '--help':
      case '-h':
        a.help = true
        break
      case '--version':
      case '-v':
        a.version = true
        break
      default:
        throw new Error(`unknown argument "${argv[i]}"`)
    }
  }
  return a
}

/** The only URL shape that is ever handed to the OS: loopback, a port, and an optional token of safe characters. */
export const isSafeUrl = (url: string) => /^http:\/\/127\.0\.0\.1:\d+\/(\?token=[\w-]+)?$/.test(url)

/** Opens the default browser. A fixed command and an argument array: no shell string, no user input. */
export function openBrowser(url: string): void {
  // The URL is built here from a port and a token, but nothing that reaches a command line is trusted:
  // only this exact shape is ever passed on, so no shell metacharacter can get through.
  if (!isSafeUrl(url)) return
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true })
    child.on('error', () => {}) // no browser to open (a server): the printed URL is enough
    child.unref()
  } catch {
    /* same */
  }
}

/** Where Edge lives on Windows: both Program Files folders, then a per-user install. A base that is not a full drive path (C:...) is ignored, so a relative variable cannot pick up an msedge.exe from the working folder. */
export function edgePaths(env: NodeJS.ProcessEnv): string[] {
  const tail = ['Microsoft', 'Edge', 'Application', 'msedge.exe']
  return [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter((b): b is string => !!b && /^[A-Za-z]:[\\/]/.test(b)).map((b) => path.win32.join(b, ...tail))
}

/** What openApp needs from the machine, so a test can stand in for all of it. */
export interface AppDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  exists: (file: string) => boolean
  spawn: (cmd: string, args: string[], opts: SpawnOptions) => { on(ev: 'error', cb: () => void): unknown; unref(): void }
  /** the normal browser opener, used as the fallback */
  openBrowser: (url: string) => void
  note: (line: string) => void
}

const realDeps: AppDeps = { platform: process.platform, env: process.env, exists: existsSync, spawn, openBrowser, note: (l) => console.error(l) }

/**
 * `--app`: opens `msedge.exe --app=<url>` (a window with no tabs or address bar). The exe is found at its
 * usual install paths, never through a shell or `where`, and the only argument is the exact loopback URL
 * the server built. On any failure (not Windows, no Edge, a refused URL, a failed start) it falls back to
 * the normal browser opener and prints one line saying so. Returns what it tried first.
 */
export function openApp(url: string, deps: AppDeps = realDeps): 'edge' | 'browser' {
  const fallback = (why: string): 'browser' => {
    deps.note(`folio: ${why}; opening the browser instead.`)
    deps.openBrowser(url)
    return 'browser'
  }
  if (!isSafeUrl(url)) return fallback('the link is not a loopback address')
  if (deps.platform !== 'win32') return fallback('--app works on Windows only')
  const exe = edgePaths(deps.env).find((p) => deps.exists(p))
  if (!exe) return fallback('Microsoft Edge was not found')
  try {
    const child = deps.spawn(exe, ['--app=' + url], { detached: true, stdio: 'ignore', shell: false })
    child.on('error', () => fallback('Edge could not be started'))
    child.unref()
    return 'edge'
  } catch {
    return fallback('Edge could not be started')
  }
}

export async function main(argv: string[], version = ''): Promise<void> {
  let args: Args
  try {
    args = parseArgs(argv)
  } catch (e) {
    console.error(`folio: ${(e as Error).message}\n\n${HELP}`)
    process.exit(2)
  }
  if (args.help) return void console.log(HELP)
  if (args.version) return void console.log(version || 'dev')
  if (Number(process.versions.node.split('.')[0]) < 22) {
    console.error('folio needs Node 22 or newer.')
    process.exit(1)
  }

  const here = path.dirname(fileURLToPath(import.meta.url))
  const distDir = process.env.FOLIO_DIST || path.join(here, 'dist')
  if (!existsSync(path.join(distDir, 'index.html'))) {
    console.error(`folio: the built frontend is missing (${distDir}). Run "npm run build:web" first.`)
    process.exit(1)
  }

  let running: Running
  try {
    running = await start({ distDir, docs: args.docs ? path.resolve(args.docs) : undefined, port: args.port })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    console.error(err.code === 'EADDRINUSE' ? `folio: port ${args.port} is already in use` : `folio: ${err.message}`)
    process.exit(1)
  }
  if (running.shell.loadError) console.error(`folio: ${running.shell.loadError}`)
  for (const w of running.shell.loadWarnings) console.error(`folio: ${w}`)
  console.log(`Folio is running. Open this link (the token in it works once):\n\n  ${running.url}\n\nPress Ctrl+C to stop.`)
  if (args.open) {
    if (args.app) openApp(running.url)
    else openBrowser(running.url)
  }

  const stop = () => {
    void running.close().then(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
