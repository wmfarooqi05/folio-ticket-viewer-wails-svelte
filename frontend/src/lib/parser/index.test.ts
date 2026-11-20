import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildIndex,
  extractFragment,
  parseFile,
  parseFrontmatter,
  parseItems,
  parseLegacy,
  parseLinks,
  resolveHref,
  resolveRef,
  scanText,
  updateIndex,
  type Index,
  type SourceFile,
  type TicketMeta,
} from './index'
import { buildIndexFromDisk, readDocsRoot } from './node'

// frontend/src/lib/parser -> repo root
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const fixtures = join(repoRoot, 'fixtures')
const docsRoot = join(fixtures, 'docs')

/* eslint-disable @typescript-eslint/no-explicit-any */
const expected = JSON.parse(readFileSync(join(fixtures, 'expected.json'), 'utf8')) as any

let files: SourceFile[]
let index: Index
const text = (path: string) => files.find((f) => f.path === path)!.text
const byLine = <T extends { line: number }>(xs: T[]) => [...xs].sort((a, b) => a.line - b.line)
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const tkt = (p: string) => index.files[p]
const meta = (p: string) => index.files[p].meta as TicketMeta
const find = (suffix: string) => Object.keys(index.files).find((p) => p.includes(suffix))!

beforeAll(async () => {
  files = await readDocsRoot(docsRoot)
  index = buildIndex(files)
})

describe('index shape', () => {
  it('indexes every fixture file except modules/_templates', () => {
    const onDisk = walk(docsRoot)
    expect(onDisk).toHaveLength(78)
    expect(files).toHaveLength(78)
    expect(Object.keys(index.files)).toHaveLength(76)
  })

  it('hides every path with a segment starting "_" (expected.hidden)', () => {
    for (const p of expected.hidden.absentFromIndex) expect(index.files[p]).toBeUndefined()
    expect(Object.keys(index.files).some((p) => p.split('/').some((s) => s.startsWith('_')))).toBe(false)
    // the hiding also holds on update
    const t = { path: 'modules/_templates/ticket.md', text: '# x', mtime: 1 }
    expect(updateIndex(index, [t], []).files[t.path]).toBeUndefined()
  })

  it('keeps the index plain JSON, so it can be cached and cloned', () => {
    expect(plain(index)).toEqual(index)
  })

  it('collects the spaces and ticket keys', () => {
    expect(index.spaces).toEqual([
      'cash-handling-workflow',
      'cash-movement-engine',
      'cloud-migration',
      'one-cash-mover',
      'remove-service-account',
    ])
    expect(Object.keys(index.tickets)).toHaveLength(64)
    expect(index.tickets['cash-handling-workflow 100']).toBe('modules/cash-handling-workflow/issues/100-final-cutover.md')
    expect(index.tickets['cash-handling-workflow 45']).toContain('step2b-payment-identification')
  })

  it('classifies kind, space and map flags', () => {
    expect(tkt('modules/remove-service-account/map.md')).toMatchObject({
      kind: 'map',
      space: 'remove-service-account',
      legacy: false,
      meta: { status: 'active', ado: 84997, superseded_by: null },
      map: { kanban: true, issuesDir: 'modules/remove-service-account/issues' },
    })
    expect(tkt('modules/one-cash-mover/map.md')).toMatchObject({ kind: 'map', legacy: true, meta: { status: null, ado: null, superseded_by: null } })
    expect(tkt('handoffs/migration-notes.md')).toMatchObject({ kind: 'doc', space: null, meta: null })
    expect(tkt('modules/cash-handling-workflow/answers.md').kind).toBe('doc')
  })

  it('sets hasMermaid on exactly the two mermaid files', () => {
    expect(Object.values(index.files).filter((r) => r.hasMermaid).map((r) => r.path).sort()).toEqual([
      'handoffs/ocm-cutover-handoff.md',
      'modules/cash-handling-workflow/issues/04-build-movecash.md',
    ])
  })

  it('reports the only intended cross-file problems', () => {
    const real = index.diagnostics.filter((d) => d.code !== 'LINK')
    expect(real.map((d) => `${d.code} ${d.path}`)).toEqual(['FM_REF modules/remove-service-account/issues/10-client-signoff.md'])
    expect(real[0].level).toBe('error')
    const anchorAbove = Object.values(index.files).flatMap((r) => r.diagnostics.filter((d) => d.code === 'ANCHOR_ABOVE').map(() => r.path))
    expect(anchorAbove.sort()).toEqual([
      'modules/remove-service-account/issues/05-grill-uat-schedule.md',
      'modules/remove-service-account/issues/11-vnet-rule.md',
    ])
    const links = index.diagnostics.filter((d) => d.code === 'LINK').map((d) => d.path)
    expect(links.sort()).toEqual([
      'modules/cash-handling-workflow/issues/16-build-audit.md',
      'modules/cash-movement-engine/issues/08-shared-matcher.md', // its ../map.md does not exist in the fixtures (not in expected.json)
      'modules/remove-service-account/issues/07-ops-delete-secret.md',
    ])
  })
})

