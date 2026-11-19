<script lang="ts">
  import type { ChipModel } from '../lib/refs'
  import StatusDot from './StatusDot.svelte'

  interface Props {
    chip: ChipModel
    /** a blocker chip is outlined harder than a related one */
    strong?: boolean
    onopen: (path: string, fragment: string | null) => void
  }
  let { chip, strong = false, onopen }: Props = $props()
</script>

<button
  type="button"
  class="inline-flex h-22 max-w-full min-w-0 items-center gap-6 rounded-sm border bg-card px-8 font-mono text-xs whitespace-nowrap transition-[border-color,color] duration-(--dur-press) {chip.ok
    ? 'hover:border-acc hover:text-acc'
    : 'cursor-default border-dashed !border-s-block text-s-block'} {strong ? 'border-line2' : 'border-line text-fg2'}"
  class:opacity-55={chip.resolved}
  title={chip.title}
  aria-disabled={!chip.ok}
  onclick={() => chip.ok && chip.path && onopen(chip.path, chip.fragment)}
>
  {#if chip.status}<StatusDot status={chip.status} size={6} />{/if}
  <span class="shrink-0">{chip.label}</span>
  {#if strong && chip.ok}
    <span class="min-w-0 truncate font-sans text-fg3">{chip.title}</span>
  {/if}
</button>
