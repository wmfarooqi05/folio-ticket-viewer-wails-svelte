<script lang="ts">
  import type { DocRecord, Index, TicketMeta } from '../lib/parser'
  import { chipsFor, chipFor } from '../lib/refs'
  import { PERSON_LABEL } from '../lib/status'
  import type { UrlHelpers } from '../lib/render/urls'
  import Icon from '../lib/icons/Icon.svelte'
  import StatusPill from './StatusPill.svelte'
  import RefChip from './RefChip.svelte'

  interface Props {
    rec: DocRecord
    index: Index
    urls: UrlHelpers
    onopen: (path: string, fragment: string | null) => void
    onexternal: (url: string) => void
    onvscode: () => void
  }
  let { rec, index, urls, onopen, onexternal, onvscode }: Props = $props()

  const meta = $derived(rec.meta as TicketMeta)
  const blockers = $derived(chipsFor(rec, 'blocked_by', index))
  const related = $derived(chipsFor(rec, 'related', index))
  const superseded = $derived(
    index.edges.filter((e) => e.from === rec.path && e.field === 'superseded_by').map((e) => chipFor(e, index, rec.space)),
  )
  /** an unknown status: the pill shows the status as written, or for a legacy ticket its raw text (status_note) */
  const pillNote = $derived(meta.status === 'unknown' ? (rec.statusRaw ?? meta.status_note) : meta.status_note)
  const note = $derived(meta.status === 'unknown' && rec.statusRaw === null ? null : meta.status_note)
</script>

<section class="rounded-xl border border-line bg-card px-20 pt-16 pb-14 shadow-hair" aria-label="Ticket">
  <div class="flex flex-wrap items-center gap-8">
    <span class="font-mono text-[12px] text-fg2">{rec.key}</span>
    {#if rec.legacy}
      <span
        class="rounded-xs border border-dashed border-fg3 px-6 py-1 font-mono text-[10px] tracking-[0.05em] text-fg2"
        title="No frontmatter. Fields inferred.">LEGACY</span
      >
    {/if}
    {#if meta.afk}
      <span
        class="rounded-xs border border-acc px-6 py-1 font-mono text-[10px] tracking-[0.05em] text-acc"
        title="Can run away from keyboard">AFK</span
      >
    {/if}
    <span class="flex-1"></span>
    <button
      type="button"
      class="inline-flex h-28 items-center gap-7 rounded-md border border-line2 bg-card px-10 text-[12px] font-medium text-fg hover:border-acc hover:text-acc"
      onclick={onvscode}
    >
      <Icon name="square-code" size={13} />Open in VS Code
    </button>
  </div>

  <h1 class="mt-8 mb-12 text-xl leading-[1.25] font-semibold tracking-[-0.02em] [text-wrap:pretty]">{rec.title}</h1>

  <div class="flex flex-wrap items-center gap-6">
    <StatusPill status={meta.status} note={pillNote} pulse />
    {#if rec.legacy}<span class="text-xs text-fg3 italic">inferred</span>{/if}
    {#each meta.type as ty (ty)}
      <span class="inline-flex h-22 items-center rounded-sm bg-chip px-8 text-xs text-fg2">{ty}</span>
    {/each}
    {#if note}<span class="text-xs text-fg3">{note}</span>{/if}
  </div>

  <dl
    class="mt-14 grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-12 gap-y-9 border-t border-line pt-12 text-sm"
  >
    <dt class="text-fg3">Waiting on</dt>
    <dd class="flex">
      {#if meta.waiting_on}
        <span class="inline-flex h-22 items-center gap-6 rounded-full border border-line bg-chip pr-9 pl-3">
          <span class="grid size-16 place-items-center rounded-full bg-fg text-[9.5px] font-semibold text-bg"
            >{PERSON_LABEL[meta.waiting_on][0]}</span
          >{PERSON_LABEL[meta.waiting_on]}
        </span>
      {:else}
        <span class="text-fg3">none</span>
      {/if}
    </dd>

    <dt class="text-fg3">Blocked by</dt>
    <dd class="flex min-w-0 flex-col gap-6">
      <div class="flex flex-wrap gap-6">
        {#each blockers as chip, i (i)}<RefChip {chip} strong {onopen} />{/each}
        {#if blockers.length === 0}<span class="text-fg3">nothing</span>{/if}
      </div>
      {#if meta.blocked_note}<span class="text-fg2">{meta.blocked_note}</span>{/if}
    </dd>

    <dt class="text-fg3">Related</dt>
    <dd class="flex flex-wrap gap-6">
      {#each related as chip, i (i)}<RefChip {chip} {onopen} />{/each}
      {#if related.length === 0}<span class="text-fg3">—</span>{/if}
    </dd>

    {#if meta.superseded_by}
      <dt class="text-fg3">Superseded by</dt>
      <dd class="flex flex-wrap gap-6">
        {#each superseded as chip, i (i)}<RefChip {chip} strong {onopen} />{/each}
        {#if superseded.length === 0}<span class="font-mono text-xs text-fg2">{meta.superseded_by}</span>{/if}
      </dd>
    {/if}

    <dt class="text-fg3">Links</dt>
    <dd class="flex flex-wrap gap-14">
      {#each meta.pr as n (n)}
        {@const url = urls.pr(n)}
        {#if url}
          <button type="button" class="inline-flex items-center gap-3 font-medium text-acc hover:underline" onclick={() => onexternal(url)}
            >PR #{n}<Icon name="arrow-up-right" size={12} /></button
          >
        {:else}
          <span class="font-mono text-xs text-fg2" title="Set the PR link template in Settings to link this">PR #{n}</span>
        {/if}
      {/each}
      {#each meta.ado as n (n)}
        {@const url = urls.ado(n)}
        {#if url}
          <button type="button" class="inline-flex items-center gap-3 font-medium text-acc hover:underline" onclick={() => onexternal(url)}
            >ADO {n}<Icon name="arrow-up-right" size={12} /></button
          >
        {:else}
          <span class="font-mono text-xs text-fg2" title="Set the ADO link template in Settings to link this">ADO {n}</span>
        {/if}
      {/each}
      {#if meta.pr.length === 0 && meta.ado.length === 0}<span class="text-fg3">—</span>{/if}
    </dd>
  </dl>
</section>
