<script lang="ts">
  // Copy a ticket ref ("pay 05") to paste into the agent's chat (ticket 38). Folio stays read-only:
  // the verdict is given in the chat, so this is the only action a Needs verification ticket offers.
  interface Props {
    ref: string
    /** 22px on a card, 24px in the ticket view (the mockup's sizes) */
    size?: 'sm' | 'md'
  }
  let { ref, size = 'sm' }: Props = $props()

  let state = $state<'idle' | 'copied' | 'failed'>('idle')
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(e: MouseEvent) {
    // on a card the whole card opens the ticket: this click is only the copy
    e.stopPropagation()
    clearTimeout(timer)
    try {
      await navigator.clipboard.writeText(ref)
      state = 'copied'
      timer = setTimeout(() => (state = 'idle'), 1500)
    } catch {
      // no clipboard (an insecure context, or permission refused): show the ref to select by hand
      state = 'failed'
    }
  }
</script>

<!-- shrink-0 and nowrap: in the side panel's narrow Your turn strip, flex squeezed it onto two lines -->
<span class="relative z-1 inline-flex shrink-0 items-center gap-6">
  <button
    type="button"
    class="inline-flex items-center rounded-[6px] whitespace-nowrap border border-solid border-line2 bg-card px-8 font-mono text-[11px] text-fg2 hover:bg-hover hover:text-fg {size ===
    'md'
      ? 'h-24'
      : 'h-22'}"
    aria-label="Copy {ref}"
    onclick={copy}
  >
    {state === 'copied' ? 'copied' : state === 'failed' ? 'select and copy' : `copy ${ref}`}
  </button>
  {#if state === 'failed'}
    <code class="rounded-xs bg-chip px-5 font-mono text-[11px] select-all">{ref}</code>
  {/if}
  <span class="sr-only" aria-live="polite">{state === 'copied' ? `${ref} copied` : ''}</span>
</span>
