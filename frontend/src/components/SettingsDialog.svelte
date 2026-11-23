<script lang="ts">
  // Settings dialog (ticket 13, 05 D4). Look and values come from
  // docs/assets/13-settings-mockup.src.html. Sections and fields come from SECTIONS.
  import { onDestroy, onMount, untrack } from 'svelte'
  import * as api from '../lib/api'
  import type { Config, RootCheck } from '../lib/api'
  import { checkPath, isNetworkPath, noRootsText, pickRoot } from '../lib/folder'
  import { docsRootPath } from '../lib/path'
  import EvidenceField from './EvidenceField.svelte'
  import MapFilesField from './MapFilesField.svelte'
  import {
    SECTIONS,
    THEMES,
    draftFrom,
    needsRescan,
    parseTypedRoot,
    patchFrom,
    rootCandidates,
    rootLabel,
    saveDisabled,
    templateExample,
    toggleRoot,
    validateDraft,
    validateTemplate,
    type Draft,
    type Field,
  } from '../lib/settings'

  let {
    config,
    scan,
    onclose,
    onsaved,
    onmapfiles,
  }: {
    config: Config
    scan: { count: number; walkMs: number } | null
    onclose: () => void
    onsaved: (cfg: Config, rescan: boolean) => void
    /** the map file names were saved (ticket 47): the index is rebuilt with them */
    onmapfiles?: () => void
  } = $props()

  const saved: Draft = untrack(() => draftFrom(config))
  let draft = $state<Draft>(untrack(() => draftFrom(config)))
  let sec = $state<(typeof SECTIONS)[number]['id']>('folder')
  let check = $state.raw<RootCheck | null>(null)
  let saveError = $state<string | null>(null)
  let busy = $state(false)
  let dlg: HTMLDivElement
  let opener: Element | null = null

  const errors = $derived(validateDraft(draft))
  const disabled = $derived(busy || saveDisabled(draft, saved))
  const hasRepo = $derived(draft.repoRoot !== '')
  // Folders typed in the box this session stay as chips when unticked. The check asks about these only: the
  // folders it finds come back in check.folders and are added to the chips, so they never feed the check again.
  let added = $state<string[]>([])
  // Not the ticked roots: a tick must not walk the docs folder again.
  const askRoots = $derived(rootCandidates(saved.docsRoots, [], added))
  const candidates = $derived(rootCandidates(draft.docsRoots, check?.folders ?? [], added))
  let typedRoot = $state('')
  let typedRootError = $state<string | null>(null)
  function addRoot() {
    const r = parseTypedRoot(typedRoot)
    if ('error' in r) {
      typedRootError = r.error
      return
    }
    typedRootError = null
    typedRoot = ''
    // The file system may be case-insensitive: "Modules" is the "modules" chip, not a second root.
    const root = candidates.find((c) => c.toLowerCase() === r.root.toLowerCase()) ?? r.root
    if (!candidates.includes(root)) added = [...added, root]
    if (!draft.docsRoots.includes(root)) draft.docsRoots = toggleRoot(draft.docsRoots, root, rootCandidates(draft.docsRoots, check?.folders ?? [], [...added, root]))
  }
  // The selected roots decide it, not the found candidates: a found but unticked root does not count.
  const noRoots = $derived(
    hasRepo && check !== null && draft.docsRoots.length > 0 && !draft.docsRoots.some((r) => found(r)),
  )
  const issues = $derived({
    folder: noRoots || !!errors.docsRoots || !!errors.docsDir,
    links: !!errors.adoWorkItemUrl || !!errors.adoPrUrl,
    appearance: false,
    data: false,
  })

  // Which roots exist on disk, re-checked when the folder, docs name or roots change.
  let seq = 0
  $effect(() => {
    const [repo, dir, roots] = [draft.repoRoot, draft.docsDir, askRoots]
    if (!repo) {
      check = null
      return
    }
    const mine = ++seq
    const t = setTimeout(async () => {
      try {
        const rc = await api.checkDocs(repo, dir, roots)
        if (mine === seq) check = rc
      } catch (err) {
        if (mine === seq) check = null
        console.error('CheckDocs failed', err)
      }
    }, 120)
    return () => clearTimeout(t)
  })

  onMount(() => {
    opener = document.activeElement
    dlg.focus()
  })
  onDestroy(() => {
    if (opener instanceof HTMLElement) opener.focus()
  })

  async function choose() {
    try {
      const res = await pickRoot()
      if (res.kind === 'ok') {
        draft.repoRoot = res.repoRoot
        draft.docsDir = res.docsDir
        if (res.docsRoots) draft.docsRoots = res.docsRoots // a map.md or issues/ folder: the whole docs folder
      } else if (res.kind === 'no-roots') {
        if (res.refused) saveError = res.message
        else draft.repoRoot = res.picked // shows the "No roots" warning
      }
    } catch (err) {
      saveError = message(err)
    }
  }

  // Web mode: no native dialog, so the folder is a typed path, checked like a picked one.
  let typed = $state(untrack(() => docsRootPath(config.repoRoot, config.docsDir)))
  let cliFolder = $state<string | null>(null)
  onMount(() => {
    if (api.isWeb) void api.docsFromCommandLine().then((p) => (cliFolder = p)).catch(() => {})
  })
  async function chooseTyped() {
    try {
      const res = await checkPath(typed, undefined, true)
      if (res.kind === 'ok') {
        draft.repoRoot = res.repoRoot
        draft.docsDir = res.docsDir
        if (res.docsRoots) draft.docsRoots = res.docsRoots
        typed = docsRootPath(res.repoRoot, res.docsDir)
      } else if (res.kind === 'no-roots') {
        if (res.refused) saveError = res.message // a network or device path: web mode has no dialog to pick it in
        else draft.repoRoot = res.picked // shows the "No roots" warning
      }
    } catch (err) {
      saveError = message(err)
    }
  }

  // "Clear data" (ticket 18, L5): two clicks, then what was done and what is left for the next start.
  let confirmClear = $state(false)
  let clearing = $state(false)
  let cleared = $state.raw<api.ClearDataResult | null>(null)
  async function clearData() {
    clearing = true
    saveError = null
    try {
      cleared = await api.clearData()
      confirmClear = false
    } catch (err) {
      saveError = message(err)
    } finally {
      clearing = false
    }
  }

  async function save() {
    if (disabled) return
    busy = true
    saveError = null
    try {
      const patch = patchFrom(draft, saved)
      const next = await api.setConfig(patch)
      onsaved(next, needsRescan(patch))
    } catch (err) {
      saveError = message(err)
      busy = false
    }
  }

  /** "invalid settings: docsRoots: none of …" becomes the plain sentence. */
  const message = (err: unknown) =>
    (err instanceof Error ? err.message : String(err))
      .replace(/^invalid settings: /, '')
      .split('; ')
      .map((p) => p.replace(/^[A-Za-z]+: /, ''))
      .join('. ')

  // On window, not on the dialog: when a focused button unmounts (Choose again) focus
  // falls to <body>, and the keys must still work. The app behind is inert.
  function onwindowkeydown(e: KeyboardEvent) {
    if (!dlg.contains(document.activeElement)) dlg.focus()
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    } else if (e.key === 'Enter' && !e.isComposing && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      void save()
    } else if (e.key === 'Tab') {
      // Keep focus inside the modal.
      const items = [...dlg.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dlg)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // A folder the check listed holds .md files, so it counts as found even when it was not one of the roots asked about.
  const found = (root: string) => (check?.found ?? []).includes(root) || (check?.folders ?? []).includes(root)
  // Web mode has no RAM readout to switch, so that toggle is not offered.
  const section = $derived.by(() => {
    const s = SECTIONS.find((x) => x.id === sec)!
    return api.isWeb ? { ...s, fields: s.fields.filter((f) => f.key !== 'showMemory') } : s
  })
  const watchLine = $derived(
    !scan || noRoots || !hasRepo
      ? `Watching 0 files${scan ? ` · last scan ${scan.walkMs} ms` : ''}`
      : `Watching ${scan.count} files · last scan ${scan.walkMs} ms`,
  )
  const issueColor = (id: string) => (id === 'links' ? 'var(--s-block)' : 'var(--s-rev)')

  function setField(f: Field, value: string) {
    if (f.key === 'docsDir' || f.key === 'adoWorkItemUrl' || f.key === 'adoPrUrl') draft[f.key] = value
  }
</script>

<svelte:window onkeydown={onwindowkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="scrim"
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose()
  }}
