import type { IconName } from './icons/icons'
import type { ViewId } from './views'

/**
 * One row of the pinned views list at the top of the tree (Tree.svelte draws it).
 * `count: null` draws no number.
 */
export interface PinnedItem {
  id: ViewId
  label: string
  count: number | null
  icon?: IconName
  /** a chip before the count: Waiting on's "2 to verify" (ticket 41) */
  badge?: string | null
}

/** The pinned rows, fed by `pinnedCounts(index)` from lib/views.ts (ticket 12). */
export function pinnedItems(counts: { waiting: number; verify?: number; questions: number } | null): PinnedItem[] {
  return [
    {
      id: 'waiting',
      label: 'Waiting on',
      count: counts?.waiting ?? null,
      icon: 'clock',
      badge: counts?.verify ? `${counts.verify} to verify` : null,
    },
    { id: 'questions', label: 'Open questions', count: counts?.questions ?? null, icon: 'circle-help' },
  ]
}
