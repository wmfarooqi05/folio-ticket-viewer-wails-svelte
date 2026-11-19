<script lang="ts">
  import type { Index } from '../../lib/parser'
  import { STATUS_VAR, boardFor, liveBlockers } from '../../lib/views'

  interface Props {
    index: Index
    /** path of the map.md */
    mapPath: string
    onselect: (path: string) => void
  }
  let { index, mapPath, onselect }: Props = $props()

  const board = $derived(boardFor(index, mapPath))
  let stripOpen = $state(false)

  const COL_VAR = {
    open: 'var(--s-open)',
    'in-progress': 'var(--s-prog)',
    blocked: 'var(--s-block)',
    'in-review': 'var(--s-rev)',
    done: 'var(--s-done)',
  } as const
</script>

<div class="chrome mx-auto max-w-[1180px] animate-rise px-40 pt-8 pb-120">
  {#if board.total === 0}
    <p class="text-md text-fg3">This map has no tickets yet.</p>
  {:else}
    <div class="grid grid-cols-[repeat(5,minmax(180px,1fr))] gap-10">
      {#each board.columns as col, ci (col.id)}
        <section class="min-h-260 rounded-xl bg-colbg p-8" aria-label={col.label}>
          <h3 class="m-0 mb-8 flex items-center gap-6 px-3 text-sm font-semibold">
            <span
              class="size-7 rounded-full {col.id === 'in-progress' ? 'animate-pulse-dot' : ''}"
              style:background={COL_VAR[col.id]}
              style:color={COL_VAR[col.id]}
            ></span>
            {col.label}
            <span class="font-mono text-xs font-normal text-fg3">{col.cards.length}</span>
          </h3>
          {#if col.cards.length === 0}
            <p class="m-0 px-3 text-xs text-fg3">Nothing here.</p>
          {/if}
          <div class="flex flex-col gap-8">
            {#each col.cards as t, i (t.path)}
              {@const blockers = liveBlockers(index, t)}
              <button
                type="button"
                class="flex animate-rise-card flex-col items-start gap-7 rounded-[9px] border border-line bg-card px-11 py-10 text-left shadow-hair transition-[transform,box-shadow,border-color] duration-[var(--dur-hover)] hover:-translate-y-2 hover:border-line2 hover:shadow-lift"
                style:animation-delay="{(ci * 2 + i) * 45}ms"
                onclick={() => onselect(t.path)}
              >
                <span class="flex w-full items-center gap-6 font-mono text-xs text-fg3">
                  {t.num}
                  {#if t.meta.type[0]}<span class="rounded-xs bg-chip px-5 text-2xs">{t.meta.type[0]}</span>{/if}
                  {#if t.meta.afk}<span class="ml-auto text-[9.5px] tracking-[0.05em]">AFK</span>{/if}
                </span>
                <span class="text-base leading-[1.35] font-medium">{t.title}</span>
                {#if t.meta.status === 'unknown' && t.meta.status_note}
                  <span class="text-xs text-fg3 italic">{t.meta.status_note}</span>
                {/if}
                {#if blockers.length > 0}
                  <span class="flex flex-wrap gap-4">
                    {#each blockers as b (b.ref)}
                      <span
                        class="h-19 rounded-full bg-chip px-7 font-mono text-2xs leading-[19px] text-s-block"
                        title="Blocked by {b.ref}">← {b.ref}</span
                      >
                    {/each}
                  </span>
                {/if}
                {#if t.meta.waiting_on}
                  <span class="text-xs text-fg2">waiting on {t.meta.waiting_on}</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    <div class="mt-14 rounded-xl bg-colbg">
      <button
        type="button"
        class="flex w-full items-center gap-8 px-12 py-10 text-left text-sm font-semibold text-fg2"
        aria-expanded={stripOpen}
        onclick={() => (stripOpen = !stripOpen)}
      >
        <span
          class="text-[9px] transition-transform duration-[var(--dur)]"
          style:transform="rotate({stripOpen ? 90 : 0}deg)">▶</span
        >
        Dropped &amp; superseded
        <span class="font-mono text-xs font-normal text-fg3">{board.strip.length}</span>
      </button>
      {#if stripOpen}
        <div class="flex flex-wrap gap-8 px-12 pb-12">
          {#if board.strip.length === 0}
            <p class="m-0 text-xs text-fg3">Nothing dropped or superseded.</p>
          {/if}
          {#each board.strip as t, i (t.path)}
            <button
              type="button"
              class="flex animate-rise-card items-center gap-8 rounded-lg bg-chip px-10 py-7 text-left text-sm text-fg2 hover:bg-hover"
              style:animation-delay="{i * 45}ms"
              onclick={() => onselect(t.path)}
            >
              <span class="size-6 rounded-full" style:background={STATUS_VAR[t.meta.status]}></span>
              <span class="font-mono text-xs text-fg3">{t.num}</span>
              <span class="line-through decoration-fg3">{t.title}</span>
              <span class="text-2xs text-fg3">{t.meta.status}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
