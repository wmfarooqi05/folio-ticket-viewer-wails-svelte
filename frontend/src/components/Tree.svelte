<script lang="ts">
  import type { DocRecord, TicketMeta } from '../lib/parser'
  import Icon from '../lib/icons/Icon.svelte'
  import type { PinnedItem } from '../lib/pinned'
  import { STATUS_LABEL, isStruck } from '../lib/status'
  import { ancestors, buildRows, searchRecords, visibleRows } from '../lib/tree'
  import { formatSize } from '../lib/index-engine'
  import StatusDot from './StatusDot.svelte'

  interface Props {
    files: DocRecord[]
    /** files over the size cap (ticket 18): path -> bytes. Shown with a "too large" tag. */
    tooLarge?: Record<string, number>
    selected: string | null
    onselect: (path: string) => void
    /** the pinned views list; ticket 12 feeds the real counts. Rows are drawn, links are stubs. */
    pinned?: PinnedItem[]
    activeView?: PinnedItem["id"] | null
    onview?: (id: PinnedItem["id"]) => void
  }
  let { files, tooLarge = {}, selected, onselect, pinned = [], activeView = null, onview }: Props = $props()

  const rows = $derived(buildRows(files))

  // Top-level folders start open; a selected document opens the folders above it.
  let open = $state(new Set<string>())
  let seeded = false
  $effect(() => {
    if (seeded || rows.length === 0) return
    seeded = true
    open = new Set(rows.filter((r) => r.kind === 'dir' && r.depth === 0).map((r) => (r as { path: string }).path))
  })
  $effect(() => {
    if (!selected) return
    const need = ancestors(selected).filter((p) => !open.has(p))
    if (need.length) open = new Set([...open, ...need])
  })

  function toggle(path: string) {
    const next = new Set(open)
    if (!next.delete(path)) next.add(path)
    open = next
  }

  let query = $state('')
  let input = $state<HTMLInputElement>()
  const shown = $derived(visibleRows(rows, open))
  const matches = $derived(searchRecords(files, query))
  const searching = $derived(query.trim() !== '')

  const statusOf = (rec: DocRecord) => (rec.kind === 'ticket' && rec.meta ? (rec.meta as TicketMeta).status : null)

  function onwindowkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && t?.tagName !== 'INPUT' && t?.tagName !== 'TEXTAREA') {
      e.preventDefault()
      input?.focus()
    }
  }
</script>

<svelte:window onkeydown={onwindowkeydown} />

