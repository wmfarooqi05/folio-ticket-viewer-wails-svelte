<script lang="ts">
  import { onMount } from 'svelte'
  import * as api from './lib/api'
  import type { Config } from './lib/api'
  import { buildIndex, type Index } from './lib/parser'
  import { applyTheme, resolvedTheme } from './lib/theme/theme'
  import Tree from './components/Tree.svelte'
  import DocView from './components/DocView.svelte'

  let { initial }: { initial: Config | null } = $props()

  type Phase = 'loading' | 'first-run' | 'ready' | 'error'

  let phase = $state<Phase>('loading')
  let config = $state.raw<Config | null>(null)
  let index = $state.raw<Index | null>(null) // the only index (05 D1): $state.raw, never deep
  let status = $state('')
  let problem = $state<string | null>(null)

  let selected = $state<string | null>(null)
  let text = $state<string | null>(null)
  let docError = $state<string | null>(null)

  // Panels: the right panel arrives with its own slice (03 spec section 3).
  const rightPanelOpen = false

  const files = $derived(index ? Object.values(index.files) : [])
  const crumb = $derived(selected ? selected.split('/') : [])
  const dark = $derived(resolvedTheme(config?.theme) === 'dark')

  onMount(async () => {
    try {
      config = initial ?? (await api.getConfig())
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

  /** The thin path: Scan, ReadBatch, buildIndex. Cache and watching come with ticket 05. */
  async function load() {
    phase = 'loading'
    status = 'Scanning…'
    const scan = await api.scan()
    status = `Reading ${scan.changed?.length ?? 0} files…`
    const { files: read } = await api.readAll(scan.changed ?? [])
    index = buildIndex(read)
    status = `${scan.count} files`
    phase = 'ready'
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

  async function select(path: string) {
    selected = path
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

<div class="flex h-full flex-col bg-bg text-fg">
  <header class="chrome flex h-44 shrink-0 items-center gap-12 border-b border-line bg-side px-14">
    <span class="text-[13.5px] font-semibold tracking-[-0.01em]">Folio</span>
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
      title="Settings (coming with ticket 05)"
    >
      Gear
    </button>
  </header>

  <div class="flex min-h-0 flex-1">
    <aside class="chrome flex w-280 shrink-0 flex-col border-r border-line bg-side">
      {#if phase === 'ready'}
        <Tree {files} {selected} onselect={select} />
        <footer class="border-t border-line px-12 py-6 text-[11px] text-fg3">{status}</footer>
      {:else}
        <p class="p-12 text-sm text-fg3">{phase === 'loading' ? status || 'Loading…' : ''}</p>
      {/if}
    </aside>

    <main class="min-w-0 flex-1 overflow-auto bg-bg">
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
        <DocView path={selected} {text} error={docError} />
      {/if}
    </main>

    {#if rightPanelOpen}
      <aside class="chrome w-360 shrink-0 border-l border-line bg-card"></aside>
    {/if}
  </div>
</div>
