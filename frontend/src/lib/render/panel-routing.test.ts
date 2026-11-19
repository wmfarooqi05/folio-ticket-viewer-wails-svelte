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
import { resolveEntry } from '../panel'
import { questionChips, usedBy } from '../refs'

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

  const adhoc = (text: string) => {
    const path = 'modules/remove-service-account/issues/99-t.md'
    const idx = buildIndex([
      ...Object.values(index.files).map((r) => ({ path: r.path, text: readFileSync(join(docsRoot, r.path), 'utf8'), mtime: 0 })),
      { path, text, mtime: 0 },
    ])
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(text, { path, rec: idx.files[path], index: idx })
    document.body.append(root)
    return root
  }

  it('G1: a no-file or no-anchor link opens the panel (never the middle pane), a bad scheme stays inert', () => {
    const root = adhoc(
      'See [x](../../one-cash-mover/issues/05-build-movecash.md#q99), [y](nowhere.md) and [z](ftp://x.test/a).',
    )
    const [noAnchor, noFile, scheme] = [...root.querySelectorAll<HTMLElement>('a')]
    expect(noAnchor.dataset).toMatchObject({ broken: 'no-anchor', path: Q05, frag: 'q99' })
    expect(noFile.dataset.broken).toBe('no-file')
    expect(noFile.dataset.path).toBe('modules/remove-service-account/issues/nowhere.md')
    const panel = vi.fn()
    const middle = vi.fn()
    attachDocHandlers(root, { onLink: (p, f, mid, broken) => (mid ? middle(p, f) : panel(p, f, broken)), onExternal: vi.fn() })
    for (const a of [noAnchor, noFile, scheme]) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
      a.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true) // the webview never navigates
    }
    expect(middle).not.toHaveBeenCalled()
    expect(panel.mock.calls).toEqual([
      [Q05, 'q99', true],
      ['modules/remove-service-account/issues/nowhere.md', null, true],
    ])
  })

  it('a same-file #fragment that is not drawn (fragment-only view) goes to onLocal', () => {
    const { root } = mount(Q05, { start: 24, end: 24 }) // only Q1's marker line
    root.insertAdjacentHTML('beforeend', '<a class="lk" href="#" data-frag="q3">Q3</a>')
    const onLocal = vi.fn()
    attachDocHandlers(root, { onLink: vi.fn(), onExternal: vi.fn(), onLocal })
    const a = root.querySelector<HTMLElement>('a[data-frag="q3"]')!
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onLocal).toHaveBeenCalledWith('q3')
    // when the target is drawn, it scrolls instead
    root.insertAdjacentHTML('beforeend', '<h3 data-anchor="q9">x</h3><a class="lk" href="#" data-frag="q9">9</a>')
    ;(root.querySelector('h3') as HTMLElement).scrollIntoView = vi.fn()
    root.querySelector<HTMLElement>('a[data-frag="q9"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onLocal).toHaveBeenCalledTimes(1)
  })
})

describe('reference-style links in a fragment view', () => {
  it('definitions outside the range are kept, so a reference link inside it still resolves', () => {
    const path = 'modules/remove-service-account/issues/99-t.md'
    const text = ['# T', '', '### Q1 — a', 'See [the ticket][t].', '', '### Q2 — b', 'Other.', '', '[t]: ../../one-cash-mover/issues/05-build-movecash.md#q3'].join('\n')
    const idx = buildIndex([
      ...Object.values(index.files).map((r) => ({ path: r.path, text: readFileSync(join(docsRoot, r.path), 'utf8'), mtime: 0 })),
      { path, text, mtime: 0 },
    ])
    const rec = idx.files[path]
    const range = extractFragment(text, rec, 'q1')!
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(text, { path, rec, index: idx, range })
    const a = root.querySelector<HTMLElement>('a.lk')
    expect(a?.dataset.path).toBe(Q05)
    expect(a?.dataset.frag).toBe('q3')
    expect(root.textContent).not.toContain('[t]:')
    expect(root.textContent).not.toContain('Other.')
  })
})

describe('panel entry state and link groups', () => {
  it('resolveEntry: missing file, whole file, one item, and an item that is not there', () => {
    const rec = index.files[Q05]
    const text = readFileSync(join(docsRoot, Q05), 'utf8')
    expect(resolveEntry({ path: 'gone.md', fragment: null }, null, null)).toEqual({ state: 'missing' })
    expect(resolveEntry({ path: Q05, fragment: null }, rec, null)).toEqual({ state: 'whole', range: null })
    expect(resolveEntry({ path: Q05, fragment: 'q3' }, rec, null)).toBeNull() // still reading
    expect(resolveEntry({ path: Q05, fragment: 'q3' }, rec, text)?.state).toBe('fragment')
    expect(resolveEntry({ path: Q05, fragment: 'q99' }, rec, text)).toEqual({ state: 'bad-fragment', range: null })
  })

  it('the LINKS block: questions of the ticket and the documents that use it', () => {
    const rec = index.files[Q05]
    expect(questionChips(rec).map((c) => [c.label, c.fragment])).toEqual([
      ['Q1', 'q1'],
      ['Q3', 'q3'],
    ])
    const used = usedBy(rec, index)
    expect(used.length).toBeGreaterThan(0)
    expect(used.every((c) => c.ok && c.path && c.path !== Q05)).toBe(true)
    expect(new Set(used.map((c) => c.path)).size).toBe(used.length)
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
