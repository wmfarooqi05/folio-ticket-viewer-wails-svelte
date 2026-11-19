import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildIndex, type SourceFile } from './index'

// frontend/src/lib/parser -> repo root
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const fixtures = join(repoRoot, 'fixtures')
const docsRoot = join(fixtures, 'docs')

function walkMd(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walkMd(full) : full.endsWith('.md') ? [full] : []
  })
}

function loadFixtureFiles(): SourceFile[] {
  return walkMd(docsRoot).map((abs) => ({
    path: relative(docsRoot, abs).split(sep).join('/'),
    text: readFileSync(abs, 'utf8'),
    mtime: statSync(abs).mtimeMs,
  }))
}

const expected = JSON.parse(readFileSync(join(fixtures, 'expected.json'), 'utf8')) as {
  tickets: { path: string; title: string }[]
}

describe('buildIndex (trivial skeleton)', () => {
  const files = loadFixtureFiles()
  const index = buildIndex(files)

  it('indexes all 78 fixture files', () => {
    expect(files).toHaveLength(78)
    expect(Object.keys(index.files)).toHaveLength(78)
  })

  it('finds the 64 ticket paths from expected.json', () => {
    const tickets = Object.values(index.files)
      .filter((r) => r.kind === 'ticket')
      .map((r) => r.path)
      .sort()
    expect(tickets).toHaveLength(64)
    expect(tickets).toEqual(expected.tickets.map((t) => t.path).sort())
  })

  it('keeps the index plain JSON', () => {
    expect(JSON.parse(JSON.stringify(index))).toEqual(index)
  })

  it('takes the title from the first H1', () => {
    const rec = index.files['modules/cash-handling-workflow/issues/01-ledger-schema.md']
    expect(rec.title).toBe('Ledger schema')
  })
})

describe('parser contract, not built yet', () => {
  it.todo('parseFrontmatter and the legacy fallback give the expected TicketMeta')
  it.todo('parseItems extracts Q, D, AC and R items with line ranges')
  it.todo('parseLinks and resolveRef match expected.json links and refs')
  it.todo('scanText finds the expected textRefs')
  it.todo('updateIndex re-parses only the changed files')
  it.todo('extractFragment returns the item line range')
})
