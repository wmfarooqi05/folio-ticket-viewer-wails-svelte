// AC1 (ticket 12): the view counts match a hand count over the fixtures. Every expected
// number below was counted by hand from fixtures/docs and fixtures/expected.json, not taken
// from the functions under test. The derivation is in the ticket's Outcome.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildIndex, updateIndex, type Index, type SourceFile } from './parser'
import { readDocsRoot } from './parser/node'
import {
  ageDays,
  ageFill,
  ageLabel,
  ageTone,
  boardFor,
  liveBlockers,
  openQuestions,
  pinnedCounts,
  questionWhere,
  waitingOn,
} from './views'

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures', 'docs')

const M = 'modules/'
const CHW = M + 'cash-handling-workflow/'
const RSA = M + 'remove-service-account/'
const OCM = M + 'one-cash-mover/'
const CM = M + 'cloud-migration/'

// Disk mtimes are the checkout time, so the tests pin their own. Everything else is 1000.
const MTIME: Record<string, number> = {
  [CHW + 'issues/21-build-ocm-hook.md']: 500,
  [RSA + 'issues/06-dba-rotate-sql-login.md']: 2000,
  [CM + 'issues/08-build-vnet.md']: 100,
  [RSA + 'issues/11-vnet-rule.md']: 20,
  [CHW + 'issues/13-dba-ddl.md']: 100,
  [RSA + 'issues/07-ops-delete-secret.md']: 100,
  [CM + 'issues/07-decide-region.md']: 5,
  [RSA + 'issues/05-grill-uat-schedule.md']: 10,
  [RSA + 'issues/03-decide-key-owner.md']: 15,
  [OCM + 'issues/05-build-movecash.md']: 30,
  [RSA + 'map.md']: 40,
  [CM + 'map.md']: 50,
  [OCM + 'map.md']: 60,
}

let files: SourceFile[]
let index: Index

beforeAll(async () => {
  files = (await readDocsRoot(docsRoot)).map((f) => ({ ...f, mtime: MTIME[f.path] ?? 1000 }))
  index = buildIndex(files)
})

const keys = (recs: { key: string | null }[]) => recs.map((r) => r.key)

describe('Waiting on', () => {
  it('has 8 tickets in 5 groups, Owner first, oldest first inside a group', () => {
    const groups = waitingOn(index)
    expect(groups.map((g) => g.person)).toEqual(['owner', 'client', 'dba', 'infra', 'ops'])
    expect(groups.map((g) => g.label)).toEqual(['Owner', 'Client', 'DBA', 'Infra', 'Ops'])
    expect(keys(groups[0].rows)).toEqual(['remove-service-account 05'])
    expect(keys(groups[1].rows)).toEqual(['remove-service-account 10'])
    // dba: legacy 21 (mtime 500, inferred from "awaiting DBA") before migrated 06 (2000)
    expect(keys(groups[2].rows)).toEqual(['cash-handling-workflow 21', 'remove-service-account 06'])
    // infra: 11 (20) is older than legacy cloud-migration 08 (100, inferred)
    expect(keys(groups[3].rows)).toEqual(['remove-service-account 11', 'cloud-migration 08'])
    // ops: 13 and 07 tie at 100, so the path decides
    expect(keys(groups[4].rows)).toEqual(['cash-handling-workflow 13', 'remove-service-account 07'])
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(8)
  })

  it('includes the three legacy tickets whose waiting_on is inferred (04 D4)', () => {
    const legacy = waitingOn(index).flatMap((g) => g.rows.filter((r) => r.legacy))
    expect(keys(legacy).sort()).toEqual(
      ['cash-handling-workflow 13', 'cash-handling-workflow 21', 'cloud-migration 08'].sort(),
    )
  })

  it('leaves out a closed ticket even when it has waiting_on', () => {
    const done = {
      path: RSA + 'issues/12-done-but-waiting.md',
      mtime: 1,
      text: '---\nstatus: done\nwaiting_on: client\n---\n\n# 12 — Done but waiting\n',
    }
    const next = updateIndex(index, [done], [])
    expect(next.files[done.path].meta).toMatchObject({ status: 'done', waiting_on: 'client' })
    expect(keys(waitingOn(next)[1].rows)).toEqual(['remove-service-account 10'])
  })

  it('is empty for an index with no waiting tickets', () => {
    expect(waitingOn(buildIndex([]))).toEqual([])
  })
})

