// AC3: a wrong Host, no token or a cross-site request is rejected, a /doc/ path that leaves the
// root returns 404, and the server listens on 127.0.0.1 only.
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { start, type Running } from './server'
import { CSP, SECURITY_HEADERS } from './security'

const TOKEN = 'test-token-0123456789'
let tmp: string
let srv: Running
let docs: string

interface Res {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

/** A request with the headers exactly as given: Node sets Host itself unless it is passed. */
function req(p: string, headers: Record<string, string> = {}, method = 'GET', body?: string, port = srv.port): Promise<Res> {
  return new Promise((ok, fail) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    r.on('error', fail)
    r.end(body)
  })
}
let cookie: { cookie: string } // the session cookie, once the server is up

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-sec-'))
  const dist = path.join(tmp, 'dist')
  mkdirSync(dist)
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>folio</title>')
  writeFileSync(path.join(tmp, 'secret.txt'), 'top secret')
  docs = path.join(tmp, 'repo', 'docs')
  cpSync(path.join(__dirname, '..', '..', '..', 'fixtures', 'docs'), docs, { recursive: true })
  mkdirSync(path.join(docs, 'modules', 'img'), { recursive: true })
  writeFileSync(path.join(docs, 'modules', 'img', 'a.png'), 'png')
  writeFileSync(path.join(docs, 'modules', 'img', 'CON.png'), 'png')
  srv = await start({ distDir: dist, docs, settingsFile: path.join(tmp, 'settings.json'), cacheDir: path.join(tmp, 'cache'), token: TOKEN })
  cookie = { cookie: `folio_session_${srv.port}=${srv.session}` }
})

