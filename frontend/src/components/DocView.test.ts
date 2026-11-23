// @vitest-environment happy-dom
// Ticket 46: with no document selected, DocView says why the pane is empty.
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api', () => ({ isWeb: true }))

import DocView from './DocView.svelte'

let app: ReturnType<typeof mount> | null = null
afterEach(() => {
  if (app) void unmount(app)
  app = null
  document.body.innerHTML = ''
})

const render = (empty?: boolean) => {
  app = mount(DocView, { target: document.body, props: { path: null, text: null, error: null, ...(empty === undefined ? {} : { empty }) } })
  flushSync()
  return document.body.textContent ?? ''
}

describe('DocView with nothing selected (ticket 46)', () => {
  it('says there is no Markdown when the folder has none', () => expect(render(true)).toContain('No Markdown files in this folder.'))
  it('asks for a selection otherwise', () => {
    const t = render(false)
    expect(t).toContain('Select a document in the tree.')
    expect(t).not.toContain('No Markdown files')
  })
})
