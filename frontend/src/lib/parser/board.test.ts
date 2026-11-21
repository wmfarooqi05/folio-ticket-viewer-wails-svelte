// Tickets 33 and 35: the factory's board block and the needs-verification status, against the
// mirror fixture (fixtures/board-mirror, built from the R3 example in the factory's handoff).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { boardFor, boardWidth, evidenceCounts, foldedColumns, isMirror, pinnedCounts, shortAge, verifyCount, waitingOn, waitingSince } from '../views'
import { pinnedItems } from '../pinned'
import { buildIndex, fileUrlToPath, parseFile, scanBoard, type DocRecord, type Index } from './index'
import { buildIndexFromDisk } from './node'

const mirror = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'board-mirror')
const P = 'modules/pay/issues/'

const ticket = (body: string, status = 'needs-verification'): DocRecord =>
  parseFile({
    path: 'modules/pay/issues/05-x.md',
    mtime: 0,
    text: `---\ntype: build\nstatus: ${status}\nwaiting_on: owner\n---\n\n# 05 — X\n\n${body}`,
  })

const block = (inner: string, v = '1') => `<!-- factory:board begin v${v} -->\n${inner}\n<!-- factory:board end -->\n`

describe('the board block (ticket 35)', () => {
  let index: Index
  beforeAll(async () => {
    index = await buildIndexFromDisk(mirror)
  })

  it('reads the handoff sample: branch, claim, verdict and every evidence file', () => {
    const b = index.files[P + '04-refund-screen.md'].board
    expect(b).toMatchObject({
      branch: 'feature/refunds',
      branchNote: 'feature/refunds (worktree C:/work/app-refunds), uncommitted',
      claim: 'worktree C:/work/app-refunds, since 2026-11-21 10:02',
      verdict: 'accepted by the owner, relayed from chat, 2026-11-21: "looks right, approve flow works"',
    })
    expect(b?.evidence).toEqual({
      folder: 'U:/Evidence/app/pay-04-refund-screen/',
      reachable: true,
      files: [
        { name: 'pay-04-01-queue.png', path: 'U:/Evidence/app/pay-04-refund-screen/pay-04-01-queue.png', kind: 'image' },
        { name: 'pay-04-demo-approve.webm', path: 'U:/Evidence/app/pay-04-refund-screen/pay-04-demo-approve.webm', kind: 'video' },
        { name: 'scenarios.md', path: 'U:/Evidence/app/pay-04-refund-screen/scenarios.md', kind: 'scenarios' },
        { name: 'pay-04-evidence.md', path: 'U:/Evidence/app/pay-04-refund-screen/pay-04-evidence.md', kind: 'write-up' },
        // percent-encoded in the URL, decoded in the path; the link text is kept as written
        { name: 'trace%20log.zip', path: 'U:/Evidence/app/pay-04-refund-screen/trace log.zip', kind: 'file' },
      ],
    })
  })

  it('a folder marked "(not reachable)" has no files and reachable false', () => {
    const b = index.files[P + '08-chargebacks.md'].board
    expect(b?.evidence).toEqual({ folder: 'U:/Evidence/app/pay-08-chargebacks/', reachable: false, files: [] })
    expect(b?.branch).toBe('feature/chargebacks')
    expect(b?.claim).toBeNull()
  })

  it('a block without evidence still gives the branch and claim', () => {
    const b = index.files[P + '02-payment-intents.md'].board
    expect(b).toMatchObject({ branch: 'feature/payment-intents', evidence: null, verdict: null })
  })

  it('a ticket with no block has board null and no warning', () => {
    const r = index.files[P + '01-card-capture.md']
    expect(r.board).toBeNull()
    expect(r.diagnostics.filter((d) => d.code === 'BOARD')).toEqual([])
  })

  it('records the begin marker line', () => {
    const r = ticket(block('## Board\n\n- Branch: `b`'))
    expect(r.board?.line).toBe(9)
  })

  it('a v2 block is not read: no board, a warning, and the ticket is still a ticket', () => {
    const r = ticket(block('## Board\n\n- Branch: `b`', '2'))
    expect(r.board).toBeNull()
    expect(r.kind).toBe('ticket')
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'BOARD', level: 'warning', line: 9 })])
  })

  it('an unclosed block is not read, with a warning', () => {
    const r = ticket('<!-- factory:board begin v1 -->\n## Board\n\n- Branch: `b`\n')
    expect(r.board).toBeNull()
    expect(r.diagnostics.map((d) => d.code)).toEqual(['BOARD'])
  })

  it('reads only the first of two blocks', () => {
    const r = ticket(block('- Branch: `first`') + '\n' + block('- Branch: `second`'))
    expect(r.board?.branch).toBe('first')
  })

  it('ignores a block inside fenced code (a ticket quoting the format)', () => {
    const r = ticket('```markdown\n' + block('- Branch: `quoted`') + '```\n')
    expect(r.board).toBeNull()
    expect(r.diagnostics).toEqual([])
  })

  it('only tickets get a board', () => {
    const r = parseFile({ path: 'handoffs/notes.md', mtime: 0, text: block('- Branch: `b`') })
    expect(r.kind).toBe('doc')
    expect(r.board).toBeNull()
  })

  it('skips evidence lines it cannot read, and maps an unknown kind to "file"', () => {
    const r = ticket(
      block(
        [
          'Folder: `U:/E/`',
          '- [a.png](https://example.com/a.png) — image',
          '- [b.png](file:///U:/E/%E0%A4%A.png) — image',
          '- [c.gif](file:///U:/E/c.gif) — animation',
          '- [d.webm](<file:///U:/E/d.webm>) -- video',
        ].join('\n'),
      ),
    )
    expect(r.board?.evidence?.files).toEqual([
      { name: 'c.gif', path: 'U:/E/c.gif', kind: 'file' },
      { name: 'd.webm', path: 'U:/E/d.webm', kind: 'video' },
    ])
  })

  it('never throws on a malformed block', () => {
    for (const inner of ['', '- Branch:', '- Verdict: ', 'Folder:', '### Evidence\n- [](file:///) —', '\0\0']) {
      expect(() => ticket(block(inner))).not.toThrow()
    }
  })
})