describe('expected.json tickets (every TicketMeta, key, title, legacy, legacyRule)', () => {
  it('covers all 64 tickets', () => {
    expect(expected.tickets).toHaveLength(64)
  })

  for (const t of expected.tickets as any[]) {
    it(t.path.replace('modules/', ''), () => {
      const r = tkt(t.path)
      expect(r, 'record exists').toBeDefined()
      const { path, space, num, key, title, legacy, legacyRule, ...m } = t
      expect({ path: r.path, space: r.space, num: r.num, key: r.key, title: r.title, legacy: r.legacy, legacyRule: r.legacyRule }).toEqual({
        path,
        space,
        num,
        key,
        title,
        legacy,
        legacyRule,
      })
      expect(r.kind).toBe('ticket')
      expect(r.meta).toEqual(m)
    })
  }
})

describe('expected.json ambiguities (each decision holds)', () => {
  const ids = (expected.ambiguities as any[]).map((a) => a.id)
  const cwf = (n: string) => meta(find(`/cash-handling-workflow/issues/${n}`))
  const cwfRec = (n: string) => tkt(find(`/cash-handling-workflow/issues/${n}`))

  it('lists A1 to A21 and the T1 trap', () => {
    expect(ids).toEqual([...Array.from({ length: 21 }, (_, i) => `A${i + 1}`), 'T1'])
    for (const a of expected.ambiguities as any[]) if (a.id !== 'T1') expect(a.resolved).toBe(true)
  })

  it('A1/D2: rule 1 needs a leading "superseded" or "superseded by NN"', () => {
    expect(cwf('19-').status).toBe('done')
    expect(cwfRec('19-').legacyRule).toBe(6)
    expect(cwf('12-')).toMatchObject({ status: 'superseded' })
    expect(cwf('20-')).toMatchObject({ status: 'superseded' })
  })

  it('A2: legacy superseded_by is read from "superseded by NN"', () => {
    expect(cwf('12-').superseded_by).toBe('45')
    expect(cwf('20-').superseded_by).toBe('30')
  })

  it('A3/D5: curly quotes are normalised before matching', () => {
    expect(cwf('11-')).toMatchObject({ status: 'dropped', status_note: "Won't do — client dropped scope" })
    expect(cwfRec('11-').legacyRule).toBe(2)
  })

  it('A4: blocked beats the branch words', () => {
    expect(cwf('21-').status).toBe('blocked')
    expect(cwfRec('21-').legacyRule).toBe(3)
  })

  it('A5/D4: waiting_on is inferred for blocked legacy tickets only', () => {
    expect(cwf('21-').waiting_on).toBe('dba')
    expect(meta(find('/cloud-migration/issues/08-')).waiting_on).toBe('infra')
    expect(cwf('13-').waiting_on).toBe('ops') // the Type token wins
    expect(cwf('32-')).toMatchObject({ status: 'unknown', waiting_on: null }) // "Pending client answer"
  })

  it('A6/A7/D3: "merged" wins, "not merged" is in-review', () => {
    expect(cwf('39-').status).toBe('done')
    expect(cwfRec('39-').legacyRule).toBe(6)
    expect(cwf('38-').status).toBe('in-review')
    expect(cwfRec('38-').legacyRule).toBe(4)
    expect(cwf('14-').status).toBe('in-review')
  })

  it('A8: the first word wins on "Done (not merged to dev yet)"', () => {
    expect(cwf('31-').status).toBe('done')
  })

  it('A9: a person in Type sets waiting_on and is dropped from type, but never on a closed ticket', () => {
    expect(cwf('13-')).toMatchObject({ type: ['task'], waiting_on: 'ops' })
    const lg = parseLegacy('Status: done\nType: task + ops\n')
    expect(lg).toMatchObject({ type: ['task'], waiting_on: null })
    expect(parseLegacy('Status: superseded by 12\nType: ops\n').waiting_on).toBeNull()
    expect(parseLegacy('Status: dropped\nType: ops\n').waiting_on).toBeNull()
  })

  it('A10: unknown or missing Type gives [] (and a warning for a token), case-insensitive', () => {
    expect(cwf('25-').type).toEqual(['build'])
    const lg = parseLegacy('Status: open\nType: wizardry\n')
    expect(lg.type).toEqual([])
    expect(lg.warnings.map((w) => w.code)).toEqual(['LEGACY_TYPE'])
    expect(parseLegacy('Status: open\n').type).toEqual([])
  })

  it('A11: no Status line, or only a check mark, is unknown with a null note', () => {
    for (const n of ['34-', '35-']) {
      expect(cwf(n)).toMatchObject({ status: 'unknown', status_note: null })
      expect(cwfRec(n).legacyRule).toBe(8)
    }
  })

  it('A12/D5: no new vocabulary, but "Open (dropped from sprint 4)" is open', () => {
    expect(cwf('36-')).toMatchObject({ status: 'unknown', status_note: 'Unblocked — ready to build' })
    expect(cwf('37-').status).toBe('open')
    expect(cwf('15-').status).toBe('unknown') // parked
  })

  it('A13: bold label and backticks are accepted', () => {
    expect(cwf('08-')).toMatchObject({ status: 'in-progress', status_note: 'in progress' })
    expect(cwf('09-')).toMatchObject({ status: 'open', status_note: 'open' })
    expect(parseLegacy('**Status**: open\n').status).toBe('open')
  })

  it('A14: hyphen and en-dash ranges expand inclusively', () => {
    expect(cwf('09-').blocked_by).toEqual(['03', '04', '05', '06', '07'])
    expect(parseLegacy('Blocked by: 03-05\n').blocked_by).toEqual(['03', '04', '05'])
    expect(parseLegacy('Blocked by: 07–03\n')).toMatchObject({ blocked_by: [], blocked_note: '07–03' })
  })

  it('A15/A16: mixed lists are refs; a number followed by words, and free text, are notes', () => {
    expect(cwf('100-').blocked_by).toEqual(['01', '03', '04', '05'])
    expect(cwf('26-')).toMatchObject({ blocked_by: [], blocked_note: '05 (only the ADO part)' })
    expect(cwf('07-')).toMatchObject({ blocked_by: [], blocked_note: 'waiting for the DBA to confirm the ledger schema' })
    for (const none of ['none', '—', '-', 'n/a', '']) {
      expect(parseLegacy(`Blocked by: ${none}\n`)).toMatchObject({ blocked_by: [], blocked_note: null })
    }
  })

  it('A17: num is kept as written, key and refs are padded', () => {
    expect(cwfRec('100-')).toMatchObject({ num: '100', key: 'cash-handling-workflow 100' })
    expect(resolveRef('5', 'modules/cash-handling-workflow/issues/01-ledger-schema.md', index).path).toContain('05-decide-and-build')
    expect(resolveRef('005', 'modules/cash-handling-workflow/issues/01-ledger-schema.md', index).path).toContain('05-decide-and-build')
    expect(resolveRef('100', 'modules/cash-handling-workflow/issues/01-ledger-schema.md', index).ok).toBe(true)
  })

  it('A18: legacy is per file, so one space can be mixed', () => {
    expect(tkt('modules/one-cash-mover/issues/01-inventory.md').legacy).toBe(true)
    expect(tkt('modules/one-cash-mover/issues/05-build-movecash.md').legacy).toBe(false)
  })

  it('A19: a Label line stays body text', () => {
    expect(cwf('09-')).not.toHaveProperty('label')
  })

  it('A20: the number comes from the filename, the title is the H1 minus an optional number', () => {
    expect(cwfRec('02-')).toMatchObject({ num: '02', title: 'Cash handling entrypoint' })
    expect(cwfRec('26-')).toMatchObject({ num: '26' })
    expect(cwfRec('04-')).toMatchObject({ title: 'Build the move-cash step' })
  })

  it('A21: status_note is stripped and always present', () => {
    expect(cwf('05-').status_note).toBe('resolved') // "✅ resolved"
    for (const r of Object.values(index.files)) if (r.kind === 'ticket') expect(r.meta).toHaveProperty('status_note')
  })

  it('T1: the one dangling frontmatter ref', () => {
    const edge = index.edges.find((e) => e.ref === 'cloud-migration 07#q3')!
    expect(edge.to).toMatchObject({ ok: false, problem: 'no-anchor' })
    expect(index.edges.filter((e) => !e.to.ok)).toEqual([edge])
  })

  it('viewDefaults: Q items of closed tickets are in the index for the viewer to hide', () => {
    expect(expected.viewDefaults.hideClosedQuestions).toBe(true)
    const closedWithQ = Object.values(index.files).filter(
      (r) => r.kind === 'ticket' && ['done', 'dropped', 'superseded'].includes((r.meta as TicketMeta).status) && r.items.some((i) => i.kind === 'Q'),
    )
    expect(closedWithQ.length).toBeGreaterThan(0)
  })
})