afterAll(async () => {
  await srv.close()
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('binding', () => {
  it('listens on 127.0.0.1 only', () => {
    const a = srv.server.address() as net.AddressInfo
    expect(a.address).toBe('127.0.0.1')
    expect(a.family).toBe('IPv4')
  })

  it('does not answer on any other address of this machine', async () => {
    const others = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
    // all at once: a PC with a VPN or Hyper-V switches has several addresses that drop packets, and
    // one 1.5 s timeout after another would run past the test's 5 s limit
    const codes = await Promise.all(
      others.map(
        (i) =>
          new Promise<[string, string]>((ok) => {
            const s = net.connect({ host: i!.address, port: srv.port, timeout: 1500 })
            s.on('connect', () => (s.destroy(), ok([i!.address, 'connected'])))
            s.on('timeout', () => (s.destroy(), ok([i!.address, 'timeout'])))
            s.on('error', (e: NodeJS.ErrnoException) => ok([i!.address, e.code ?? 'error']))
          }),
      ),
    )
    for (const [address, code] of codes) expect(code, address).not.toBe('connected')
  })

  it('uses a random free port by default', () => {
    expect(srv.port).toBeGreaterThan(0)
  })
})

describe('Host header (DNS rebinding)', () => {
  it.each(['evil.example.com', `evil.example.com:${'PORT'}`, 'localhost', '127.0.0.1', '0.0.0.0:PORT', '[::1]:PORT', 'localhost:1', '127.0.0.1.evil.com:PORT'])('rejects Host %j', async (host) => {
    const r = await req('/', { ...cookie, host: host.replace('PORT', String(srv.port)) })
    expect(r.status).toBe(403)
  })

  it.each(['127.0.0.1', 'localhost', 'LOCALHOST'])('accepts %s:<port>', async (h) => {
    const r = await req('/', { ...cookie, host: `${h}:${srv.port}` })
    expect(r.status).toBe(200)
  })

  it('checks the Host before the token, and before the token exchange', async () => {
    const r = await req(`/?token=${TOKEN}`, { host: 'evil.example.com' })
    expect(r.status).toBe(403)
    expect(r.headers['set-cookie']).toBeUndefined()
  })
})

describe('token', () => {
  it('rejects a request with no cookie', async () => {
    expect((await req('/')).status).toBe(401)
    expect((await req('/api/getConfig', {}, 'POST', '[]')).status).toBe(401)
    expect((await req('/api/events')).status).toBe(401)
    expect((await req('/api/events', { ...cookie }, 'POST', '[]')).status).toBe(405) // GET only
    expect((await req('/doc/modules/img/a.png')).status).toBe(401)
    expect((await req('/assets/x.js')).status).toBe(401)
  })

  it('rejects a wrong or truncated cookie, and a wrong ?token=', async () => {
    const name = `folio_session_${srv.port}`
    expect((await req('/', { cookie: `${name}=nope` })).status).toBe(401)
    expect((await req('/', { cookie: `${name}=${srv.session.slice(1)}` })).status).toBe(401)
    expect((await req('/', { cookie: `other=${srv.session}` })).status).toBe(401)
    expect((await req('/', { cookie: `${name}=${TOKEN}` })).status).toBe(401) // the URL token is not the cookie
    const r = await req('/?token=wrong')
    expect(r.status).toBe(401)
    expect(r.headers['set-cookie']).toBeUndefined()
  })

  it('exchanges ?token= once for an HttpOnly SameSite=Strict cookie and redirects without it', async () => {
    const own = await start({ distDir: path.join(tmp, 'dist'), docs, settingsFile: path.join(tmp, 's2.json'), cacheDir: path.join(tmp, 'cache2'), token: 'exchange-token-0123456789' })
    try {
      const r = await req(`/?token=${own.token}`, {}, 'GET', undefined, own.port)
      expect(r.status).toBe(302)
      expect(r.headers.location).toBe('/')
      const c = String(r.headers['set-cookie'])
      expect(c).toContain(`folio_session_${own.port}=${own.session}`)
      expect(c).not.toContain(own.token) // the cookie is not the URL token
      expect(c).toContain('HttpOnly')
      expect(c).toContain('SameSite=Strict')
      const page = await req('/', { cookie: c.split(';')[0] }, 'GET', undefined, own.port)
      expect(page.status).toBe(200)
      expect(page.body).toContain('folio')
      // the link is spent: the URL in history is not a credential any more
      const again = await req(`/?token=${own.token}`, {}, 'GET', undefined, own.port)
      expect(again.status).toBe(401)
      expect(again.headers['set-cookie']).toBeUndefined()
      expect((await req(`/?token=${own.token}`, { cookie: c.split(';')[0] }, 'GET', undefined, own.port)).status).toBe(200) // the cookie still works
    } finally {
      await own.close()
    }
  })

  it('keeps the query when it drops the token', async () => {
    const own = await start({ distDir: path.join(tmp, 'dist'), docs, settingsFile: path.join(tmp, 's3.json'), cacheDir: path.join(tmp, 'cache3'), token: 'query-token-0123456789' })
    try {
      expect((await req(`/?token=${own.token}&a=1`, {}, 'GET', undefined, own.port)).headers.location).toBe('/?a=1')
    } finally {
      await own.close()
    }
  })

  it('never redirects to another site: a raw backslash path is refused before the exchange (ticket 19)', async () => {
    const own = await start({ distDir: path.join(tmp, 'dist'), docs, settingsFile: path.join(tmp, 's5.json'), cacheDir: path.join(tmp, 'cache5'), token: 'redirect-token-0123456789' })
    try {
      for (const p of ['/\\evil.example.com/', '/\\/evil.example.com/', '/a\\b']) {
        const r = await req(`${p}?token=${own.token}`, {}, 'GET', undefined, own.port)
        expect(r.status, p).toBe(400)
        expect(r.headers.location, p).toBeUndefined()
        expect(r.headers['set-cookie'], p).toBeUndefined()
      }
      // the link was not spent by the refused requests
      expect((await req(`/?token=${own.token}`, {}, 'GET', undefined, own.port)).headers.location).toBe('/')
    } finally {
      await own.close()
    }
  })

  it('names the cookie after the port, so two instances do not overwrite each other', async () => {
    const other = await start({ distDir: path.join(tmp, 'dist'), docs, settingsFile: path.join(tmp, 's4.json'), cacheDir: path.join(tmp, 'cache4'), token: 'other-token-0123456789' })
    try {
      const a = String((await req(`/?token=${other.token}`, {}, 'GET', undefined, other.port)).headers['set-cookie']).split(';')[0]
      expect(a.startsWith(`folio_session_${other.port}=`)).toBe(true)
      expect(other.port).not.toBe(srv.port)
      // a browser sends both cookies to both servers: each still accepts its own
      const both = `${cookie.cookie}; ${a}`
      expect((await req('/', { cookie: both })).status).toBe(200)
      expect((await req('/', { cookie: both }, 'GET', undefined, other.port)).status).toBe(200)
    } finally {
      await other.close()
    }
  })
})

describe('cross-site requests', () => {
  it.each(['cross-site', 'same-site'])('rejects Sec-Fetch-Site: %s even with the cookie', async (site) => {
    expect((await req('/', { ...cookie, 'sec-fetch-site': site })).status).toBe(403)
    expect((await req('/api/getConfig', { ...cookie, 'sec-fetch-site': site, 'content-type': 'application/json' }, 'POST', '[]')).status).toBe(403)
    expect((await req('/api/events', { ...cookie, 'sec-fetch-site': site })).status).toBe(403)
    expect((await req('/doc/modules/img/a.png', { ...cookie, 'sec-fetch-site': site })).status).toBe(403)
  })

  it.each(['same-origin', 'none'])('accepts Sec-Fetch-Site: %s', async (site) => {
    expect((await req('/', { ...cookie, 'sec-fetch-site': site })).status).toBe(200)
  })

  it('rejects a foreign Origin on a POST, accepts our own', async () => {
    const json = { ...cookie, 'content-type': 'application/json' }
    expect((await req('/api/getConfig', { ...json, origin: 'https://evil.example.com' }, 'POST', '[]')).status).toBe(403)
    expect((await req('/api/getConfig', { ...json, origin: 'null' }, 'POST', '[]')).status).toBe(403)
    expect((await req('/api/getConfig', { ...json, origin: `http://127.0.0.1:${srv.port}` }, 'POST', '[]')).status).toBe(200)
  })

  it('wants JSON for a call, and POST only', async () => {
    expect((await req('/api/getConfig', { ...cookie, 'content-type': 'text/plain' }, 'POST', '[]')).status).toBe(415)
    expect((await req('/api/getConfig', cookie)).status).toBe(405)
    expect((await req('/api/nope', { ...cookie, 'content-type': 'application/json' }, 'POST', '[]')).status).toBe(404)
    expect((await req('/api/constructor', { ...cookie, 'content-type': 'application/json' }, 'POST', '[]')).status).toBe(404)
  })
})

describe('event streams', () => {
  it('closes the oldest stream when a fifth one opens', async () => {
    const open = () =>
      new Promise<http.IncomingMessage>((ok, fail) => {
        const r = http.get({ host: '127.0.0.1', port: srv.port, path: '/api/events', headers: cookie }, ok)
        r.on('error', fail)
      })
    const streams: http.IncomingMessage[] = []
    const closed: boolean[] = []
    for (let i = 0; i < 5; i++) {
      const res = await open()
      const k = i
      res.on('close', () => (closed[k] = true))
      res.resume()
      streams.push(res)
    }
    await new Promise((r) => setTimeout(r, 200))
    expect(closed[0]).toBe(true)
    expect(closed.slice(1).some(Boolean)).toBe(false)
    for (const r of streams) r.destroy()
  })
})

describe('headers on every response', () => {
  it('sends the CSP and the security headers on pages, errors, redirects and API answers', async () => {
    const answers = [
      await req('/', cookie),
      await req('/', {}), // 401
      await req('/', { ...cookie, host: 'evil.example.com' }), // 403
      await req('/missing.js', cookie), // 404
      await req(`/?token=${TOKEN}`), // 302
      await req('/api/getConfig', { ...cookie, 'content-type': 'application/json' }, 'POST', '[]'),
    ]
    for (const r of answers) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(r.headers[k.toLowerCase()], `${r.status} ${k}`).toBe(v)
    }
  })

  it('has the CSP of index.html in its header', () => {
    const html = readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8')
    const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)![1]
    expect(CSP).toBe(meta)
    expect(SECURITY_HEADERS['Content-Security-Policy'].startsWith(meta)).toBe(true)
  })
})

