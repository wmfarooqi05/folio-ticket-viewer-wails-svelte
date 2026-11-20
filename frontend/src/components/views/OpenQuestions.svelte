<script lang="ts">
  import type { Index } from '../../lib/parser'
  import { ageDays, ageFill, ageLabel, ageTone, openQuestions, questionSpaces, questionWhere } from '../../lib/views'

  interface Props {
    index: Index
    onselect: (path: string) => void
    now?: number
  }
  let { index, onselect, now: nowProp }: Props = $props()
  // Fresh whenever the index changes, so ages do not freeze at mount.
  const now = $derived.by(() => {
    void index
    return nowProp ?? Date.now()
  })

  // 04 D6: Q items of closed tickets are hidden by default, with a toggle.
  let hideClosed = $state(true)

  const rows = $derived(openQuestions(index, !hideClosed))
  const spaces = $derived(questionSpaces(rows))
  const BAR = { block: 'var(--s-block)', rev: 'var(--s-rev)', idle: 'var(--fg3)' } as const
</script>

<section class="chrome mx-auto max-w-[900px] animate-rise px-40 pt-26 pb-120">
  <div class="flex items-start justify-between gap-16">
    <div>
      <h1 class="m-0 mb-6 text-xl font-semibold tracking-[-0.02em]">Open questions</h1>
      <p class="m-0 mb-22 text-md text-fg2">
        {#if rows.length === 0}
          <span class="text-fg3">Nothing is unanswered.</span>
        {:else}
          {rows.length} unanswered across {spaces}
          {spaces === 1 ? 'space' : 'spaces'}, oldest first.
        {/if}
      </p>
    </div>
    <label class="mt-6 flex shrink-0 items-center gap-6 text-sm text-fg2">
      <input type="checkbox" bind:checked={hideClosed} class="accent-acc" />
      Hide closed tickets
    </label>
  </div>

  {#if rows.length > 0}
    <div class="overflow-hidden rounded-xl border border-line bg-card">
      {#each rows as r, i (r.rec.path + '#' + r.item.id)}
        {@const days = ageDays(r.rec.mtime, now)}
        <button
          type="button"
          class="grid w-full animate-rise-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-12 gap-y-6 px-16 py-13 text-left hover:bg-hover {i >
          0
            ? 'border-t border-line'
            : ''}"
          style:animation-delay="{i * 35}ms"
          onclick={() => onselect(r.rec.path)}
        >
          <span class="rounded-xs bg-chip px-6 py-1 font-mono text-2xs text-fg2">{r.item.id.toUpperCase()}</span>
          <span class="truncate text-base">{r.item.title}</span>
          <span class="flex items-center gap-8">
            <span class="h-4 w-44 overflow-hidden rounded-full bg-chip" aria-hidden="true">
              <span
                class="block h-full origin-left animate-grow rounded-full"
                style:width="{ageFill(days) * 100}%"
                style:background={BAR[ageTone(days)]}
              ></span>
            </span>
            <span class="w-80 text-right text-xs {ageTone(days) === 'block' ? 'text-s-block' : 'text-fg2'}">
              edited {ageLabel(days)}
            </span>
          </span>
          <span></span>
          <span class="truncate text-xs text-fg3">
            <span class="font-mono">{questionWhere(r.rec)}</span>
            {#if r.rec.kind === 'ticket'}<span> · {r.rec.title}</span>{/if}
            {#if r.closed}<span class="ml-6 rounded-xs bg-chip px-4 text-2xs">closed</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</section>
