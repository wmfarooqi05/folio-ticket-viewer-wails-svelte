// The sanitiser: an allowlist, not a filter (ticket 06 D2). markdown-it runs with
// html: true, and these functions decide what the html_inline and html_block tokens
// become. Nothing from the source text is ever passed through as markup:
//   - <a id="x"> is rebuilt from the captured id (a data-anchor, never an id);
//   - </a> emits nothing, and the anchor is self-closed, so an unclosed <a id> cannot wrap
//     the rest of the document;
//   - <br> is re-emitted bare;
//   - HTML comments vanish (they are not content);
//   - everything else is escaped and shown as text.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESC[c])
}

/** `<a id="x">` as one inline tag. The id is limited to word characters, dot and dash. */
const ANCHOR_OPEN = /^<a\s+id=(["'])([\w.-]+)\1\s*>$/i
const ANCHOR_CLOSE = /^<\/a\s*>$/i
const BR = /^<br\s*\/?>$/i
const COMMENT = /^<!--(?:(?!-->)[\s\S])*-->$/

/** A line holding only an anchor, as the parser reads it (parser ANCHOR_ONLY). */
export const ANCHOR_LINE = /^\s*<a\s+id=["']([^"']+)["']\s*>(?:\s*<\/a>)?\s*$/i

export interface InlineHtmlState {
  /** the tag is inside a heading: the heading's data-anchor already carries the id */
  inHeading: boolean
}

/**
 * The output for one html_inline token. An <a id> becomes an empty, closed anchor (or nothing
 * in a heading) and every </a> emits nothing, so the browser's HTML parser never sees an open
 * <a> that could swallow the blocks that follow.
 */
export function renderInlineHtml(html: string, state: InlineHtmlState): string {
  const tag = html.trim()
  const m = ANCHOR_OPEN.exec(tag)
  if (m) return state.inHeading ? '' : `<a data-anchor="${escapeHtml(m[2].toLowerCase())}"></a>`
  if (ANCHOR_CLOSE.test(tag)) return ''
  if (BR.test(tag)) return '<br>'
  if (COMMENT.test(tag)) return ''
  return escapeHtml(html)
}

/** The output for one html_block token: comments vanish, the rest is shown as text. */
export function renderHtmlBlock(html: string): string {
  const t = html.trim()
  if (COMMENT.test(t)) return ''
  return `<p class="raw-html">${escapeHtml(t)}</p>\n`
}
