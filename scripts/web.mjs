// `npm run web -- --docs <path>`: builds the web bundle if it is missing or older than its sources,
// then runs it. The arguments go to folio as they are.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const pkg = path.join(root, 'packages', 'folio-viewer')
const bundle = path.join(pkg, 'folio-web.mjs')
const page = path.join(pkg, 'dist', 'index.html')

function newest(dir) {
  let t = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs)
  }
  return t
}

const sources = Math.max(
  newest(path.join(frontend, 'src')),
  ...['package.json', 'vite.web.config.ts', 'vite.server.config.ts', 'vite.shared.ts', 'index.html'].map((f) => statSync(path.join(frontend, f)).mtimeMs),
)
const built = existsSync(bundle) && existsSync(page) ? Math.min(statSync(bundle).mtimeMs, statSync(page).mtimeMs) : 0

if (built < sources) {
  console.log('Building the web bundle...')
  const r = spawnSync('npm', ['run', 'build:web', '--silent'], { cwd: frontend, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const child = spawn(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' })
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
child.on('exit', (code) => process.exit(code ?? 0))
