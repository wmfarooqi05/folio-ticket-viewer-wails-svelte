<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import * as api from './lib/api'
  import type { Config } from './lib/api'
  import { indexStore } from './lib/index-store.svelte'
  import { applyTheme, resolvedTheme } from './lib/theme/theme'
  import Logo from './components/Logo.svelte'
  import Tree from './components/Tree.svelte'
  import DocView from './components/DocView.svelte'
  import SettingsDialog from './components/SettingsDialog.svelte'
  import SidePanel from './components/SidePanel.svelte'
  import WaitingOn from './components/views/WaitingOn.svelte'
  import OpenQuestions from './components/views/OpenQuestions.svelte'
  import MapModes from './components/views/MapModes.svelte'
  import { pinnedItems } from './lib/pinned'
  import { pinnedCounts, type ViewId } from './lib/views'
  import * as panelStack from './lib/panel'
  import { Layout } from './lib/layout.svelte'
  import { pickRoot, rootsLabel } from './lib/folder'
  import { docsRootPath, splitPath } from './lib/path'
  import { MEMORY_TIP, formatMemory } from './lib/memory'
  import Icon from './lib/icons/Icon.svelte'
  import Divider from './components/Divider.svelte'

  let { initial }: { initial: Config | null } = $props()

  type Phase = 'loading' | 'first-run' | 'ready' | 'error'

  let phase = $state<Phase>('loading')
  let config = $state.raw<Config | null>(null)
  const index = $derived(indexStore.index) // the only index (05 D1), owned by the store
  const status = $derived(indexStore.status.text)
  let problem = $state<string | null>(null)

  let selected = $state<string | null>(null)
  let view = $state<ViewId | null>(null) // a cross-space view (ticket 12) replaces the document
  let text = $state<string | null>(null)
  let fragment = $state<string | null>(null) // a heading or item to scroll to (link clicks)
  let docError = $state<string | null>(null)

  let settingsOpen = $state(false)
  const scanInfo = $derived(indexStore.scanInfo)
  let toast = $state<string | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // The right panel (ticket 11): a back stack of {path, fragment}; empty means closed.
  let panel = $state.raw<panelStack.PanelStack>([])
  const rightPanelOpen = $derived(panel.length > 0)
  // what the panel draws: the last non-empty stack, kept until the close transition ends
  let shownStack = $state.raw<panelStack.PanelStack>([])
  let lastClosed = $state.raw<panelStack.PanelStack>([]) // for `]`
  let mainEl = $state<HTMLElement>()
  let returnFocus: HTMLElement | null = null

  // Pane widths, both drag dividers and the tree's collapsed flag (lib/layout.svelte.ts).
  const layout = new Layout(() => rightPanelOpen)
  const geo = $derived(layout.geo)

  $effect(() => {
    const el = layout.panelEl
    if (panel.length) shownStack = panel
    else if (el && parseFloat(getComputedStyle(el).transitionDuration) === 0) shownStack = [] // no motion
  })

  function openInPanel(path: string, frag: string | null) {
    if (panel.length === 0) {
      const a = document.activeElement
      returnFocus = a instanceof HTMLElement && a !== document.body ? a : null
    }
    panel = panelStack.push(panel, { path, fragment: frag })
  }
  /** Closes the panel and puts focus back where the first push came from, or on the middle pane. */
  function leavePanel() {
    const target = returnFocus?.isConnected ? returnFocus : mainEl
    returnFocus = null
    void tick().then(() => target?.focus({ preventScroll: true }))
  }
  function closePanel() {
    if (panel.length === 0) return
    ;({ stack: panel, lastClosed } = panelStack.toggle(panel, lastClosed))
    leavePanel()
  }
  function promotePanel() {
    const { entry, stack } = panelStack.promote(panel)
    panel = stack
    if (entry) void select(entry.path, entry.fragment)
    leavePanel()
  }
  function togglePanel() {
    if (panel.length > 0) closePanel()
    else ({ stack: panel, lastClosed } = panelStack.toggle(panel, lastClosed))
  }

  const files = $derived(index ? Object.values(index.files) : [])
  const crumb = $derived(
    view ? [view === 'waiting' ? 'Waiting on' : 'Open questions'] : selected ? selected.split('/') : [],
  )
  const dark = $derived(resolvedTheme(config?.theme) === 'dark')
  const docsPath = $derived(config ? docsRootPath(config.repoRoot, config.docsDir) : '')
  const docsPathParts = $derived(splitPath(docsPath))
  // the engine says "412 files"; the mockup's footer says "Watching 412 files"
  const footerText = $derived(/^\d+ files?$/.test(status) ? `Watching ${status}` : status)

  // The RAM readout (ticket 16). Go measures and emits `mem:changed` only when the total moves by
  // 1 MB; this sets one text node. Polling runs only while the footer is on screen and the setting
  // is on; Go itself pauses it while the window is minimised or hidden.
  let memText = $state('')
  const memWanted = $derived(!!config?.showMemory && phase === 'ready' && geo.treeVisible)
  $effect(() => {
    if (!memWanted) return
    const off = api.onMemory((b) => (memText = formatMemory(b)))
    void api.setMemoryEnabled(true).catch(() => {})
    return () => {
      off()
      memText = ''
      void api.setMemoryEnabled(false).catch(() => {})
    }
  })

  // Bench hook (ticket 15): opens an indexed file when the exe runs with FOLIO_BENCH=1; inert otherwise.
  onMount(() =>
    api.onBench((kind, path) => {
      if (!Object.hasOwn(indexStore.index?.files ?? {}, path)) return
      if (kind === 'open') void select(path).then(() => void api.logTimings(`bench: opened ${path}`))
      else {
        openInPanel(path, null)
        void api.logTimings(`bench: opened (panel) ${path}`)
      }
    }),
  )

  onMount(async () => {
    try {
      config = initial ?? (await api.getConfig())
      layout.load(config) // 0 (never saved) gives the defaults
      if (config.repoRoot) await load()
      else phase = 'first-run'
    } catch (err) {
      fail(err)
    }
  })

  function fail(err: unknown) {
    problem = err instanceof Error ? err.message : String(err)
    phase = 'error'
  }

  /** Warm or cold start (ticket 09). The tree shows as soon as the store has an index. */
  async function load() {
    phase = 'loading'
    await indexStore.start()
    phase = 'ready'
  }

  // A cache hit or the first cold batch makes the index appear before start() resolves.
  $effect(() => {
    if (indexStore.index && phase === 'loading') phase = 'ready'
  })

  // Re-render the open document silently when its file changed or vanished.
  $effect(() => {
    void indexStore.docVersion
    const path = untrack(() => selected)
    if (untrack(() => view)) return // a cross-space view is showing, not the document
    if (path && indexStore.touched(path)) void reloadSelected(path, indexStore.removed(path))
  })

  let reloadToken = 0 // the newest reload wins; a slow read must not undo a deletion

  async function reloadSelected(path: string, gone: boolean) {
    const mine = ++reloadToken
    if (gone) {
      text = null
      docError = 'This file was deleted.'
      return
    }
    try {
      const content = await api.readFile(path)
      if (mine === reloadToken && selected === path && content !== text) {
        text = content // same path, so DocView keeps its scroll position
        docError = null
      }
    } catch (err) {
      if (mine === reloadToken && selected === path) docError = err instanceof Error ? err.message : String(err)
    }
  }

  async function choose() {
    problem = null
    try {
      const res = await pickRoot()
      if (res.kind === 'cancelled') return
      if (res.kind === 'no-roots') {
        problem = res.message
        return
      }
      config = await api.setConfig({ repoRoot: res.repoRoot, docsDir: res.docsDir })
      await load()
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
    }
  }

  // "Change folder" in the tree footer: the same picker as first run and Settings, then the
  // same root-change path as a Settings save.
  let changingFolder = $state(false)
  let folderNotice = $state<{ roots: boolean; message: string } | null>(null)

  async function changeFolder() {
    if (changingFolder || !config) return
    changingFolder = true
    folderNotice = null
    try {
      const res = await pickRoot()
      if (res.kind === 'no-roots') {
        folderNotice = { roots: true, message: res.message } // the Settings warning; nothing changed
      } else if (res.kind === 'ok' && (res.repoRoot !== config.repoRoot || res.docsDir !== config.docsDir)) {
        config = await api.setConfig({ repoRoot: res.repoRoot, docsDir: res.docsDir })
        showToast('Folder changed')
        await rootChanged(config)
      }
    } catch (err) {
      folderNotice = { roots: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      changingFolder = false
    }
  }

  /** The folder, docs dir or roots changed: drop everything tied to the old one, then rescan. */
  async function rootChanged(next: Config) {
    selected = null
    view = null
    fragment = null
    text = null
    docError = null
    folderNotice = null
    panel = panelStack.close()
    lastClosed = [] // `]` must not bring back a stack from the old folder
    if (!next.repoRoot) return
    try {
      await indexStore.rescan()
    } catch (err) {
      fail(err)
    }
  }

  function showToast(msg: string) {
    clearTimeout(toastTimer)
    toast = msg
    toastTimer = setTimeout(() => (toast = null), 2200)
  }

  /** The dialog saved settings.json: apply the theme, rescan after a root change, toast. */
  async function settingsSaved(next: Config, rescan: boolean) {
    config = next
    applyTheme(next.theme)
    settingsOpen = false
    showToast('Settings saved')
    if (rescan) await rootChanged(next)
  }

  function onwindowkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    const typing = !!t?.closest('input, textarea, select, [contenteditable="true"]')
    if (!settingsOpen && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '[') {
        layout.toggleTree()
        return
      }
      if (e.key === ']') {
        togglePanel()
        return
      }
    }
    if (rightPanelOpen && !settingsOpen) {
      if (e.key === 'Escape' && !typing) {
        closePanel()
        return
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        panel = panelStack.back(panel)
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
      e.preventDefault() // never reload the webview; rescan instead
      if (phase === 'ready') indexStore.rescan().catch(fail)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault()
      if (config) settingsOpen = true
    }
  }

  async function select(path: string, frag: string | null = null) {
    view = null
    selected = path
    fragment = frag
    text = null
    docError = null
    try {
      const content = await api.readFile(path)
      if (selected === path) text = content // ignore a stale answer after a faster click
    } catch (err) {
      if (selected === path) docError = err instanceof Error ? err.message : String(err)
    }
  }

  async function toggleTheme() {
    if (!config) return
    const next = dark ? 'light' : 'dark'
    applyTheme(next)
    config = { ...config, theme: next }
    try {
      config = await api.setConfig({ theme: next })
    } catch (err) {
      console.error('could not save the theme', err)
    }
  }
