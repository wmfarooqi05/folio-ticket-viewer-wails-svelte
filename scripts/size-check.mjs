// Size budgets for Folio (ticket 15; 06 D5, tightened to what tickets 09-14 actually used).
//
//   node scripts/size-check.mjs            checks frontend/dist and bin/folio.exe, prints a table
//   node scripts/size-check.mjs --no-exe   skips the exe (when only the frontend is built)
//   node scripts/size-check.mjs --json     adds a machine-readable line at the end
//
// Node built-ins only. Exits 1 on a breach, 2 when the build output is missing.
// The checks read frontend/dist/index.html and the Vite manifest (frontend/.vite/manifest.json,
// moved out of dist/ by vite.config.ts so it is not embedded in the exe). Sizes are gzip
// (zlib level 9, which is what a good static host would send; Vite's own report uses a
// similar level) and "KB" is 1000 bytes, like Vite's report.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export const KB = 1000
export const MIB = 1024 * 1024

/** The caps. Each one is the tighter number the tickets used, not the 06 D5 hard cap. */
export const BUDGETS = {
  initialJs: 120 * KB, // every chunk index.html loads or modulepreloads
  css: 25 * KB,
  mermaidFamily: 450 * KB, // the largest diagram-family closure, without the KaTeX add-on
  mermaidHeavy: 500 * KB, // the cytoscape families listed in HEAVY_FAMILIES (see below)
  highlight: 25 * KB,
  exe: 20 * MIB,
}

/**
 * Families that carry cytoscape (139 KB gzip on its own). architecture-beta is the only one: Mermaid
 * 12.3.0 has no lighter renderer for it, no document in the corpus uses it, and it cannot be dropped
 * without disabling the diagram type. It is held to its own cap instead of the 450 KB one, and the
 * table says so. Every other family, including all the ones documents actually use, gets 450.
 */
export const HEAVY_FAMILIES = new Set(['architectureDiagram'])

export const gzipSize = (buf) => gzipSync(buf, { level: 9 }).length

// ---- pure helpers (tested in size-check.test.mjs) -----------------------------------------

/** Files an index.html loads: module scripts, modulepreloads and stylesheets, as dist-relative paths. */
export function htmlAssets(html) {
  const js = new Set()
  const css = new Set()
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const rel = /\brel="([^"]*)"/i.exec(tag)?.[1]
    const ref = /\b(?:src|href)="([^"]*)"/i.exec(tag)?.[1]
    if (!ref) continue
    const path = ref.replace(/^\//, '')
    if (/^<script/i.test(tag) && /\.m?js$/.test(path)) js.add(path)
    else if (rel === 'modulepreload') js.add(path)
    else if (rel === 'stylesheet') css.add(path)
  }
  return { js: [...js], css: [...css] }
}

/** Manifest keys reachable through static `imports` from the given keys (the keys included). */
export function staticClosure(manifest, keys) {
  const seen = new Set()
  const walk = (k) => {
    if (seen.has(k) || !manifest[k]) return
    seen.add(k)
    for (const i of manifest[k].imports ?? []) walk(i)
  }
  for (const k of keys) walk(k)
  return seen
}

/** Total gzip bytes of the files of a set of manifest keys (css files of chunks are included). */
export function closureBytes(manifest, keys, gz) {
  const files = new Set()
  for (const k of keys) {
    const e = manifest[k]
    if (!e) continue
    files.add(e.file)
    for (const c of e.css ?? []) files.add(c)
  }
  let total = 0
  for (const f of files) total += gz(f)
  return { bytes: total, chunks: files.size, files }
}

const keyOfFile = (manifest, file) => Object.keys(manifest).find((k) => manifest[k].file === file)

/** `node_modules/mermaid/dist/chunks/mermaid.core/flowDiagram-MALGAFMO.mjs` -> `flowDiagram` */
export function familyName(key) {
  const base = key.split('/').pop().replace(/\.mjs$/, '')
  // Some diagram chunks are anonymous (`diagram-3B7GL73J`); the hash is all that tells them apart.
  return base.startsWith('diagram-') ? base : base.replace(/-[A-Z0-9]{8}$/, '')
}

const LAYOUTS = new Set(['dagre', 'elk', 'cose-bilkent'])
const NOT_DIAGRAMS = new Set(['sizeCapture', 'bpmnIcons', 'swimlanes'])

