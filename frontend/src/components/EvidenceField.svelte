<script lang="ts">
  // Settings: the folder agents stage evidence in (ticket 39, ticket 37 Q8). Web mode has no folder
  // dialog, so it is a typed path, like the docs folder. Folio serves a ticket's evidence files only
  // from inside it. It says "Reachable" from one stat and never lists the folder. --evidence wins for
  // the run. It is saved on "Use folder", apart from the dialog's Save: it is not part of getConfig,
  // which the frozen desktop app shares.
  import { onMount } from 'svelte'
  import * as api from '../lib/api'
  import type { EvidenceRoot } from '../lib/backend-types'

  let current = $state<EvidenceRoot | null>(null)
  let typed = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)

  onMount(() => {
    void api
      .getEvidence()
      .then((e) => ((current = e), (typed = e.fromCommandLine ? '' : e.root)))
      .catch(() => {})
  })

  async function use(path: string) {
    busy = true
    error = null
    try {
      current = await api.setEvidence(path)
      typed = current.fromCommandLine ? path : current.root
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).replace(/^evidence folder: /, '')
    } finally {
      busy = false
    }
  }
</script>

<div>
  <div class="lbl">Evidence folder <span class="opt">optional</span></div>
  <form class="row" onsubmit={(e) => (e.preventDefault(), void use(typed))}>
    <input
      class="inp mono"
      style="flex:1;min-width:0"
      spellcheck="false"
      aria-label="Path to the evidence folder"
      placeholder="U:/Evidence/app"
      bind:value={typed}
    />
    <button type="submit" class="btn" disabled={busy}>Use folder</button>
    {#if current?.root && !current.fromCommandLine}
      <button type="button" class="btn" disabled={busy} onclick={() => ((typed = ''), void use(''))}>Clear</button>
    {/if}
  </form>
  {#if current?.fromCommandLine}
    <div class="hint" style="margin-top:6px">
      Set by <span class="mono">--evidence {current.root}</span> for this run. A folder saved here applies the next time without
      <span class="mono">--evidence</span>.
    </div>
  {/if}
  {#if current?.root}
    <div class="hint" role="status" style="margin-top:6px">
      {current.reachable ? 'Reachable' : 'Not reachable now: check the drive or the path'}
    </div>
  {/if}
  {#if error}
    <div class="hint" role="alert" style="margin-top:6px;color:var(--s-block)">{error}</div>
  {/if}
  <div class="hint" style="margin-top:6px;line-height:1.5">
    Where agents stage screenshots and videos. Folio shows a ticket's evidence only from inside this folder, and never changes
    anything in it.
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
  .opt {
    margin-left: 6px;
    font-weight: 400;
    color: var(--fg3);
  }
</style>
