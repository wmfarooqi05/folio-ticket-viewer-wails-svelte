<script lang="ts">
  import { tick, untrack } from 'svelte'
  import * as api from '../lib/api'
  import { fileAt, type Index, type LineRange } from '../lib/parser'
  import { attachDocHandlers, installNavGuard, scrollToAnchor } from '../lib/render/dom'
  import { enhanceDoc } from '../lib/render/enhance'
  import { renderMarkdown } from '../lib/render/markdown'
  import { makeUrls, type UrlTemplates } from '../lib/render/urls'
  import { editedAgo } from '../lib/status'
  import EvidencePanel from './EvidencePanel.svelte'
  import HeaderCard from './HeaderCard.svelte'
  import '../lib/render/doc.css'

  interface Props {
    path: string | null
    text: string | null
    error: string | null
    index?: Index | null
    /** only the ADO and PR templates are read */
    config?: UrlTemplates | null
    /** a heading or item to scroll to once the document is shown */
    fragment?: string | null
    /** an internal link was clicked: show `path` (and scroll to `fragment`) */
    onnavigate?: (path: string, fragment: string | null) => void
    /** `panel` is the right side panel: narrow gutters, no path line (the panel shows it) */
    variant?: 'main' | 'panel'
    /** fragment-only: render just these file lines (the parser's extractFragment range) */
    range?: LineRange | null
    /** a plain click on an internal link goes here (the panel); without it, to `onnavigate` */
    onpanel?: (path: string, fragment: string | null) => void
    /** the side panel's "open in the middle", offered by the compact evidence summary */
    onpromote?: () => void
  }
  let {
    path,
    text,
    error,
    index = null,
    config = null,
    fragment = null,
    onnavigate,
    variant = 'main',
    range = null,
    onpanel,
    onpromote,
  }: Props = $props()

  const rec = $derived(path && index ? (fileAt(index, path) ?? null) : null)
  const urls = $derived(makeUrls(config))
  const isTicket = $derived(rec?.kind === 'ticket' && rec.meta !== null)
  // The render is keyed on the record's mtime, the text and the link templates, not on `index`:
  // a live refresh swaps the index on every disk change, and the open document must not be
  // re-rendered (and lose its scroll) for an edit to some other file. Link states (a broken
  // link that now resolves) refresh the next time the document is shown.
  // The factory's board block is drawn by EvidencePanel, so the body does not repeat it. Its lines are
  // blanked, never cut, so the parser's file lines still match headings and items below it.
  const body_text = $derived.by(() => {
    if (text === null || !rec?.board) return text
    const lines = text.split('\n')
    const b = rec.board.line - 1
    let e = b
    while (e < lines.length && !/^<!--\s*factory:board\s+end\s*-->$/.test(lines[e].trim())) e++
    if (b < 0 || e >= lines.length) return text
    for (let i = b; i <= e; i++) lines[i] = ''
    return lines.join('\n')
  })
  let cache: { key: string; text: string; html: string } | null = null
  const html = $derived.by(() => {
    const text = body_text
    if (text === null || !rec) return null
    const key = [rec.path, rec.mtime, isTicket, range ? `${range.start}-${range.end}` : '', config?.adoWorkItemUrl ?? '', config?.adoPrUrl ?? ''].join('|')
    if (cache && cache.key === key && cache.text === text) return cache.html
    const out = untrack(() => renderMarkdown(text, { path: rec.path, rec, index: index!, urls, skipTitle: isTicket, range }))
    cache = { key, text, html: out }
    return out
  })

  let article = $state<HTMLElement>()
  let body = $state<HTMLElement>()
  let notice = $state<string | null>(null)

  function fail(what: string, err: unknown) {
    notice = `${what}: ${err instanceof Error ? err.message : String(err)}`
    setTimeout(() => (notice = null), 4000)
  }

  const open = (p: string, frag: string | null, middle = false, broken = false) => {
    // a broken link is explained in the panel, whichever document it points at
    if (broken && onpanel) return onpanel(p, frag)
    // a link to this very document scrolls; it never reloads the file
    if (p === path && variant === 'main') {
      if (frag && body && scrollToAnchor(body, frag)) return
      if (!frag && article?.parentElement) article.parentElement.scrollTop = 0
      return
    }
    if (middle) return onnavigate?.(p, frag) // Ctrl-click and middle-click: the middle pane
    if (p === path && frag && body && scrollToAnchor(body, frag)) return // in the panel: only if it is on show
    if (onpanel) onpanel(p, frag)
    else onnavigate?.(p, frag)
  }

  $effect(() => {
    installNavGuard()
    if (!body) return
    return attachDocHandlers(body, {
      onLink: (p, frag, middle, broken) => open(p, frag, middle, broken),
      // in the panel only one item is drawn: a link to another part of this file is one more hop
      onLocal: (f) => {
        if (variant === 'panel' && path) onpanel?.(path, f)
      },
      onExternal: (url) => api.openExternal(url).catch((e) => fail('Could not open the link', e)),
    })
  })

  // Highlight fences and draw mermaid diagrams once the HTML is in the page (ticket 14). The
  // mtime is read through a derived so a live refresh of another file does not re-run it.
  const mtime = $derived(rec?.mtime ?? 0)
  $effect(() => {
    if (!body || html === null || !path) return
    return enhanceDoc(body, { path, mtime })
  })

  // Scroll to the top for a new document, or to its fragment. A silent re-render of the
  // same document and fragment (a file changed on disk) leaves the scroll position alone.
  let shown = ''
  $effect(() => {
    const key = `${path}#${fragment ?? ''}@${range?.start ?? ''}`
    if (html === null || key === shown) return
    shown = key
    const frag = fragment
    void tick().then(() => {
      if (frag && body && scrollToAnchor(body, frag)) return
      if (article?.parentElement) article.parentElement.scrollTop = 0
    })
  })
