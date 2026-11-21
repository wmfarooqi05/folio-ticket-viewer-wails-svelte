// @vitest-environment happy-dom
// Ticket 40: the evidence panel draws what evidenceFiles says, in each state of the design's switcher.
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildIndex, parseFile } from '../lib/parser'

const evidenceFiles = vi.fn()
vi.mock('../lib/api', () => ({
  isWeb: true,
  evidenceFiles: (...a: unknown[]) => evidenceFiles(...a),
  evidenceUrl: (p: string, i: number) => `/evidence/${p}/${i}`,
}))

import EvidencePanel from './EvidencePanel.svelte'

const P = 'modules/pay/issues/05-refund-screen.md'
const ticket = (block: string, status = 'needs-verification') =>
  parseFile({
    path: P,
    mtime: 1,
    text: `---\ntype: build\nstatus: ${status}\nstatus_note: "refund screen built"\nwaiting_on: owner\n---\n\n# 05 — Refund screen\n\n<!-- factory:board begin v1 -->\n## Board\n\n${block}\n<!-- factory:board end -->\n`,
  })
const EV = [
  '- Branch: `feature/refunds`',
  '',
  '### Evidence',
  '',
  'Folder: `U:/Evidence/pay-05/`',
  '',
  '- [demo.webm](file:///U:/Evidence/pay-05/demo.webm) — video',
  '- [01-refund-list.png](file:///U:/Evidence/pay-05/01-refund-list.png) — image',
  '- [scenarios.md](file:///U:/Evidence/pay-05/scenarios.md) — scenarios',
  '- [trace.zip](file:///U:/Evidence/pay-05/trace.zip) — file',
].join('\n')
const served = (index: number, name: string, kind: string) => ({ index, name, kind, served: true, size: 10 })
const ALL = [served(0, 'demo.webm', 'video'), served(1, '01-refund-list.png', 'image'), served(2, 'scenarios.md', 'scenarios'), { index: 3, name: 'trace.zip', kind: 'file', served: false, reason: 'type not served' }]

let app: ReturnType<typeof mount> | null = null
afterEach(() => {
  if (app) void unmount(app)
  app = null
  document.body.innerHTML = ''
  evidenceFiles.mockReset()
})

async function render(rec: ReturnType<typeof ticket>, compact = false) {
  // the scenarios tab fetches its text through the route
  globalThis.fetch = vi.fn(async () => new Response('1. Open a paid order. Expect the amount prefilled.')) as never
  app = mount(EvidencePanel, { target: document.body, props: { rec, index: buildIndex([]), compact } })
  flushSync()
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
  flushSync()
  return document.body.querySelector('section[aria-label="Evidence"]')
}

