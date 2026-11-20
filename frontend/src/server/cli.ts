// The folio command: argument parsing, the browser launch and the shutdown. The bundled
// folio-web.mjs is this file plus the server, with no dependencies.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { start, type Running } from './server'

export interface Args {
  docs?: string
  port: number
  open: boolean
  help: boolean
  version: boolean
}

export const HELP = `folio: a read-only viewer for Markdown tickets, in your browser

Usage:
  folio --docs <path> [--port <n>] [--no-open]

Options:
  --docs <path>   the repo root or its docs folder (the one that holds modules/, handoffs/, patterns/)
  --port <n>      listen on this port (default: a random free port)
  --no-open       print the URL but do not open the browser
  --version       print the version
  --help          show this text

The server listens on 127.0.0.1 only. Open the printed URL: it carries a one-time token.
`

export function parseArgs(argv: string[]): Args {
  const a: Args = { port: 0, open: true, help: false, version: false }
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

/** Opens the default browser. A fixed command and an argument array: no shell string, no user input. */
export function openBrowser(url: string): void {
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
  if (Number(process.versions.node.split('.')[0]) < 20) {
    console.error('folio needs Node 20 or newer.')
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
  console.log(`Folio is running. Open this link (it carries a one-time token):\n\n  ${running.url}\n\nPress Ctrl+C to stop.`)
  if (args.open) openBrowser(running.url)

  const stop = () => {
    void running.close().then(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
