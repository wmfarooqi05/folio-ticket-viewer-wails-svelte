// @vitest-environment happy-dom
// Ticket 47: the Map files field in Settings.
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getMapFiles = vi.fn()
const setMapFiles = vi.fn()
vi.mock('../lib/api', () => ({
  getMapFiles: (...a: unknown[]) => getMapFiles(...a),
  setMapFiles: (...a: unknown[]) => setMapFiles(...a),
}))

import MapFilesField from './MapFilesField.svelte'

let app: ReturnType<typeof mount> | null = null
afterEach(() => {
  if (app) void unmount(app)
  app = null
  document.body.innerHTML = ''
  getMapFiles.mockReset()
  setMapFiles.mockReset()
})

const tick = async () => {
  await new Promise((r) => setTimeout(r, 0))
  flushSync()
}
async function render(saved: string[], onchanged = vi.fn()) {
  getMapFiles.mockResolvedValue(saved)
  app = mount(MapFilesField, { target: document.body, props: { onchanged } })
  flushSync()
  await tick()
  return onchanged
}
const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Map file names, comma-separated"]')!
const button = (label: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent === label)
const type = (text: string) => {
  input().value = text
  input().dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

describe('the Map files field (ticket 47)', () => {
  it('shows the saved names, comma-separated', async () => {
    await render(['map.md', 'README.md'])
    expect(input().value).toBe('map.md, README.md')
    expect(input().placeholder).toBe('map.md, README.md')
    expect(button('Reset')).toBeUndefined()
  })

  it('Use names saves the parsed list, then tells the dialog', async () => {
    const onchanged = await render(['map.md', 'README.md'])
    setMapFiles.mockResolvedValue(['map.md', 'index.md'])
    type(' map.md , index.md ,')
    button('Use names')!.click()
    await tick()
    expect(setMapFiles).toHaveBeenCalledWith(['map.md', 'index.md'])
    expect(onchanged).toHaveBeenCalledTimes(1)
    expect(input().value).toBe('map.md, index.md')
    expect(button('Reset')).toBeDefined()
  })

  it('shows the refusal in an alert and does not tell the dialog', async () => {
    const onchanged = await render(['map.md', 'README.md'])
    setMapFiles.mockRejectedValue(new Error('map files: "x.txt" must end in .md'))
    type('x.txt')
    button('Use names')!.click()
    await tick()
    expect(document.body.querySelector('[role=alert]')?.textContent).toBe('"x.txt" must end in .md')
    expect(onchanged).not.toHaveBeenCalled()
  })

  it('Reset appears only for a changed list and saves the defaults', async () => {
    const onchanged = await render(['index.md'])
    expect(input().value).toBe('index.md')
    setMapFiles.mockResolvedValue(['map.md', 'README.md'])
    button('Reset')!.click()
    await tick()
    expect(setMapFiles).toHaveBeenCalledWith(['map.md', 'README.md'])
    expect(onchanged).toHaveBeenCalled()
    expect(button('Reset')).toBeUndefined()
  })
})
