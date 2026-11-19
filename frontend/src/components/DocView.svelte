<script lang="ts">
  interface Props {
    path: string | null
    text: string | null
    error: string | null
  }
  let { path, text, error }: Props = $props()
</script>

<article class="selectable mx-auto max-w-[780px] px-[clamp(18px,4vw,40px)] pt-22 pb-120">
  {#if error}
    <p class="text-md text-s-block" role="alert">{error}</p>
  {:else if path === null}
    <p class="text-md text-fg2">Select a document in the tree.</p>
  {:else}
    <p class="mb-8 font-mono text-xs text-fg3">{path}</p>
    <pre class="font-mono text-sm leading-[1.65] whitespace-pre-wrap text-fg">{text ?? ''}</pre>
  {/if}
</article>
