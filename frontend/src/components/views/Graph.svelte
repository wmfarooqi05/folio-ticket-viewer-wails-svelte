<script lang="ts">
  // The dependency graph of one map (ticket 14; 03 spec screen 5). HTML nodes over one SVG of
  // edges. The layout is lib/graph/layout.ts. Motion is plain CSS: `rise` on nodes, `draw` on
  // resolved edges and `march` on live ones. prefers-reduced-motion turns all of it off in
  // tokens.css, and with GPU compositing off (07 D1) `march` repaints, so it is limited to
  // MARCH_MAX live edges; a bigger graph keeps its dashes still. The spec's in-progress `pulse`
  // dot is left out for the same reason (it animates box-shadow, a repaint every frame).
  import Icon from '../../lib/icons/Icon.svelte'
  import { layoutGraph, NODE_H, NODE_W, STUB_H, STUB_W } from '../../lib/graph/layout'
  import { graphFor, linkKey } from '../../lib/graph/model'
  import type { Index } from '../../lib/parser'
  import { statusVar } from '../../lib/status'

  interface Props {
    index: Index
    /** path of the map file */
    mapPath: string
    onselect: (path: string) => void
  }
  let { index, mapPath, onselect }: Props = $props()

  const MARCH_MAX = 24

  const rec = $derived(index.files[mapPath])
  const model = $derived(graphFor(index, mapPath))
  const g = $derived(layoutGraph(model.input))
  const liveCount = $derived(g.links.filter((l) => model.live.has(linkKey(l.from, l.to))).length)
  const total = $derived(model.input.tickets.length)
  /** level of the first ticket each stub blocks, for the stub's entrance delay (spec 6.2) */
  const targetLevel = $derived.by(() => {
    const level = new Map(g.boxes.map((b) => [b.id, b.level]))
    const m = new Map<string, number>()
    for (const l of g.links) if (l.from.startsWith('stub:') || l.from.startsWith('unresolved:')) if (!m.has(l.from)) m.set(l.from, level.get(l.to) ?? 0)
    return m
  })

  function kind(from: string, to: string): 'stub' | 'live' | 'resolved' {
    if (from.startsWith('stub:') || from.startsWith('unresolved:')) return 'stub'
    return model.live.has(linkKey(from, to)) ? 'live' : 'resolved'
  }
</script>

