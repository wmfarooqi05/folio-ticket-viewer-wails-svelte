// The contract suite (ticket 24): the same cases against the Go services and the Node server, so
// the two backends cannot drift. Every case runs once per backend with literal expectations; what
// each backend reported is also collected, and the last block checks the two reports are equal.
//
//   npm run test:contract        (from frontend/; needs Go on PATH, and Windows for the junction case)
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixturesDocs, goDriver, nodeDriver, sandbox, type Driver, type Handle, type Sandbox } from './driver'

const ROOTS = ['modules', 'handoffs', 'patterns']
const drivers: Driver[] = [goDriver, nodeDriver].filter((d) => d.available())

/** What each backend reported, by case, for the final comparison. */
const seen: Record<string, Record<string, unknown>> = { go: {}, node: {} }

interface Ctx {
  b: Handle
  sb: Sandbox
  /** the repo root (holds docs/) */
  repo: string
  docs: string
  /** every .md under the three roots, minus _, dot and node_modules folders: found without the services */
  expected: string[]
}

/** The files a scan must find, listed independently of both backends. */
function walkExpected(docs: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!(e.name === 'node_modules' || e.name.startsWith('.') || e.name.startsWith('_'))) walk(path.join(dir, e.name))
      } else if (e.name.toLowerCase().endsWith('.md')) out.push(path.relative(docs, path.join(dir, e.name)).split(path.sep).join('/'))
    }
  }
  for (const r of ROOTS) if (existsSync(path.join(docs, r))) walk(path.join(docs, r))
  return out.sort()
}

async function withBackend(d: Driver, fn: (c: Ctx) => Promise<void>, prep?: (c: { repo: string; docs: string; sb: Sandbox }) => void) {
  const sb = sandbox()
  const repo = path.join(sb.dir, 'repo')
  const docs = path.join(repo, 'docs')
  cpSync(fixturesDocs, docs, { recursive: true })
  prep?.({ repo, docs, sb })
  const b = await d.start(sb)
  try {
    await fn({ b, sb, repo, docs, expected: walkExpected(docs) })
  } finally {
    await b.stop()
    rmSync(sb.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

const use = async (c: Ctx) => c.b.call('setConfig', { repoRoot: c.repo })
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
/** Replaces the sandbox folder (random per run and per backend) so reports can be compared. */
function norm(v: unknown, c: Ctx): unknown {
  const dir = c.sb.dir
  const variants = [dir, JSON.stringify(dir).slice(1, -1), dir.replaceAll('\\', '/')]
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return variants.reduce((acc, d) => acc.replaceAll(d, '<DIR>'), x)
    if (Array.isArray(x)) return x.map(walk)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]))
    return x ?? null
  }
  return walk(v)
}
/** Go sends null for an empty slice; the Node server sends []. Same meaning. */
const list = (v: unknown) => (v ?? []) as string[]