</script>

{#snippet docView()}
  <DocView path={selected} {text} error={docError} {index} {config} {fragment} onnavigate={select} onpanel={openInPanel} />
{/snippet}

<svelte:window onkeydown={onwindowkeydown} />

<div class="flex h-full flex-col bg-bg text-fg {layout.dragging ? 'cursor-col-resize select-none' : ''}" inert={settingsOpen}>
  <header class="chrome flex h-44 shrink-0 items-center gap-12 border-b border-line bg-side px-14">
    <button
      type="button"
      class="grid h-28 w-28 shrink-0 place-items-center rounded-md text-fg2 hover:bg-hover hover:text-fg"
      aria-label="Toggle sidebar"
      aria-expanded={geo.treeVisible}
      aria-controls="tree-pane"
      title={geo.treeAutoHidden ? 'Sidebar hidden: the window is too narrow beside the panel  [' : 'Toggle sidebar  ['}
      onclick={() => layout.toggleTree()}
    >
      <Icon name="panel-left" size={15} />
    </button>
    <Logo />
    {#if docsPath}
      <span class="text-fg3">/</span>
      <!-- middle truncation: the last two segments keep their width, the front gets the ellipsis -->
      <span class="selectable flex max-w-[40%] min-w-0 shrink font-mono text-[11.5px] text-fg2" title={docsPath} aria-label="Docs folder {docsPath}">
        <span class="truncate">{docsPathParts.head}</span><span class="shrink-0 whitespace-nowrap">{docsPathParts.tail}</span>
      </span>
      {#if crumb.length}<span class="text-fg3">/</span>{/if}
    {/if}
    <ol class="flex min-w-0 flex-1 items-center gap-6 text-sm text-fg2" aria-label="Breadcrumb">
      {#each crumb as part, i (i)}
        <li class="truncate" class:text-fg={i === crumb.length - 1}>
          {#if i > 0}<span class="pr-6 text-fg3">/</span>{/if}{part}
        </li>
      {/each}
    </ol>
    <span class="rounded-sm bg-chip px-6 py-2 font-mono text-2xs tracking-[0.04em] text-fg2">READ-ONLY</span>
    <button
      type="button"
      class="h-28 rounded-md px-8 text-xs font-medium text-fg2 hover:bg-hover"
      aria-label="Toggle theme"
      onclick={toggleTheme}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
    <button
      type="button"
      class="h-28 rounded-md px-8 text-xs font-medium text-fg2 hover:bg-hover"
      aria-label="Settings"
      title="Settings  Ctrl+,"
      onclick={() => config && (settingsOpen = true)}
    >
      Gear
    </button>
  </header>

  <div class="flex min-h-0 flex-1" bind:clientWidth={layout.bodyW}>
    <aside
      id="tree-pane"
      bind:this={layout.treeEl}
      style:width="{geo.treeW}px"
      class="chrome relative shrink-0 flex-col border-r border-line bg-side {layout.dragging ? '' : 'transition-[width] duration-(--dur-hover)'} {geo.treeVisible ? 'flex' : 'hidden'}"
    >
      {#if phase === 'ready'}
        <Tree
          {files}
          selected={view ? null : selected}
          onselect={select}
          pinned={pinnedItems(index ? pinnedCounts(index) : null)}
          activeView={view}
          onview={(v) => (view = v)}
        />
        {#if folderNotice}
          <!-- the same warning as the Settings dialog, in the sidebar -->
          <div
            class="mx-8 mb-8 flex items-start gap-8 rounded-md border border-[color-mix(in_oklab,var(--s-rev)_45%,transparent)] bg-[color-mix(in_oklab,var(--s-rev)_10%,transparent)] px-10 py-8 text-xs motion-safe:animate-rise"
            role="alert"
          >
            <span class="mt-4 size-7 shrink-0 rounded-full bg-s-rev"></span>
            <span class="min-w-0 flex-1">
              {#if folderNotice.roots}
                This folder has none of <span class="font-mono text-[11.5px]">{rootsLabel(config?.docsRoots ?? [])}</span>
              {:else}
                {folderNotice.message}
              {/if}
            </span>
            <button type="button" class="shrink-0 rounded-xs px-4 font-medium text-acc" onclick={changeFolder}>
              {folderNotice.roots ? 'Choose again' : 'Retry'}
            </button>
          </div>
        {/if}
        <footer class="flex items-center gap-8 border-t border-line px-14 py-8 text-[11px] text-fg3">
          <span class="size-6 shrink-0 rounded-full bg-s-done"></span>
          <span class="min-w-0 flex-1 truncate">{footerText}</span>
          {#if memText}
            <span class="shrink-0 tabular-nums" title={MEMORY_TIP}>{memText}</span>
          {/if}
          <button
            type="button"
            class="shrink-0 rounded-xs text-fg2 transition-colors duration-(--dur-hover) enabled:hover:text-acc disabled:opacity-50"
            disabled={changingFolder}
            onclick={changeFolder}
          >
            Change folder
          </button>
        </footer>
      {:else}
        <p class="p-12 text-sm text-fg3">{phase === 'loading' ? status || 'Loading…' : ''}</p>
      {/if}
      <Divider splitter={layout.tree} label="Resize sidebar" now={geo.treeW} max={geo.treeMax} edge="right" controls="tree-pane" />
    </aside>

    <main bind:this={mainEl} tabindex="-1" class="min-w-0 flex-1 overflow-auto bg-bg outline-none">
      {#if phase === 'first-run'}
        <section class="mx-auto flex max-w-[520px] animate-rise flex-col items-start gap-14 px-40 pt-120">
          <h1 class="text-2xl font-semibold tracking-[-0.025em]">Choose your docs folder</h1>
          <p class="text-md leading-[1.6] text-fg2">
            Folio reads the tickets in a repo and never changes them. Pick the repo, or its docs folder.
          </p>
          <button
            type="button"
            class="h-40 rounded-lg bg-acc px-18 text-sm font-medium text-acc-ink transition-transform duration-[var(--dur-press)] hover:-translate-y-1"
            onclick={choose}
          >
            Choose folder…
          </button>
          {#if problem}
            <p class="text-sm text-s-block" role="alert">{problem}</p>
          {/if}
        </section>
      {:else if phase === 'error'}
        <p class="p-24 text-md text-s-block" role="alert">{problem}</p>
      {:else if phase === 'ready'}
        {#if view === 'waiting' && index}
          <WaitingOn {index} onselect={select} />
        {:else if view === 'questions' && index}
          <OpenQuestions {index} onselect={select} />
        {:else if index && selected && index.files[selected]?.kind === 'map'}
          <MapModes {index} path={selected} onselect={select}>
            {#snippet doc()}{@render docView()}{/snippet}
          </MapModes>
        {:else}
          {@render docView()}
        {/if}
      {/if}
    </main>

    <!-- the width animates 0 to the panel width (not while dragging); the inner box keeps that
         width, so nothing reflows (03 spec 6) -->
    <aside
      id="side-panel"
      bind:this={layout.panelEl}
      style:width={rightPanelOpen ? `${geo.panelW}px` : '0px'}
      class="chrome relative shrink-0 overflow-hidden bg-card {layout.dragging
        ? ''
        : 'transition-[width] duration-(--dur) ease-(--ease-pane)'} {rightPanelOpen ? 'border-l border-line' : 'border-l-0'}"
      aria-label="Side panel"
      inert={!rightPanelOpen}
      ontransitionend={(e) => {
        if (e.target === layout.panelEl && !rightPanelOpen) shownStack = []
      }}
    >
      <Divider splitter={layout.panel} label="Resize side panel" now={geo.panelW} max={geo.panelMax} edge="left" controls="side-panel" />
      <SidePanel
        width={geo.panelW}
        stack={panel.length ? panel : shownStack}
        {index}
        {config}
        onback={() => (panel = panelStack.back(panel))}
        onpromote={promotePanel}
        onclose={closePanel}
        onpush={openInPanel}
        onpopto={(i) => (panel = panelStack.popTo(panel, i))}
        onnavigate={select}
      />
    </aside>
  </div>
</div>

{#if settingsOpen && config}
  <SettingsDialog {config} scan={scanInfo} onclose={() => (settingsOpen = false)} onsaved={settingsSaved} />
{/if}

{#if toast}
  <div
    class="fixed bottom-64 left-1/2 z-30 animate-toast rounded-[9px] bg-fg px-14 py-8 font-mono text-[12px] whitespace-nowrap text-bg shadow-lift [transform:translateX(-50%)]"
    role="status"
  >
    {toast}
  </div>
{/if}