describe('fileUrlToPath', () => {
  it('drive paths, POSIX paths, localhost, and refusals', () => {
    expect(fileUrlToPath('file:///U:/a%20b/c.png')).toBe('U:/a b/c.png')
    expect(fileUrlToPath('file:///home/me/x.png')).toBe('/home/me/x.png')
    expect(fileUrlToPath('file://localhost/C:/x.png')).toBe('C:/x.png')
    expect(fileUrlToPath('file://server/share/x.png')).toBeNull()
    expect(fileUrlToPath('https://x/y.png')).toBeNull()
    expect(fileUrlToPath('file:///C:/a%00b.png')).toBeNull()
    expect(fileUrlToPath('file:///C:/%E0%A4%A')).toBeNull()
  })

  it('scanBoard on plain text with no block', () => {
    expect(scanBoard('# Hi\n\nNothing here.')).toEqual({ board: null, problem: null })
  })
})

describe('needs-verification and unknown statuses (ticket 33)', () => {
  let index: Index
  beforeAll(async () => {
    index = await buildIndexFromDisk(mirror)
  })

  it('the board has a Needs verification column between Blocked and In review', () => {
    const b = boardFor(index, 'modules/pay/map.md')
    expect(b.columns.map((c) => [c.id, c.cards.map((t) => t.num)])).toEqual([
      ['open', ['01', '09']],
      ['in-progress', ['02']],
      ['blocked', ['03']],
      ['needs-verification', ['04', '08']],
      ['in-review', ['05']],
      ['done', ['06']],
    ])
    expect(b.strip.map((t) => t.num)).toEqual(['07'])
  })

  it('a status Folio does not know keeps its raw value, and sits in Open', () => {
    const r = index.files[P + '09-payouts.md']
    expect(r.meta).toMatchObject({ status: 'unknown' })
    expect(r.statusRaw).toBe('needs-review')
    expect(index.files[P + '04-refund-screen.md'].statusRaw).toBeNull()
  })

  it('needs-verification is not an unknown-status warning', () => {
    const r = index.files[P + '04-refund-screen.md']
    expect(r.diagnostics.filter((d) => d.code === 'FM_ENUM')).toEqual([])
  })
})

describe('folding columns into rails (ticket 38, ticket 37 D6)', () => {
  const ids = (s: Set<string>) => [...s]

  it('six columns need 1,048px; at that width nothing folds', () => {
    expect(boardWidth(0)).toBe(1048)
    expect(ids(foldedColumns(1048))).toEqual([])
    expect(ids(foldedColumns(2000))).toEqual([])
  })

  it('folds Done, then Open, In review, Blocked, one at a time as the width shrinks', () => {
    expect(ids(foldedColumns(1047))).toEqual(['done'])
    expect(ids(foldedColumns(boardWidth(1) - 1))).toEqual(['done', 'open'])
    expect(ids(foldedColumns(boardWidth(2) - 1))).toEqual(['done', 'open', 'in-review'])
    expect(ids(foldedColumns(boardWidth(3) - 1))).toEqual(['done', 'open', 'in-review', 'blocked'])
  })

  it('never folds In progress or Needs verification, however narrow', () => {
    const f = foldedColumns(100)
    expect(f.has('in-progress')).toBe(false)
    expect(f.has('needs-verification')).toBe(false)
    expect(f.size).toBe(4)
  })

  it('a rail the owner opened stays open, and nothing folds in its place (the board scrolls instead)', () => {
    expect(ids(foldedColumns(1047, new Set(['done'])))).toEqual([])
    expect(ids(foldedColumns(100, new Set(['open', 'blocked'])))).toEqual(['done', 'in-review'])
  })
})

