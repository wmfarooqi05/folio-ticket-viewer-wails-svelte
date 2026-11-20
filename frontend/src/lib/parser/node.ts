// Node adapter for the parser (not part of lib.mjs): reads a docs root from disk.
// The upstream CLI uses the same shape; the tests and the perf run use it too.
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { buildIndex, rootNameFor, type Index, type SourceFile } from './index'

async function* walkMd(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && !e.name.startsWith('.')) yield* walkMd(abs)
    }
    else if (e.name.endsWith('.md')) yield abs
  }
}

export async function readDocsRoot(docsRoot: string, roots = ['modules', 'handoffs', 'patterns']): Promise<SourceFile[]> {
  const files = new Map<string, SourceFile>() // keyed by path: "." plus "modules" must not list a file twice
  for (const r of roots)
    for await (const abs of walkMd(join(docsRoot, r))) {
      const path = relative(docsRoot, abs).split(sep).join('/')
      if (!files.has(path)) files.set(path, { path, text: await readFile(abs, 'utf8'), mtime: (await stat(abs)).mtimeMs })
    }
  return [...files.values()]
}

/** The docs folder's own space is named like the app names it: repo folder, or the docs folder when it is not "docs". */
export const rootNameOf = (docsRoot: string): string => rootNameFor(dirname(resolve(docsRoot)), basename(resolve(docsRoot)))

export async function buildIndexFromDisk(docsRoot: string, roots?: string[]): Promise<Index> {
  return buildIndex(await readDocsRoot(docsRoot, roots), rootNameOf(docsRoot))
}