describe('the evidence panel (ticket 40)', () => {
  it('full evidence: the counts, your turn with copy ref, the video, a thumbnail, the scenarios and the other file', async () => {
    evidenceFiles.mockResolvedValue({ root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true, files: ALL })
    const s = await render(ticket(EV))
    expect(s?.querySelector('header')?.textContent).toContain('1 video · 1 image · scenarios · 1 other file')
    expect(s?.textContent).toContain('Your turn.')
    expect(s?.textContent).toContain('say “pay 05 verified” in the agent’s chat')
    expect(s?.querySelector('video')?.getAttribute('src')).toBe(`/evidence/${P}/0`)
    expect(s?.querySelector('.thumb img')?.getAttribute('alt')).toBe('refund list')
    expect(s?.querySelector('[role=tab][aria-selected=true]')?.textContent).toContain('Scenarios')
    expect(s?.textContent).toContain('trace.zip')
    expect(s?.textContent).toContain('not openable')
    expect(evidenceFiles).toHaveBeenCalledWith(P)
  })

  it('no evidence root: the files are listed, nothing is loaded, and it says how to set one', async () => {
    evidenceFiles.mockResolvedValue({ root: '', folder: 'U:/Evidence/pay-05/', reachable: true, files: ALL.map((f) => ({ ...f, served: false, reason: 'root not set' })) })
    const s = await render(ticket(EV))
    expect(s?.textContent).toContain('started without an evidence folder')
    expect(s?.querySelectorAll('video, img').length).toBe(0)
    expect(s?.textContent).toContain('demo.webm')
  })

  it('not reachable: a note, no file list, and evidenceFiles is still asked (the server is the judge)', async () => {
    evidenceFiles.mockResolvedValue({ root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: false, files: [] })
    const s = await render(ticket(EV.replace('pay-05/`', 'pay-05/` (not reachable)')))
    expect(s?.textContent).toContain('can’t read this folder right now')
    expect(s?.querySelector('header')?.textContent).toContain('(not reachable)')
  })

  it('a missing video and image show a placeholder, not a broken player', async () => {
    evidenceFiles.mockResolvedValue({
      root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true,
      files: [{ index: 0, name: 'demo.webm', kind: 'video', served: false, reason: 'missing' }, { index: 1, name: '01-refund-list.png', kind: 'image', served: false, reason: 'missing' }],
    })
    const s = await render(ticket(EV))
    expect(s?.querySelector('video')).toBeNull()
    expect(s?.textContent).toContain('File not found in the evidence folder')
    expect(s?.querySelector('.thumb.missing')?.textContent).toContain('File not found')
  })

  it('a verdict replaces "your turn": accepted and rejected, with the date and the quote', async () => {
    evidenceFiles.mockResolvedValue({ root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true, files: ALL })
    let s = await render(ticket(EV.replace('- Branch', '- Verdict: accepted by the owner, relayed from chat, 2026-11-21: "looks right"\n- Branch'), 'done'))
    expect(s?.querySelector('.verdict')?.textContent).toMatch(/Accepted.*by the owner, relayed from chat.*2026-11-21.*looks right/s)
    expect(s?.textContent).not.toContain('Your turn.')
    void unmount(app!)
    app = null
    s = await render(ticket(EV.replace('- Branch', '- Verdict: rejected by the owner, relayed from chat, 2026-11-21: "approve stays enabled"\n- Branch'), 'in-progress'))
    expect(s?.querySelector('.verdict.rejected')?.textContent).toContain('approve stays enabled')
  })

  it('no board block: nothing at all', async () => {
    const rec = parseFile({ path: P, mtime: 1, text: '---\nstatus: open\n---\n\n# 05 — X\n' })
    expect(await render(rec)).toBeNull()
    expect(evidenceFiles).not.toHaveBeenCalled()
  })

  it('ticket 42: one video per scenario, each captioned with its scenario from the file name', async () => {
    evidenceFiles.mockResolvedValue({
      root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true,
      files: [
        served(0, 'pay-05-S1-approve-flow.webm', 'video'),
        { index: 1, name: 'pay-05-S2-reject.webm', kind: 'video', served: false, reason: 'missing' },
        served(2, 'demo.webm', 'video'),
      ],
    })
    const s = await render(ticket(EV))
    const caps = [...(s?.querySelectorAll('figure.clip figcaption') ?? [])].map((c) => c.textContent?.replace(/\s+/g, ' ').trim())
    expect(caps).toHaveLength(3)
    expect(caps[0]).toMatch(/^S1 ?approve flow ?pay-05-S1-approve-flow\.webm$/)
    expect(caps[1]).toMatch(/^S2 ?reject ?pay-05-S2-reject\.webm$/)
    expect(caps[2]).toBe('demo.webm')
    expect(s?.querySelector('video')?.getAttribute('aria-label')).toBe('S1 approve flow (pay-05-S1-approve-flow.webm)')
    // the missing one keeps its placeholder under its caption
    expect(s?.querySelectorAll('figure.clip')[1]?.textContent).toContain('File not found in the evidence folder')
  })

  it('ticket 42: one plain-named video has no caption, as before', async () => {
    evidenceFiles.mockResolvedValue({ root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true, files: ALL })
    const s = await render(ticket(EV))
    expect(s?.querySelector('figcaption')).toBeNull()
    expect(s?.querySelector('video')?.getAttribute('aria-label')).toBe('demo.webm')
  })

  it('ticket 43 AC1: a round per scenario, each with its heading, video, the note, then its screenshots', async () => {
    const F = 'file:///U:/Evidence/pay-05'
    const GROUPED = [
      '### Evidence',
      '',
      'Folder: `U:/Evidence/pay-05/`',
      '',
      `- [scenarios.md](${F}/scenarios.md) — scenarios`,
      '',
      '#### S1 — Approve a refund',
      `- [pay-05-S1-01-queue.png](${F}/pay-05-S1-01-queue.png) — image`,
      `- [pay-05-S1-02-dialog.png](${F}/pay-05-S1-02-dialog.png) — image`,
      `- [pay-05-S1-approve.webm](${F}/pay-05-S1-approve.webm) — video`,
      '',
      '#### S2 — Reject a refund',
      `- [pay-05-S2-reject.webm](${F}/pay-05-S2-reject.webm) — video`,
      `- [pay-05-S2-01-reject.png](${F}/pay-05-S2-01-reject.png) — image`,
    ].join('\n')
    evidenceFiles.mockResolvedValue({
      root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true,
      files: [
        served(0, 'scenarios.md', 'scenarios'),
        served(1, 'pay-05-S1-01-queue.png', 'image'),
        served(2, 'pay-05-S1-02-dialog.png', 'image'),
        served(3, 'pay-05-S1-approve.webm', 'video'),
        served(4, 'pay-05-S2-reject.webm', 'video'),
        served(5, 'pay-05-S2-01-reject.png', 'image'),
      ],
    })
    const s = await render(ticket(GROUPED))
    const rounds = [...(s?.querySelectorAll('section.round') ?? [])]
    expect(rounds.map((r) => r.getAttribute('aria-label'))).toEqual(['S1 Approve a refund', 'S2 Reject a refund'])
    // inside a round: the video first, the factory's note, then the screenshots, in block order
    const order = (r: Element) => [...r.querySelectorAll('video, p, .thumb')].map((e) => (e.tagName === 'VIDEO' ? 'video' : e.tagName === 'P' ? 'note' : (e.querySelector('.name')?.textContent ?? '')))
    expect(order(rounds[0])).toEqual(['video', 'note', 'pay-05-S1-01-queue.png', 'pay-05-S1-02-dialog.png'])
    expect(order(rounds[1])).toEqual(['video', 'note', 'pay-05-S2-01-reject.png'])
    expect(rounds[0].textContent).toContain('Recorded during this round; its screenshots passed. Not checked frame by frame.')
    expect(rounds[0].querySelector('video')?.getAttribute('aria-label')).toBe('S1 Approve a refund (pay-05-S1-approve.webm)')
    expect(rounds[0].querySelector('figcaption')).toBeNull()
    // nothing is drawn twice outside the rounds, and the scenarios tab is still there
    expect(s?.querySelectorAll('video').length).toBe(2)
    expect(s?.querySelectorAll('.thumb').length).toBe(3)
    expect(s?.querySelector('[role=tab]')?.textContent).toContain('Scenarios')
    // the viewer steps through every screenshot in block order, across rounds
    ;(rounds[1].querySelector('.thumb') as HTMLButtonElement).click()
    flushSync()
    expect(document.body.textContent).toContain('3 / 3')
  })

  it('compact (the side panel): the summary and copy ref, and no media', async () => {
    evidenceFiles.mockResolvedValue({ root: 'U:/Evidence', folder: 'U:/Evidence/pay-05/', reachable: true, files: ALL })
    const s = await render(ticket(EV), true)
    expect(s?.textContent).toContain('opens in the middle')
    expect(s?.textContent).toContain('copy pay 05')
    expect(s?.querySelectorAll('video, img').length).toBe(0)
  })
})