</script>

<article
  bind:this={article}
  class="selectable mx-auto {variant === 'panel' ? 'px-16 pt-12 pb-48' : 'max-w-[780px] px-[clamp(18px,4vw,40px)] pt-22 pb-120'}"
>
  {#if error}
    <p class="text-md text-s-block" role="alert">{error}</p>
  {:else if path === null}
    <p class="text-md text-fg2">Select a document in the tree.</p>
  {:else}
    {#key path}
      <div class="animate-rise">
        {#if variant === 'main'}
          <div class="flex items-baseline gap-10 font-mono text-xs text-fg3">
            <span class="min-w-0 truncate">{path}</span>
            {#if rec}<span class="shrink-0 font-sans">· {editedAgo(rec.mtime)}</span>{/if}
          </div>
        {/if}
        {#if notice}<p class="mt-6 text-sm text-s-block" role="alert">{notice}</p>{/if}

        {#if rec && isTicket && !range}
          <div class="mt-10">
            <HeaderCard
              {rec}
              index={index!}
              {urls}
              onopen={open}
              onexternal={(url) => api.openExternal(url).catch((e) => fail('Could not open the link', e))}
              onvscode={() => api.openInVSCode(rec.path, 0).catch((e) => fail('Could not open VS Code', e))}
            />
          </div>
        {/if}

        {#if rec && isTicket && !range && rec.board && index}
          <EvidencePanel {rec} {index} compact={variant === 'panel'} {onpromote} />
        {/if}

        {#if text === null}
          <p class="mt-16 text-sm text-fg3">Loading…</p>
        {:else if html !== null}
          <div bind:this={body} class="doc mt-8">{@html html}</div>
        {:else}
          <pre class="mt-12 font-mono text-sm leading-[1.65] whitespace-pre-wrap text-fg">{text}</pre>
        {/if}
      </div>
    {/key}
  {/if}
</article>
