// Localhost security for web mode. The server binds to 127.0.0.1 only, and on top of that
// every request must: carry a Host of 127.0.0.1:<port> or localhost:<port> (DNS rebinding),
// not be cross-site (Sec-Fetch-Site, Origin), and carry the startup token as an HttpOnly cookie.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

/** Cookies ignore the port, so each instance names its cookie after its own: two folios do not log each other out. */
export const cookieName = (port: number) => `folio_session_${port}`

/** The CSP of frontend/src/../index.html (a test keeps them equal), plus the one directive only a header can carry. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'"

/** The headers every response carries, errors and images included. */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP + "; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

export const newToken = () => randomBytes(24).toString('base64url')

const digest = (s: string) => createHash('sha256').update(s).digest()
export const tokenMatches = (a: string | undefined, b: string) => a !== undefined && timingSafeEqual(digest(a), digest(b))

export function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

export type Verdict = { ok: true } | { ok: false; status: number; message: string }
const no = (status: number, message: string): Verdict => ({ ok: false, status, message })

/** The Host check: exactly 127.0.0.1:<port> or localhost:<port>. */
export function hostAllowed(host: string | undefined, port: number): boolean {
  const h = (host ?? '').toLowerCase()
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`
}

/** Everything that does not need the token: the Host, then cross-site requests. */
export function checkOrigin(req: IncomingMessage, port: number): Verdict {
  if (!hostAllowed(req.headers.host, port)) return no(403, 'Forbidden: unexpected Host header')
  const site = req.headers['sec-fetch-site']
  // Browsers send it on every request. "none" is a typed or launched URL; "same-origin" is the app itself.
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return no(403, 'Forbidden: cross-site request')
  const origin = req.headers.origin
  if (origin !== undefined && origin !== `http://${req.headers.host}`) return no(403, 'Forbidden: cross-origin request')
  return { ok: true }
}
