<script lang="ts">
  // The evidence a ticket's factory board block lists (ticket 40; the design's D1 to D3, Q1, Q6, Q7).
  // It sits under the header card. The server decides what may be shown (ticket 39's evidenceFiles):
  // this draws what it is told, and nothing else. Read-only: the verdict goes in the agent's chat,
  // so copy ref is the only action.
  import * as api from '../lib/api'
  import type { EvidenceEntry, EvidenceList } from '../lib/backend-types'
  import { parseFile, type DocRecord, type Index } from '../lib/parser'
  import { renderMarkdown } from '../lib/render/markdown'
  import CopyRef from './CopyRef.svelte'
  import ImageViewer from './ImageViewer.svelte'

  interface Props {
    rec: DocRecord
    index: Index
    /** the right side panel: a summary only (the mockup's "opens in the middle") */
    compact?: boolean
    onpromote?: () => void
  }
  let { rec, index, compact = false, onpromote }: Props = $props()

  const board = $derived(rec.board)
  const meta = $derived(rec.meta && 'waiting_on' in rec.meta ? rec.meta : null)
  const yourTurn = $derived(meta?.status === 'needs-verification')

  // Fetched again when the ticket changes on disk (the mirror rewrites it).
  let list = $state<EvidenceList | null>(null)
  let failed = $state<string | null>(null)
  $effect(() => {
    const path = rec.path
    void rec.mtime
    if (!board?.evidence) {
      list = null
      return
    }
    let live = true
    api
      .evidenceFiles(path)
      .then((l) => live && ((list = l), (failed = null)))
      .catch((e) => live && (failed = e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  })

  const files = $derived(list?.files ?? [])
  const of = (k: EvidenceEntry['kind']) => files.filter((f) => f.kind === k)
  const videos = $derived(of('video'))
  const images = $derived(of('image'))
  const docs = $derived([...of('scenarios'), ...of('write-up')])
  const others = $derived(files.filter((f) => f.kind === 'file' || (!f.served && f.reason !== 'missing' && f.reason !== 'root not set')))
  const rootUnset = $derived(list !== null && list.root === '' && files.length > 0)
  const url = (f: EvidenceEntry) => api.evidenceUrl(rec.path, f.index)

  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
  const summary = $derived.by(() => {
    const parts: string[] = []
    if (videos.length) parts.push(plural(videos.length, 'video'))
    if (images.length) parts.push(plural(images.length, 'image'))
    const hasS = docs.some((d) => d.kind === 'scenarios')
    const hasW = docs.some((d) => d.kind === 'write-up')
    if (hasS || hasW) parts.push(hasS && hasW ? 'scenarios and write-up' : hasS ? 'scenarios' : 'write-up')
    const other = of('file').length
    if (other) parts.push(plural(other, 'other file'))
    return parts.join(' · ')
  })

  /** "accepted by the owner, relayed from chat, 2026-11-21: "looks right"" → its parts */
  const verdict = $derived.by(() => {
    const v = board?.verdict
    if (!v) return null
    const m = /^(accepted|rejected)\b\s*(.*?)(?:,\s*(\d{4}-\d{2}-\d{2}))?\s*:\s*[“"](.*)[”"]\s*$/i.exec(v)
    if (!m) return { outcome: /^rejected/i.test(v) ? 'rejected' : /^accepted/i.test(v) ? 'accepted' : null, by: '', date: '', quote: v }
    return { outcome: m[1].toLowerCase(), by: m[2].replace(/,\s*$/, '').trim(), date: m[3] ?? '', quote: m[4] }
  })

  // Scenarios first (D3). The text is fetched through the route and rendered by Folio's own renderer
  // and sanitizer (Q1), as any doc.
  let tab = $state(0)
  let rendered = $state<Record<number, string>>({})
  $effect(() => {
    const d = docs[tab]
    if (!d || !d.served || rendered[d.index] !== undefined) return
    const at = rec.path
    void fetch(url(d))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((text) => {
        if (at !== rec.path) return
        const doc = parseFile({ path: `evidence/${d.name}`, text, mtime: 0 })
        rendered = { ...rendered, [d.index]: renderMarkdown(text, { path: doc.path, rec: doc, index }) }
      })
      .catch(() => (rendered = { ...rendered, [d.index]: '' }))
  })
  $effect(() => {
    void rec.path
    void rec.mtime
    rendered = {}
    tab = 0
  })

  let viewing = $state<number | null>(null)
  const shownImages = $derived(images.filter((f) => f.served))
  // Ticket 42: the factory records one video per scenario, named `<space>-<NN>-S<n>-<slug>.<ext>`,
  // so with several videos each gets its scenario as a caption. A lone video with a plain name has none.
  const scenarioOf = (name: string) => {
    const m = /-(S\d+)-(.+)\.[a-z0-9]+$/i.exec(name)
    return m ? { id: m[1].toUpperCase(), title: m[2].replace(/[-_.]+/g, ' ').trim() } : null
  }
  // Ticket 43: the factory lists a passed round's files under `#### S<n> — <title>` (its board D9). The
  // agent checked the round's screenshots, never the video, so a round shows its video, the factory's
  // note saying so, then its screenshots. Files outside any round keep the layout above.
  const roundOf = (f: EvidenceEntry) => board?.evidence?.files[f.index]?.scenario ?? null
  const rounds = $derived.by(() => {
    const out: { id: string; title: string; videos: EvidenceEntry[]; images: EvidenceEntry[] }[] = []
    for (const f of files) {
      const s = roundOf(f)
      if (!s || (f.kind !== 'video' && f.kind !== 'image')) continue
      let r = out.find((x) => x.id === s.id)
      if (!r) out.push((r = { id: s.id, title: s.title, videos: [], images: [] }))
      ;(f.kind === 'video' ? r.videos : r.images).push(f)
    }
    return out
  })
  const looseVideos = $derived(videos.filter((v) => !roundOf(v)))
  const looseImages = $derived(images.filter((im) => !roundOf(im)))
  const ROUND_NOTE = 'Recorded during this round; its screenshots passed. Not checked frame by frame.'
  const captioned = $derived(looseVideos.length > 1 || looseVideos.some((v) => scenarioOf(v.name)))
  const videoName = (name: string) => {
    const s = scenarioOf(name)
    return s ? `${s.id} ${s.title} (${name})` : name
  }
  const alt = (name: string) =>
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/^[\d\s._-]+/, '')
      .replace(/[-_.]+/g, ' ')
      .trim() || name
</script>

{#if board && (board.evidence || board.verdict)}
  <section class="ev mt-12 rounded-[12px] border border-solid border-line bg-card shadow-hair" aria-label="Evidence">
    <header class="flex flex-wrap items-baseline gap-x-10 gap-y-2 border-b border-line px-16 py-10">
      <h2 class="m-0 text-sm font-semibold">Evidence</h2>
      {#if board.evidence?.reachable && summary}<span class="text-xs text-fg3">{summary}</span>{/if}
      {#if compact && board.evidence?.reachable && summary}<span class="text-xs text-fg3">· opens in the middle</span>{/if}
      {#if board.evidence}
        <span class="ml-auto min-w-0 truncate font-mono text-2xs text-fg3" title={board.evidence.folder}
          >{board.evidence.folder}{board.evidence.reachable ? '' : ' (not reachable)'}</span
        >
      {/if}
    </header>

    {#if verdict}
      <div class="verdict mx-16 mt-12 flex gap-10 rounded-lg px-12 py-10" class:rejected={verdict.outcome === 'rejected'}>
        <span class="mark" aria-hidden="true">{verdict.outcome === 'rejected' ? '✕' : '✓'}</span>
        <div class="min-w-0 text-sm">
          <div>
            <b class="font-semibold">{verdict.outcome === 'rejected' ? 'Rejected' : verdict.outcome === 'accepted' ? 'Accepted' : 'Verdict'}</b>
            {#if verdict.by}<span class="text-fg3"> {verdict.by}</span>{/if}
            {#if verdict.date}<span class="text-fg3"> · {verdict.date}</span>{/if}
          </div>
          <q class="mt-2 block text-fg2">{verdict.quote}</q>
        </div>
      </div>
    {:else if yourTurn}
      <div class="turn mx-16 mt-12 flex flex-wrap items-center gap-x-12 gap-y-6 rounded-lg px-12 py-9">
        <span class="text-sm"
          ><b class="font-semibold">Your turn.</b>{#if meta?.status_note}{' '}<span class="text-fg2">{meta.status_note}</span>{/if}</span
        >
        {#if rec.key}
          <span class="ml-auto flex items-center gap-10">
            <span class="text-xs text-fg2 italic">say “{rec.key} verified” in the agent’s chat</span>
            <CopyRef ref={rec.key} size="md" />
          </span>
        {/if}
      </div>
    {/if}

    <div class="px-16 pt-12 pb-16">
      {#if !board.evidence}
        <!-- a verdict with no evidence: the quote above is all there is -->
      {:else if !board.evidence.reachable}
        <p class="note m-0">
          Folio can’t read this folder right now, so no files are listed. The ticket itself is unaffected; the evidence shows here once
          the folder is back.
        </p>
      {:else if failed}
        <p class="note m-0">Could not list the evidence: {failed}</p>
      {:else if list === null}
        <p class="m-0 text-xs text-fg3">Loading the evidence…</p>
      {:else if compact}
        {#if onpromote}
          <button type="button" class="text-xs font-medium text-acc hover:underline" onclick={onpromote}>Open it in the middle</button>
        {/if}
      {:else if rootUnset}
        <p class="note m-0">
          Folio was started without an evidence folder, so these files are listed but not shown. Start it with
          <span class="font-mono">--evidence &lt;folder&gt;</span> or set the folder in Settings.
        </p>
        <ul class="m-0 mt-10 grid list-none gap-4 p-0">
          {#each files as f (f.index)}
            <li class="flex items-baseline gap-10 text-sm"><span class="font-mono text-xs">{f.name}</span><span class="text-xs text-fg3">{f.kind}</span></li>
          {/each}
        </ul>
      {:else}
        {#snippet clip(v: EvidenceEntry, caption: boolean, label: string)}
          {@const s = scenarioOf(v.name)}
          <figure class="clip m-0">
            {#if caption}
              <figcaption class="mb-6 flex min-w-0 items-baseline gap-8 text-sm">
                {#if s}<b class="font-semibold">{s.id}</b><span class="truncate">{s.title}</span>{/if}
                <span class="min-w-0 truncate font-mono text-2xs text-fg3" class:ml-auto={s}>{v.name}</span>
              </figcaption>
            {/if}
            {#if v.served}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video class="video" controls preload="metadata" src={url(v)} aria-label={label}></video>
            {:else}
              <div class="missing video-missing"><span class="font-mono">{v.name}</span><span>File not found in the evidence folder</span></div>
            {/if}
          </figure>
        {/snippet}
        {#snippet thumbs(list: EvidenceEntry[])}
          <div class="thumbs">
            {#each list as im (im.index)}
              {#if im.served}
                <button type="button" class="thumb" onclick={() => (viewing = shownImages.indexOf(im))} aria-label="Open {im.name} full size">
                  <img src={url(im)} alt={alt(im.name)} loading="lazy" />
                  <span class="name">{im.name}</span>
                </button>
              {:else}
                <div class="thumb missing"><span>{im.reason === 'missing' ? 'File not found' : 'Not shown'}</span><span class="name">{im.name}</span></div>
              {/if}
            {/each}
          </div>
        {/snippet}

        {#each looseVideos as v (v.index)}
          {@render clip(v, captioned, videoName(v.name))}
        {/each}
        {#if looseImages.length}
          <div class:mt-10={looseVideos.length > 0}>{@render thumbs(looseImages)}</div>
        {/if}

        {#each rounds as r (r.id)}
          <section class="round" class:first={looseVideos.length + looseImages.length === 0 && r === rounds[0]} aria-label="{r.id} {r.title}">
            <h3 class="m-0 mb-8 flex items-baseline gap-8 text-sm font-normal"><b class="font-semibold">{r.id}</b><span>{r.title}</span></h3>
            {#each r.videos as v (v.index)}
              {@render clip(v, false, `${r.id} ${r.title} (${v.name})`)}
            {/each}
            {#if r.videos.length}<p class="m-0 mt-6 text-xs text-fg3">{ROUND_NOTE}</p>{/if}
            {#if r.images.length}<div class:mt-10={r.videos.length > 0}>{@render thumbs(r.images)}</div>{/if}
          </section>
        {/each}

        {#if docs.length}
          <div class="mt-14" role="tablist" aria-label="Scenarios and write-up">
            {#each docs as d, i (d.index)}
              <button
                type="button"
                role="tab"
                class="tab"
                aria-selected={tab === i}
                onclick={() => (tab = i)}
              >
                {d.kind === 'scenarios' ? 'Scenarios' : 'Write-up'} <span class="font-mono text-2xs text-fg3">{d.name}</span>
              </button>
            {/each}
          </div>
          {@const d = docs[tab]}
          <div class="tabpanel" role="tabpanel">
            {#if !d.served}
              <p class="note m-0">{d.reason === 'missing' ? 'File not found in the evidence folder.' : 'Not shown.'}</p>
            {:else if rendered[d.index] === undefined}
              <p class="m-0 text-xs text-fg3">Loading…</p>
            {:else if rendered[d.index] === ''}
              <p class="note m-0">Could not load {d.name}.</p>
            {:else}
              <div class="doc">{@html rendered[d.index]}</div>
            {/if}
          </div>
        {/if}

        {#if others.length}
          <div class="mt-14">
            <div class="text-2xs font-semibold tracking-[0.06em] text-fg3 uppercase">Other files</div>
            <ul class="m-0 mt-6 grid list-none gap-4 p-0">
              {#each others as f (f.index)}
                <li class="flex items-baseline gap-10 text-sm">
                  <span class="font-mono text-xs text-fg2">{f.name}</span>
                  <span class="text-xs text-fg3">{f.kind === 'file' || f.reason === 'type not served' ? 'not openable' : f.reason}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}
    </div>
  </section>
{/if}

{#if viewing !== null && shownImages.length}
  <ImageViewer
    images={shownImages.map((f) => ({ src: url(f), name: f.name, alt: alt(f.name) }))}
    start={viewing}
    onclose={() => (viewing = null)}
  />
{/if}

<style>
  .turn {
    background: color-mix(in oklab, var(--s-verify) 8%, transparent);
    border: 1px solid color-mix(in oklab, var(--s-verify) 32%, transparent);
  }
  .verdict {
    background: color-mix(in oklab, var(--s-done) 9%, transparent);
    border: 1px solid color-mix(in oklab, var(--s-done) 30%, transparent);
  }
  .verdict.rejected {
    background: color-mix(in oklab, var(--s-block) 8%, transparent);
    border-color: color-mix(in oklab, var(--s-block) 30%, transparent);
  }
  .mark {
    font-weight: 700;
    color: var(--s-done);
  }
  .rejected .mark {
    color: var(--s-block);
  }
  .note {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--fg2);
  }
  /* D2: full panel width, 16:9, at most 380px tall */
  .video {
    display: block;
    width: 100%;
    max-height: 380px;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    background: #000;
  }
  /* ticket 43: one section per passed round, divided by a rule */
  .round {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  .round.first {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  /* ticket 42: several videos (one per scenario) never touch */
  .clip + .clip {
    margin-top: 14px;
  }
  .missing {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    border: 1px dashed var(--line2);
    border-radius: 8px;
    color: var(--fg3);
    font-size: 12px;
    text-align: center;
  }
  .video-missing {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 380px;
  }
  /* auto-fill, at least 120px, 16:10, gap 8, radius 7 */
  .thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
  .thumb {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--chip);
    cursor: zoom-in;
  }
  .thumb.missing {
    cursor: default;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb .name {
    position: absolute;
    inset: auto 0 0 0;
    padding: 3px 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    background: color-mix(in oklab, var(--card) 85%, transparent);
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--fg2);
    text-align: left;
  }
  .thumb.missing .name {
    position: static;
    background: none;
  }
  .thumb:focus-visible {
    outline: 2px solid var(--acc);
    outline-offset: 2px;
  }
  .tab {
    margin-right: 4px;
    padding: 5px 10px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--fg2);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .tab[aria-selected='true'] {
    border-bottom-color: var(--acc);
    color: var(--fg);
  }
  .tabpanel {
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
</style>
