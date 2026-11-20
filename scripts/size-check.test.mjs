// Self-check for size-check.mjs: node --test scripts
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { BUDGETS, closureBytes, HEAVY_FAMILIES, familyName, htmlAssets, mermaidFamilies, run, staticClosure } from './size-check.mjs'

test('htmlAssets lists the script, every modulepreload and the stylesheet', () => {
  const html = `<script type="module" crossorigin src="/assets/index-A.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/views-B.js">
    <link rel="icon" href="/favicon.svg">
    <link rel="stylesheet" crossorigin href="/assets/index-C.css">`
  assert.deepEqual(htmlAssets(html), { js: ['assets/index-A.js', 'assets/views-B.js'], css: ['assets/index-C.css'] })
})

test('staticClosure follows imports, not dynamic imports', () => {
  const m = {
    a: { file: 'a.js', imports: ['b'], dynamicImports: ['d'] },
    b: { file: 'b.js', imports: ['c'] },
    c: { file: 'c.js' },
    d: { file: 'd.js' },
  }
  assert.deepEqual([...staticClosure(m, ['a'])].sort(), ['a', 'b', 'c'])
})

test('familyName strips the path, extension and hash', () => {
  assert.equal(familyName('node_modules/mermaid/dist/chunks/mermaid.core/flowDiagram-MALGAFMO.mjs'), 'flowDiagram')
  assert.equal(familyName('node_modules/mermaid/dist/chunks/mermaid.core/cose-bilkent-JH36ORCC.mjs'), 'cose-bilkent')
})

const sizes = { 'w.js': 10, 'core.js': 100, 'shared.js': 50, 'dagre.js': 20, 'flow.js': 30, 'pie.js': 5, 'pieparser.js': 7, 'katex.js': 40, 'arch.js': 3, 'cytoscape.esm-X.js': 90, 'elk.js': 1 }
const gz = (f) => sizes[f]
const manifest = {
  'src/lib/render/mermaid.ts': { file: 'w.js', imports: ['core'], dynamicImports: [] },
  'core': { file: 'core.js', imports: ['shared'] },
  'shared': { file: 'shared.js' },
  'node_modules/mermaid/dist/mermaid.core.mjs': {
    file: 'core.js',
    imports: ['shared'],
    dynamicImports: [
      'node_modules/mermaid/dist/chunks/mermaid.core/dagre-AAAAAAAA.mjs',
      'node_modules/mermaid/dist/chunks/mermaid.core/elk-AAAAAAAA.mjs',
      'node_modules/mermaid/dist/chunks/mermaid.core/flowDiagram-AAAAAAAA.mjs',
      'node_modules/mermaid/dist/chunks/mermaid.core/pieDiagram-AAAAAAAA.mjs',
      'node_modules/mermaid/dist/chunks/mermaid.core/architectureDiagram-AAAAAAAA.mjs',
    ],
  },
  'node_modules/mermaid/dist/chunks/mermaid.core/dagre-AAAAAAAA.mjs': { file: 'dagre.js', imports: ['shared'] },
  'node_modules/mermaid/dist/chunks/mermaid.core/elk-AAAAAAAA.mjs': { file: 'elk.js' },
  'node_modules/mermaid/dist/chunks/mermaid.core/flowDiagram-AAAAAAAA.mjs': { file: 'flow.js', imports: ['shared'] },
  'node_modules/mermaid/dist/chunks/mermaid.core/pieDiagram-AAAAAAAA.mjs': { file: 'pie.js', imports: ['shared'] },
  'node_modules/mermaid/dist/chunks/mermaid.core/architectureDiagram-AAAAAAAA.mjs': { file: 'arch.js', imports: ['cyto'] },
  cyto: { file: 'cytoscape.esm-X.js' },
  'node_modules/@mermaid-js/parser/dist/chunks/mermaid-parser.core/pie-BBBBBBBB.mjs': { file: 'pieparser.js' },
  'node_modules/katex/dist/katex.mjs': { file: 'katex.js' },
}

test('mermaidFamilies counts shared chunks once, adds dagre and the matching parser, keeps KaTeX apart', () => {
  const r = mermaidFamilies(manifest, gz)
  const byName = Object.fromEntries(r.families.map((f) => [f.name, f.bytes]))
  assert.equal(byName.flowDiagram, 10 + 100 + 50 + 20 + 30) // wrapper, core, shared, dagre, flow
  assert.equal(byName.pieDiagram, 10 + 100 + 50 + 20 + 5 + 7) // plus the pie parser
  assert.equal(byName.architectureDiagram, 10 + 100 + 50 + 3 + 90) // cytoscape instead of dagre
  assert.equal(r.families[0].name, 'architectureDiagram') // sorted, largest first
  assert.equal(r.katex, 40)
  assert.equal(r.elk, 1)
  assert.equal(closureBytes(manifest, ['core', 'shared'], gz).bytes, 150)
})

test('run fails above a cap and passes below it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'size-check-'))
  try {
    const dist = join(dir, 'dist')
    mkdirSync(join(dist, 'assets'), { recursive: true })
    const big = randomBytes(BUDGETS.css + 1000) // incompressible
    writeFileSync(join(dist, 'assets', 'i.js'), 'export {}')
    writeFileSync(join(dist, 'assets', 'i.css'), big)
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="/assets/i.js"></script><link rel="stylesheet" href="/assets/i.css">')
    const mp = join(dir, 'manifest.json')
    writeFileSync(mp, JSON.stringify({ 'index.html': { file: 'assets/i.js', isEntry: true, css: ['assets/i.css'] } }))
    const lines = []
    const code = run({ dist, manifestPath: mp, exePath: join(dir, 'none.exe'), checkExe: false, log: (l) => lines.push(l) })
    assert.equal(code, 1) // css over 25 KB, and no mermaid/highlight in this tiny manifest
    assert.ok(lines.some((l) => l.startsWith('CSS') && l.includes('FAIL')))
    assert.equal(run({ dist: join(dir, 'nope'), manifestPath: mp, exePath: '', checkExe: false, log: () => {} }), 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
