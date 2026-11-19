<script lang="ts">
  import type { Status } from '../lib/parser'
  import { STATUS_LABEL, isStruck, statusVar } from '../lib/status'
  import StatusDot from './StatusDot.svelte'

  interface Props {
    status: Status
    /** an unknown status shows this raw text (03 spec 1.2) */
    note?: string | null
    size?: 'md' | 'sm'
    pulse?: boolean
  }
  let { status, note = null, size = 'md', pulse = false }: Props = $props()

  const color = $derived(statusVar(status))
  const label = $derived(status === 'unknown' ? (note ?? 'unknown') : STATUS_LABEL[status])
</script>

<span
  class="inline-flex items-center gap-6 rounded-full border border-solid pr-9 pl-8 font-medium whitespace-nowrap {size ===
  'md'
    ? 'h-22 text-[12px]'
    : 'h-20 text-[11.5px]'}"
  style:background={color ? `color-mix(in oklab, ${color} 13%, transparent)` : 'transparent'}
  style:border-color={color ? `color-mix(in oklab, ${color} 30%, transparent)` : 'var(--line2)'}
>
  <StatusDot {status} raw={note} size={size === 'md' ? 7 : 6} {pulse} />
  <span class:line-through={isStruck(status)}>{label}</span>
</span>
