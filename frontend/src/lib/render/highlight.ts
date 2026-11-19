// Syntax highlighting (ticket 14; 06 D4). highlight.js 11.12.0 core plus seven grammars.
// This module is only ever loaded through import() from enhance.ts, when a document has a
// fence in one of the languages in langs.ts, so none of it is in the initial chunk.
// Token colours are CSS variables from the theme tokens (highlight.css), so a theme toggle
// recolours the code without running anything.

import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import csharp from 'highlight.js/lib/languages/csharp'
import json from 'highlight.js/lib/languages/json'
import powershell from 'highlight.js/lib/languages/powershell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import yaml from 'highlight.js/lib/languages/yaml'
import './highlight.css'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('csharp', csharp)

/** True for a language name or alias the bundle knows. */
export const knows = (lang: string): boolean => hljs.getLanguage(lang) !== undefined

/**
 * Highlights one `<code class="language-x">` element in place. The element's text is the
 * source, so the copy button still copies it. hljs escapes its input, so the result holds
 * `<span class="hljs-*">` and text only. Returns false when the language is not bundled.
 */
export function highlightCode(code: HTMLElement, lang: string): boolean {
  if (!hljs.getLanguage(lang)) return false
  const source = code.textContent ?? ''
  code.innerHTML = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value
  code.classList.add('hljs')
  return true
}
