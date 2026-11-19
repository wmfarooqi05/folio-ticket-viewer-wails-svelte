<script lang="ts">
  import { tick } from 'svelte'
  import * as api from '../lib/api'
  import type { Index } from '../lib/parser'
  import { attachDocHandlers, installNavGuard, scrollToAnchor } from '../lib/render/dom'
  import { renderMarkdown } from '../lib/render/markdown'
  import { makeUrls, type UrlTemplates } from '../lib/render/urls'
  import { editedAgo } from '../lib/status'
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
  }
  let { path, text, error, index = null, config = null, fragment = null, onnavigate }: Props = $props()

  const rec = $derived(path && index ? (index.files[path] ?? null) : null)
  const urls = $derived(makeUrls(config))
  const isTicket = $derived(rec?.kind === 'ticket' && rec.meta !== null)
  const html = $derived(
    text !== null && rec && index ? renderMarkdown(text, { path: rec.path, rec, index, urls, skipTitle: isTicket }) : null,
  )

  let article = $state<HTMLElement>()
  let body = $state<HTMLElement>()
  let notice = $state<string | null>(null)

  function fail(what: string, err: unknown) {
    notice = `${what}: ${err instanceof Error ? err.message : String(err)}`
    setTimeout(() => (notice = null), 4000)
  }

  const open = (p: string, frag: string | null) => onnavigate?.(p, frag)

  $effect(() => {
    installNavGuard()
    if (!body) return
    return attachDocHandlers(body, {
      onLink: (p, frag) => open(p, frag), // the right panel arrives with ticket 11; until then the middle pane
      onExternal: (url) => api.openExternal(url).catch((e) => fail('Could not open the link', e)),
    })
  })

  // Scroll to the top for a new document, or to its fragment. A silent re-render of the
  // same document and fragment (a file changed on disk) leaves the scroll position alone.
  let shown = ''
  $effect(() => {
    const key = `${path}#${fragment ?? ''}`
    if (html === null || key === shown) return
    shown = key
    const frag = fragment
    void tick().then(() => {
      if (frag && body && scrollToAnchor(body, frag)) return
      if (article?.parentElement) article.parentElement.scrollTop = 0
    })
  })
</script>

<article bind:this={article} class="selectable mx-auto max-w-[780px] px-[clamp(18px,4vw,40px)] pt-22 pb-120">
  {#if error}
    <p class="text-md text-s-block" role="alert">{error}</p>
  {:else if path === null}
    <p class="text-md text-fg2">Select a document in the tree.</p>
  {:else}
    {#key path}
      <div class="animate-rise">
        <div class="flex items-baseline gap-10 font-mono text-xs text-fg3">
          <span class="min-w-0 truncate">{path}</span>
          {#if rec}<span class="shrink-0 font-sans">· {editedAgo(rec.mtime)}</span>{/if}
        </div>
        {#if notice}<p class="mt-6 text-sm text-s-block" role="alert">{notice}</p>{/if}

        {#if rec && isTicket}
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
