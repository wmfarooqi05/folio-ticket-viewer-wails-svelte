<script lang="ts">
  /** The Folio mark (a ticket) in the theme accent, plus the wordmark. Both follow the app theme tokens. */
  let { wordmark = true, size = 18 }: { wordmark?: boolean; size?: number } = $props()
</script>

<span class="inline-flex items-center gap-6">
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    style="color: var(--acc)"
    aria-hidden={wordmark ? 'true' : undefined}
    role={wordmark ? undefined : 'img'}
    aria-label={wordmark ? undefined : 'Folio'}
  >
    <path d="M5 9.5A2.5 2.5 0 0 1 7.5 7h17A2.5 2.5 0 0 1 27 9.5V13a3 3 0 0 0 0 6v3.5a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 5 22.5V19a3 3 0 0 0 0-6z" />
    <path d="M11.5 13.5h9M11.5 18.5h5.5" />
  </svg>
  {#if wordmark}<span class="text-[13.5px] font-semibold tracking-[-0.01em]">Folio</span>{/if}
</span>
