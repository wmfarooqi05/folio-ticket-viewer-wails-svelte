<script lang="ts">
  import type { Index } from '../../lib/parser'
  import { STATUS_VAR, ageDays, ageFill, ageLabel, ageTone, evidenceCounts, shortAge, waitingOn, waitingSince, waitingSpaces } from '../../lib/views'
  import CopyRef from '../CopyRef.svelte'
  import StatusDot from '../StatusDot.svelte'

  interface Props {
    index: Index
    onselect: (path: string) => void
    /** injectable for tests; the age is "edited N days ago" from mtime (03 D4), or the mirror's Waiting since */
    now?: number
  }
  let { index, onselect, now: nowProp }: Props = $props()
  // Fresh whenever the index changes, so ages do not freeze at mount.
  const now = $derived.by(() => {
    void index
    return nowProp ?? Date.now()
  })

  const groups = $derived(waitingOn(index))
  const total = $derived(groups.reduce((n, g) => n + g.verify.length + g.rows.length, 0))
  const spaces = $derived(waitingSpaces(groups))
  // Row animation delay runs across all groups (spec 6.5).
  const offsets = $derived(
    groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.verify.length + g.rows.length, 0)),
  )
  const BAR = { block: 'var(--s-block)', rev: 'var(--s-rev)', idle: 'var(--fg3)' } as const
</script>

<section class="chrome mx-auto max-w-[900px] animate-rise px-40 pt-26 pb-120">
  <h1 class="m-0 mb-6 text-xl font-semibold tracking-[-0.02em]">Waiting on</h1>
  {#if total === 0}
    <p class="text-md text-fg3">Nothing is waiting on anyone.</p>
  {:else}
    <p class="m-0 text-md text-fg2">
      {total}
      {total === 1 ? 'ticket' : 'tickets'} across {spaces}
      {spaces === 1 ? 'space' : 'spaces'}. You first{groups[0]?.verify.length ? ', with what needs verifying at the top' : ''}, then everyone
      else, oldest at the top.
    </p>
    {#each groups as g, gi (g.person)}
      <div class="mt-26">
        <div class="mb-8 flex items-center gap-9">
          <span
            class="grid size-22 place-items-center rounded-full text-[11px] font-semibold {g.person === 'owner'
              ? 'bg-acc text-acc-ink'
              : 'bg-chip text-fg2'}"
            aria-hidden="true">{g.label[0]}</span
          >
          <h2 class="m-0 text-base font-semibold">{g.label}</h2>
          <span class="font-mono text-xs text-fg3">{g.verify.length + g.rows.length}</span>
        </div>

        {#if g.verify.length > 0}
          <!-- D4: the owner's Needs verification tickets, lifted to the top of the group -->
          <div class="verify mb-10 overflow-hidden rounded-xl">
            <div class="flex items-center gap-8 px-16 pt-10 pb-6 text-xs">
              <StatusDot status="needs-verification" size={7} />
              <span class="font-semibold">Needs verification</span>
              <span class="text-fg3">oldest first</span>
            </div>
            {#each g.verify as rec, i (rec.path)}
              {@const since = waitingSince(rec)}
              {@const ev = evidenceCounts(rec)}
              <div
                class="relative grid animate-rise-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-12 border-t border-line px-16 py-10 hover:bg-hover"
                style:animation-delay="{(offsets[gi] + i) * 35}ms"
              >
                <span class="font-mono text-xs text-fg3">{rec.key}</span>
                <span class="min-w-0">
                  <button type="button" class="open block w-full truncate text-left text-base" onclick={() => onselect(rec.path)}
                    >{rec.title}</button
                  >
                  {#if rec.meta.status_note || ev}
                    <span class="block truncate text-xs text-fg2"
                      >{rec.meta.status_note ?? ''}{rec.meta.status_note && ev ? ' · ' : ''}{ev}</span
                    >
                  {/if}
                </span>
                <span class="flex items-center gap-10">
                  {#if rec.key}<CopyRef ref={rec.key} />{/if}
                  <span
                    class="w-32 text-right font-mono text-xs text-fg2"
                    title={since === null ? 'No "Waiting since" in the board block' : 'Waiting since ' + new Date(since).toLocaleString()}
                    >{since === null ? '—' : shortAge(since, now)}</span
                  >
                </span>
              </div>
            {/each}
          </div>
        {/if}

        {#if g.rows.length > 0}
          <div class="overflow-hidden rounded-xl border border-line bg-card">
            {#each g.rows as rec, i (rec.path)}
              {@const since = waitingSince(rec)}
              {@const days = since === null ? null : ageDays(since, now)}
              <button
                type="button"
                class="grid w-full animate-rise-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-12 px-16 py-11 text-left hover:bg-hover {i >
                0
                  ? 'border-t border-line'
                  : ''}"
                style:animation-delay="{(offsets[gi] + g.verify.length + i) * 35}ms"
                onclick={() => onselect(rec.path)}
              >
                <span class="flex items-center gap-7">
                  <span
                    class="size-7 rounded-full {rec.meta.status === 'unknown' ? 'border border-dashed' : ''}"
                    style:background={rec.meta.status === 'unknown' ? 'transparent' : STATUS_VAR[rec.meta.status]}
                    style:border-color={STATUS_VAR[rec.meta.status]}
                  ></span>
                  <span class="sr-only">{rec.meta.status}</span>
                  <span class="font-mono text-xs text-fg3">{rec.key}</span>
                </span>
                <span class="truncate text-base">{rec.title}</span>
                {#if days === null}
                  <!-- Q3: a mirror ticket's mtime is the last factory write, not an age -->
                  <span class="w-80 text-right text-xs text-fg3" title="No &quot;Waiting since&quot; in the board block">—</span>
                {:else}
                  <span class="flex items-center gap-8">
                    <span class="h-4 w-44 overflow-hidden rounded-full bg-chip" aria-hidden="true">
                      <span
                        class="block h-full origin-left animate-grow rounded-full"
                        style:width="{ageFill(days) * 100}%"
                        style:background={BAR[ageTone(days)]}
                      ></span>
                    </span>
                    <span
                      class="w-80 text-right text-xs {ageTone(days) === 'block' ? 'text-s-block' : 'text-fg2'}"
                      title={rec.board ? 'Waiting since, from the board block' : "Last edit, from the file's modified time"}
                      >{rec.board ? 'waiting' : 'edited'} {ageLabel(days)}</span
                    >
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</section>

<style>
  .verify {
    background: color-mix(in oklab, var(--s-verify) 8%, var(--card));
    border: 1px solid color-mix(in oklab, var(--s-verify) 32%, transparent);
  }
  /* the row is one click target; copy ref sits above it */
  .open::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .open:focus-visible {
    outline: none;
  }
  .open:focus-visible::after {
    outline: 2px solid var(--acc);
    outline-offset: -2px;
  }
</style>
