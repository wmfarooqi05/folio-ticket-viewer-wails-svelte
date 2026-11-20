// Test helper (ticket 19): what the renderer is allowed to put in the page. Every element and
// attribute in renderMarkdown's output must be listed here, and every URL must be one of three
// shapes. Used by hostile.test.ts and fuzz.test.ts; nothing in the app imports it.

/** Element -> the attributes it may carry. */
const ELEMENTS: Record<string, readonly string[]> = {
  p: ['class', 'data-state'],
  h1: ['data-anchor', 'class', 'data-state'],
  h2: ['data-anchor', 'class', 'data-state'],
  h3: ['data-anchor', 'class', 'data-state'],
  h4: ['data-anchor', 'class', 'data-state'],
  h5: ['data-anchor', 'class', 'data-state'],
  h6: ['data-anchor', 'class', 'data-state'],
  a: ['class', 'href', 'title', 'aria-disabled', 'data-ext', 'data-path', 'data-frag', 'data-broken', 'data-anchor'],
  span: ['class', 'title'],
  div: ['class', 'data-mermaid', 'data-line'],
  pre: [],
  code: ['class'],
  button: ['type', 'class', 'data-copy'],
  input: ['type', 'class', 'disabled', 'checked'],
  img: ['class', 'src', 'alt', 'data-href', 'loading'],
  ul: ['class'],
  ol: ['class', 'start'],
  li: ['class', 'data-state'],
  blockquote: [],
  em: [],
  strong: [],
  s: [],
  hr: [],
  br: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['style'],
  td: ['style'],
}

/** markdown-it's table alignment, the only style the renderer writes. */
const ALIGN = /^text-align:(left|right|center)$/

/** A list of what is wrong with `root`'s subtree; empty when everything is allowed. */
export function violations(root: ParentNode): string[] {
  const out: string[] = []
  for (const el of root.querySelectorAll('*')) {
    const tag = el.localName.toLowerCase()
    const allowed = ELEMENTS[tag]
    if (!allowed) {
      out.push(`element <${tag}>`)
      continue
    }
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase()
      const v = a.value
      if (!allowed.includes(name)) out.push(`<${tag} ${name}="${v.slice(0, 60)}">`)
      else if (name === 'href' && v !== '#') out.push(`<${tag} href="${v.slice(0, 60)}">`)
      else if (name === 'src' && !/^\/doc\/[^/]/.test(v)) out.push(`<${tag} src="${v.slice(0, 60)}">`)
      else if (name === 'src' && !new URL(v, 'http://127.0.0.1:1/').pathname.startsWith('/doc/')) out.push(`<${tag} src="${v}"> leaves /doc/`)
      else if (name === 'data-ext' && !/^https?:\/\//i.test(v)) out.push(`<${tag} data-ext="${v.slice(0, 60)}">`)
      else if (name === 'style' && !ALIGN.test(v)) out.push(`<${tag} style="${v.slice(0, 60)}">`)
      else if (name === 'type' && !['button', 'checkbox'].includes(v)) out.push(`<${tag} type="${v}">`)
    }
  }
  return out
}