describe('expected.json items', () => {
  for (const [path, items] of Object.entries<any[]>(expected.items)) {
    it(path.replace('modules/', ''), () => {
      expect(plain(tkt(path).items)).toEqual(byLine(items))
    })
  }

  it('parseItems agrees with the record, given the body and its line offset', () => {
    const rec = tkt('modules/remove-service-account/issues/03-decide-key-owner.md')
    const body = text(rec.path).split('\n').slice(rec.bodyLine - 1).join('\n')
    expect(parseItems(body, rec.bodyLine - 1, false)).toEqual(rec.items)
  })

  it('takes the first of a duplicate id and raises DUP_ANCHOR', () => {
    const r = parseFile({ path: 'x.md', mtime: 0, text: '# T\n\n### <a id="q1"></a>Q1 — a\n\n### <a id="q1"></a>Q1 — b\n' })
    expect(r.items.map((i) => i.title)).toEqual(['a'])
    expect(r.diagnostics.map((d) => d.code)).toContain('DUP_ANCHOR')
  })

  it('ignores items inside code fences and anchor-only headings', () => {
    const txt = '# T\n\n```md\n### Q1 — fenced\n```\n\n### <a id="foo"></a>Intro\n\n~~~~\n### Q2 — x\n~~~\n### Q3 — still fenced\n~~~~\n'
    expect(parseItems(txt, 0, false)).toEqual([])
  })

  it('reads the legacy "(answered date)" suffix only for legacy files', () => {
    const txt = '### Q7 — Why (answered 2026-10-14, by the client)\n'
    expect(parseItems(txt, 0, true)[0]).toMatchObject({ title: 'Why', state: 'answered', stateNote: '2026-10-14' })
    expect(parseItems(txt, 0, false)[0]).toMatchObject({ state: 'open' })
  })
})

const PARTIAL_LINKS_FILE = 'modules/remove-service-account/map.md'