describe('Needs you, ages and the mirror (ticket 41)', () => {
  let index: Index
  beforeAll(async () => {
    index = await buildIndexFromDisk(mirror)
  })
  const at = (block: string, status = 'needs-verification', mtime = 5) =>
    parseFile({
      path: 'modules/pay/issues/05-x.md',
      mtime,
      text: `---\ntype: build\nstatus: ${status}\nwaiting_on: owner\n---\n\n# 05 — X\n\n<!-- factory:board begin v1 -->\n${block}\n<!-- factory:board end -->\n`,
    })

  it('AC1: Waiting on lists 04 and 08 first under Owner, and the tree says "2 to verify"', () => {
    const owner = waitingOn(index).find((g) => g.person === 'owner')!
    expect(owner.verify.map((r) => r.num)).toEqual(['04', '08'])
    expect(owner.rows.map((r) => r.num)).toEqual([])
    expect(verifyCount(index)).toBe(2)
    const counts = pinnedCounts(index)
    expect(counts.verify).toBe(2)
    expect(pinnedItems(counts)[0]).toMatchObject({ id: 'waiting', badge: '2 to verify', count: counts.waiting })
    expect(pinnedItems({ waiting: 3, verify: 0, questions: 0 })[0].badge).toBeNull()
  })

  it('reads "Waiting since" from the block', () => {
    expect(at('- Waiting since: 2026-11-21 10:02').board?.waitingSince).toBe('2026-11-21 10:02')
    expect(at('- Waiting since: `2026-11-21 10:02`').board?.waitingSince).toBe('2026-11-21 10:02')
  })

  it('AC2: a mirror ticket ages from Waiting since, or has no age; an ordinary ticket ages from its mtime', () => {
    expect(waitingSince(at('- Waiting since: 2026-11-21 10:02'))).toBe(new Date(2026, 10, 21, 10, 2).getTime())
    expect(waitingSince(at('- Waiting since: 2026-11-21'))).toBe(new Date(2026, 10, 21).getTime())
    expect(waitingSince(at('- Branch: `b`'))).toBeNull()
    expect(waitingSince(at('- Waiting since: soon'))).toBeNull()
    const plain = parseFile({ path: 'modules/pay/issues/06-y.md', mtime: 1234, text: '---\nstatus: open\nwaiting_on: owner\n---\n\n# 06 — Y\n' })
    expect(waitingSince(plain)).toBe(1234)
  })

  it('oldest wait first; tickets with no age last', () => {
    const t = (n: string, line: string) => ({
      path: `modules/q/issues/${n}-x.md`,
      mtime: 9,
      text: `---\nstatus: needs-verification\nwaiting_on: owner\n---\n\n# ${n} — X\n\n<!-- factory:board begin v1 -->\n${line}\n<!-- factory:board end -->\n`,
    })
    const idx = buildIndex([t('01', '- Waiting since: 2026-11-21 12:00'), t('02', '- Branch: `b`'), t('03', '- Waiting since: 2026-11-20 08:00')])
    expect(waitingOn(idx)[0].verify.map((r) => r.num)).toEqual(['03', '01', '02'])
  })

  it('shortAge: minutes, hours, days', () => {
    const t = Date.UTC(2026, 10, 22, 12)
    expect(shortAge(t, t)).toBe('now')
    expect(shortAge(t - 30 * 60_000, t)).toBe('30m')
    expect(shortAge(t - 2 * 3_600_000, t)).toBe('2h')
    expect(shortAge(t - 50 * 3_600_000, t)).toBe('2d')
    expect(shortAge(t + 60_000, t)).toBe('now')
  })

  it('AC3: the mirror fixture is a mirror; the ordinary fixtures are not', async () => {
    expect(isMirror(index)).toBe(true)
    const plain = await buildIndexFromDisk(join(mirror, '..', 'docs'))
    expect(isMirror(plain)).toBe(false)
    expect(isMirror(buildIndex([]))).toBe(false)
  })

  it('the evidence summary for a Needs you row comes from the block', () => {
    const r = index.files['modules/pay/issues/04-refund-screen.md']
    expect(evidenceCounts(r)).toBe('1 video · 1 image')
    expect(evidenceCounts(index.files['modules/pay/issues/08-chargebacks.md'])).toBe('')
  })
})
