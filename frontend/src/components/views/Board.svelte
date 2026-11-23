<script lang="ts">
  import Icon from '../../lib/icons/Icon.svelte'
  import type { Index, Status } from '../../lib/parser'
  import { live, clock } from '../../lib/live.svelte'
  import { COLUMN_GAP, RAIL, STATUS_VAR, boardFor, foldedColumns, isMirror, type ColumnId } from '../../lib/views'
  import BranchBadge from '../BranchBadge.svelte'
  import CopyRef from '../CopyRef.svelte'

  interface Props {
    index: Index
    /** path of the map file */
    mapPath: string
    onselect: (path: string) => void
  }
  let { index, mapPath, onselect }: Props = $props()

  const board = $derived(boardFor(index, mapPath))
  const rec = $derived(index.files[mapPath])
  // Q2: "Mirror live · updated 10:14" when the docs folder is the factory's mirror
  const mirror = $derived(isMirror(index))
  let stripOpen = $state(false)

  const COL_VAR = {
    open: 'var(--s-open)',
    'in-progress': 'var(--s-prog)',
    blocked: 'var(--s-block)',
    'needs-verification': 'var(--s-verify)',
    'in-review': 'var(--s-rev)',
    done: 'var(--s-done)',
  } as const

  // D6: below 1,048px columns fold to 40px rails (Done, Open, In review, Blocked); a rail opens on click.
  let width = $state(0)
  let opened = $state(new Set<ColumnId>())
  const folded = $derived(width > 0 ? foldedColumns(width, opened) : new Set<ColumnId>())
  const template = $derived(board.columns.map((c) => (folded.has(c.id) ? `${RAIL}px` : 'minmax(168px, 1fr)')).join(' '))
  const openRail = (id: ColumnId) => (opened = new Set([...opened, id]))
  // a new map starts folded again
  $effect(() => {
    void mapPath
    opened = new Set()
  })

  // Q9: a card that arrives in Needs verification while the board is open gets a fading ring.
  let seen: Map<string, Status> | null = null
  let arrived = $state(new Set<string>())
  $effect(() => {
    const now = new Map<string, Status>()
    for (const c of board.columns) for (const t of c.cards) now.set(t.path, t.meta.status)
    if (seen !== null) {
      const fresh = [...now].filter(([p, s]) => s === 'needs-verification' && seen!.has(p) && seen!.get(p) !== s).map(([p]) => p)
      if (fresh.length > 0) {
        arrived = new Set([...arrived, ...fresh])
        setTimeout(() => (arrived = new Set([...arrived].filter((p) => !fresh.includes(p)))), 1700)
      }
    }
    seen = now
  })
</script>