describe('expected.json links', () => {
  for (const [path, links] of Object.entries<any[]>(expected.links)) {
    it(path.replace('modules/', ''), () => {
      const got = plain(tkt(path).links)
      const shape = (l: any, resolved: any) => ({ href: l.href, text: l.text, line: l.line, image: l.image, resolved })
      const want = links.map((l) => shape(l, l.resolved))
      if (path === PARTIAL_LINKS_FILE) {
        // The oracle lists only 4 of this map's 18 links (the others are table rows and prose
        // that the oracle author did not record), so here each listed link must be present.
        for (const w of want) {
          const g = got.find((x: any) => x.href === w.href && x.line === w.line)
          expect(g, `link ${w.href}`).toBeDefined()
          expect(shape(g!, g!.resolved ?? null)).toEqual(w)
        }
        expect(got.length).toBeGreaterThan(want.length)
      } else {
        // Every other file lists all of its links: assert the full list, in order.
        expect(got.map((g: any) => shape(g, g.resolved ?? null))).toEqual(want)
      }
    })
  }

  it('parseLinks finds links and images, skipping fences and code spans', () => {
    const body = ['[a](x.md#q1) and ![img](p/a.png "t") `[no](code.md)`', '```', '[fenced](f.md)', '```', '[b](<../y z.md>)', '[ext](https://e.com/a_(b))'].join('\n')
    const ls = parseLinks(body, 10)
    expect(ls.map((l) => [l.href, l.image, l.line])).toEqual([
      ['x.md#q1', false, 11],
      ['p/a.png', true, 11],
      ['../y z.md', false, 15],
      ['https://e.com/a_(b', false, 16],
    ])
  })

  it('flags ticket-shaped link text (section 5)', () => {
    const ls = parseLinks('[05 Q3](a.md) [one-cash-mover 05](b.md) [Q3](#q3) [map](c.md) [the audit spec](d.md)', 0)
    expect(ls.map((l) => l.ticketText)).toEqual([true, true, true, false, false])
  })
})

describe('resolveHref', () => {
  const from = 'modules/remove-service-account/issues/03-decide-key-owner.md'
  it('treats http, mailto and vscode as external', () => {
    for (const h of ['https://a.b/c', 'http://a.b', 'mailto:a@b.c', 'vscode://file/x']) {
      expect(resolveHref(h, from, index)).toMatchObject({ kind: 'external', ok: true })
    }
  })
  it('refuses every other scheme (javascript:, file:, data:, ftp:)', () => {
    for (const h of ['javascript:alert(1)', 'JavaScript:alert(1)', 'file:///c:/x', 'data:text/html,x', 'ftp://a.b/c']) {
      expect(resolveHref(h, from, index)).toMatchObject({ kind: 'external', ok: false, problem: 'bad-scheme' })
    }
  })
  it('strips a query, turns backslashes into slashes and decodes per segment', () => {
    const want = 'modules/remove-service-account/issues/01-entrypoints-and-callers.md'
    expect(resolveHref('01-entrypoints-and-callers.md?plain=1#ac1', from, index)).toMatchObject({ path: want, ok: true, itemId: 'ac1' })
    expect(resolveHref('..\\issues\\01-entrypoints-and-callers.md', from, index).path).toBe(want)
    // %2F is part of a name, not a separator: it must not become an extra path segment
    const enc = resolveHref('..%2Fissues%2F01-entrypoints-and-callers.md', from, index)
    expect(enc).toMatchObject({ ok: false, problem: 'no-file' })
    expect(enc.path).toBe('modules/remove-service-account/issues/../issues/01-entrypoints-and-callers.md') // one literal segment
    expect(resolveHref('%2E%2E/%2E%2E/%2E%2E/%2E%2E/x.md', from, index).kind).toBe('outside')
  })
  it('resolves a bare fragment against the current file', () => {
    expect(resolveHref('#d1', from, index)).toEqual({ kind: 'internal', path: from, fragment: 'd1', itemId: 'd1', ok: true })
    expect(resolveHref('#nope', from, index)).toMatchObject({ ok: false, problem: 'no-anchor' })
  })
  it('joins, normalises and percent-decodes', () => {
    expect(resolveHref('./../issues/./01-entrypoints-and-callers.md', from, index).path).toBe('modules/remove-service-account/issues/01-entrypoints-and-callers.md')
    expect(resolveHref('01-entrypoints-and-callers%2Emd', from, index).ok).toBe(true)
  })
  it('marks a path above the docs root as outside, with no problem', () => {
    const r = resolveHref('../../../../x.md', from, index)
    expect(r).toMatchObject({ kind: 'outside', path: null, ok: false })
    expect(r.problem).toBeUndefined()
  })
  it('falls back through item id, explicit anchor and heading slug', () => {
    const p = 'modules/cash-handling-workflow/step2b-payment-identification/issues/41-grill-payment-ids.md'
    expect(resolveHref(`${p.split('/').pop()}#q35-answered--2026-10-14`, p, index)).toMatchObject({ ok: true, itemId: 'q35' })
    expect(resolveHref('#done-when', from, index)).toMatchObject({ ok: true, itemId: null })
    expect(resolveHref('#Q35', p, index)).toMatchObject({ ok: true, fragment: 'q35' })
  })
})

