<script module lang="ts">
  // The chosen mode per map outlives the component, so opening a card from the Board and
  // coming back lands on the Board again.
  import { SvelteMap } from 'svelte/reactivity'
  const remembered = new SvelteMap<string, 'doc' | 'board' | 'graph'>()
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Index } from '../../lib/parser'
  import Board from './Board.svelte'

  interface Props {
    index: Index
    /** path of the open map.md */
    path: string
    onselect: (path: string) => void
    /** the rendered map document (Doc mode) */
    doc: Snippet
  }
  let { index, path, onselect, doc }: Props = $props()

  type Mode = 'doc' | 'board' | 'graph'
  const MODES: { id: Mode; label: string }[] = [
    { id: 'doc', label: 'Doc' },
    { id: 'board', label: 'Board' },
    { id: 'graph', label: 'Graph' },
  ]

  const mode = $derived<Mode>(remembered.get(path) ?? 'doc')
  const pick = (m: Mode) => remembered.set(path, m)
</script>

<div class="chrome sticky top-0 z-10 flex justify-end bg-bg px-40 pt-12">
  <div class="inline-flex gap-2 rounded-lg bg-chip p-2" role="group" aria-label="Map view">
    {#each MODES as m (m.id)}
      <button
        type="button"
        aria-pressed={mode === m.id}
        class="h-22 rounded-md px-12 text-xs font-medium transition-colors duration-[var(--dur)] {mode === m.id
          ? 'bg-card text-fg shadow-hair'
          : 'text-fg2 hover:text-fg'}"
        onclick={() => pick(m.id)}
      >
        {m.label}
      </button>
    {/each}
  </div>
</div>

{#if mode === 'board'}
  <Board {index} mapPath={path} {onselect} />
{:else if mode === 'graph'}
  <!-- lazy: the layout, the SVG and the node styles stay out of the initial chunk (06 D3) -->
  {#await import('./Graph.svelte') then g}
    <g.default {index} mapPath={path} {onselect} />
  {/await}
{:else}
  {@render doc()}
{/if}