for (const d of drivers) {
  describe(`contract: ${d.name}`, () => {
    beforeAll(() => d.prepare?.())
    const t = (name: string, fn: (c: Ctx) => Promise<void>, prep?: Parameters<typeof withBackend>[2]) => it(name, () => withBackend(d, fn, prep))
    const record = (key: string, v: unknown) => (seen[d.name][key] = v)

    // ---- folder checks and settings -------------------------------------------------

    t('checkRoot accepts a repo root and the docs folder itself, and says why not otherwise', async (c) => {
      const empty = path.join(c.sb.dir, 'empty')
      mkdirSync(empty)
      const repoCheck = await c.b.call('checkRoot', c.repo)
      expect(repoCheck).toMatchObject({ ok: true, repoRoot: c.repo, docsDir: 'docs', found: ROOTS, missing: [] })
      const docsCheck = await c.b.call('checkRoot', c.docs)
      expect(docsCheck).toMatchObject({ ok: true, repoRoot: c.repo, docsDir: 'docs' })
      const none = await c.b.call('checkRoot', empty)
      expect(none.ok).toBe(false)
      expect(none.message).toBe('expects modules/ · handoffs/ · patterns/ inside the folder')
      const notDir = await c.b.call('checkRoot', path.join(c.sb.dir, 'nope'))
      expect(notDir).toMatchObject({ ok: false, message: 'that is not a folder' })
      record('checkRoot', norm([repoCheck, docsCheck, none, notDir], c))
    })

    t('checkDocs reports which roots exist and rejects roots that leave the folder', async (c) => {
      const some = await c.b.call('checkDocs', c.repo, 'docs', ['modules', 'nothing'])
      expect(some).toMatchObject({ ok: true, found: ['modules'], missing: ['nothing'] })
      const bad = await c.b.call('checkDocs', c.repo, 'docs', ['..'])
      expect(bad).toMatchObject({ ok: false, message: 'the docs roots must be folders inside the docs folder' })
      const outside = await c.b.call('checkDocs', c.repo, '../x', ['modules'])
      expect(outside).toMatchObject({ ok: false, message: 'the docs folder must be inside the repo root' })
      record('checkDocs', norm([some, bad, outside], c))
    })

    t('settings: defaults, a valid save, UI state and the same file bytes', async (c) => {
      const first = await c.b.call('getConfig')
      expect(first).toMatchObject({ v: 1, repoRoot: '', docsDir: 'docs', docsRoots: ROOTS, theme: 'system', showMemory: true, sidebarWidth: 0, panelWidth: 0, sidebarCollapsed: false })
      const saved = await c.b.call('setConfig', { repoRoot: c.repo, theme: 'dark', adoPrUrl: 'https://dev.example.com/pr/{id}', showMemory: false })
      expect(saved).toMatchObject({ repoRoot: c.repo, theme: 'dark', showMemory: false })
      expect(await c.b.call('setSidebarWidth', 9999)).toBe(480)
      expect(await c.b.call('setSidebarWidth', 10)).toBe(200)
      expect(await c.b.call('setPanelWidth', 10)).toBe(320)
      expect(await c.b.call('setSidebarCollapsed', true)).toBe(true)
      const after = await c.b.call('getConfig')
      expect(after).toMatchObject({ sidebarWidth: 200, panelWidth: 320, sidebarCollapsed: true, theme: 'dark' })
      const file = readFileSync(c.sb.settingsFile, 'utf8')
      record('settings.json', norm(file, c))
      record('getConfig', norm([first, after], c))
    })

    t('settings: every validation rule, with the same message', async (c) => {
      const msgs: Record<string, string> = {}
      const bad = async (key: string, patch: object) => {
        const err = await c.b.call('setConfig', patch).then(
          () => '',
          (e: Error) => e.message,
        )
        expect(err, key).not.toBe('')
        msgs[key] = err
      }
      await bad('theme', { theme: 'blue' })
      await bad('docsDir', { docsDir: '../x' })
      await bad('docsDirAbs', { docsDir: 'C:\\x' })
      await bad('docsRoots', { docsRoots: ['..'] })
      await bad('template', { adoWorkItemUrl: 'https://x.example.com/' })
      await bad('http', { adoPrUrl: 'http://x.example.com/{id}' })
      await bad('missingRepo', { repoRoot: path.join(c.sb.dir, 'nope') })
      await bad('noRoots', { repoRoot: c.sb.dir })
      expect(msgs.theme).toBe('invalid settings: theme: must be system, light or dark')
      expect(msgs.docsRoots).toBe('invalid settings: docsRoots: ".." must be a relative folder inside the docs folder')
      expect(msgs.template).toBe('invalid settings: adoWorkItemUrl: must contain {id}')
      expect(msgs.http).toBe('invalid settings: adoPrUrl: must be an https:// URL')
      expect(msgs.missingRepo).toContain('repoRoot: must be an existing folder')
      expect(msgs.noRoots).toContain('docsRoots: none of the selected folders exist under')
      // a rejected patch changes nothing
      expect((await c.b.call('getConfig')).repoRoot).toBe('')
      record('validation', norm(msgs, c))
    })

    t('settings: unknown keys survive, hand edits are picked up, a corrupt file is moved aside', async (c) => {
      writeFileSync(c.sb.settingsFile, JSON.stringify({ v: 1, theme: 'light', zzz: { keep: [1, 2] }, adoPrUrl: 'https://old.example.com/{id}' }))
      expect((await c.b.call('getConfig')).theme).toBe('light') // read at start
      writeFileSync(c.sb.settingsFile, JSON.stringify({ v: 1, theme: 'light', zzz: { keep: [1, 2] }, adoPrUrl: 'https://hand.example.com/{id}' }))
      const next = await c.b.call('setConfig', { repoRoot: c.repo })
      expect(next.adoPrUrl).toBe('https://hand.example.com/{id}') // the hand edit was not overwritten
      const onDisk = JSON.parse(readFileSync(c.sb.settingsFile, 'utf8'))
      expect(onDisk.zzz).toEqual({ keep: [1, 2] })
      expect(onDisk.repoRoot).toBe(c.repo)
    }, ({ sb }) => writeFileSync(sb.settingsFile, JSON.stringify({ v: 1, theme: 'light', zzz: { keep: [1, 2] }, adoPrUrl: 'https://old.example.com/{id}' })))

    t('settings: a corrupt file gives the defaults and is renamed to .bad', async (c) => {
      expect((await c.b.call('getConfig')).theme).toBe('system')
      expect(existsSync(c.sb.settingsFile + '.bad')).toBe(true)
      expect(existsSync(c.sb.settingsFile)).toBe(false)
    }, ({ sb }) => writeFileSync(sb.settingsFile, '{ not json'))

    // ---- scan, read, stamps ---------------------------------------------------------

    t('scan lists the fixtures once, read returns every file, and the next scan is quiet', async (c) => {
      await use(c)
      const s1 = await c.b.call('scan')
      expect(s1.count).toBe(c.expected.length)
      expect(list(s1.changed)).toEqual(c.expected)
      expect(list(s1.removed)).toEqual([])
      expect(c.expected.some((p) => p.includes('_templates'))).toBe(false)
      const batch = await c.b.call('readBatch', c.expected)
      expect(batch.files.length).toBe(c.expected.length)
      expect(list(batch.missing)).toEqual([])
      expect(list(batch.failed)).toEqual([])
      for (const f of batch.files) {
        const disk = statSync(path.join(c.docs, f.path))
        expect(f.mtime).toBe(Math.floor(disk.mtimeMs))
        expect(f.text).toBe(readFileSync(path.join(c.docs, f.path), 'utf8').replace(/^\ufeff/, ''))
      }
      const s2 = await c.b.call('scan')
      expect(list(s2.changed)).toEqual([])
      record('scan', { count: s1.count, changed: list(s1.changed), batch: batch.files.map((f: any) => [f.path, f.text.length]) })
    })

    t('stamps: an edit and a delete are seen by scan; a deleted file reads as missing', async (c) => {
      await use(c)
      await c.b.call('scan')
      await c.b.call('readBatch', c.expected)
      const edit = c.expected[0]
      const gone = c.expected[1]
      writeFileSync(path.join(c.docs, edit), readFileSync(path.join(c.docs, edit), 'utf8') + '\nmore\n')
      rmSync(path.join(c.docs, gone))
      const s = await c.b.call('scan')
      expect(list(s.changed)).toEqual([edit])
      expect(list(s.removed)).toEqual([gone])
      const batch = await c.b.call('readBatch', [edit, gone])
      expect(batch.files.map((f: any) => f.path)).toEqual([edit])
      expect(list(batch.missing)).toEqual([gone])
      expect(list((await c.b.call('scan')).changed)).toEqual([])
      const again = await c.b.call('rescan')
      expect(list(again.changed).length).toBe(again.count) // rescan forgets what was delivered
    })

    t('read strips a byte order mark; paths that are not .md or leave the root fail the whole call', async (c) => {
      await use(c)
      mkdirSync(path.join(c.docs, 'modules', 'bom'), { recursive: true })
      writeFileSync(path.join(c.docs, 'modules', 'bom', 'a.md'), '\ufeff---\ntype: build\n---\n# x\n')
      const one = await c.b.call('readFile', 'modules/bom/a.md')
      expect(one.startsWith('---')).toBe(true)
      const batch = await c.b.call('readBatch', ['modules/bom/a.md'])
      expect(batch.files[0].text.startsWith('---')).toBe(true)
      const errors: string[] = []
      for (const p of ['../README.md', 'modules/a.txt', 'C:/Windows/x.md', '/etc/x.md', 'modules\\..\\..\\x.md', 'modules/a.md::$DATA', '', 'modules/a:b.md']) {
        errors.push(await c.b.call('readBatch', [p]).then(() => 'NO ERROR ' + p, () => 'rejected'))
        errors.push(await c.b.call('readFile', p).then(() => 'NO ERROR ' + p, () => 'rejected'))
      }
      expect(new Set(errors)).toEqual(new Set(['rejected']))
      // one bad path fails the call before any I/O
      await expect(c.b.call('readBatch', ['modules/bom/a.md', '../x.md'])).rejects.toThrow()
    })

    // ---- the cache ------------------------------------------------------------------

    t('the cache is the same file: written once, read back, dropped for another parser', async (c) => {
      await use(c)
      expect(await c.b.call('loadCache', 'p1')).toBeNull()
      await c.b.call('scan')
      await c.b.call('readBatch', c.expected)
      await c.b.call('saveCache', 'p1', { files: { a: 1 }, note: 'héllo' })
      expect(await c.b.call('loadCache', 'p1')).toEqual({ files: { a: 1 }, note: 'héllo' })
      expect(await c.b.call('loadCache', 'p2')).toBeNull()
      const files = readdirSync(c.sb.cacheDir)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^[0-9a-f]{12}\.json$/)
      const env = JSON.parse(readFileSync(path.join(c.sb.cacheDir, files[0]), 'utf8'))
      expect(Object.keys(env)).toEqual(['v', 'parserVersion', 'docsRoot', 'roots', 'stamps', 'index'])
      expect(env).toMatchObject({ v: 1, parserVersion: 'p1', roots: ROOTS })
      expect(env.docsRoot).toBe(c.docs.replaceAll('\\', '/').toLowerCase())
      expect(Object.keys(env.stamps).sort()).toEqual(c.expected)
      record('cache', { docsRoot: env.docsRoot.replace(c.sb.dir.replaceAll('\\', '/').toLowerCase(), '<DIR>'), stampKeys: Object.keys(env.stamps).sort(), sizes: Object.values(env.stamps).map((s: any) => s[1]) })
    })

    t('a corrupt cache is dropped and gives a cold start', async (c) => {
      await use(c)
      await c.b.call('scan')
      await c.b.call('readBatch', c.expected)
      await c.b.call('saveCache', 'p1', { a: 1 })
      const f = path.join(c.sb.cacheDir, readdirSync(c.sb.cacheDir)[0])
      writeFileSync(f, '{"v":1,')
      expect(await c.b.call('loadCache', 'p1')).toBeNull()
      expect(existsSync(f)).toBe(false)
    })

    // ---- the watcher ----------------------------------------------------------------

    t('watcher: edit, create, delete, rename and a new folder are reported within a second', async (c) => {
      await use(c)
      await c.b.call('scan')
      await c.b.call('readBatch', c.expected)
      const ev = await c.b.events()
      const issues = path.join(c.docs, 'modules', 'remove-service-account', 'issues')
      const rel = (n: string) => 'modules/remove-service-account/issues/' + n
      const timed = async (what: string, act: () => void) => {
        const t0 = Date.now()
        act()
        const cs = await ev.next(3000)
        const ms = Date.now() - t0
        expect(cs, what).not.toBeNull()
        expect(ms, what + ' took ' + ms + ' ms').toBeLessThan(1000)
        return cs!
      }
      const report: Record<string, unknown> = {}
      try {
        // edit
        const cs1 = await timed('edit', () => writeFileSync(path.join(issues, '02-cutover.md'), readFileSync(path.join(issues, '02-cutover.md'), 'utf8') + '\nedited\n'))
        expect(list(cs1.changed)).toEqual([rel('02-cutover.md')])
        expect(list(cs1.removed)).toEqual([])
        report.edit = cs1
        // create
        const cs2 = await timed('create', () => writeFileSync(path.join(issues, '90-new.md'), '---\ntype: build\n---\n# 90\n'))
        expect(list(cs2.changed)).toEqual([rel('90-new.md')])
        report.create = cs2
        // delete
        const cs3 = await timed('delete', () => rmSync(path.join(issues, '90-new.md')))
        expect(list(cs3.removed)).toEqual([rel('90-new.md')])
        report.delete = cs3
        // rename
        const cs4 = await timed('rename', () => renameSync(path.join(issues, '03-decide-key-owner.md'), path.join(issues, '03-renamed.md')))
        expect(list(cs4.removed)).toEqual([rel('03-decide-key-owner.md')])
        expect(list(cs4.changed)).toEqual([rel('03-renamed.md')])
        report.rename = cs4
        // a new folder with a file already in it
        const cs5 = await timed('new folder', () => {
          mkdirSync(path.join(c.docs, 'modules', 'fresh', 'issues'), { recursive: true })
          writeFileSync(path.join(c.docs, 'modules', 'fresh', 'issues', '01-a.md'), '# a\n')
        })
        expect(list(cs5.changed)).toEqual(['modules/fresh/issues/01-a.md'])
        report.newFolder = cs5
        // a folder deleted
        const cs7 = await timed('folder delete', () => rmSync(path.join(c.docs, 'modules', 'fresh'), { recursive: true }))
        expect(list(cs7.removed)).toEqual(['modules/fresh/issues/01-a.md'])
        report.folderDelete = cs7
        // a burst of saves is one event
        const cs8 = await timed('burst', () => {
          for (let i = 0; i < 5; i++) writeFileSync(path.join(issues, '02-cutover.md'), `burst ${i}\n`)
        })
        expect(list(cs8.changed)).toEqual([rel('02-cutover.md')])
        expect(await ev.next(600)).toBeNull()
        report.burst = cs8
        // skipped folders: _, dot and node_modules never produce an event
        for (const dir of ['_templates', '.hidden', 'node_modules']) {
          mkdirSync(path.join(c.docs, 'modules', dir, 'sub'), { recursive: true })
          writeFileSync(path.join(c.docs, 'modules', dir, 'sub', 'x.md'), '# x\n')
        }
        expect(await ev.next(800)).toBeNull()
        // a file that is not markdown
        writeFileSync(path.join(issues, 'notes.txt'), 'x')
        expect(await ev.next(600)).toBeNull()
        record('watcher', JSON.parse(JSON.stringify(report, (_k, v) => (v === null ? [] : v))))
      } finally {
        ev.close()
      }
    })

    // ---- /doc/ images ---------------------------------------------------------------

    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    const prepImages = ({ docs, sb }: { docs: string; sb: Sandbox }) => {
      mkdirSync(path.join(docs, 'modules', 'x', 'evidence'), { recursive: true })
      writeFileSync(path.join(docs, 'modules', 'x', 'evidence', 'a.png'), PNG)
      writeFileSync(path.join(docs, 'modules', 'x', 'evidence', 'b.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
      writeFileSync(path.join(docs, 'modules', 'x', 'evidence', 'c.txt'), 'text')
      // a file outside the docs root, and a junction that points at it
      const outside = path.join(sb.dir, 'outside')
      mkdirSync(outside)
      writeFileSync(path.join(outside, 'secret.png'), PNG)
      writeFileSync(path.join(sb.dir, 'repo', 'secret.png'), PNG)
      if (process.platform === 'win32') {
        const r = spawnSync('cmd', ['/c', 'mklink', '/J', path.join(docs, 'modules', 'x', 'linked'), outside], { encoding: 'utf8' })
        if (r.status !== 0) throw new Error('mklink /J failed: ' + r.stdout + r.stderr)
      }
    }

    t(
      '/doc/ serves images and refuses every way out of the root',
      async (c) => {
        await use(c)
        const base = '/doc/modules/x/evidence/'
        const ok = await c.b.raw('GET', base + 'a.png')
        expect(ok.status).toBe(200)
        expect(ok.headers['content-type']).toBe('image/png')
        expect(ok.headers['x-content-type-options']).toBe('nosniff')
        expect(Buffer.compare(ok.body, PNG)).toBe(0)
        const svg = await c.b.raw('GET', base + 'b.svg')
        expect(svg.status).toBe(200)
        expect(svg.headers['content-type']).toBe('image/svg+xml')
        expect(svg.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox")
        expect((await c.b.raw('HEAD', base + 'a.png')).status).toBe(200)
        expect((await c.b.raw('POST', base + 'a.png')).status).toBe(405)

        const refused: Record<string, number> = {}
        const urls = [
          base + 'c.txt', // not an image
          '/doc/modules/x/evidence/', // a folder
          '/doc/modules/x/evidence/missing.png',
          '/doc/modules/../../../secret.png', // dot-dot, as sent
          '/doc/modules/x/../../../secret.png',
          '/doc/%2e%2e/secret.png', // encoded
          '/doc/modules/%2e%2e/%2e%2e/%2e%2e/secret.png',
          '/doc/modules/x/..%2f..%2f..%2fsecret.png',
          '/doc/modules%5c..%5c..%5csecret.png', // backslashes
          '/doc/..%5csecret.png',
          '/doc//secret.png', // absolute
          '/doc/C:/Windows/system.png', // drive
          '/doc/C%3A/Windows/system.png',
          '/doc/c:secret.png',
          '/doc///server/share/a.png', // UNC
          '/doc/%5c%5cserver%5cshare%5ca.png',
          '/doc/%5c%5c%3f%5cC%3a%5ca.png', // \\?\C:\a.png
          base + 'a.png::$DATA', // alternate data streams
          base + 'a.png%3A%3A%24DATA',
          base + 'a.png:stream.png',
          base + 'a.png%00.png', // NUL
          '/doc/', // nothing
        ]
        for (const u of urls) {
          const r = await c.b.raw('GET', u)
          refused[u] = r.status
          expect(r.status, u).toBe(404)
          expect(r.body.equals(PNG), u).toBe(false)
        }
        if (process.platform === 'win32') {
          // a junction that leaves the root: the file behind it exists, and must not be served
          const via = await c.b.raw('GET', '/doc/modules/x/linked/secret.png')
          expect(via.status).toBe(404)
          refused['junction'] = via.status
        }
        record('doc', refused)
      },
      prepImages,
    )

    // ---- links ----------------------------------------------------------------------

    t('vscodeUrl escapes the path the same way', async (c) => {
      await use(c)
      mkdirSync(path.join(c.docs, 'modules', 'my notes'), { recursive: true })
      writeFileSync(path.join(c.docs, 'modules', 'my notes', 'a b #1.md'), '# x\n')
      const top = await c.b.call('vscodeUrl', 'modules/my notes/a b #1.md', 0)
      const line = await c.b.call('vscodeUrl', 'modules/my notes/a b #1.md', 12)
      const url = 'vscode://file/' + c.docs.replaceAll('\\', '/').split('/').map(encodeURIComponent).join('/').replaceAll('%3A', ':')
      expect(top).toBe(url + '/modules/my%20notes/a%20b%20%231.md')
      expect(line).toBe(top + ':12')
      await expect(c.b.call('vscodeUrl', '../x.md', 0)).rejects.toThrow()
      await expect(c.b.call('vscodeUrl', 'modules/a.txt', 0)).rejects.toThrow()
      record('vscodeUrl', norm([top, line], c))
    })
  })
}

// ---- the two backends read each other's files ---------------------------------------------

describe.skipIf(drivers.length < 2)('contract: cache and settings written by one backend are read by the other', () => {
  beforeAll(() => goDriver.prepare?.())
  for (const [first, second] of [
    [goDriver, nodeDriver],
    [nodeDriver, goDriver],
  ] as const) {
    it(`${first.name} writes, ${second.name} reads`, async () => {
      const sb = sandbox()
      const repo = path.join(sb.dir, 'repo')
      const docs = path.join(repo, 'docs')
      cpSync(fixturesDocs, docs, { recursive: true })
      const expected = walkExpected(docs)
      try {
        const a = await first.start(sb)
        await a.call('setConfig', { repoRoot: repo, theme: 'dark' })
        await a.call('scan')
        await a.call('readBatch', expected)
        await a.call('saveCache', 'px', { hello: 'world' })
        await a.stop()
        const b = await second.start(sb)
        try {
          expect((await b.call('getConfig')).theme).toBe('dark')
          expect(await b.call('loadCache', 'px')).toEqual({ hello: 'world' })
          const s = await b.call('scan')
          expect(list(s.changed)).toEqual([]) // the stamps came from the other backend's file
          expect(s.count).toBe(expected.length)
        } finally {
          await b.stop()
        }
      } finally {
        rmSync(sb.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      }
    })
  }
})

describe.skipIf(drivers.length < 2)('contract: the two backends report the same', () => {
  afterAll(() => undefined)
  it('on every case both ran', () => {
    const keys = Object.keys(seen.node)
    expect(keys.length).toBeGreaterThan(8)
    expect(Object.keys(seen.go).sort()).toEqual(keys.sort())
  })
  for (const key of ['checkRoot', 'checkDocs', 'getConfig', 'settings.json', 'validation', 'scan', 'cache', 'watcher', 'doc', 'vscodeUrl']) {
    it(key, () => {
      expect(seen.node[key], key).toBeDefined()
      expect(seen.node[key]).toEqual(seen.go[key])
    })
  }
})