describe('expected.json refs (frontmatter references)', () => {
  for (const [path, refs] of Object.entries<any[]>(expected.refs)) {
    it(path.replace('modules/', ''), () => {
      const got = index.edges
        .filter((e) => e.from === path)
        .map((e) => ({ field: e.field, ref: e.ref, path: e.to.path, fragment: e.to.fragment, itemId: e.to.itemId, ok: e.to.ok, ...(e.to.problem ? { problem: e.to.problem } : {}) }))
      expect(got).toEqual(refs)
    })
  }

  it('resolveRef handles every ref grammar and rejects the rest', () => {
    const from = 'modules/remove-service-account/issues/06-dba-rotate-sql-login.md'
    expect(resolveRef('05#q3', from, index)).toMatchObject({ ok: true, itemId: 'q3' })
    expect(resolveRef('one-cash-mover 05#q3', from, index)).toMatchObject({ ok: true, itemId: 'q3' })
    expect(resolveRef('one-cash-mover#q3', from, index).path).toBe('modules/one-cash-mover/map.md')
    expect(resolveRef('99', from, index)).toMatchObject({ ok: false, problem: 'no-file' })
    expect(resolveRef('05#q9', from, index)).toMatchObject({ ok: false, problem: 'no-anchor' })
    expect(resolveRef('not a ref!', from, index)).toMatchObject({ ok: false, problem: 'bad-ref' })
    expect(resolveRef('05', 'handoffs/migration-notes.md', index)).toMatchObject({ ok: false, problem: 'bad-ref' })
  })

  it('marks cross-space edges', () => {
    const e = index.edges.filter((x) => x.from.endsWith('07-ops-delete-secret.md'))
    expect(e.map((x) => x.crossSpace)).toEqual([true, true, true, true])
    expect(index.edges.find((x) => x.field === 'superseded_by' && x.from.includes('09-old-cutover'))!.crossSpace).toBe(false)
  })

  it('turns legacy refs into edges too', () => {
    const e = index.edges.filter((x) => x.from.endsWith('/12-first-parking.md'))
    expect(e.map((x) => [x.field, x.ref, x.to.ok])).toEqual([
      ['blocked_by', '03', true],
      ['superseded_by', '45', true],
    ])
  })
})

describe('expected.json textRefs (scanText)', () => {
  for (const [path, refs] of Object.entries<any[]>(expected.textRefs)) {
    it(path.replace('modules/', ''), () => {
      const lines = text(path).split('\n')
      // like the renderer, scan body text only (not frontmatter) and blank out real links first (offsets stay the same)
      const blank = (ln: string) => ln.replace(/!?\[[^\]]*\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
      const found = lines.flatMap((ln, i) => (i + 1 < tkt(path).bodyLine ? [] : scanText(blank(ln), path, index).map((r) => ({ ...r, line: i + 1, slice: ln.slice(r.start, r.end) }))))
      // the count per line: exactly the oracle's linked refs, nothing extra
      const perLine = (xs: { line: number }[]) => xs.reduce<Record<number, number>>((a, x) => ({ ...a, [x.line]: (a[x.line] ?? 0) + 1 }), {})
      expect(perLine(found)).toEqual(perLine(refs.filter((e) => e.kind !== 'none')))
      for (const e of refs) {
        const hit = found.find((f) => f.line === e.line && f.slice === e.text)
        if (e.kind === 'none') {
          expect(found.find((f) => f.line === e.line && f.slice.includes(e.text)), `${e.text} must stay plain`).toBeUndefined()
          continue
        }
        expect(hit, e.text).toBeDefined()
        expect(hit!.kind).toBe(e.kind)
        if (e.kind === 'ado') {
          expect(hit!.ado).toBe(e.ado)
          expect(hit!.to).toBeNull()
        } else expect(hit!.to).toMatchObject({ ok: true, path: e.target })
      }
    })
  }

  it('links an item reference, and a ticket reference whose item does not exist', () => {
    const from = 'handoffs/migration-notes.md'
    const a = scanText('see one-cash-mover 05 Q3 now', from, index)
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ kind: 'item', start: 4, end: 24 })
    expect(a[0].to).toMatchObject({ ok: true, itemId: 'q3' })
    const b = scanText('one-cash-mover 05 Q9', from, index)
    expect(b).toMatchObject([{ kind: 'ticket', start: 0, end: 17 }])
  })

  it('does not link unresolved tickets or bare numbers, and ignores a "ticket NN" without a space', () => {
    expect(scanText('cloud-migration 99, ticket 77, order 51234', 'modules/cloud-migration/issues/07-decide-region.md', index)).toEqual([])
    expect(scanText('ticket 07', 'handoffs/migration-notes.md', index)).toEqual([])
    expect(scanText('ticket 07', 'modules/cloud-migration/issues/08-build-vnet.md', index)).toMatchObject([{ kind: 'ticket' }])
    // case-insensitive, and the cached space regex gives the same answer twice
    for (let i = 0; i < 2; i++) {
      expect(scanText('See Ticket 07 and TICKET 07', 'modules/cloud-migration/issues/08-build-vnet.md', index)).toMatchObject([{ kind: 'ticket', start: 4 }, { kind: 'ticket', start: 18 }])
      expect(scanText('cloud-migration 07', 'handoffs/migration-notes.md', index)).toHaveLength(1)
    }
  })
})

