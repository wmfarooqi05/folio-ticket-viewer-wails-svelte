// @vitest-environment happy-dom
// Ticket 11: where a link click goes (panel or middle pane) and what the panel renders for a fragment.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildIndex, extractFragment, type Index } from '../parser'
import { readDocsRoot } from '../parser/node'
import { attachDocHandlers } from './dom'
import { renderMarkdown } from './markdown'

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'fixtures', 'docs')
const Q05 = 'modules/one-cash-mover/issues/05-build-movecash.md'
const RSA03 = 'modules/remove-service-account/issues/03-decide-key-owner.md'

let index: Index

beforeAll(async () => {
  index = buildIndex(await readDocsRoot(docsRoot))
})

function mount(path: string, range?: { start: number; end: number } | null) {
  const text = readFileSync(join(docsRoot, path), 'utf8')
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(text, { path, rec: index.files[path], index, range })
  document.body.append(root)
  return { root, text }
}

/** Mirrors DocView.open: a plain click is the panel's, Ctrl or middle is the middle pane's. */
function route(root: HTMLElement) {
  const panel = vi.fn()
  const middle = vi.fn()
  attachDocHandlers(root, {
    onLink: (p, f, mid) => (mid ? middle(p, f) : panel(p, f)),
    onExternal: vi.fn(),
  })
  return { panel, middle }
}

describe('click routing from a real fixture link (05 Q3)', () => {
  it('the fixture links to 05 Q3 with a data-path and a data-frag', () => {
    const { root } = mount(RSA03)
    const a = root.querySelector<HTMLElement>(`a[data-path="${Q05}"][data-frag="q3"]`)
    expect(a).not.toBeNull()
  })

  it('plain click goes to the panel; Ctrl-click and middle-click go to the middle pane', () => {
    const { root } = mount(RSA03)
    const { panel, middle } = route(root)
    const a = root.querySelector<HTMLElement>(`a[data-path="${Q05}"][data-frag="q3"]`)!
    const click = (init: MouseEventInit, type = 'click') => {
      const ev = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
      a.dispatchEvent(ev)
      return ev.defaultPrevented
    }
    expect(click({})).toBe(true)
    expect(panel).toHaveBeenCalledTimes(1)
    expect(panel).toHaveBeenCalledWith(Q05, 'q3')
    expect(middle).not.toHaveBeenCalled()

    expect(click({ ctrlKey: true })).toBe(true)
    expect(click({ button: 1 }, 'auxclick')).toBe(true)
    expect(middle).toHaveBeenCalledTimes(2)
    expect(middle).toHaveBeenLastCalledWith(Q05, 'q3')
    expect(panel).toHaveBeenCalledTimes(1)
  })

  it('a broken link goes nowhere and the webview does not navigate', () => {
    const { root } = mount(RSA03)
    root.insertAdjacentHTML('beforeend', '<a class="lk lk-broken" aria-disabled="true" href="x.md">gone</a>')
    const { panel, middle } = route(root)
    const a = root.querySelector<HTMLElement>('.lk-broken')!
    for (const init of [{}, { ctrlKey: true }]) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
      a.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    }
    const aux = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    a.dispatchEvent(aux)
    expect(aux.defaultPrevented).toBe(true)
    expect(panel).not.toHaveBeenCalled()
    expect(middle).not.toHaveBeenCalled()
  })

  it('a link to a missing item is rendered broken, with no data-path to route', () => {
    const text = 'See [x](../../one-cash-mover/issues/05-build-movecash.md#q99) and [y](nowhere.md).'
    const path = 'modules/remove-service-account/issues/99-t.md'
    const idx = buildIndex([...Object.values(index.files).map((r) => ({ path: r.path, text: readFileSync(join(docsRoot, r.path), 'utf8'), mtime: 0 })), { path, text, mtime: 0 }])
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(text, { path, rec: idx.files[path], index: idx })
    const links = [...root.querySelectorAll('a')]
    expect(links).toHaveLength(2)
    for (const a of links) {
      expect(a.classList.contains('lk-broken')).toBe(true)
      expect(a.hasAttribute('data-path')).toBe(false)
    }
  })
})

describe('fragment-only rendering', () => {
  it('Q1 shows only that item, with its answer marker', () => {
    const rec = index.files[Q05]
    const text = readFileSync(join(docsRoot, Q05), 'utf8')
    const range = extractFragment(text, rec, 'q1')
    expect(range).not.toBeNull()
    const { root } = mount(Q05, range)
    const heads = [...root.querySelectorAll('[data-anchor]')]
    expect(heads.map((h) => h.getAttribute('data-anchor'))).toEqual(['q1'])
    expect(root.querySelector('.marker')?.textContent).toContain('Answered 2026-11-10')
    expect(root.textContent).not.toContain('Who moves the cash')
    expect(root.querySelector('h1, h2')).toBeNull() // no document title or section heading leaks in
  })

  it('Q3 shows only Q3, and a scoped data-anchor query finds it', () => {
    const rec = index.files[Q05]
    const text = readFileSync(join(docsRoot, Q05), 'utf8')
    const { root } = mount(Q05, extractFragment(text, rec, 'q3'))
    expect(root.querySelector('[data-anchor="q3"]')?.textContent).toContain('Who moves the cash in Step 4')
    expect(root.querySelector('[data-anchor="q1"]')).toBeNull()
    expect(root.querySelectorAll('.idtag')).toHaveLength(1)
  })

  it('a duplicate Q35 heading resolves through Item.fragments to one item', () => {
    const path = [...Object.keys(index.files)].find((p) => index.files[p].items.some((i) => i.fragments && i.fragments.length > 1))
    expect(path).toBeDefined()
    const rec = index.files[path!]
    const item = rec.items.find((i) => i.fragments && i.fragments.length > 1)!
    const text = readFileSync(join(docsRoot, path!), 'utf8')
    const a = extractFragment(text, rec, item.fragments![0])
    const b = extractFragment(text, rec, item.fragments![1])
    expect(a).toEqual(b)
  })

  it('an unknown fragment has no range', () => {
    const text = readFileSync(join(docsRoot, Q05), 'utf8')
    expect(extractFragment(text, index.files[Q05], 'q99')).toBeNull()
  })
})
