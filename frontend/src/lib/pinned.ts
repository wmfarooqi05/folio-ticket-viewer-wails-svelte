import type { IconName } from './icons/icons'

/**
 * One row of the pinned views list at the top of the tree. Ticket 10 draws the rows;
 * ticket 12 owns the views and feeds the real counts (`count: null` draws no number).
 */
export interface PinnedItem {
  id: string
  label: string
  count: number | null
  icon?: IconName
}

/** The three rows of the mockup, with no counts yet. Ticket 12 replaces this. */
export const PINNED_STUBS: PinnedItem[] = [
  { id: 'waiting', label: 'Waiting on', count: null, icon: 'clock' },
  { id: 'questions', label: 'Open questions', count: null, icon: 'circle-help' },
  { id: 'board', label: 'Board', count: null, icon: 'columns-3' },
]