>
  <div
    class="dlg"
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
    tabindex="-1"
    bind:this={dlg}
  >
    <div class="head">
      <span class="title">Settings</span>
      <span class="sub">writes settings.json only · tickets are never changed</span>
      <button class="x" type="button" aria-label="Close" title="Close  Esc" onclick={onclose}>×</button>
    </div>

    <div class="mid">
      <div class="secs" role="tablist" aria-orientation="vertical" aria-label="Settings sections">
        {#each SECTIONS as s (s.id)}
          <button
            type="button"
            role="tab"
            aria-selected={sec === s.id}
            class="sec"
            class:on={sec === s.id}
            onclick={() => (sec = s.id)}
          >
            <span style="flex:1">{s.label}</span>
            {#if issues[s.id]}<span class="dot" style="background:{issueColor(s.id)}"></span>{/if}
          </button>
        {/each}
      </div>

      <div class="pane" role="tabpanel" aria-label={section.label}>
        {#key sec}
          <div class="fields" style:gap={sec === 'links' ? '20px' : undefined}>
            {#each section.fields as f (f.key)}
              {#if f.kind === 'folder'}
                <div>
                  <div class="lbl">{f.label}</div>
                  {#if api.isWeb}
                    <form class="row" onsubmit={(e) => (e.preventDefault(), void chooseTyped())}>
                      <input
                        class="inp mono"
                        style="flex:1;min-width:0"
                        spellcheck="false"
                        aria-label="Path to the repo or its docs folder"
                        placeholder="E:/path/to/repo or its docs folder"
                        bind:value={typed}
                      />
                      <button type="submit" class="btn">Use folder</button>
                    </form>
                    {#if cliFolder}
                      <div class="hint" style="margin-top:6px">
                        This session was started with <span class="mono">--docs {cliFolder}</span>. That folder is used until
                        you restart; a folder saved here applies the next time without <span class="mono">--docs</span>.
                      </div>
                    {/if}
                  {:else}
                    <div class="row">
                      <div class="path" title={draft.repoRoot}>{draft.repoRoot || 'No folder chosen'}</div>
                      <button type="button" class="btn" onclick={choose}>Choose folder…</button>
                    </div>
                  {/if}
                  {#if isNetworkPath(draft.repoRoot)}
                    <div class="warn" role="note" style="margin-top:8px">
                      <span class="dot" style="width:7px;height:7px;background:var(--s-rev)"></span>
                      <span style="flex:1;min-width:0">
                        A network folder: Folio reads it over the network with your Windows sign-in. It is forgotten when Folio closes, so
                        choose it again next time.
                      </span>
                    </div>
                  {/if}
                  {#if noRoots}
                    <div class="warn" role="alert">
                      <span class="dot" style="width:7px;height:7px;background:var(--s-rev)"></span>
                      <span style="flex:1;min-width:0">
                        This folder has <span class="mono" style="font-size:11.5px">{noRootsText(draft.docsRoots)}</span>
                        {#if (check?.folders ?? []).length > 0}. Tick a folder below, or the whole docs folder.{/if}
                      </span>
                      {#if !api.isWeb}<button type="button" class="link" onclick={choose}>Choose again</button>{/if}
                    </div>
                  {/if}
                </div>
              {:else if f.kind === 'docsDir'}
                <div>
                  <label class="lbl" for="docsDir">{f.label}</label>
                  <input
                    id="docsDir"
                    class="inp mono"
                    class:bad={!!errors.docsDir}
                    style="width:180px"
                    spellcheck="false"
                    aria-invalid={!!errors.docsDir}
                    value={draft.docsDir}
                    oninput={(e) => setField(f, e.currentTarget.value)}
                  />
                  {#if errors.docsDir}
                    <div class="err"><span class="dot" style="background:var(--s-block)"></span>{errors.docsDir}</div>
                  {:else}
                    <div class="hint">{f.hint}</div>
                  {/if}
                </div>
              {:else if f.kind === 'roots'}
                <div>
                  <div class="lbl" style="margin-bottom:8px">{f.label}</div>
                  <div class="chips">
                    {#each candidates as r (r)}
                      {@const on = draft.docsRoots.includes(r)}
                      <button
                        type="button"
                        class="chip"
                        class:on
                        aria-pressed={on}
                        onclick={() => (draft.docsRoots = toggleRoot(draft.docsRoots, r, candidates))}
                      >
                        <span class="box">{on ? '✓' : ''}</span>
                        <span>{rootLabel(r)}</span>
                        <span class="found">
                          {#if check === null}
                            <span class="fdot unknown"></span>{hasRepo ? 'checking…' : ''}
                          {:else}
                            <span class="fdot" class:missing={!found(r)}></span>{found(r) ? 'found' : 'missing'}
                          {/if}
                        </span>
                      </button>
                    {/each}
                  </div>
                  <form
                    class="row"
                    style="margin-top:8px"
                    onsubmit={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      addRoot()
                    }}
                  >
                    <input
                      id="addRoot"
                      class="inp mono"
                      class:bad={!!typedRootError}
                      style="width:230px"
                      spellcheck="false"
                      placeholder="another folder, e.g. specs"
                      aria-label="Add another folder, relative to the docs folder"
                      aria-invalid={!!typedRootError}
                      bind:value={typedRoot}
                      oninput={() => (typedRootError = null)}
                      onkeydown={(e) => e.stopPropagation()}
                    />
                    <button type="submit" class="btn">Add</button>
                  </form>
                  {#if typedRootError}
                    <div class="err"><span class="dot" style="background:var(--s-block)"></span>{typedRootError}</div>
                  {/if}
                  {#if errors.docsRoots}
                    <div class="err"><span class="dot" style="background:var(--s-block)"></span>{errors.docsRoots}</div>
                  {/if}
                </div>
                <div class="watch">
                  <span class="dot" style="background:{noRoots || !hasRepo ? 'var(--s-rev)' : 'var(--s-done)'}"></span>{watchLine}
                </div>
              {:else if f.kind === 'template'}
                {@const bad = validateTemplate(draft[f.key] as string)}
                <div>
                  <label class="lbl" for={f.key}>{f.label}</label>
                  <input
                    id={f.key}
                    class="inp mono"
                    class:bad={!!bad}
                    style="width:100%"
                    spellcheck="false"
                    placeholder="https://…/{'{id}'}"
                    aria-invalid={!!bad}
                    value={draft[f.key] as string}
                    oninput={(e) => setField(f, e.currentTarget.value)}
                  />
                  {#if bad}
                    <div class="err"><span class="dot" style="background:var(--s-block)"></span>{bad}</div>
                  {:else if draft[f.key]}
                    <div class="hint ex">
                      <span style="flex:none">Example:</span>
                      <span class="mono ex-v">{templateExample(draft[f.key] as string, f.sampleId ?? '1')}</span>
                    </div>
                  {:else}
                    <div class="hint">Empty switches this link off.</div>
                  {/if}
                </div>
              {:else if f.kind === 'theme'}
                <div>
                  <div class="lbl" style="margin-bottom:8px">{f.label}</div>
                  <div class="seg" role="radiogroup" aria-label={f.label}>
                    {#each THEMES as t (t.value)}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={draft.theme === t.value}
                        class="segb"
                        class:on={draft.theme === t.value}
                        onclick={() => (draft.theme = t.value)}
                      >
                        {t.label}
                      </button>
                    {/each}
                  </div>
                  <div class="hint" style="margin-top:6px">{f.hint}</div>
                </div>
              {:else if f.kind === 'toggle'}
                {@const on = draft[f.key] === true}
                <div>
                  <button
                    type="button"
                    role="switch"
                    class="chip"
                    class:on
                    aria-checked={on}
                    onclick={() => (draft.showMemory = !draft.showMemory)}
                  >
                    <span class="box">{on ? '✓' : ''}</span>
                    <span style="font-family:var(--font-sans);font-size:12.5px">{f.label}</span>
                  </button>
                  <div class="hint" style="margin-top:6px">{f.hint}</div>
                </div>
              {/if}
            {/each}
            {#if sec === 'folder' && api.isWeb}
              <EvidenceField />
              <MapFilesField onchanged={onmapfiles} />
            {/if}
            {#if sec === 'data'}
              <div>
                <div class="lbl">Clear data</div>
                <div class="hint" style="line-height:1.5;margin-bottom:10px">
                  {#if api.isWeb}
                    Deletes the index cache, a copy of your ticket text that Folio keeps so the next start is quick. It is not written
                    again until you restart folio, and it is rebuilt then. Your settings and your tickets are not touched.
                  {:else}
                    Deletes the index cache (<span class="mono">%LOCALAPPDATA%\Folio\cache</span>), a copy of your ticket text that
                    Folio keeps so the next start is quick, and Folio's browser profile (<span class="mono">%LOCALAPPDATA%\Folio\WebView2</span>).
                    The cache goes now and is not written again until you restart Folio. The profile is locked while Folio runs, so it is
                    deleted the next time Folio starts. Your settings and your tickets are not touched.
                  {/if}
                </div>
                {#if confirmClear}
                  <div class="row">
                    <button type="button" class="btn" disabled={clearing} onclick={clearData}>Yes, delete it</button>
                    <button type="button" class="btn" disabled={clearing} onclick={() => (confirmClear = false)}>Cancel</button>
                  </div>
                {:else}
                  <button type="button" class="btn" onclick={() => ((confirmClear = true), (cleared = null))}>Clear data…</button>
                {/if}
                {#if cleared}
                  <div class="hint" role="status" style="margin-top:8px;line-height:1.5">
                    {cleared.cacheDeleted ? 'The index cache was deleted.' : 'There was no index cache to delete.'}
                    {#if cleared.profileScheduled}
                      The browser profile will be deleted the next time Folio starts: close Folio and open it again to finish.
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
            {#if sec === 'links'}
              <div class="hint" style="line-height:1.5">
                <span class="mono" style="color:var(--fg2)">{'{id}'}</span> is replaced with the number from a ticket’s
                <span class="mono">ado:</span> or
                <span class="mono">pr:</span> field.
              </div>
            {/if}
            {#if saveError}
              <div class="err" role="alert" style="margin-top:0">
                <span class="dot" style="background:var(--s-block)"></span>{saveError}
              </div>
            {/if}
          </div>
        {/key}
      </div>
    </div>

    <div class="foot">
      {#if !api.isWeb}
        <button type="button" class="file" onclick={() => api.openSettingsFile().catch((e) => (saveError = message(e)))}>
          Open settings file
        </button>
      {/if}
      <span style="flex:1"></span>
      <button type="button" class="cancel" onclick={onclose}>Cancel</button>
      <button type="button" class="save" {disabled} title="Enter" onclick={save}>Save</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--scrim);
    animation: fadeIn 0.26s ease backwards;
  }
  .dlg {
    width: min(640px, 100%);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--card);
    border: 1px solid var(--line2);
    border-radius: 12px;
    outline: none;
    animation: dlgIn 0.26s var(--ease-enter) backwards;
    user-select: none;
  }
  .head {
    height: 48px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 18px;
    border-bottom: 1px solid var(--line);
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .sub {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--fg3);
  }
  .mono {
    font-family: var(--font-mono);
  }
  .x {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--fg2);
    font-size: 16px;
    cursor: pointer;
  }
  .x:hover {
    background: var(--hover);
    color: var(--fg);
  }
  .mid {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .secs {
    width: 160px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 10px 6px;
    overflow: auto;
    background: var(--side);
    border-right: 1px solid var(--line);
  }
  .sec {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--fg2);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .sec:hover {
    background: var(--hover);
  }
  .sec.on {
    background: var(--sel);
    color: var(--fg);
    font-weight: 500;
  }
  .pane {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 18px 22px 22px;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 18px;
    animation: rise 0.26s var(--ease-enter) backwards;
  }
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
  .path {
    flex: 1;
    min-width: 0;
    height: 32px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 10px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    border: 1px solid var(--line2);
    border-radius: 7px;
    background: var(--chip);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--fg2);
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
  .warn {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid color-mix(in oklab, var(--s-rev) 45%, transparent);
    border-radius: 7px;
    background: color-mix(in oklab, var(--s-rev) 10%, transparent);
    font-size: 12px;
    animation: rise 0.26s var(--ease-enter) backwards;
  }
  .link {
    padding: 2px 4px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--acc);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
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
  .inp.bad {
    border-color: var(--s-block);
  }
  .hint {
    margin-top: 5px;
    font-size: 11.5px;
    color: var(--fg3);
  }
  .hint.ex {
    display: flex;
    gap: 6px;
    min-width: 0;
    margin-top: 6px;
  }
  .ex-v {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--fg2);
  }
  .err {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--s-block);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px 0 8px;
    border: 1px solid var(--line2);
    border-radius: 7px;
    background: transparent;
    color: var(--fg2);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
    transition:
      background var(--dur),
      border-color var(--dur);
  }
  .chip.on {
    border-color: var(--acc);
    background: var(--sel);
    color: var(--fg);
  }
  .box {
    width: 13px;
    height: 13px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    border: 1.5px solid var(--line2);
    border-radius: 4px;
    color: var(--acc-ink);
    font-size: 9px;
  }
  .chip.on .box {
    border-color: var(--acc);
    background: var(--acc);
  }
  .found {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--fg3);
  }
  .fdot {
    width: 6px;
    height: 6px;
    box-sizing: border-box;
    border-radius: 50%;
    background: var(--s-done);
  }
  .fdot.unknown {
    background: var(--fg3);
    opacity: 0.5;
  }
  .fdot.missing {
    background: transparent;
    border: 1.5px solid var(--s-block);
  }
  .watch {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: var(--fg3);
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--chip);
  }
  .segb {
    height: 26px;
    padding: 0 14px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--fg2);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--dur),
      color var(--dur);
  }
  .segb.on {
    background: var(--card);
    color: var(--fg);
    box-shadow: 0 0 0 1px var(--line2);
  }
  .foot {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px 0 18px;
    border-top: 1px solid var(--line);
  }
  .file {
    padding: 2px 0;
    border: none;
    background: transparent;
    color: var(--fg2);
    font-size: 12px;
    cursor: pointer;
  }
  .file:hover {
    color: var(--acc);
    text-decoration: underline;
  }
  .cancel {
    height: 30px;
    padding: 0 14px;
    border: 1px solid var(--line2);
    border-radius: 7px;
    background: var(--card);
    color: var(--fg);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .cancel:hover {
    border-color: var(--fg3);
  }
  .save {
    height: 30px;
    padding: 0 16px;
    border: 1px solid var(--acc);
    border-radius: 7px;
    background: var(--acc);
    color: var(--acc-ink);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--dur),
      color var(--dur);
  }
  .save:disabled {
    border-color: var(--line);
    background: var(--chip);
    color: var(--fg3);
    cursor: default;
  }

  /* The Indigo focus ring (mockup: 2px --acc, offset 2px; 1px on the close button). */
  button:focus-visible {
    outline: 2px solid var(--acc);
    outline-offset: 2px;
  }
  .x:focus-visible,
  .segb:focus-visible {
    outline-offset: 1px;
  }
  .sec:focus-visible {
    outline-offset: -2px;
  }
</style>