<div class="chrome flex min-h-0 flex-1 flex-col">
  <div class="px-10 pt-10 pb-6">
    <label
      class="flex h-30 items-center gap-8 rounded-[8px] border border-line2 bg-card pr-8 pl-10 focus-within:border-acc"
    >
      <span class="text-fg3"><Icon name="search" size={12} /></span>
      <input
        bind:this={input}
        bind:value={query}
        class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg3"
        placeholder="Filter by title or path"
        aria-label="Filter documents"
        spellcheck="false"
        onkeydown={(e) => e.key === 'Escape' && ((query = ''), input?.blur())}
      />
      <kbd class="rounded-xs border border-line2 px-5 font-mono text-2xs text-fg3">/</kbd>
    </label>
  </div>

  {#if pinned.length > 0}
    <div class="flex flex-col gap-1 border-b border-line px-6 pt-4 pb-8" role="group" aria-label="Views">
      {#each pinned as p (p.id)}
        <button
          type="button"
          class="flex h-28 items-center gap-9 rounded-md px-8 text-left text-sm font-medium hover:bg-hover {activeView === p.id
            ? 'bg-sel text-fg'
            : 'text-fg2'}"
          aria-current={activeView === p.id ? 'true' : undefined}
          onclick={() => onview?.(p.id)}
        >
          <span class="grid w-16 place-items-center text-acc">{#if p.icon}<Icon name={p.icon} size={13} />{/if}</span>
          <span class="flex-1">{p.label}</span>
          {#if p.count !== null}<span class="font-mono text-2xs text-fg3">{p.count}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <nav class="min-h-0 flex-1 overflow-auto pt-6 pb-16" aria-label="Documents">
    {#if searching}
      <p class="px-16 pt-4 pb-6 text-[11px] text-fg3">
        {matches.length === 0 ? 'No matches' : matches.length === 1 ? '1 match' : `${matches.length} matches`}
      </p>
      {#each matches as rec (rec.path)}
        {@const status = statusOf(rec)}
        <button
          type="button"
          class="group mx-6 flex min-h-26 w-[calc(100%-12px)] items-center gap-6 rounded-sm px-10 text-left text-sm hover:bg-hover {selected ===
          rec.path
            ? 'bg-sel text-fg'
            : 'text-fg'}"
          aria-current={selected === rec.path ? 'true' : undefined}
          onclick={() => onselect(rec.path)}
        >
          {#if status}<StatusDot {status} />{/if}
          <span class="min-w-0 flex-1 py-4">
            <span class="block truncate" class:line-through={status && isStruck(status)}>{rec.title}</span>
            <span class="block truncate font-mono text-2xs text-fg3">{rec.path.replace(/^modules\//, '')}{#if tooLarge[rec.path]} · too large, {formatSize(tooLarge[rec.path])}{/if}</span>
          </span>
        </button>
      {/each}
    {:else}
      {#each shown as row (row.key)}
        {#if row.kind === 'dir'}
          {@const isOpen = open.has(row.path)}
          <button
            type="button"
            class="mx-6 flex min-h-26 w-[calc(100%-12px)] items-center gap-6 rounded-sm pr-8 text-left text-sm hover:bg-hover {row.count ===
            0
              ? 'text-fg3'
              : 'text-fg'} {row.depth === 0 ? 'font-medium' : ''}"
            style:padding-left="{8 + row.depth * 14}px"
            aria-expanded={isOpen}
            onclick={() => toggle(row.path)}
          >
            <span class="grid w-12 shrink-0 place-items-center text-fg3 transition-transform duration-(--dur)" class:rotate-90={isOpen}
              ><Icon name="chevron-right" size={11} /></span
            >
            <span class="min-w-0 flex-1 truncate">{row.name}{row.depth === 0 || row.name === 'issues' ? '/' : ''}</span>
            {#if row.count > 0}
              <span class="inline-grid h-17 min-w-18 place-items-center rounded-[5px] bg-chip px-5 font-mono text-2xs text-fg2"
                >{row.count}</span
              >
            {/if}
          </button>
        {:else}
          {@const rec = row.rec}
          {@const status = statusOf(rec)}
          {@const struck = status !== null && isStruck(status)}
          <button
            type="button"
            class="group mx-6 flex min-h-26 w-[calc(100%-12px)] items-center gap-6 rounded-sm pr-8 text-left text-sm hover:bg-hover {selected ===
            rec.path
              ? 'bg-sel font-medium text-fg'
              : struck
                ? 'text-fg3'
                : 'text-fg2'}"
            style:padding-left="{8 + row.depth * 14}px"
            aria-current={selected === rec.path ? 'true' : undefined}
            title={tooLarge[rec.path] !== undefined ? `${rec.title}: too large (${formatSize(tooLarge[rec.path])}), not read` : rec.title}
            onclick={() => onselect(rec.path)}
          >
            {#if status}
              <StatusDot {status} />
            {:else}
              <span class="w-7 shrink-0 font-mono text-[10px] text-fg3">#</span>
            {/if}
            <span class="min-w-0 flex-1 truncate py-4" class:line-through={struck}>{row.name}</span>
            {#if status}
              <span class="hidden text-[11px] whitespace-nowrap text-fg2 group-hover:inline">{STATUS_LABEL[status]}</span>
            {/if}
            {#if tooLarge[rec.path] !== undefined}
              <span
                class="shrink-0 rounded-xs border border-line2 px-4 font-mono text-[9.5px] whitespace-nowrap text-s-block"
                title="Over the 5 MB limit: Folio does not read this file"
                >too large · {formatSize(tooLarge[rec.path])}</span
              >
            {:else if rec.legacy && rec.kind === 'ticket'}
              <span class="rounded-xs border border-line2 px-4 font-mono text-[9.5px] text-fg3">legacy</span>
            {/if}
          </button>
        {/if}
      {/each}
    {/if}
  </nav>
</div>