describe('Board', () => {
  const ids = (b: ReturnType<typeof boardFor>) => b.columns.map((c) => c.cards.length)
  const nums = (b: ReturnType<typeof boardFor>, id: string) =>
    b.columns.find((c) => c.id === id)!.cards.map((t) => t.num)

  it('has five columns in order', () => {
    expect(boardFor(index, RSA + 'map.md').columns.map((c) => c.label)).toEqual([
      'Open',
      'In progress',
      'Blocked',
      'In review',
      'Done',
    ])
  })

  it('remove-service-account: 1/1/4/1/2 and a strip of 08 and 09', () => {
    const b = boardFor(index, RSA + 'map.md')
    expect(ids(b)).toEqual([1, 1, 4, 1, 2])
    expect(nums(b, 'open')).toEqual(['05'])
    expect(nums(b, 'in-progress')).toEqual(['04'])
    expect(nums(b, 'blocked')).toEqual(['06', '07', '10', '11'])
    expect(nums(b, 'in-review')).toEqual(['02'])
    expect(nums(b, 'done')).toEqual(['01', '03'])
    expect(b.strip.map((t) => t.num)).toEqual(['08', '09'])
    expect(b.total).toBe(11)
  })

  it('cash-handling-workflow: unknown tickets sit in Open, 100 sorts last, strip holds 4 dropped and 2 superseded', () => {
    const b = boardFor(index, CHW + 'map.md')
    // Open 6 (02 07 09 25 26 37) + unknown 6 (15 32 33 34 35 36)
    expect(ids(b)).toEqual([12, 3, 2, 5, 12])
    expect(nums(b, 'open')).toEqual(['02', '07', '09', '15', '25', '26', '32', '33', '34', '35', '36', '37'])
    expect(nums(b, 'in-progress')).toEqual(['08', '27', '30'])
    expect(nums(b, 'blocked')).toEqual(['13', '21'])
    expect(nums(b, 'in-review')).toEqual(['04', '14', '17', '18', '38'])
    expect(nums(b, 'done')).toEqual(['01', '03', '05', '06', '16', '19', '22', '23', '24', '31', '39', '100'])
    expect(b.strip.map((t) => t.num)).toEqual(['10', '11', '12', '20', '28', '29'])
    expect(b.total).toBe(40)
  })

  it('the nested map owns only its own folder, not the parent tickets', () => {
    const b = boardFor(index, CHW + 'step2b-payment-identification/map.md')
    expect(ids(b)).toEqual([2, 1, 0, 1, 3])
    expect(nums(b, 'open')).toEqual(['43', '46'])
    expect(b.strip).toEqual([])
    expect(b.total).toBe(7)
  })

  it('cloud-migration 1 blocked + 1 done, one-cash-mover 1/1/0/0/1', () => {
    expect(ids(boardFor(index, CM + 'map.md'))).toEqual([0, 0, 1, 0, 1])
    expect(ids(boardFor(index, OCM + 'map.md'))).toEqual([1, 1, 0, 0, 1])
  })

  it('a path that is not a map gives an empty board', () => {
    expect(boardFor(index, 'nope.md').total).toBe(0)
  })

  it('card blockers: only unresolved ones', () => {
    // 06 is blocked_by 05 (open): chip. Check the closed case on a synthetic ticket below.
    const t6 = index.files[RSA + 'issues/06-dba-rotate-sql-login.md'] as never
    const chips = liveBlockers(index, t6)
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.every((c) => c.ref.length > 0)).toBe(true)

    const mk = (n: string, status: string, by: string) => ({
      path: RSA + `issues/${n}-x.md`,
      mtime: 1,
      text: `---\nstatus: ${status}\nblocked_by: [${by}]\n---\n\n# ${n} — x\n`,
    })
    // 01 is done in the fixtures: a blocker on a done ticket is not shown
    const next = updateIndex(index, [mk('20', 'blocked', '"01"'), mk('21', 'blocked', '"05"')], [])
    expect(liveBlockers(next, next.files[RSA + 'issues/20-x.md'] as never)).toEqual([])
    expect(liveBlockers(next, next.files[RSA + 'issues/21-x.md'] as never).map((c) => c.ref)).toEqual(['05'])
  })
})