/**
 * The diagram families of Mermaid, as closures over the manifest's import graph. A family is what
 * a document with one diagram of that type loads:
 *
 *   mermaid.ts wrapper + mermaid.core (and everything they import statically)
 *   + the diagram chunk and its static imports
 *   + the layout it needs: dagre (mermaid.ts pins it) unless the family already carries
 *     cytoscape (architecture), cose-bilkent for mindmap
 *   + the @mermaid-js/parser chunk of the same name, when there is one (pie, gitGraph, ...)
 *
 * The ELK layout is stubbed in vite.config.ts, so its chunk is a few bytes and is not added.
 * KaTeX is loaded only for a diagram with math; it is returned separately as the add-on.
 */
export function mermaidFamilies(manifest, gz) {
  const wrapperKey = Object.keys(manifest).find((k) => /(^|\/)render\/mermaid\.ts$/.test(k))
  const coreKey = Object.keys(manifest).find((k) => /(^|\/)mermaid\/dist\/mermaid\.core\.mjs$/.test(k))
  if (!wrapperKey || !coreKey) return null
  const dyn = manifest[coreKey].dynamicImports ?? []
  const diagramKeys = dyn.filter((k) => {
    if (!k.includes('/mermaid/dist/chunks/mermaid.core/')) return false
    const n = familyName(k)
    return !LAYOUTS.has(n) && !NOT_DIAGRAMS.has(n)
  })
  const dagreKey = dyn.find((k) => familyName(k) === 'dagre')
  const elkKey = dyn.find((k) => familyName(k) === 'elk')
  const coseKey = dyn.find((k) => familyName(k) === 'cose-bilkent')
  const base = staticClosure(manifest, [wrapperKey, coreKey])
  const dagreSet = dagreKey ? staticClosure(manifest, [dagreKey]) : new Set()
  const coseSet = coseKey ? staticClosure(manifest, [coseKey]) : new Set()
  const hasCytoscape = (keys) => [...keys].some((x) => /cytoscape/.test(manifest[x].file))
  const parserKeys = Object.keys(manifest).filter((k) => k.includes('/mermaid-parser.core/'))
  const norm = (s) => s.toLowerCase().replace(/^railroad-/, '').replace(/diagram$|-definition$|-v2$/g, '')

  const families = diagramKeys.map((k) => {
    const name = familyName(k)
    const keys = new Set([...base, ...staticClosure(manifest, [k])])
    // Layout: a family that already carries cytoscape (architecture) does not use dagre; mindmap
    // needs cose-bilkent; every other family is charged for dagre, which is an upper bound.
    const layout = /mindmap/.test(name) ? coseSet : hasCytoscape(keys) ? new Set() : dagreSet
    for (const x of layout) keys.add(x)
    const parser = parserKeys.find((p) => {
      const pn = norm(familyName(p))
      return pn && norm(name).startsWith(pn)
    })
    if (parser) for (const x of staticClosure(manifest, [parser])) keys.add(x)
    const { bytes, chunks } = closureBytes(manifest, keys, gz)
    return { name, bytes, chunks }
  })
  families.sort((a, b) => b.bytes - a.bytes)

  const katexKey = Object.keys(manifest).find((k) => /(^|\/)katex\/dist\/katex\.mjs$/.test(k))
  const katex = katexKey ? closureBytes(manifest, staticClosure(manifest, [katexKey]), gz).bytes : 0
  const elk = elkKey ? closureBytes(manifest, staticClosure(manifest, [elkKey]), gz).bytes : 0
  const baseBytes = closureBytes(manifest, base, gz).bytes
  return { families, katex, elk, baseBytes }
}

/** The highlight.js chunk: the dynamic entry of render/highlight.ts and its static closure, minus the initial JS. */
export function highlightBytes(manifest, initialFiles, gz) {
  const key = Object.keys(manifest).find((k) => /(^|\/)render\/highlight\.ts$/.test(k))
  if (!key) return null
  const keys = [...staticClosure(manifest, [key])].filter((k) => !initialFiles.has(manifest[k].file))
  return closureBytes(manifest, keys, gz).bytes
}

// ---- the check ----------------------------------------------------------------------------

const fmtKB = (n) => (n / KB).toFixed(1).padStart(7) + ' KB'
const fmtMiB = (n) => (n / MIB).toFixed(2).padStart(7) + ' MiB'

