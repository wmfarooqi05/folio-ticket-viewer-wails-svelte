<script lang="ts">
  import type { Index } from '../../lib/parser'
  import { STATUS_VAR, ageDays, ageFill, ageLabel, ageTone, waitingOn, waitingSpaces } from '../../lib/views'

  interface Props {
    index: Index
    onselect: (path: string) => void
    /** injectable for tests; the age is "edited N days ago" from mtime (03 D4) */
    now?: number
  }
  let { index, onselect, now = Date.now() }: Props = $props()

  const groups = $derived(waitingOn(index))
  const total = $derived(groups.reduce((n, g) => n + g.rows.length, 0))
  const spaces = $derived(waitingSpaces(groups))
  // Row animation delay runs across all groups (spec 6.5).
  const offsets = $derived(
    groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.rows.length, 0)),
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
      {spaces === 1 ? 'module' : 'modules'}. You first, then everyone else, oldest at the top.
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
          <span class="font-mono text-xs text-fg3">{g.rows.length}</span>
        </div>
        <div class="overflow-hidden rounded-xl border border-line bg-card">
          {#each g.rows as rec, i (rec.path)}
            {@const days = ageDays(rec.mtime, now)}
            <button
              type="button"
              class="grid w-full animate-rise-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-12 px-16 py-11 text-left hover:bg-hover {i >
              0
                ? 'border-t border-line'
                : ''}"
              style:animation-delay="{(offsets[gi] + i) * 35}ms"
              onclick={() => onselect(rec.path)}
            >
              <span class="flex items-center gap-7">
                <span
                  class="size-7 rounded-full {rec.meta.status === 'unknown' ? 'border border-dashed' : ''}"
                  style:background={rec.meta.status === 'unknown' ? 'transparent' : STATUS_VAR[rec.meta.status]}
                  style:border-color={STATUS_VAR[rec.meta.status]}
                ></span>
                <span class="font-mono text-xs text-fg3">{rec.key}</span>
              </span>
              <span class="truncate text-base">{rec.title}</span>
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
                  title="Last edit, from the file's modified time">edited {ageLabel(days)}</span
                >
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</section>