describe('extractFragment', () => {
  const p = 'modules/remove-service-account/issues/03-decide-key-owner.md'
  const rec = () => tkt(p)
  it('returns the item line range, by id or follow-up slug', () => {
    expect(extractFragment(text(p), rec(), 'q3')).toEqual({ start: 33, end: 34 })
    expect(extractFragment(text(p), rec(), 'Q3')).toEqual({ start: 33, end: 34 })
    const p41 = 'modules/cash-handling-workflow/step2b-payment-identification/issues/41-grill-payment-ids.md'
    expect(extractFragment(text(p41), tkt(p41), 'q35-answered--2026-10-14')).toEqual({ start: 22, end: 28 })
  })
  it('returns the section of a plain heading', () => {
    expect(extractFragment(text(p), rec(), 'decisions')).toEqual({ start: 36, end: 42 })
    expect(extractFragment(text(p), rec(), 'outcome')).toEqual({ start: 52, end: 54 })
  })
  it('starts an anchor-above item on the anchor line', () => {
    const p5 = 'modules/remove-service-account/issues/05-grill-uat-schedule.md'
    expect(extractFragment(text(p5), tkt(p5), 'q1')).toEqual({ start: 23, end: 26 })
  })
  it('returns null for an unknown fragment', () => {
    expect(extractFragment(text(p), rec(), 'q9')).toBeNull()
  })
})

describe('parseFrontmatter', () => {
  it('reads the YAML subset', () => {
    const fm = parseFrontmatter('---\ntype: [decision, "build it"]  # why\nstatus: open\nstatus_note: "a: b # c"\nafk: true\npr: [1, 2]\nado: 84997\nblocked_by: ["05#q3", \'x y\']\n\n# a comment\nsuperseded_by: null\n---\nbody')
    expect(fm).toEqual({
      type: ['decision', 'build it'],
      status: 'open',
      status_note: 'a: b # c',
      afk: true,
      pr: [1, 2],
      ado: 84997,
      blocked_by: ['05#q3', 'x y'],
      superseded_by: null,
    })
  })
  it('returns null without leading or closing ---', () => {
    expect(parseFrontmatter('# Title\n')).toBeNull()
    expect(parseFrontmatter('---\nstatus: open\n')).toBeNull()
  })
  it('skips a line outside the subset with FM_PARSE and keeps the rest', () => {
    const r = parseFile({ path: 'modules/a/issues/01-x.md', mtime: 0, text: '---\nstatus: open\n  nested: no\nstatus_note: [broken\nafk: true\n---\n# 01 — T\n' })
    expect(r.diagnostics.filter((d) => d.code === 'FM_PARSE').map((d) => d.line)).toEqual([3, 4])
    expect(r.meta).toMatchObject({ status: 'open', afk: true, status_note: null })
    expect(r.bodyLine).toBe(7)
  })
  it('flags enum values it does not know', () => {
    const r = parseFile({ path: 'modules/a/issues/01-x.md', mtime: 0, text: '---\nstatus: wip\nwaiting_on: boss\n---\n' })
    expect(r.meta).toMatchObject({ status: 'unknown', waiting_on: null })
    expect(r.diagnostics.map((d) => d.code)).toEqual(['FM_ENUM', 'FM_ENUM'])
  })
  it('reports FM_PARSE on line 1 for a block that never closes, and reads the file as legacy', () => {
    const r = parseFile({ path: 'modules/a/issues/01-x.md', mtime: 0, text: '---\nstatus: done\n\n# 01 — T\n\nStatus: open\n' })
    expect(r.legacy).toBe(true)
    expect(r.diagnostics.filter((d) => d.code === 'FM_PARSE')).toMatchObject([{ line: 1, level: 'error' }])
    expect(parseFrontmatter('---\nstatus: done\n')).toBeNull()
  })
  it('keeps the raw token text of reference fields, so [02] stays "02"', () => {
    const fm = parseFrontmatter('---\nblocked_by: [02, 007]\nrelated: [05#q3]\nsuperseded_by: 03\npr: [02]\n---\n')
    expect(fm).toEqual({ blocked_by: ['02', '007'], related: ['05#q3'], superseded_by: '03', pr: [2] })
    const r = parseFile({ path: 'modules/a/issues/04-x.md', mtime: 0, text: '---\nblocked_by: [02]\nsuperseded_by: 03\n---\n' })
    expect(r.meta).toMatchObject({ blocked_by: ['02'], superseded_by: '03' })
  })
  it('puts FM_ENUM on the line of the key that is wrong', () => {
    const r = parseFile({ path: 'modules/a/issues/01-x.md', mtime: 0, text: '---\ntype: build\nstatus: wip\n\nwaiting_on: boss\n---\n' })
    expect(r.diagnostics.map((d) => [d.code, d.line])).toEqual([['FM_ENUM', 3], ['FM_ENUM', 5]])
    const m = parseFile({ path: 'modules/a/map.md', mtime: 0, text: '---\nado: null\nstatus: nope\n---\n' })
    expect(m.diagnostics.map((d) => [d.code, d.line])).toEqual([['FM_ENUM', 3]])
  })
  it('puts FM_REF on the line of the field, for migrated and legacy files', () => {
    const a = { path: 'modules/a/issues/01-x.md', mtime: 0, text: '---\ntype: task\nstatus: open\nblocked_by: ["09"]\n---\n# 01 — A\n' }
    const b = { path: 'modules/a/issues/02-y.md', mtime: 0, text: '# 02 — B\n\nStatus: open\nType: task\nBlocked by: 07\n\n## Why\n' }
    const c = { path: 'modules/a/issues/03-z.md', mtime: 0, text: '# 03 — C\n\nStatus: superseded by 08\nType: task\n' }
    const idx = buildIndex([a, b, c])
    const refs = idx.diagnostics.filter((d) => d.code === 'FM_REF').map((d) => [d.path.split('/').pop(), d.level, d.line])
    expect(refs).toEqual([
      ['01-x.md', 'error', 4],
      ['02-y.md', 'warning', 5], // legacy branch: a warning, on the "Blocked by:" line
      ['03-z.md', 'warning', 3],
    ])
    expect(idx.files[b.path].fmLines).toEqual({ status: 3, superseded_by: 3, waiting_on: 3, blocked_by: 5 })
  })
  it('accepts CRLF files', () => {
    const r = parseFile({ path: 'modules/a/issues/01-x.md', mtime: 0, text: '---\r\nstatus: done\r\n---\r\n\r\n# 01 — T\r\n' })
    expect(r).toMatchObject({ legacy: false, title: 'T', bodyLine: 4 })
    expect((r.meta as TicketMeta).status).toBe('done')
  })
})