export function run({ dist, manifestPath, exePath, checkExe = true, log = console.log }) {
  const indexPath = join(dist, 'index.html')
  if (!existsSync(indexPath) || !existsSync(manifestPath)) {
    log(`size-check: build output missing (${indexPath} or ${manifestPath}). Run npm run build in frontend/ first.`)
    return 2
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const cache = new Map()
  const gz = (file) => {
    if (!cache.has(file)) cache.set(file, gzipSize(readFileSync(join(dist, file))))
    return cache.get(file)
  }

  const { js, css } = htmlAssets(readFileSync(indexPath, 'utf8'))
  // The entry's static closure from the manifest should equal the preload list; take the union.
  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry)
  const initial = new Set(js)
  for (const k of staticClosure(manifest, [entryKey])) initial.add(manifest[k].file)
  const cssFiles = new Set(css)
  for (const f of initial) for (const c of manifest[keyOfFile(manifest, f)]?.css ?? []) cssFiles.add(c)

  const jsBytes = [...initial].reduce((n, f) => n + gz(f), 0)
  const cssBytes = [...cssFiles].reduce((n, f) => n + gz(f), 0)
  const hl = highlightBytes(manifest, initial, gz)
  const mer = mermaidFamilies(manifest, gz)

  const rows = []
  const add = (label, value, cap, fmt, detail = '') => {
    rows.push({ label, value, cap, fmt, ok: value != null && value <= cap, detail })
  }
  add('initial JS (gzip)', jsBytes, BUDGETS.initialJs, fmtKB, `${initial.size} chunks (index + every modulepreload)`)
  add('CSS (gzip)', cssBytes, BUDGETS.css, fmtKB, `${cssFiles.size} file(s)`)
  if (mer) {
    const light = mer.families.filter((f) => !HEAVY_FAMILIES.has(f.name))
    const heavy = mer.families.filter((f) => HEAVY_FAMILIES.has(f.name))
    add('Mermaid, largest family', light[0].bytes, BUDGETS.mermaidFamily, fmtKB, `${light[0].name}, ${light[0].chunks} chunks, no KaTeX`)
    if (heavy.length) add('Mermaid, heavy family', heavy[0].bytes, BUDGETS.mermaidHeavy, fmtKB, `${heavy[0].name} (cytoscape), own cap`)
  } else {
    rows.push({ label: 'Mermaid, largest family', value: null, cap: BUDGETS.mermaidFamily, fmt: fmtKB, ok: false, detail: 'mermaid entries not found in the manifest' })
  }
  add('highlight.js (gzip)', hl, BUDGETS.highlight, fmtKB, 'core + grammars, dynamic chunk')
  let exeBytes = null
  if (checkExe) {
    if (existsSync(exePath)) {
      exeBytes = statSync(exePath).size
      add('exe', exeBytes, BUDGETS.exe, fmtMiB, exePath.split(/[\\/]/).slice(-2).join('/'))
    } else {
      rows.push({ label: 'exe', value: null, cap: BUDGETS.exe, fmt: fmtMiB, ok: false, detail: `${exePath} not found` })
    }
  }

  const pad = (s, n) => String(s).padEnd(n)
  log('')
  log(pad('budget', 26) + pad('actual', 14) + pad('cap', 14) + pad('', 6) + 'detail')
  for (const r of rows) {
    const actual = r.value == null ? 'n/a' : r.fmt(r.value)
    log(pad(r.label, 26) + pad(actual, 14) + pad(r.fmt(r.cap), 14) + pad(r.ok ? 'ok' : 'FAIL', 6) + r.detail)
  }
  if (mer) {
    log('')
    log(`Mermaid families (gzip; base = wrapper + core = ${(mer.baseBytes / KB).toFixed(1)} KB)`)
    for (const f of mer.families.slice(0, 6)) {
      log(`  ${pad(f.name, 26)}${fmtKB(f.bytes)}   +KaTeX ${fmtKB(f.bytes + mer.katex)}   ${f.chunks} chunks`)
    }
    log(`  KaTeX add-on (only when a diagram has math): ${(mer.katex / KB).toFixed(1)} KB`)
    log(`  ELK layout is stubbed (vite.config.ts): its chunk is ${(mer.elk / KB).toFixed(1)} KB instead of ~466 KB`)
    const over = mer.families.filter((f) => f.bytes + mer.katex > BUDGETS.mermaidFamily).map((f) => f.name)
    if (over.length) log(`  note: with the KaTeX add-on, over ${(BUDGETS.mermaidFamily / KB).toFixed(0)} KB: ${over.join(', ')} (cap is checked without it)`)
  }
  const failed = rows.filter((r) => !r.ok)
  log('')
  log(failed.length ? `size-check: FAILED (${failed.map((r) => r.label).join(', ')})` : 'size-check: all budgets pass')
  return failed.length ? 1 : 0
}

const here = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(here, '..')
  const code = run({
    dist: join(root, 'frontend', 'dist'),
    manifestPath: join(root, 'frontend', '.vite', 'manifest.json'),
    exePath: join(root, 'bin', 'folio.exe'),
    checkExe: !process.argv.includes('--no-exe'),
  })
  process.exit(code)
}
