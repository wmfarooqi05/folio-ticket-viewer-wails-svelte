// @vitest-environment happy-dom
// Ticket 25: the docs-roots chips (whole docs folder, found folders, typed folders) in Settings.
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const checkDocs = vi.fn()
vi.mock('../lib/api', () => ({
  isWeb: true,
  checkDocs: (...a: unknown[]) => checkDocs(...a),
  docsFromCommandLine: async () => null,
  setConfig: async () => ({}),
  clearData: async () => ({}),
}))

import SettingsDialog from './SettingsDialog.svelte'

let app: ReturnType<typeof mount> | null = null
const config = { v: 1, repoRoot: 'E:\\repo', docsDir: 'docs', docsRoots: ['.'], adoWorkItemUrl: '', adoPrUrl: '', theme: 'system', showMemory: false } as never

beforeEach(() => {
  vi.useFakeTimers()
  checkDocs.mockReset()
  checkDocs.mockResolvedValue({
    ok: true, repoRoot: 'E:\\repo', docsDir: 'docs', found: ['.'], missing: ['modules', 'handoffs', 'patterns'], message: '',
    suggested: [], folders: ['assets', 'issues'],
  })
})
afterEach(() => {
  if (app) void unmount(app)
  app = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

async function render() {
  app = mount(SettingsDialog, { target: document.body, props: { config, scan: null, onclose: () => {}, onsaved: () => {} } })
  flushSync()
  await vi.advanceTimersByTimeAsync(300) // the 120 ms debounce, then the check
  flushSync()
}
const chips = () => [...document.body.querySelectorAll<HTMLButtonElement>('button.chip')]
const chip = (label: string) => chips().find((b) => b.textContent?.includes(label))

describe('Settings docs roots', () => {
  it('lists the whole docs folder, the usual three and the found folders, with their dots', async () => {
    await render()
    const text = chips().map((b) => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(text.some((t) => t?.startsWith('✓ Whole docs folder (.) found') || t?.includes('Whole docs folder (.)'))).toBe(true)
    expect(chip('modules/')?.textContent).toContain('missing')
    expect(chip('assets/')?.textContent).toContain('found')
    expect(chip('issues/')?.textContent).toContain('found')
    expect(chip('Whole docs folder (.)')?.getAttribute('aria-pressed')).toBe('true')
    expect(chip('issues/')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('turns a chip on and off without asking the backend again', async () => {
    await render()
    const calls = checkDocs.mock.calls.length
    chip('issues/')!.click()
    flushSync()
    expect(chip('issues/')?.getAttribute('aria-pressed')).toBe('true')
    chip('Whole docs folder (.)')!.click()
    flushSync()
    expect(chip('Whole docs folder (.)')?.getAttribute('aria-pressed')).toBe('false')
    await vi.advanceTimersByTimeAsync(300)
    expect(checkDocs.mock.calls.length).toBe(calls)
  })

  const type = (text: string) => {
    const input = document.body.querySelector<HTMLInputElement>('#addRoot')!
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.body.querySelector<HTMLFormElement>('#addRoot')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    flushSync()
  }

  it('adds a typed folder as a ticked chip', async () => {
    await render()
    type('specs/api')
    expect(chip('specs/api/')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('treats a typed name that differs only in case as the chip that exists', async () => {
    await render()
    type('Issues')
    expect(chips().filter((b) => b.textContent?.toLowerCase().includes('issues/'))).toHaveLength(1)
    expect(chip('issues/')?.getAttribute('aria-pressed')).toBe('true')
  })

  it.each(['..', 'C:/x', '_templates', '.git', 'a/node_modules', ''])('refuses %j', async (bad) => {
    await render()
    const before = chips().length
    type(bad)
    expect(document.body.querySelector('.err')).not.toBeNull()
    expect(chips()).toHaveLength(before)
  })
})
