// @vitest-environment happy-dom
// Ticket 18, L6: a file over the size cap stays in the tree with a "too large" tag and its size.
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'
import { buildIndex } from '../lib/parser'
import Tree from './Tree.svelte'

let app: ReturnType<typeof mount> | null = null
afterEach(() => {
  if (app) void unmount(app)
  app = null
  document.body.innerHTML = ''
})

const render = (tooLarge: Record<string, number>) => {
  const index = buildIndex([
    { path: 'modules/a/issues/01-small.md', text: '# small\n', mtime: 1 },
    { path: 'modules/a/issues/02-huge.md', text: '# huge\n', mtime: 1 },
  ])
  app = mount(Tree, { target: document.body, props: { files: Object.values(index.files), selected: 'modules/a/issues/02-huge.md', onselect: () => {}, tooLarge } })
  flushSync() // the effect that opens the top-level folders
  return document.body
}

describe('Tree', () => {
  it('tags a file over the cap with "too large" and its size, and only that file', () => {
    const body = render({ 'modules/a/issues/02-huge.md': 10 * 1024 * 1024 })
    const tags = [...body.querySelectorAll('span')].filter((s) => s.textContent?.includes('too large'))
    expect(tags).toHaveLength(1)
    expect(tags[0].textContent).toContain('10.0 MB')
    const rows = [...body.querySelectorAll('button')]
    expect(rows.find((b) => b.textContent?.includes('02-huge.md'))?.textContent).toContain('too large')
    expect(rows.find((b) => b.textContent?.includes('01-small.md'))?.textContent).not.toContain('too large')
  })

  it('shows no tag when nothing is over the cap', () => {
    expect(render({}).textContent).not.toContain('too large')
  })
})
