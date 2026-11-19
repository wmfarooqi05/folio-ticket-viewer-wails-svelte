<script lang="ts">
  import { tick, untrack } from 'svelte'
  import * as api from '../lib/api'
  import Icon from '../lib/icons/Icon.svelte'
  import type { Index, LineRange } from '../lib/parser'
  import { canBack, label, resolveEntry, top, type PanelStack } from '../lib/panel'
  import { chipsFor, questionChips, usedBy, type ChipModel } from '../lib/refs'
  import type { UrlTemplates } from '../lib/render/urls'
  import DocView from './DocView.svelte'
  import RefChip from './RefChip.svelte'

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

  // The text with the path and mtime it was read at, so a record and a text never mix: on a hop
  // the old file's text is never shown for the new record, and after a live refresh the range
  // is only recomputed once the text for the new mtime has arrived.
  let loaded = $state.raw<{ path: string; mtime: number; text: string } | null>(null)
  let error = $state<string | null>(null)
  let notice = $state<string | null>(null)
  let token = 0
  let backBtn = $state<HTMLButtonElement>()
  let closeBtn = $state<HTMLButtonElement>()

  const text = $derived(loaded && entry && loaded.path === entry.path ? loaded.text : null)

  $effect(() => {
    const path = entry?.path
    const mtime = rec?.mtime
    if (!path || mtime === undefined) return
    if (untrack(() => loaded?.path === path && loaded.mtime === mtime)) return
    error = null
    const mine = ++token
    api
      .readFile(path)
      .then((t) => mine === token && (loaded = { path, mtime, text: t }))
      .catch((e) => mine === token && (error = e instanceof Error ? e.message : String(e)))
  })

  // Resolved once per (entry, text). While a refreshed file is being read the previous range stays.
  let kept: { key: string; range: LineRange | null } | null = null
  const resolved = $derived.by(() => {
    if (!entry) return null
    const key = `${entry.path}#${entry.fragment ?? ''}`
    const fresh = !!rec && !!loaded && loaded.path === entry.path && loaded.mtime === rec.mtime
    if (!fresh && rec && entry.fragment && kept?.key === key) {
      return { state: kept.range ? ('fragment' as const) : ('bad-fragment' as const), range: kept.range }
    }
    const r = resolveEntry(entry, rec, fresh ? text : null)
    if (r && r.state !== 'missing') kept = { key, range: r.range }
    return r
  })
  const range = $derived(resolved && 'range' in resolved ? resolved.range : null)

  const fileName = $derived(entry ? entry.path.split('/').pop()! : '')

  // The LINKS block, for a whole ticket (03 spec: blocked by, related, used by, questions)
  const links = $derived.by(() => {
    if (!rec || !index || rec.kind !== 'ticket' || entry?.fragment) return []
    return [
      { name: 'blocked by', chips: chipsFor(rec, 'blocked_by', index) },
      { name: 'related', chips: chipsFor(rec, 'related', index) },
      { name: 'used by', chips: usedBy(rec, index) },
      { name: 'questions', chips: questionChips(rec) },
    ].filter((g) => g.chips.length > 0)
  })

  function fail(what: string, err: unknown) {
    notice = `${what}: ${err instanceof Error ? err.message : String(err)}`
    setTimeout(() => (notice = null), 4000)
  }

  // Back at depth 1 disables its button: move focus to Close first, so it is not left on a dead control
  function goBack() {
    if (stack.length <= 2) closeBtn?.focus()
    onback()
  }
  $effect(() => {
    if (!canBack(stack) && backBtn && document.activeElement === backBtn) void tick().then(() => closeBtn?.focus())
  })

  const open = (chip: ChipModel) => chip.ok && chip.path && onpush(chip.path, chip.fragment)
</script>

{#if entry}
  <div class="flex h-full w-360 flex-col">
    <header class="flex h-44 shrink-0 items-center gap-6 border-b border-line px-8">
      <button
        bind:this={backBtn}
        type="button"
        class="inline-flex h-28 items-center gap-4 rounded-md px-8 text-xs font-medium text-fg2 enabled:hover:bg-hover disabled:opacity-40"
        title="Back  Alt+Left"
        disabled={!canBack(stack)}
        onclick={goBack}
      >
        <Icon name="arrow-left" size={13} />Back
      </button>
      <span class="min-w-0 flex-1 truncate text-center font-mono text-xs text-fg2" title={entry.path}>{fileName}</span>
      <button
        type="button"
        class="h-28 rounded-md border border-line px-8 text-[11.5px] font-medium whitespace-nowrap text-fg2 transition-[border-color,color] duration-(--dur-press) enabled:hover:border-acc enabled:hover:text-acc disabled:opacity-40"
        disabled={!rec}
        onclick={onpromote}
      >
        Open in middle
      </button>
      <button
        bind:this={closeBtn}
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
        {#if resolved?.state === 'fragment'}
          <p class="px-16 pt-6 text-xs text-fg3">Showing one item from this file.</p>
        {:else if resolved?.state === 'bad-fragment'}
          <p class="mx-16 mt-8 rounded-sm border border-dashed border-s-block px-10 py-6 text-xs text-s-block" role="status" data-banner>
            Item #{entry.fragment} not found
          </p>
        {/if}
        {#if links.length}
          <section class="mx-16 mt-10 grid grid-cols-[auto_1fr] items-start gap-x-12 gap-y-6" aria-label="Links">
            {#each links as g (g.name)}
              <span class="pt-3 text-[11px] tracking-[0.04em] text-fg3 uppercase">{g.name}</span>
              <div class="flex flex-wrap gap-6">
                {#each g.chips as chip, i (i)}
                  <RefChip {chip} strong={g.name === 'blocked by'} onopen={() => open(chip)} />
                {/each}
              </div>
            {/each}
          </section>
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