<div class="chrome mx-auto max-w-[1180px] animate-rise px-40 pt-8 pb-120">
  {#if board.total === 0}
    <p class="text-md text-fg3">This map has no tickets yet.</p>
  {:else}
    <header class="mb-14">
      <p class="m-0 font-mono text-xs text-fg3">{mapPath}</p>
      <h2 class="m-0 mt-2 text-lg font-semibold">{rec?.title}</h2>
      {#if mirror}
        <p class="m-0 mt-4 flex items-center gap-6 text-xs text-fg2" role="status">
          <span class="size-6 rounded-full {live.connected ? 'bg-s-done' : 'bg-s-rev'}" aria-hidden="true"></span>
          {live.connected ? 'Mirror live' : 'Mirror reconnecting'}{#if live.lastChange}<span class="text-fg3"
              >· updated {clock(live.lastChange)}</span
            >{/if}
        </p>
      {/if}
      <p class="m-0 mt-4 text-sm text-fg2">
        {board.summary.total}
        {board.summary.total === 1 ? 'ticket' : 'tickets'} · {board.summary.open} open · {board.summary.blocked} blocked
      </p>
      <div class="mt-8 flex h-6 gap-2 overflow-hidden rounded-full" aria-hidden="true">
        {#each board.columns as col (col.id)}
          {#if col.cards.length > 0}
            <span style:flex={col.cards.length} style:background={COL_VAR[col.id]}></span>
          {/if}
        {/each}
        {#if board.strip.length > 0}
          <span style:flex={board.strip.length} style:background="var(--s-mute)"></span>
        {/if}
      </div>
    </header>
    <div class="overflow-x-auto" bind:clientWidth={width}>
      <div class="grid" style:grid-template-columns={template} style:gap="{COLUMN_GAP}px">
        {#each board.columns as col, ci (col.id)}
          {@const verify = col.id === 'needs-verification'}
          {#if folded.has(col.id)}
            <button
              type="button"
              class="flex min-h-260 flex-col items-center gap-8 rounded-xl bg-colbg py-10 text-fg2 hover:bg-hover"
              aria-label="{col.label}, {col.cards.length} {col.cards.length === 1 ? 'ticket' : 'tickets'}. Show the column"
              title="Show {col.label}"
              onclick={() => openRail(col.id)}
            >
              <span class="size-7 shrink-0 rounded-full" style:background={COL_VAR[col.id]} aria-hidden="true"></span>
              <span class="font-mono text-xs text-fg3" aria-hidden="true">{col.cards.length}</span>
              <span class="rail-label text-sm font-semibold" aria-hidden="true">{col.label}</span>
            </button>
          {:else}
            <section
              class="col min-h-260 min-w-0 rounded-xl border border-solid border-transparent bg-colbg p-8"
              class:verify-col={verify}
              aria-label={col.label}
            >
              <h3 class="m-0 mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 px-3 text-sm font-semibold">
                <span
                  class="size-7 shrink-0 rounded-full {col.id === 'in-progress' ? 'pulse-dot' : ''}"
                  class:verify-dot={verify}
                  style:background={COL_VAR[col.id]}
                  style:color={COL_VAR[col.id]}
                ></span>
                <span>{col.label}</span>
                <span class="font-mono text-xs font-normal text-fg3">{col.cards.length}</span>
                {#if verify && col.cards.length > 0}
                  <span class="your-turn ml-auto text-2xs font-medium text-s-verify">your turn</span>
                {/if}
              </h3>
              {#if col.cards.length === 0}
                <p class="m-0 px-3 text-xs text-fg3">Nothing here.</p>
              {/if}
              <div class="flex flex-col gap-8">
                {#each col.cards as t, i (t.path)}
                  {@const blockers = board.blockers[t.path] ?? []}
                  {@const ring = arrived.has(t.path)}
                  <div
                    class="card relative flex animate-rise-card flex-col items-start gap-7 rounded-[9px] border border-solid border-line bg-card px-11 py-10 text-left shadow-hair transition-[transform,box-shadow,border-color] duration-[var(--dur-hover)] hover:-translate-y-2 hover:border-line2 hover:shadow-lift"
                    class:verify-card={verify}
                    style:animation-delay={ring ? undefined : `${(ci * 2 + i) * 45}ms`}
                    style:animation={ring ? 'rise 0.4s var(--ease-enter) backwards, verify-ring 1.6s ease-out' : undefined}
                  >
                    <span class="flex w-full items-center gap-6 font-mono text-xs text-fg3">
                      {t.num}
                      {#if t.meta.type[0]}<span class="rounded-xs bg-chip px-5 text-2xs">{t.meta.type[0]}</span>{/if}
                      {#if t.meta.afk}<span class="ml-auto text-[9.5px] tracking-[0.05em]">AFK</span>{/if}
                    </span>
                    <!-- the whole card opens the ticket through this button's ::after; copy ref sits above it -->
                    <button
                      type="button"
                      class="open text-left text-base leading-[1.35] font-medium"
                      onclick={() => onselect(t.path)}>{t.title}</button
                    >
                    {#if t.meta.status === 'unknown'}
                      <span class="flex items-center gap-6 text-xs text-fg3">
                        <span class="size-7 rounded-full border border-dashed border-fg3" aria-hidden="true"></span>
                        {#if t.statusRaw}
                          <span>status <i>{t.statusRaw}</i> (unknown)</span>
                        {:else}
                          <span>status unknown{t.meta.status_note ? ': ' : ''}<i>{t.meta.status_note ?? ''}</i></span>
                        {/if}
                      </span>
                    {:else}
                      <span class="sr-only">{t.meta.status}</span>
                    {/if}
                    {#if verify && t.meta.status_note}
                      <span class="w-full truncate text-xs text-fg2" title={t.meta.status_note}>{t.meta.status_note}</span>
                    {/if}
                    {#if blockers.length > 0}
                      <span class="flex flex-wrap gap-4">
                        {#each blockers as b, bi (b.ref + bi)}
                          <span
                            class="inline-flex h-19 items-center gap-3 rounded-full bg-chip px-7 font-mono text-2xs leading-[19px] text-s-block"
                            title="Blocked by {b.ref}"><Icon name="arrow-left" size={9} />{b.ref}</span
                          >
                        {/each}
                      </span>
                    {/if}
                    {#if t.meta.waiting_on && !verify}
                      <span class="text-xs text-fg2">waiting on {t.meta.waiting_on}</span>
                    {/if}
                    {#if t.board?.branch}
                      <BranchBadge branch={t.board.branch} title={t.board.branchNote} />
                    {/if}
                    {#if verify && t.key}
                      <span class="w-full border-t border-dashed border-line pt-7 text-xs text-fg2 italic">
                        say “{t.key} verified” in the agent’s chat
                      </span>
                      <CopyRef ref={t.key} />
                    {/if}
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        {/each}
      </div>
    </div>

    <div class="mt-14 rounded-xl bg-colbg">
      <button
        type="button"
        class="flex w-full items-center gap-8 px-12 py-10 text-left text-xs font-normal text-fg2"
        aria-expanded={stripOpen}
        onclick={() => (stripOpen = !stripOpen)}
      >
        <span
          class="grid place-items-center transition-transform duration-[var(--dur)]"
          style:transform="rotate({stripOpen ? 90 : 0}deg)"><Icon name="chevron-right" size={11} /></span
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

<style>
  /* Q5: the column heading shows "your turn" only when it fits; the status name never truncates */
  .col {
    container-type: inline-size;
  }
  @container (max-width: 239px) {
    .your-turn {
      display: none;
    }
  }
  /* D7: the Needs verification column is tinted 8%, with a 32% hairline; its dot is ringed */
  .verify-col {
    background: color-mix(in oklab, var(--s-verify) 8%, var(--colbg));
    border-color: color-mix(in oklab, var(--s-verify) 32%, transparent);
  }
  .verify-card {
    border-color: color-mix(in oklab, var(--s-verify) 32%, var(--line));
  }
  .verify-dot {
    outline: 1.5px solid currentColor;
    outline-offset: 1.5px;
  }
  /* the card is one click target, without nesting the copy button inside another button */
  .open::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 9px;
  }
  .open:focus-visible {
    outline: none;
  }
  .open:focus-visible::after {
    outline: 2px solid var(--acc);
    outline-offset: 2px;
  }
  .rail-label {
    writing-mode: vertical-rl;
    white-space: nowrap;
  }
</style>
