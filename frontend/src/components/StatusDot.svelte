<script lang="ts">
  import type { Status } from '../lib/parser'
  import { STATUS_LABEL, statusVar } from '../lib/status'

  interface Props {
    status: Status
    size?: number
    /** the in-progress pulse: header pill, column headers and graph nodes only (03 D2) */
    pulse?: boolean
    /** the raw status text of an unknown status, for the tooltip */
    raw?: string | null
    /** drawn on a solid Needs verification pill: the pill's ink colour instead of the status colour */
    ink?: boolean
  }
  let { status, size = 7, pulse = false, raw = null, ink = false }: Props = $props()

  const color = $derived(ink ? 'var(--s-verify-ink)' : statusVar(status))
  const label = $derived(status === 'unknown' ? (raw ?? 'unknown') : STATUS_LABEL[status])
</script>

<span
  class="inline-block shrink-0 rounded-full box-border"
  class:pulse-dot={pulse && status === 'in-progress'}
  class:unknown={color === null}
  class:verify={status === 'needs-verification'}
  style:width="{size}px"
  style:height="{size}px"
  style:color={color ?? undefined}
  style:background={color === null ? 'transparent' : 'currentColor'}
  role="img"
  aria-label={label}
  title={label}
></span>

<style>
  .unknown {
    border: 1.5px dashed var(--fg3);
  }
  /* the only ringed dot (ticket 37 D7): the ring carries the meaning without colour */
  .verify {
    outline: 1.5px solid currentColor;
    outline-offset: 1.5px;
  }
</style>
