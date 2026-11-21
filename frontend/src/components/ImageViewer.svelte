<script lang="ts">
  // The full-size image view (ticket 40, the mockup's "Full-size image"): a modal dialog, focus inside,
  // ← → to move, Esc to close, alt text from the file name. Focus goes back where it came from.
  import { onDestroy, onMount } from 'svelte'

  interface Props {
    images: { src: string; name: string; alt: string }[]
    start: number
    onclose: () => void
  }
  let { images, start, onclose }: Props = $props()

  let i = $state(0)
  $effect.pre(() => {
    i = Math.min(Math.max(start, 0), images.length - 1)
  })
  const cur = $derived(images[i])
  let dlg: HTMLDivElement
  let opener: Element | null = null

  const move = (d: number) => (i = (i + d + images.length) % images.length)

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Tab') {
      // keep focus inside the dialog
      const items = [...dlg.querySelectorAll<HTMLElement>('button')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  onMount(() => {
    opener = document.activeElement
    dlg.focus()
  })
  onDestroy(() => {
    if (opener instanceof HTMLElement) opener.focus()
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={dlg}
  class="viewer"
  role="dialog"
  aria-modal="true"
  aria-label={cur.alt}
  tabindex="-1"
  {onkeydown}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={onclose}></div>
  <div class="bar">
    <span class="font-mono">{cur.name}</span>
    <span class="count">{i + 1} / {images.length}</span>
    <span class="keys">← → to move · Esc to close</span>
    <button type="button" class="btn" aria-label="Close" onclick={onclose}>×</button>
  </div>
  {#if images.length > 1}
    <button type="button" class="btn nav prev" aria-label="Previous image" onclick={() => move(-1)}>←</button>
    <button type="button" class="btn nav next" aria-label="Next image" onclick={() => move(1)}>→</button>
  {/if}
  <img class="full" src={cur.src} alt={cur.alt} />
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 56px 72px 32px;
    outline: none;
    animation: fadeIn 0.15s ease;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    background: var(--lightbox);
  }
  .full {
    position: relative;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 6px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }
  .bar {
    position: absolute;
    inset: 0 0 auto 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    color: #f4f4ef;
    font-size: 12.5px;
  }
  .count,
  .keys {
    color: rgba(244, 244, 239, 0.65);
  }
  .keys {
    margin-left: auto;
  }
  .btn {
    position: relative;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #f4f4ef;
    font-size: 16px;
    cursor: pointer;
  }
  .btn:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .btn:focus-visible {
    outline: 2px solid var(--acc);
    outline-offset: 2px;
  }
  .nav {
    position: absolute;
    top: 50%;
    translate: 0 -50%;
  }
  .prev {
    left: 20px;
  }
  .next {
    right: 20px;
  }
</style>
