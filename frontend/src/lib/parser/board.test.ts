// Tickets 33 and 35: the factory's board block and the needs-verification status, against the
// mirror fixture (fixtures/board-mirror, built from the R3 example in the factory's handoff).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { boardFor } from '../views'
import { fileUrlToPath, parseFile, scanBoard, type DocRecord, type Index } from './index'
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
