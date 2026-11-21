// Ticket 39: /evidence/<ticket path>/<index> and the evidence root. The route reads files from OUTSIDE
// the docs folder, so these tests try every way out: an unlisted index, a path in the URL, a file
// outside the root, a link out of the root, a type it must not serve, no root at all.
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseRange } from './evidence'
import { start, type Running } from './server'

interface Res {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

function req(srv: Running, p: string, headers: Record<string, string> = {}, method = 'GET', body?: string): Promise<Res> {
  return new Promise((ok, fail) => {
    const r = http.request({ host: '127.0.0.1', port: srv.port, path: p, method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => ok({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    r.on('error', fail)
    r.end(body)
  })
}
const auth = (srv: Running) => ({ cookie: `folio_session_${srv.port}=${srv.session}` })
const get = (srv: Running, p: string, h: Record<string, string> = {}, method = 'GET') => req(srv, p, { ...auth(srv), ...h }, method)
async function call(srv: Running, name: string, ...args: unknown[]): Promise<any> {
  const r = await req(srv, `/api/${name}`, { ...auth(srv), 'content-type': 'application/json' }, 'POST', JSON.stringify(args))
  const v = JSON.parse(r.body.toString('utf8'))
  if (r.status !== 200) throw new Error(v.error)
  return v
}

let tmp: string
let dist: string
let docs: string
let root: string
let withRoot: Running
let noRoot: Running
const VIDEO = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251))
const T = 'modules/pay/issues/04-refund-screen.md'
const U = (rel: string) => `/evidence/${T}/${rel}`
const url = (abs: string) => 'file:///' + abs.split(path.sep).join('/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')

/** The files the ticket's block lists, in order: the index each test uses. */
const LISTED = {
  png: 0,
  video: 1,
  scenarios: 2,
  writeUp: 3,
  zip: 4, // kind "file": listed, never served
  outside: 5, // a png outside the root
  svg: 6, // an image kind with a type that is not on the list
  missing: 7, // listed, not on disk
  viaLink: 8, // inside the root by name, outside by its real path
  mdAsImage: 9, // a .md listed as an image: the kind and the type must agree
} as const

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'folio-evidence-'))
  dist = path.join(tmp, 'dist')
  mkdirSync(dist)
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>folio</title>')
  docs = path.join(tmp, 'repo', 'docs')
  cpSync(path.join(__dirname, '..', '..', '..', 'fixtures', 'board-mirror'), docs, { recursive: true })

