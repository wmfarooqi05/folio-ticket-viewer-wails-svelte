// The step that runs after a document's HTML is in the page (ticket 14). DocView calls
// enhanceDoc once per render, for the middle pane and the side panel alike.
//
// This file is in the initial chunk and must stay tiny: it only looks at the DOM and decides.
// highlight.js and Mermaid are behind import(), and are fetched only when the document has
// a fence that needs them (a known language; a mermaid fence).

import { resolvedTheme } from '../theme/theme'
import { fenceLang, HIGHLIGHT_LANGS } from './langs'
import type { ThemeName } from './mermaid'

export interface EnhanceOptions {
  /** docs-relative path of the document */
  path: string
  /** the record's mtime: part of the diagram cache key */
  mtime: number
}

/** The source of each mermaid fence, read once: after a render the placeholder no longer holds it. */
const sources = new WeakMap<HTMLElement, string>()

const currentTheme = (): ThemeName => resolvedTheme(document.documentElement.dataset.theme)

/**
 * Highlights the fences in a known language and draws the mermaid ones. Returns a cleanup
 * that stops the theme watcher and drops any render still in flight.
 */
export function enhanceDoc(root: HTMLElement, o: EnhanceOptions): () => void {
  let alive = true

  const codes = [...root.querySelectorAll<HTMLElement>('.code code[class*="language-"]')].filter((c) => {
    const lang = fenceLang(c)
    return lang !== null && HIGHLIGHT_LANGS.has(lang) && !c.classList.contains('hljs')
  })
  if (codes.length > 0) {
    void import('./highlight')
      .then((h) => {
        if (!alive) return
        for (const c of codes) h.highlightCode(c, fenceLang(c)!)
      })
      .catch(() => {}) // the fence stays plain text
  }

  const els = [...root.querySelectorAll<HTMLElement>('.code[data-mermaid]')]
  let off: (() => void) | null = null
  if (els.length > 0) {
    const blocks = els.map((el, i) => {
      if (!sources.has(el)) sources.set(el, el.querySelector('code')?.textContent ?? '')
      // the fence's line in the file, so two views of one file share a diagram; the position
      // in this root only when the line is missing
      const line = Number(el.dataset.line)
      return { el, src: sources.get(el)!, n: Number.isFinite(line) && el.dataset.line ? line : -1 - i }
    })
    let shown: ThemeName | null = null
    const draw = () => {
      const theme = currentTheme()
      if (theme === shown) return
      shown = theme
      void import('./mermaid')
        .then((m) => m.renderBlocks(blocks, { path: o.path, mtime: o.mtime, theme, alive: () => alive && shown === theme }))
        .catch(() => {}) // the placeholder keeps the source
    }
    draw()

    // re-render when the theme toggles: the data-theme attribute, or the OS when it is "system"
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', draw)
    off = () => {
      mo.disconnect()
      mq.removeEventListener('change', draw)
    }
  }

  return () => {
    alive = false
    off?.()
  }
}