describe('Open questions', () => {
  const where = (rows: ReturnType<typeof openQuestions>) =>
    rows.map((r) => `${r.rec.path.replace(M, '')}#${r.item.id}`)

  it('hides closed tickets by default: 8 of 10, oldest first', () => {
    const rows = openQuestions(index)
    expect(where(rows)).toEqual([
      'remove-service-account/issues/05-grill-uat-schedule.md#q1',
      'remove-service-account/issues/05-grill-uat-schedule.md#q3',
      'remove-service-account/issues/11-vnet-rule.md#q1',
      'one-cash-mover/issues/05-build-movecash.md#q3',
      'remove-service-account/map.md#q1',
      'remove-service-account/map.md#q3',
      'cloud-migration/map.md#q1',
      'one-cash-mover/map.md#q3',
    ])
    expect(rows.every((r) => !r.closed)).toBe(true)
  })

  it('the toggle adds the 2 Q items of done tickets (cloud-migration 07 q1, remove-service-account 03 q2)', () => {
    const rows = openQuestions(index, true)
    expect(rows).toHaveLength(10)
    expect(rows.filter((r) => r.closed).map((r) => `${r.rec.key}#${r.item.id}`)).toEqual([
      'cloud-migration 07#q1',
      'remove-service-account 03#q2',
    ])
    expect(where(rows)[0]).toBe('cloud-migration/issues/07-decide-region.md#q1')
  })

  it('leaves out answered Q items, including the duplicate Q35 pair in step2b 41', () => {
    const all = where(openQuestions(index, true)).join(' ')
    expect(all).not.toContain('41-grill-payment-ids')
    expect(all).not.toContain('03-decide-key-owner.md#q1')
    expect(all).not.toContain('05-grill-uat-schedule.md#q2')
    expect(all).not.toContain('one-cash-mover/issues/05-build-movecash.md#q1')
  })

  it('labels where it lives: the ticket key, or "space · map.md"', () => {
    expect(questionWhere(index.files[RSA + 'issues/11-vnet-rule.md'])).toBe('remove-service-account 11')
    expect(questionWhere(index.files[RSA + 'map.md'])).toBe('remove-service-account · map.md')
  })
})

describe('pinnedCounts', () => {
  it('matches the views: 8 waiting, 8 questions', () => {
    expect(pinnedCounts(index)).toEqual({ waiting: 8, questions: 8 })
  })
  it('is zero for an empty index', () => {
    expect(pinnedCounts(buildIndex([]))).toEqual({ waiting: 0, questions: 0 })
  })
})

describe('age', () => {
  const day = 86_400_000
  it('counts whole days from mtime and never goes negative', () => {
    expect(ageDays(0, 3 * day + 5)).toBe(3)
    expect(ageDays(10 * day, 0)).toBe(0)
    expect(ageLabel(0)).toBe('today')
    expect(ageLabel(1)).toBe('1 day ago')
    expect(ageLabel(6)).toBe('6 days ago')
  })
  it('follows the spec tones and fill (14 and 7 day thresholds, age/20 capped)', () => {
    expect([ageTone(6), ageTone(7), ageTone(13), ageTone(14)]).toEqual(['idle', 'rev', 'rev', 'block'])
    expect([ageFill(10), ageFill(40)]).toEqual([0.5, 1])
  })
})
