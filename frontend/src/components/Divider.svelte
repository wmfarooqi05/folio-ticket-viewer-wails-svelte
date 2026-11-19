<script lang="ts">
  // A drag handle on a pane's edge: a 9px hit area with a 2px accent line. The behaviour
  // (pointer capture, rAF drag, keys, double-click reset) lives in the Splitter.
  import type { Splitter } from '../lib/layout.svelte'

  interface Props {
    splitter: Splitter
    label: string
    /** the width drawn now, and the widest it may be right now */
    now: number
    max: number
    /** which edge of its pane the handle sits on */
    edge: 'left' | 'right'
    /** id of the pane it resizes */
    controls: string
  }
  let { splitter, label, now, max, edge, controls }: Props = $props()
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-controls={controls}
  aria-valuenow={now}
  aria-valuemin={splitter.spec.min}
  aria-valuemax={max}
  tabindex="0"
  class="group/h absolute inset-y-0 z-10 w-[9px] cursor-col-resize touch-none outline-none {edge === 'right' ? '-right-[5px]' : 'left-0'}"
  onpointerdown={splitter.start}
  onpointermove={splitter.move}
  onpointerup={splitter.end}
  onpointercancel={splitter.end}
  onlostpointercapture={splitter.end}
  ondblclick={splitter.reset}
  onkeydown={splitter.key}
>
  <span
    class="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-acc transition-opacity duration-(--dur-hover) {splitter.dragging
      ? 'opacity-100'
      : 'opacity-0 group-hover/h:opacity-60 group-focus-visible/h:opacity-100'}"
  ></span>
</div>
