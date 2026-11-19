<script lang="ts">
  import DocView from '../src/components/DocView.svelte'
  import Tree from '../src/components/Tree.svelte'
  import type { Index } from '../src/lib/parser'
  import { pinnedItems } from '../src/lib/pinned'
  import { pinnedCounts } from '../src/lib/views'

  let { index, texts, start }: { index: Index; texts: Record<string, string>; start: string } = $props()
  let selected = $state(start)
  let fragment = $state<string | null>(null)
  const files = Object.values(index.files)
  const config = { adoWorkItemUrl: 'https://ado.example/wi/{id}', adoPrUrl: 'https://ado.example/pr/{id}' }
</script>

<div class="flex min-h-screen bg-bg text-fg">
  <aside class="flex h-screen w-280 shrink-0 flex-col border-r border-line bg-side" style="position: sticky; top: 0">
    <Tree
      {files}
      {selected}
      onselect={(p) => ((selected = p), (fragment = null))}
      pinned={pinnedItems(pinnedCounts(index))}
    />
  </aside>
  <main class="min-w-0 flex-1 bg-bg">
    <DocView
      path={selected}
      text={texts[selected] ?? null}
      error={null}
      {index}
      {config}
      {fragment}
      onnavigate={(p, f) => ((selected = p), (fragment = f))}
    />
  </main>
</div>