<div class="chrome mx-auto max-w-[1180px] animate-rise px-40 pt-8 pb-120">
  {#if total === 0}
    <p class="text-md text-fg3">
      {model.hidden > 0 ? 'Every ticket in this map is dropped or superseded.' : 'This map has no tickets yet.'}
    </p>
  {:else}
    <header class="mb-12 flex flex-wrap items-end justify-between gap-x-20 gap-y-8">
      <div>
        <p class="m-0 font-mono text-xs text-fg3">{mapPath}</p>
        <h2 class="m-0 mt-2 text-lg font-semibold">{rec?.title}</h2>
      </div>
      <ul class="m-0 flex list-none flex-wrap items-center gap-x-16 gap-y-4 p-0 text-xs text-fg2" aria-label="Legend">
        <li class="flex items-center gap-6">
          <svg width="26" height="6" aria-hidden="true"
            ><line x1="0" y1="3" x2="26" y2="3" stroke="var(--fg2)" stroke-width="1.5" stroke-dasharray="5 4" /></svg
          >still blocking
        </li>
        <li class="flex items-center gap-6">
          <svg width="26" height="6" aria-hidden="true"
            ><line x1="0" y1="3" x2="26" y2="3" stroke="var(--line2)" stroke-width="1.5" /></svg
          >resolved
        </li>
        {#if model.stubs.size > 0}
          <li class="flex items-center gap-6">
            <svg width="26" height="6" aria-hidden="true"
              ><line
                x1="0"
                y1="3"
                x2="26"
                y2="3"
                stroke="var(--acc)"
                stroke-width="1.5"
                stroke-dasharray="3 3"
                opacity=".7"
              /></svg
            >other module
          </li>
        {/if}
        {#if model.hidden > 0}
          <li class="text-fg3">{model.hidden} dropped or superseded hidden</li>
        {/if}
      </ul>
    </header>

    <div
      class="overflow-auto rounded-xl border border-line"
      style="background-image: radial-gradient(var(--line2) 1px, transparent 1px); background-size: 18px 18px; background-position: 18px 18px"
    >
      <div class="relative" style:width="{g.width}px" style:height="{g.height}px">
        <svg class="absolute top-0 left-0" width={g.width} height={g.height} aria-hidden="true">
          <defs>
            <marker id="gr-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M1 1 L7 4 L1 7 z" fill="var(--fg3)" />
            </marker>
          </defs>
          {#each g.links as l (linkKey(l.from, l.to))}
            {@const k = kind(l.from, l.to)}
            {#if k === 'live'}
              <path
                d={l.d}
                fill="none"
                stroke="var(--fg2)"
                stroke-width="1.5"
                stroke-dasharray="5 4"
                class={liveCount <= MARCH_MAX ? 'animate-march' : ''}
                marker-end="url(#gr-arrow)"
              />
            {:else if k === 'resolved'}
              <path
                d={l.d}
                pathLength="1"
                fill="none"
                stroke="var(--line2)"
                stroke-width="1.5"
                stroke-dasharray="1"
                class="animate-draw"
                style:animation-delay="{l.level * 90 + 200}ms"
                marker-end="url(#gr-arrow)"
              />
            {:else}
              <path
                d={l.d}
                fill="none"
                stroke="var(--acc)"
                stroke-width="1.5"
                stroke-dasharray="3 3"
                opacity=".7"
                marker-end="url(#gr-arrow)"
              />
            {/if}
          {/each}
        </svg>

        {#if g.isolatedTop !== null}
          <p class="absolute m-0 text-xs text-fg3" style:left="16px" style:top="{g.isolatedTop}px">No dependencies</p>
        {/if}

        {#each g.boxes as b (b.id)}
          {#if b.kind === 'stub'}
            {@const s = model.stubs.get(b.id)!}
            <button
              type="button"
              class="absolute flex animate-rise-row items-center gap-5 overflow-hidden rounded-md border border-dashed border-acc bg-card px-8 text-left font-mono text-xs text-acc hover:bg-hover"
              style:left="{b.x}px"
              style:top="{b.y}px"
              style:width="{STUB_W}px"
              style:height="{STUB_H}px"
              style:animation-delay="{(targetLevel.get(b.id) ?? 0) * 90 + 150}ms"
              style:opacity={s.closed ? 0.6 : 1}
              title="{s.label}: {s.title}"
              disabled={s.path === null}
              onclick={() => s.path && onselect(s.path)}
            >
              <span class="min-w-0 truncate">{s.label}</span>
              {#if s.unresolved}
                <span class="ml-auto font-sans text-2xs text-fg3">unresolved</span>
              {:else}
                <Icon name="arrow-up-right" size={10} />
              {/if}
            </button>
          {:else}
            {@const t = model.tickets.get(b.id)!}
            {@const col = statusVar(t.meta.status)}
            <button
              type="button"
              class="absolute flex animate-rise-node flex-col justify-between overflow-hidden rounded-lg border bg-card px-9 py-7 text-left shadow-hair transition-[transform,box-shadow] duration-[var(--dur-hover)] hover:-translate-y-2 hover:shadow-lift {col
                ? ''
                : 'border-dashed border-fg3'}"
              style:left="{b.x}px"
              style:top="{b.y}px"
              style:width="{NODE_W}px"
              style:height="{NODE_H}px"
              style:animation-delay="{b.level * 90}ms"
              style:border-color={col ? `color-mix(in oklab, ${col} 30%, transparent)` : null}
              style:background={col ? `color-mix(in oklab, ${col} 9%, var(--card))` : null}
              aria-label="{t.key}: {t.title}, {t.meta.status}"
              onclick={() => onselect(t.path)}
            >
              <span class="flex items-center gap-5 font-mono text-2xs text-fg3">
                <span
                  class="size-6 rounded-full {col ? '' : 'border border-dashed border-fg3'}"
                  style:background={col}
                ></span>
                {t.num}
                {#if t.meta.type[0]}<span class="truncate">{t.meta.type[0]}</span>{/if}
              </span>
              <span class="line-clamp-2 text-sm leading-[1.2] font-medium {t.meta.status === 'done' ? 'text-fg2' : ''}"
                >{t.title}</span
              >
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
