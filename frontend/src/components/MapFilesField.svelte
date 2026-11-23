<script lang="ts">
  // Settings: which file names can be a folder's map (ticket 47). Typed as a comma-separated list; the
  // first name wins when a folder has several. It is saved on "Use names", apart from the dialog's Save:
  // it is not part of getConfig, which the frozen desktop app shares.
  import { onMount } from 'svelte'
  import * as api from '../lib/api'
  import { parseMapFiles } from '../lib/settings'

  let { onchanged }: { onchanged?: () => void } = $props()

  const DEFAULT = 'map.md, README.md'
  let names = $state<string[]>([])
  let typed = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)

  onMount(() => {
    void api
      .getMapFiles()
      .then((n) => ((names = n), (typed = n.join(', '))))
      .catch(() => {})
  })

  async function use(text: string) {
    busy = true
    error = null
    try {
      names = await api.setMapFiles(parseMapFiles(text))
      typed = names.join(', ')
      onchanged?.()
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).replace(/^map files: /, '')
    } finally {
      busy = false
    }
  }
</script>

<div>
  <div class="lbl">Map files</div>
  <form class="row" onsubmit={(e) => (e.preventDefault(), void use(typed))}>
    <input
      class="inp mono"
      style="flex:1;min-width:0"
      spellcheck="false"
      aria-label="Map file names, comma-separated"
      placeholder={DEFAULT}
      bind:value={typed}
    />
    <button type="submit" class="btn" disabled={busy}>Use names</button>
    {#if names.length > 0 && names.join(', ') !== DEFAULT}
      <button type="button" class="btn" disabled={busy} onclick={() => ((typed = DEFAULT), void use(DEFAULT))}>Reset</button>
    {/if}
  </form>
  {#if error}
    <div class="hint" role="alert" style="margin-top:6px;color:var(--s-block)">{error}</div>
  {/if}
  <div class="hint" style="margin-top:6px;line-height:1.5">
    Which file in a folder gets the board, graph and map views. <span class="mono">map.md</span> always does; any other name only when
    an <span class="mono">issues/</span> folder of tickets sits beside it. The first name wins. Saved on this computer, not in the repo.
  </div>
</div>

<style>
  /* SettingsDialog's field styles are scoped to it, so this field carries its own copy */
  .lbl {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 500;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .btn {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line2);
    border-radius: 7px;
    background: var(--card);
    color: var(--fg);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .btn:hover {
    border-color: var(--fg3);
  }
  .inp {
    height: 32px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--line2);
    border-radius: 7px;
    background: var(--card);
    color: var(--fg);
    font-size: 12px;
    outline: none;
    user-select: text;
  }
  .inp:focus {
    border-color: var(--acc);
    outline: 2px solid var(--sel);
  }
  .mono {
    font-family: var(--font-mono);
  }
  .hint {
    margin-top: 5px;
    font-size: 11.5px;
    color: var(--fg3);
  }
</style>
