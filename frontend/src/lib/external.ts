// Link rules shared by the browser build and the Node server, ported from
// internal/shell/external.go and vscode.go. No imports: unit-tested in plain node.

/**
 * Accepts only absolute http and https URLs with a host and no credentials, and returns the
 * URL to open. Everything else (file:, javascript:, vscode:, data:, relative paths, control
 * characters) throws.
 */
export function validateExternalUrl(input: string): string {
  const raw = input.trim()
  if (raw === '') throw new Error('empty link')
  if (/[\0\r\n\t]/.test(raw)) throw new Error('link contains control characters')
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('not a valid link')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http and https links can be opened')
  // Characters that must be escaped in a query: the raw text is checked, since URL() escapes them.
  const q = raw.indexOf('?')
  if (q >= 0) {
    const h = raw.indexOf('#', q)
    if (/[ "<>\\^`{|}]/.test(raw.slice(q + 1, h < 0 ? undefined : h))) throw new Error('link query contains unsafe characters')
  }
  if (u.hostname === '' || u.username !== '' || u.password !== '') throw new Error('link needs a host and no credentials')
  return u.href
}

// Go's url.PathEscape: everything but unreserved characters and $&+=:@ is escaped.
const escapeSegment = (s: string) =>
  encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%(24|26|2B|3D|3A|40)/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

/**
 * vscode://file/<abs path>[:line] for an absolute path and an optional 1-based line (0 or less
 * means the top). Spaces become %20; the drive colon and the slashes stay as they are.
 */
export function vscodeUrl(abs: string, line = 0): string {
  const u = 'vscode://file/' + abs.replaceAll('\\', '/').split('/').map(escapeSegment).join('/').replace(/^\//, '')
  return line > 0 ? `${u}:${line}` : u
}