  root = path.join(tmp, 'Evidence')
  const ev = path.join(root, 'app', 'pay-04')
  mkdirSync(ev, { recursive: true })
  writeFileSync(path.join(ev, 'queue.png'), 'PNGDATA')
  writeFileSync(path.join(ev, 'demo.webm'), VIDEO)
  writeFileSync(path.join(ev, 'scenarios.md'), '1. Open a paid order. Expect the amount prefilled.\n')
  writeFileSync(path.join(ev, 'evidence.md'), '# Write-up\n')
  writeFileSync(path.join(ev, 'trace.zip'), 'ZIP')
  writeFileSync(path.join(ev, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  mkdirSync(path.join(tmp, 'outside'))
  writeFileSync(path.join(tmp, 'outside', 'secret.png'), 'SECRET')
  // a link inside the root that leads out of it (a junction on Windows needs no admin rights)
  symlinkSync(path.join(tmp, 'outside'), path.join(ev, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')

  const lines = [
    `- [queue.png](${url(path.join(ev, 'queue.png'))}) — image`,
    `- [demo.webm](${url(path.join(ev, 'demo.webm'))}) — video`,
    `- [scenarios.md](${url(path.join(ev, 'scenarios.md'))}) — scenarios`,
    `- [evidence.md](${url(path.join(ev, 'evidence.md'))}) — write-up`,
    `- [trace.zip](${url(path.join(ev, 'trace.zip'))}) — file`,
    `- [secret.png](${url(path.join(tmp, 'outside', 'secret.png'))}) — image`,
    `- [logo.svg](${url(path.join(ev, 'logo.svg'))}) — image`,
    `- [gone.png](${url(path.join(ev, 'gone.png'))}) — image`,
    `- [escape.png](${url(path.join(ev, 'escape', 'secret.png'))}) — image`,
    `- [scenarios-as-image.md](${url(path.join(ev, 'scenarios.md'))}) — image`,
  ]
  const ticket = path.join(docs, ...T.split('/'))
  const text = readFileSync(ticket, 'utf8')
  const head = text.slice(0, text.indexOf('<!-- factory:board begin'))
  writeFileSync(
    ticket,
    `${head}<!-- factory:board begin v1 -->\n## Board\n\n- Branch: \`feature/refunds\`\n\n### Evidence\n\nFolder: \`${ev.split(path.sep).join('/')}/\`\n\n${lines.join('\n')}\n<!-- factory:board end -->\n`,
  )

  const common = { distDir: dist, docs, cacheDir: path.join(tmp, 'cache') }
  withRoot = await start({ ...common, evidence: root, settingsFile: path.join(tmp, 'a.json') })
  noRoot = await start({ ...common, settingsFile: path.join(tmp, 'b.json') })
})

afterAll(async () => {
  await withRoot?.close()
  await noRoot?.close()
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('the evidence route serves what the block lists, from inside the root', () => {
  it('an image, with nosniff, a sandbox CSP, no-store and Accept-Ranges', async () => {
    const r = await get(withRoot, U(`${LISTED.png}`))
    expect(r.status).toBe(200)
    expect(r.body.toString()).toBe('PNGDATA')
    expect(r.headers['content-type']).toBe('image/png')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['content-security-policy']).toContain('sandbox')
    expect(r.headers['cache-control']).toBe('no-store')
    expect(r.headers['accept-ranges']).toBe('bytes')
  })

  it('scenarios and the write-up, as plain text (the panel renders them itself)', async () => {
    const s = await get(withRoot, U(`${LISTED.scenarios}`))
    expect(s.status).toBe(200)
    expect(s.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(s.body.toString()).toContain('Expect the amount prefilled')
    expect((await get(withRoot, U(`${LISTED.writeUp}`))).status).toBe(200)
  })

  it('needs the session cookie like every other route', async () => {
    expect((await req(withRoot, U(`${LISTED.png}`))).status).toBe(401)
  })

  it('is read-only', async () => {
    const r = await req(withRoot, U(`${LISTED.png}`), { ...auth(withRoot), 'content-type': 'application/json' }, 'POST', '[]')
    expect(r.status).toBe(405)
  })
})

describe('Range requests, for seeking in a video', () => {
  const v = (h?: string, method = 'GET') => get(withRoot, U(`${LISTED.video}`), h ? { range: h } : {}, method)

  it('the whole file without Range', async () => {
    const r = await v()
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toBe('video/webm')
    expect(r.headers['content-length']).toBe('1000')
    expect(r.body.equals(VIDEO)).toBe(true)
  })

  it('the first bytes, a middle range, an open end and a suffix', async () => {
    for (const [h, start, end] of [
      ['bytes=0-99', 0, 99],
      ['bytes=500-599', 500, 599],
      ['bytes=990-', 990, 999],
      ['bytes=-100', 900, 999],
      ['bytes=950-5000', 950, 999], // an end past the file is cut to it
    ] as const) {
      const r = await v(h)
      expect(r.status, h).toBe(206)
      expect(r.headers['content-range'], h).toBe(`bytes ${start}-${end}/1000`)
      expect(r.headers['content-length'], h).toBe(String(end - start + 1))
      expect(r.body.equals(VIDEO.subarray(start, end + 1)), h).toBe(true)
    }
  })

  it('416 for a range that starts past the end', async () => {
    const r = await v('bytes=1000-')
    expect(r.status).toBe(416)
    expect(r.headers['content-range']).toBe('bytes */1000')
    expect(r.body.length).toBe(0)
  })

  it('several ranges, or a malformed one, get the whole file', async () => {
    for (const h of ['bytes=0-1,5-6', 'bytes=abc', 'items=0-5', 'bytes=9-3']) {
      const r = await v(h)
      expect(r.status, h).toBe(200)
      expect(r.body.length, h).toBe(1000)
    }
  })

  it('HEAD gives the headers and no body', async () => {
    const r = await v('bytes=0-9', 'HEAD')
    expect(r.status).toBe(206)
    expect(r.headers['content-length']).toBe('10')
    expect(r.body.length).toBe(0)
  })
})

describe('the route refuses everything else (404, never a byte)', () => {
  const refused = async (p: string, srv = withRoot) => {
    const r = await get(srv, p)
    expect(r.status, p).toBe(404)
    expect(r.body.toString(), p).not.toContain('SECRET')
    expect(r.body.toString(), p).not.toContain('PNGDATA')
  }

  it('a kind "file" is listed, not served (C3)', () => refused(U(`${LISTED.zip}`)))
  it('a listed file outside the root', () => refused(U(`${LISTED.outside}`)))
  it('a listed file whose real path leaves the root through a link', () => refused(U(`${LISTED.viaLink}`)))
  it('an image kind of a type not on the list (SVG can run script)', () => refused(U(`${LISTED.svg}`)))
  it('a .md listed as an image: kind and type must agree', () => refused(U(`${LISTED.mdAsImage}`)))
  it('a listed file that is not on disk', () => refused(U(`${LISTED.missing}`)))
  it('an index past the list', () => refused(U('99')))
  it('an index that is not a number', async () => {
    for (const i of ['-1', '1e1', '0x1', '%31', '', '00000']) await refused(U(i))
  })
  it('a path where the ticket should be', async () => {
    for (const p of [
      '/evidence/..%2F..%2Fsecret.png/0',
      `/evidence/${encodeURIComponent(path.join(tmp, 'outside', 'secret.png'))}/0`,
      '/evidence/modules/pay/issues/01-card-capture.md/0', // a ticket with no evidence
      '/evidence/modules/pay/issues/nope.md/0',
      '/evidence/modules/pay/map.md/0',
      '/evidence/%E0%A4%A/0',
      '/evidence/0',
    ])
      await refused(p)
  })
  it('a folder the block marks "(not reachable)"', () => refused('/evidence/modules/pay/issues/08-chargebacks.md/0'))
  it('with no evidence root, nothing at all', async () => {
    for (const i of Object.values(LISTED)) await refused(U(`${i}`), noRoot)
  })

  it('fuzz: random indexes and paths never return 200 except the listed, allowed files', async () => {
    let seed = 0x3911
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed)
    const bits = ['..', '%2e%2e', '%2F', '/', '\\', 'modules', 'pay', 'issues', '04-refund-screen.md', T, '0', '1', '2', '3', '%00', 'C:', '~', 'secret.png']
    const allowed = new Set([0, 1, 2, 3].map((i) => U(`${i}`)))
    for (let n = 0; n < 200; n++) {
      const parts = Array.from({ length: 1 + (rnd() % 5) }, () => bits[rnd() % bits.length])
      const p = '/evidence/' + parts.join('/')
      const r = await get(withRoot, p)
      if (!allowed.has(p)) expect([400, 404], p).toContain(r.status)
      expect(r.body.toString(), p).not.toContain('SECRET')
    }
  })
})

describe('evidenceFiles: what the panel is told', () => {
  it('every listed file, and why one is not served', async () => {
    const l = await call(withRoot, 'evidenceFiles', T)
    expect(l.root).toBe(root)
    expect(l.reachable).toBe(true)
    expect(l.files.map((f: any) => [f.name, f.served ? 'served' : f.reason])).toEqual([
      ['queue.png', 'served'],
      ['demo.webm', 'served'],
      ['scenarios.md', 'served'],
      ['evidence.md', 'served'],
      ['trace.zip', 'type not served'],
      ['secret.png', 'outside the root'],
      ['logo.svg', 'type not served'],
      ['gone.png', 'missing'],
      ['escape.png', 'outside the root'],
      ['scenarios-as-image.md', 'type not served'],
    ])
    expect(l.files[1].size).toBe(1000)
  })

  it('no root: every file says "root not set"', async () => {
    const l = await call(noRoot, 'evidenceFiles', T)
    expect(l.root).toBe('')
    expect(new Set(l.files.map((f: any) => f.reason))).toEqual(new Set(['root not set']))
  })

  it('a "(not reachable)" folder, and a ticket with no evidence', async () => {
    expect(await call(withRoot, 'evidenceFiles', 'modules/pay/issues/08-chargebacks.md')).toMatchObject({ reachable: false, files: [] })
    expect(await call(withRoot, 'evidenceFiles', 'modules/pay/issues/01-card-capture.md')).toMatchObject({ folder: null, files: [] })
  })

  it('a path outside the docs folder is an error, as for readFile', async () => {
    await expect(call(withRoot, 'evidenceFiles', '../secret.md')).rejects.toThrow()
  })
})

describe('the evidence root: --evidence and Settings (Q8)', () => {
  it('--evidence wins for the run and is never saved', async () => {
    expect(await call(withRoot, 'getEvidence')).toEqual({ root, fromCommandLine: true, reachable: true })
    expect(existsSync(path.join(tmp, 'a.json'))).toBe(false)
  })

  it('Settings saves it as an extra key, and clearing removes the key', async () => {
    expect(await call(noRoot, 'getEvidence')).toEqual({ root: '', fromCommandLine: false, reachable: false })
    expect(await call(noRoot, 'setEvidence', root)).toEqual({ root, fromCommandLine: false, reachable: true })
    expect(JSON.parse(readFileSync(path.join(tmp, 'b.json'), 'utf8')).evidenceRoot).toBe(root)
    expect((await get(noRoot, U(`${LISTED.png}`))).status).toBe(200)
    expect(await call(noRoot, 'setEvidence', '')).toMatchObject({ root: '' })
    expect('evidenceRoot' in JSON.parse(readFileSync(path.join(tmp, 'b.json'), 'utf8'))).toBe(false)
    expect((await get(noRoot, U(`${LISTED.png}`))).status).toBe(404)
  })

  it('a folder that does not exist is saved but not reachable', async () => {
    const gone = path.join(tmp, 'nowhere')
    expect(await call(noRoot, 'setEvidence', gone)).toMatchObject({ root: gone, reachable: false })
    await call(noRoot, 'setEvidence', '')
  })

  it('refuses a relative path and a network path', async () => {
    await expect(call(noRoot, 'setEvidence', 'relative/folder')).rejects.toThrow()
    await expect(call(noRoot, 'setEvidence', '\\\\server\\share\\Evidence')).rejects.toThrow()
  })

  it('--evidence with a network path stops the start, like --docs', async () => {
    await expect(start({ distDir: dist, docs, evidence: '\\\\server\\share', settingsFile: path.join(tmp, 'c.json'), cacheDir: path.join(tmp, 'cache') })).rejects.toThrow('--evidence')
  })
})

describe('parseRange', () => {
  it('reads one range, and refuses the rest', () => {
    expect(parseRange(undefined, 10)).toBeNull()
    expect(parseRange('bytes=0-4', 10)).toEqual({ start: 0, end: 4 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-30', 10)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=-0', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable')
    expect(parseRange('bytes=-', 10)).toBeNull()
    expect(parseRange('bytes=5-2', 10)).toBeNull()
    expect(parseRange('bytes=0-1,3-4', 10)).toBeNull()
    expect(parseRange('bytes=99999999999999999999-', 10)).toBe('unsatisfiable')
  })
})
