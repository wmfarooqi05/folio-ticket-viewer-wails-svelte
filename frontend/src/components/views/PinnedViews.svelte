<script lang="ts">
  // Stopgap pinned rows (Waiting on, Open questions) with counts. Ticket 10 adds the real
  // pinned list inside Tree.svelte and takes `pinnedCounts(index)` as props; at merge, this
  // component and its one line in App.svelte go away.
  import type { Index } from '../../lib/parser'
  import { pinnedCounts, type ViewId } from '../../lib/views'


  interface Props {
    index: Index
    view: ViewId | null
    onview: (v: ViewId) => void
  }
  let { index, view, onview }: Props = $props()

  const counts = $derived(pinnedCounts(index))
  const rows = $derived([
    { id: 'waiting' as const, label: 'Waiting on', glyph: '◔', n: counts.waiting },
    { id: 'questions' as const, label: 'Open questions', glyph: '?', n: counts.questions },
  ])
</script>

<div class="chrome flex flex-col gap-2 border-b border-line px-6 py-6" aria-label="Views">
  {#each rows as r (r.id)}
    <button
      type="button"
      class="flex min-h-28 items-center gap-8 rounded-md px-8 text-left text-sm hover:bg-hover {view === r.id
        ? 'bg-sel'
        : ''}"
      aria-current={view === r.id ? 'true' : undefined}
      onclick={() => onview(r.id)}
    >
      <span class="w-14 text-center text-fg3" aria-hidden="true">{r.glyph}</span>
      <span class="flex-1">{r.label}</span>
      <span class="font-mono text-xs text-fg3">{r.n}</span>
    </button>
  {/each}
</div>