describe('/doc/ and static paths stay inside their roots', () => {
  it('serves an image and the page, and refuses everything that leaves', async () => {
    expect((await req('/doc/modules/img/a.png', cookie)).status).toBe(200)
    const out = [
      '/doc/../secret.txt',
      '/doc/modules/img/../../../../secret.txt',
      '/doc/%2e%2e%2f%2e%2e%2fsecret.txt',
      '/doc/modules/img/a.png::$DATA',
      '/doc/modules/img/CON.png', // a Windows device name
      '/doc/modules/img/%zz.png', // a bad escape
      '/doc/modules/img',
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%5csecret.txt',
      '/assets/..%2f..%2fsecret.txt',
      '//evil.example.com/x',
    ]
    for (const u of out) {
      const r = await req(u, cookie)
      expect([400, 404], u).toContain(r.status)
      expect(r.body, u).not.toContain('top secret')
    }
  })

  it('refuses a symlink that leaves the docs root', async () => {
    try {
      symlinkSync(tmp, path.join(docs, 'modules', 'img', 'out'), 'junction')
    } catch {
      return // no symlinks here: the contract suite covers a real junction on Windows
    }
    writeFileSync(path.join(tmp, 'outside.png'), 'png')
    expect((await req('/doc/modules/img/out/outside.png', cookie)).status).toBe(404)
  })

  it('sends the sandbox CSP and nosniff for an SVG', async () => {
    writeFileSync(path.join(docs, 'modules', 'img', 'v.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const r = await req('/doc/modules/img/v.svg', cookie)
    expect(r.status).toBe(200)
    expect(r.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox")
    expect(r.headers['x-content-type-options']).toBe('nosniff')
  })
})
