// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { attachDocHandlers } from './dom'

function setup(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  const onLink = vi.fn()
  const onExternal = vi.fn()
  const off = attachDocHandlers(root, { onLink, onExternal })
  return { root, onLink, onExternal, off }
}

describe('attachDocHandlers', () => {
  it('a missing image is swapped for the placeholder, naming the path as written', () => {
    const { root } = setup('<p><img class="doc-img" src="/doc/a/evidence/x.png" data-href="evidence/x.png"></p>')
    const img = root.querySelector('img')!
    img.dispatchEvent(new Event('error')) // an image error does not bubble: the root listens in capture
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.img-missing')?.textContent).toContain('evidence/x.png')
    expect(root.querySelector('.img-missing')?.textContent).toContain('Not in this checkout')
  })

  it('an error on some other image is left alone', () => {
    const { root } = setup('<img src="/x.png">')
    root.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(root.querySelector('img')).not.toBeNull()
  })

  it('internal links call onLink with the path, fragment and the middle-pane flag', () => {
    const { root, onLink } = setup('<a class="lk" href="#" data-path="m/a.md" data-frag="q3">x</a>')
    const a = root.querySelector('a')!
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    expect(onLink).toHaveBeenNthCalledWith(1, 'm/a.md', 'q3', false)
    expect(onLink).toHaveBeenNthCalledWith(2, 'm/a.md', 'q3', true)
  })

  it('external links go to onExternal; broken and inert links do nothing and never navigate', () => {
    const { root, onLink, onExternal } = setup(
      '<a href="#" data-ext="https://e.test/">e</a><a class="lk-broken" aria-disabled="true">b</a><a href="https://evil.test">raw</a>',
    )
    const [ext, broken, raw] = [...root.querySelectorAll('a')]
    const clicks = [ext, broken, raw].map((a) => {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
      a.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    expect(clicks).toEqual([true, true, true])
    expect(onExternal).toHaveBeenCalledTimes(1)
    expect(onExternal).toHaveBeenCalledWith('https://e.test/')
    expect(onLink).not.toHaveBeenCalled()
  })

  it('ignores a link inside a Mermaid label: cancelled, never routed', () => {
    const { root, onLink, onExternal } = setup(
      '<div class="mermaid-out"><a href="#" data-ext="https://evil.example">x</a><a href="#" data-path="m/a.md">y</a></div>',
    )
    for (const a of root.querySelectorAll('a')) {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
      a.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    }
    expect(onExternal).not.toHaveBeenCalled()
    expect(onLink).not.toHaveBeenCalled()
  })

  it('the remover detaches the listeners', () => {
    const { root, onLink, off } = setup('<a href="#" data-path="m/a.md">x</a>')
    off()
    root.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onLink).not.toHaveBeenCalled()
  })
})