describe('parseLegacy rule table', () => {
  const rule = (s: string) => {
    const l = parseLegacy(`Status: ${s}\n`)
    return [l.status, l.legacyRule]
  }
  it('applies rules 1 to 8 in order', () => {
    expect(rule('superseded')).toEqual(['superseded', 1])
    expect(rule('Dropped — superseded by 30')).toEqual(['superseded', 1])
    expect(rule('Resolved (superseded by the D3 amendment)')).toEqual(['done', 6])
    expect(rule('wontfix')).toEqual(['dropped', 2])
    expect(rule('Blocked on DBA')).toEqual(['blocked', 3])
    expect(rule('built on branch x')).toEqual(['in-review', 4])
    expect(rule('built on claude/x, not merged')).toEqual(['in-review', 4])
    expect(rule('built on claude/x, merged')).toEqual(['done', 6])
    expect(rule('Built on claude/x, not yet merged')).toEqual(['in-review', 4])
    expect(rule('Built on claude/x, NOT merged to dev')).toEqual(['in-review', 4])
    expect(rule('Built on claude/x. Not merged; merge later')).toEqual(['in-review', 4])
    expect(rule('Built on claude/x, merged to dev (not yet deployed)')).toEqual(['done', 6])
    expect(rule('Not merged — built on claude/x')).toEqual(['in-review', 4])
    expect(rule('building')).toEqual(['in-progress', 5])
    expect(rule('answered 2026-10-14')).toEqual(['done', 6])
    expect(rule('not started')).toEqual(['open', 7])
    expect(rule('parked')).toEqual(['unknown', 8])
  })
  it('D5: matches through typography (dashes, curly double quotes, leading quotes) but keeps the note', () => {
    expect(rule('In–progress')).toEqual(['in-progress', 5]) // en dash
    expect(rule('In‑progress')).toEqual(['in-progress', 5]) // non-breaking hyphen
    expect(rule('“Done”')).toEqual(['done', 6])
    expect(rule('‘Won’t do’')).toEqual(['dropped', 2])
    expect(rule('"Resolved"')).toEqual(['done', 6])
    // still no new vocabulary
    expect(rule('“Parked”')).toEqual(['unknown', 8])
    // status_note keeps the text as written, apart from the oracle's stripping and apostrophes
    expect(parseLegacy('Status: In–progress\n').status_note).toBe('In–progress')
    expect(parseLegacy('Status: “Done”\n').status_note).toBe('“Done”')
  })
  it('reads only lines before the first ## heading, outside fences', () => {
    const body = '# T\n\n```\nStatus: blocked\n```\nStatus: open\nType: build\n\n## Why\nStatus: done\n'
    expect(parseLegacy(body)).toMatchObject({ status: 'open', type: ['build'] })
  })
  it('maps Type tokens', () => {
    expect(parseLegacy('Type: fix\n').type).toEqual(['bug'])
    expect(parseLegacy('Type: task (AFK)\n')).toMatchObject({ type: ['task'], afk: true })
    expect(parseLegacy('Type: decision + build\n').type).toEqual(['decision', 'build'])
  })
})

