<script lang="ts">
  import type { DocRecord } from '../lib/parser'
  import { buildRows } from '../lib/tree'

  interface Props {
    files: DocRecord[]
    selected: string | null
    onselect: (path: string) => void
  }
  let { files, selected, onselect }: Props = $props()

  const rows = $derived(buildRows(files))
</script>

<nav class="chrome flex-1 overflow-auto py-6" aria-label="Documents">
  {#each rows as row (row.key)}
    {#if row.kind === 'dir'}
      <div
        class="flex min-h-22 items-center truncate text-xs text-fg3"
        style:padding-left="{8 + row.depth * 14}px"
      >
        {row.name}
      </div>
    {:else}
      <button
        type="button"
        class="flex min-h-26 w-full items-center gap-6 truncate pr-8 text-left text-sm text-fg hover:bg-hover"
        class:bg-sel={selected === row.rec.path}
        style:padding-left="{8 + row.depth * 14}px"
        aria-current={selected === row.rec.path ? 'true' : undefined}
        title={row.rec.title}
        onclick={() => onselect(row.rec.path)}
      >
        <span class="truncate">{row.name}</span>
      </button>
    {/if}
  {/each}
</nav>
