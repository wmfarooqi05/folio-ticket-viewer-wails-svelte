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
  import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH, clampWidth, dragWidth, keyWidth, maxWidth } from './lib/resize'

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
  let treeOpen = $state(true) // `[`
  let panelAside = $state<HTMLElement>()
  let mainEl = $state<HTMLElement>()
  let returnFocus: HTMLElement | null = null

  // Tree width (drag-to-resize). sidebarW is the wish; the width drawn is clamped to what fits.
  let sidebarW = $state(DEFAULT_WIDTH)
  let bodyW = $state(0) // width of the row that holds the three panes
  let treeAside = $state<HTMLElement>()
  let dragging = $state(false)
  const maxW = $derived(bodyW > 0 ? maxWidth(bodyW, rightPanelOpen) : MAX_WIDTH)
  const treeW = $derived(clampWidth(sidebarW, maxW))
  let dragX = 0
  let dragRaf = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function saveWidth() {
    clearTimeout(saveTimer)
    api.setSidebarWidth(treeW).catch((err) => console.error('could not save the sidebar width', err))
  }
  function dragStart(e: PointerEvent) {
    if (e.button !== 0 || !treeAside) return
    e.preventDefault() // no text selection or native drag
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragging = true
  }
  function dragMove(e: PointerEvent) {
    if (!dragging || !treeAside) return
    dragX = e.clientX
    if (dragRaf) return // one update per frame
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0
      if (treeAside) sidebarW = dragWidth(dragX, treeAside.getBoundingClientRect().left, maxW)
    })
  }
  function dragEnd(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    cancelAnimationFrame(dragRaf)
    dragRaf = 0
    if (treeAside && e.type === 'pointerup') sidebarW = dragWidth(e.clientX, treeAside.getBoundingClientRect().left, maxW)
    saveWidth() // once, at the end of the drag
  }
  function resetWidth() {
    sidebarW = DEFAULT_WIDTH
    saveWidth()
  }
  function dividerKey(e: KeyboardEvent) {
    const next = keyWidth(e.key, treeW, maxW)
    if (next === null) return
    e.preventDefault()
    sidebarW = next
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveWidth, 400) // a held key is one save, not many
  }

  $effect(() => {
    if (panel.length) shownStack = panel
    else if (panelAside && parseFloat(getComputedStyle(panelAside).transitionDuration) === 0) shownStack = [] // no motion
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

  onMount(async () => {
    try {
      config = initial ?? (await api.getConfig())
      sidebarW = clampWidth(config.sidebarWidth) // 0 (never saved) gives the default
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
      const picked = await api.pickFolder()
      if (!picked) return // cancelled
      const check = await api.checkRoot(picked)
      if (!check.ok) {
        problem = check.message
        return
      }
      config = await api.setConfig({ repoRoot: check.repoRoot, docsDir: check.docsDir })
      await load()
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
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
    if (rescan && next.repoRoot) {
      selected = null
      view = null
      fragment = null
      text = null
      panel = panelStack.close()
      try {
        await indexStore.rescan()
      } catch (err) {
        fail(err)
      }
    }
  }

  function onwindowkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    const typing = !!t?.closest('input, textarea, select, [contenteditable="true"]')
    if (!settingsOpen && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '[') {
        treeOpen = !treeOpen
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

<div class="flex h-full flex-col bg-bg text-fg {dragging ? 'cursor-col-resize select-none' : ''}" inert={settingsOpen}>
  <header class="chrome flex h-44 shrink-0 items-center gap-12 border-b border-line bg-side px-14">
    <Logo />
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

  <div class="flex min-h-0 flex-1" bind:clientWidth={bodyW}>
    <aside
      bind:this={treeAside}
      style:width="{treeW}px"
      class="chrome relative shrink-0 flex-col border-r border-line bg-side {dragging ? '' : 'transition-[width] duration-(--dur-hover)'} {!treeOpen ? 'hidden' : rightPanelOpen ? 'hidden min-[1200px]:flex' : 'flex'}"
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
        <footer class="border-t border-line px-12 py-6 text-[11px] text-fg3">{status}</footer>
      {:else}
        <p class="p-12 text-sm text-fg3">{phase === 'loading' ? status || 'Loading…' : ''}</p>
      {/if}
      <!-- the drag handle: a 9px hit area on the tree's right edge, with a 2px accent line -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={treeW}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxW}
        tabindex="0"
        class="group/h absolute inset-y-0 -right-[5px] z-10 w-[9px] cursor-col-resize touch-none outline-none"
        onpointerdown={dragStart}
        onpointermove={dragMove}
        onpointerup={dragEnd}
        onpointercancel={dragEnd}
        onlostpointercapture={dragEnd}
        ondblclick={resetWidth}
        onkeydown={dividerKey}
      >
        <span
          class="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-acc transition-opacity duration-(--dur-hover) {dragging
            ? 'opacity-100'
            : 'opacity-0 group-hover/h:opacity-60 group-focus-visible/h:opacity-100'}"
        ></span>
      </div>
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

    <!-- the width animates 0 to 360; the inner box stays 360 wide, so nothing reflows (03 spec 6) -->
    <aside
      bind:this={panelAside}
      class="chrome shrink-0 overflow-hidden bg-card transition-[width] duration-(--dur) ease-(--ease-pane) {rightPanelOpen
        ? 'w-360 border-l border-line'
        : 'w-0 border-l-0'}"
      aria-label="Side panel"
      inert={!rightPanelOpen}
      ontransitionend={(e) => {
        if (e.target === panelAside && !rightPanelOpen) shownStack = []
      }}
    >
      <SidePanel
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
