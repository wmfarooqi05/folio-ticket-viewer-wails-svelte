// The DOM side of the renderer: one delegated listener on the document root (06 D6), so
// the HTML string stays inert markup. link_open emits data attributes only; this decides
// what a click does. Copy buttons and the missing-image placeholder live here too.

import { imagePlaceholder } from './markdown'

export interface DocHandlers {
  /** an internal link: open `path` (and scroll to `frag`). `middle` is Ctrl-click or middle-click. */
  onLink(path: string, frag: string | null, middle: boolean, broken?: boolean): void
  /** a `#fragment` link whose target is not in this container (the panel shows one item only) */
  onLocal?(frag: string): void
  /** an external http(s) link: hand it to the OS browser */
  onExternal(url: string): void
}

/** Scrolls to the heading or item whose data-anchor is `frag`, inside `root`. Never uses ids. */
export function scrollToAnchor(root: ParentNode, frag: string): boolean {
  const el = root.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(frag)}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'start' })
  el.classList.remove('anchor-hit')
  void el.offsetWidth // restart the highlight if it is hit twice
  el.classList.add('anchor-hit')
  return true
}

function onClick(root: HTMLElement, h: DocHandlers, e: MouseEvent): void {
  if (e.button === 1 && e.type === 'click') return
  const target = e.target as Element | null
  const copy = target?.closest<HTMLElement>('[data-copy]')
  if (copy && root.contains(copy)) {
    if (e.type !== 'click') return
    const code = copy.closest('.code')?.querySelector('code')?.textContent ?? ''
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        copy.textContent = 'copied'
        setTimeout(() => (copy.textContent = 'copy'), 1200)
      })
      .catch(() => {})
    return
  }
  const a = target?.closest<HTMLElement>('a')
  if (!a || !root.contains(a)) return
  // the webview must never navigate away from the app, so every anchor is cancelled
  e.preventDefault()
  // a link inside a Mermaid label is diagram content, never a route (ticket 14)
  if (a.closest('.mermaid-out')) return
  if (a.getAttribute('aria-disabled') === 'true') return
  const { path, frag, ext, broken } = a.dataset
  if (ext) {
    if (e.type === 'click' || e.button === 1) h.onExternal(ext)
  } else if (path) {
    // a broken link opens the panel to say why (03 spec G1); it never goes to the middle pane
    if (broken) {
      if (e.type === 'click') h.onLink(path, frag ?? null, false, true)
    } else h.onLink(path, frag ?? null, e.ctrlKey || e.metaKey || e.button === 1)
  } else if (frag) {
    if (!scrollToAnchor(root, frag)) h.onLocal?.(frag)
  }
}

/** Installs the click, auxclick and image-error listeners. Returns the remover. */
export function attachDocHandlers(root: HTMLElement, h: DocHandlers): () => void {
  const click = (e: MouseEvent) => onClick(root, h, e)
  // error does not bubble, so it is caught in the capture phase (CSP forbids inline onerror)
  const error = (e: Event) => {
    const img = e.target
    if (img instanceof HTMLImageElement && img.classList.contains('doc-img')) {
      img.outerHTML = imagePlaceholder(img.dataset.href ?? img.getAttribute('src') ?? '')
    }
  }
  root.addEventListener('click', click)
  root.addEventListener('auxclick', click)
  root.addEventListener('error', error, true)
  return () => {
    root.removeEventListener('click', click)
    root.removeEventListener('auxclick', click)
    root.removeEventListener('error', error, true)
  }
}

let guarded = false

/** A capture-phase listener that cancels any <a> navigation that no one handled. */
export function installNavGuard(): void {
  if (guarded) return
  guarded = true
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest('a')
      if (a && !a.hasAttribute('data-keep')) e.preventDefault()
    },
    true,
  )
}
