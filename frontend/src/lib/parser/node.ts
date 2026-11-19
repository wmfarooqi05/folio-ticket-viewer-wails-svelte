// Node adapter for the parser (not part of lib.mjs): reads a docs root from disk.
// The upstream CLI uses the same shape; the tests and the perf run use it too.
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { buildIndex, type Index, type SourceFile } from './index'

async function* walkMd(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) yield* walkMd(abs)
    else if (e.name.endsWith('.md')) yield abs
  }
}

export async function readDocsRoot(docsRoot: string, roots = ['modules', 'handoffs', 'patterns']): Promise<SourceFile[]> {
  const files: SourceFile[] = []
  for (const r of roots)
    for await (const abs of walkMd(join(docsRoot, r)))
      files.push({ path: relative(docsRoot, abs).split(sep).join('/'), text: await readFile(abs, 'utf8'), mtime: (await stat(abs)).mtimeMs })
  return files
}

export async function buildIndexFromDisk(docsRoot: string, roots?: string[]): Promise<Index> {
  return buildIndex(await readDocsRoot(docsRoot, roots))
}
