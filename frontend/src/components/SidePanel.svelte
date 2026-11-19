<script lang="ts">
  import * as api from '../lib/api'
  import Icon from '../lib/icons/Icon.svelte'
  import { extractFragment, type Index } from '../lib/parser'
  import { canBack, label, top, type PanelStack } from '../lib/panel'
  import type { UrlTemplates } from '../lib/render/urls'
  import DocView from './DocView.svelte'

  interface Props {
    /** the back stack; the last entry is on show */
    stack: PanelStack
    index: Index | null
    config?: UrlTemplates | null
    onback: () => void
    onpromote: () => void
    onclose: () => void
    /** a link clicked inside the panel: one more hop */
    onpush: (path: string, fragment: string | null) => void
    /** a trail click: back to that depth */
    onpopto: (depth: number) => void
    /** Ctrl-click or middle-click inside the panel: the middle pane */
    onnavigate: (path: string, fragment: string | null) => void
  }
  let { stack, index, config = null, onback, onpromote, onclose, onpush, onpopto, onnavigate }: Props = $props()

  const entry = $derived(top(stack))
  const rec = $derived(entry && index ? (index.files[entry.path] ?? null) : null)

  let text = $state<string | null>(null)
  let error = $state<string | null>(null)
  let notice = $state<string | null>(null)
  let loaded = ''
  let token = 0

  // Read the entry's file: again when the path changes, or when the file changed on disk.
  $effect(() => {
    const path = entry?.path
    const mtime = rec?.mtime
    if (!path || !rec) {
      text = null
      error = null
      loaded = ''
      return
    }
    const key = `${path}|${mtime}`
    if (key === loaded) return
    if (!loaded.startsWith(path + '|')) text = null // a new file; a live refresh keeps the old text on show
    loaded = key
    error = null
    const mine = ++token
    api
      .readFile(path)
      .then((t) => mine === token && (text = t))
      .catch((e) => mine === token && (error = e instanceof Error ? e.message : String(e)))
  })

  // The item or section, or null for the whole file (no fragment, or one that is not in the file).
  const range = $derived(entry?.fragment && rec && text !== null ? extractFragment(text, rec, entry.fragment) : null)
  const missingFragment = $derived(!!entry?.fragment && !!rec && text !== null && range === null)
  const fileName = $derived(entry ? entry.path.split('/').pop()! : '')

  function fail(what: string, err: unknown) {
    notice = `${what}: ${err instanceof Error ? err.message : String(err)}`
    setTimeout(() => (notice = null), 4000)
  }
</script>

{#if entry}
  <div class="flex h-full w-360 flex-col">
    <header class="flex h-44 shrink-0 items-center gap-6 border-b border-line px-8">
      <button
        type="button"
        class="inline-flex h-28 items-center gap-4 rounded-md px-8 text-xs font-medium text-fg2 enabled:hover:bg-hover disabled:opacity-40"
        title="Back  Alt+Left"
        disabled={!canBack(stack)}
        onclick={onback}
      >
        <Icon name="arrow-left" size={13} />Back
      </button>
      <span class="min-w-0 flex-1 truncate text-center font-mono text-xs text-fg2" title={entry.path}>{fileName}</span>
      <button
        type="button"
        class="h-28 rounded-md border border-line px-8 text-[11.5px] font-medium whitespace-nowrap text-fg2 transition-[border-color,color] duration-(--dur-press) hover:border-acc hover:text-acc"
        onclick={onpromote}
      >
        Open in middle
      </button>
      <button
        type="button"
        class="inline-flex h-28 w-28 items-center justify-center rounded-md text-fg2 hover:bg-hover"
        title="Close  Esc"
        aria-label="Close panel"
        onclick={onclose}
      >
        <Icon name="x" size={14} />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-auto">
      {#if stack.length > 1}
        <nav class="flex flex-wrap items-center gap-x-2 gap-y-2 px-16 pt-10 font-mono text-[11px] text-fg3" aria-label="Panel trail">
          {#each stack as e, i (i)}
            {#if i > 0}<Icon name="chevron-right" size={10} />{/if}
            {#if i < stack.length - 1}
              <button type="button" class="rounded-xs px-2 hover:text-acc" onclick={() => onpopto(i)}>{label(e)}</button>
            {:else}
              <span class="px-2 text-fg" aria-current="true">{label(e)}</span>
            {/if}
          {/each}
        </nav>
      {/if}

      <div class="flex items-center gap-8 px-16 pt-8 font-mono text-xs text-fg3">
        <span class="min-w-0 flex-1 truncate" title={entry.path}>{entry.path}</span>
        {#if rec}
          <button
            type="button"
            class="shrink-0 rounded-sm border border-line px-6 py-1 font-sans text-[11px] text-fg2 hover:border-acc hover:text-acc"
            title={range ? `Open in VS Code at line ${range.start}` : 'Open in VS Code'}
            onclick={() => api.openInVSCode(rec.path, range?.start ?? 0).catch((e) => fail('Could not open VS Code', e))}
          >
            VS Code
          </button>
        {/if}
      </div>
      {#if notice}<p class="px-16 pt-6 text-sm text-s-block" role="alert">{notice}</p>{/if}

      {#if !rec}
        <!-- an unknown target: a card, never a navigation -->
        <section class="m-16 rounded-lg border border-dashed border-s-block px-14 py-12" role="alert" data-broken>
          <p class="text-sm font-medium text-s-block">Not found</p>
          <p class="mt-4 font-mono text-xs break-all text-fg2">{entry.path}{entry.fragment ? `#${entry.fragment}` : ''}</p>
          <p class="mt-6 text-xs text-fg3">This file is not in the docs folder.</p>
        </section>
      {:else}
        {#if range}
          <p class="px-16 pt-6 text-xs text-fg3">Showing one item from this file.</p>
        {:else if missingFragment}
          <p class="mx-16 mt-8 rounded-sm border border-dashed border-s-block px-10 py-6 text-xs text-s-block" role="status" data-banner>
            Item #{entry.fragment} not found
          </p>
        {/if}
        <DocView
          variant="panel"
          path={entry.path}
          {text}
          {error}
          {index}
          {config}
          {range}
          onpanel={onpush}
          {onnavigate}
        />
      {/if}
    </div>
  </div>
{/if}
