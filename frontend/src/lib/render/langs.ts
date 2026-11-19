// The fence languages highlight.js is loaded for (06 D4). Kept apart from highlight.ts so
// the initial chunk can ask "does this document need highlighting?" without importing it.
// enhance.test.ts checks that every name here is a name or alias hljs registers.

export const HIGHLIGHT_LANGS: ReadonlySet<string> = new Set([
  'typescript',
  'ts',
  'tsx',
  'sql',
  'powershell',
  'pwsh',
  'ps',
  'ps1',
  'bash',
  'sh',
  'zsh',
  'json',
  'yaml',
  'yml',
  'csharp',
  'cs',
  'c#',
])

/** The language of a rendered `<code class="language-x">`, lowercased, or null. */
export function fenceLang(code: Element): string | null {
  for (const c of code.classList) if (c.startsWith('language-')) return c.slice(9).toLowerCase()
  return null
}