describe('updateIndex', () => {
  const p1 = 'modules/remove-service-account/issues/02-cutover.md'
  const p2 = 'modules/remove-service-account/issues/01-entrypoints-and-callers.md'

  it('buildIndex is updateIndex over an empty index', () => {
    const empty = buildIndex([])
    expect(updateIndex(empty, files, [])).toEqual(index)
  })

  it('re-parses only the changed files and does not touch the input index', () => {
    const before = plain(index)
    const next = updateIndex(index, [{ path: p1, text: text(p1).replace('# 02', '# 02 (edited)'), mtime: 99 }], [])
    expect(next.files[p1].title).toContain('(edited)')
    expect(next.files[p1].mtime).toBe(99)
    // unchanged records keep the very same parsed arrays
    expect(next.files[p2].headings).toBe(index.files[p2].headings)
    expect(next.files[p2].items).toBe(index.files[p2].items)
    expect(plain(index)).toEqual(before)
    expect(Object.keys(next.files)).toHaveLength(76)
  })

  it('reruns the cross-file pass when a target is removed or added', () => {
    const gone = updateIndex(index, [], [p2])
    expect(gone.files[p2]).toBeUndefined()
    expect(gone.tickets['remove-service-account 01']).toBeUndefined()
    const link = gone.files[p1].links.find((l) => l.href.startsWith('01-'))!
    expect(link.resolved).toMatchObject({ ok: false, problem: 'no-file' })
    expect(gone.edges.find((e) => e.from === p1 && e.ref === '01')!.to.ok).toBe(false)
    const back = updateIndex(gone, [files.find((f) => f.path === p2)!], [])
    expect(back.files[p1].links.find((l) => l.href.startsWith('01-'))!.resolved!.ok).toBe(true)
    expect(plain(back.edges)).toEqual(plain(index.edges))
  })

  it('reports a duplicate ticket number', () => {
    const dup = updateIndex(index, [{ path: 'modules/remove-service-account/issues/02-other.md', text: '# 02 — Other\n', mtime: 1 }], [])
    expect(dup.diagnostics.filter((d) => d.code === 'DUP_NUM')).toHaveLength(1)
  })
})

describe('standalone module', () => {
  it('index.ts has no imports and no DOM, Node or Svelte use (it builds to a standalone lib.mjs)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')
    expect(src).not.toMatch(/^\s*(import|export\s.*\sfrom)/m)
    expect(src).not.toMatch(/(document|window|node:|require\()/)
  })
})

describe('buildIndexFromDisk (the Node adapter)', () => {
  it('matches buildIndex over the same files', async () => {
    const onDisk = await buildIndexFromDisk(docsRoot)
    expect(plain(onDisk).spaces).toEqual(index.spaces)
    expect(Object.keys(onDisk.files).sort()).toEqual(Object.keys(index.files).sort())
    expect(onDisk.edges).toEqual(index.edges)
  })
})

describe('performance (04 Q1: batch under 50 ms, cold build under 300 ms)', () => {
  // The 78 fixtures copied 14 times with the space names suffixed (so links still resolve),
  // built in memory: no disk in the timed path, and a fresh set of strings for every call.
  function makeCorpus(copies: number): SourceFile[] {
    const out: SourceFile[] = []
    for (let c = 0; c < copies; c++) {
      for (const f of files) {
        let path = f.path
        let body = f.text
        if (c > 0) {
          for (const s of index.spaces) {
            path = path.split(`modules/${s}/`).join(`modules/${s}-${c}/`)
            body = body.split(s).join(`${s}-${c}`)
          }
          if (!path.startsWith('modules/')) path = path.replace(/^(handoffs|patterns)\/(.*)\.md$/, `$1/$2-${c}.md`)
        }
        out.push({ path, text: body, mtime: f.mtime })
      }
    }
    return out
  }

  it(
    'builds a 1,000-file corpus cold, and in batches of 100',
    () => {
      // Thresholds are asserted at 5x unless PERF=1 (a quiet machine): a loaded CI box must not flake.
      const slack = process.env.PERF === '1' ? 1 : 5
      const corpus = makeCorpus(14)
      expect(corpus.length).toBeGreaterThanOrEqual(1000)

      // A fresh corpus, and the first buildIndex on it. Note the module is already JIT-warm from the
      // tests above in this process; a process-cold figure comes from running dist-lib/lib.mjs alone.
      const t0 = performance.now()
      const cold = buildIndex(corpus)
      const coldMs = performance.now() - t0
      expect(Object.keys(cold.files).length).toBe(corpus.length - 14 * 2) // 2 template files per copy are hidden

      // batches: another fresh corpus fed 100 files at a time, as Go would stream them
      const batches = makeCorpus(14)
      let idx = buildIndex([])
      let worst = 0
      for (let i = 0; i < batches.length; i += 100) {
        const b0 = performance.now()
        idx = updateIndex(idx, batches.slice(i, i + 100), [])
        worst = Math.max(worst, performance.now() - b0)
      }
      // eslint-disable-next-line no-console
      console.log(`[perf] ${corpus.length} files: cold buildIndex ${coldMs.toFixed(1)} ms, worst 100-file batch ${worst.toFixed(1)} ms (limits 300/50 ms, asserted x${slack})`)
      expect(coldMs).toBeLessThan(300 * slack)
      expect(worst).toBeLessThan(50 * slack)
    },
    30_000,
  )
})

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []))
}

describe('keys that are names on Object.prototype', () => {
  it('keeps __proto__ in frontmatter as an ordinary key', () => {
    const fm = parseFrontmatter(['---', '__proto__: "x"', 'constructor: 1', 'status: open', '---', '# t'].join('\n'))!
    expect(Object.getPrototypeOf(fm)).toBeNull()
    expect(fm.status).toBe('open')
    expect(fm.constructor).toBe(1)
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })

  it('numbers duplicate headings called __proto__ and constructor without touching the prototype', () => {
    const text = ['---', 'type: build', '---', '# a', '## constructor', '## constructor', '## __proto__', '## __proto__', ''].join('\n')
    const idx = buildIndex([{ path: 'modules/m/a.md', text, mtime: 1 }])
    const slugs = Object.values(idx.files)[0].headings.map((h) => h.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.filter((s) => s.startsWith('constructor'))).toEqual(['constructor', 'constructor-1'])
    expect(({} as any).constructor).toBe(Object)
  })
})
