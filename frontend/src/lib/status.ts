// Status and person display data (03 spec 1.2). One place, so the tree, the header card and
// the views read the same table.

import type { Person, Status } from './parser'

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  'needs-verification': 'Needs verification',
  'in-review': 'In review',
  done: 'Done',
  dropped: 'Dropped',
  superseded: 'Superseded',
  unknown: 'unknown',
}

/** The CSS custom property that colours a status; null for unknown (dashed, no fill). */
export function statusVar(s: Status): string | null {
  switch (s) {
    case 'open':
      return 'var(--s-open)'
    case 'in-progress':
      return 'var(--s-prog)'
    case 'blocked':
      return 'var(--s-block)'
    case 'needs-verification':
      return 'var(--s-verify)'
    case 'in-review':
      return 'var(--s-rev)'
    case 'done':
      return 'var(--s-done)'
    case 'dropped':
    case 'superseded':
      return 'var(--s-mute)'
    default:
      return null
  }
}

/** Dropped and superseded read as struck through. */
export const isStruck = (s: Status): boolean => s === 'dropped' || s === 'superseded'

/** Counts toward a module's open badge: not started, being worked, stuck, waiting for the owner's check, or for review. */
export const isOpenStatus = (s: Status): boolean =>
  s === 'open' || s === 'in-progress' || s === 'blocked' || s === 'needs-verification' || s === 'in-review'

export const PERSON_LABEL: Record<Person, string> = {
  owner: 'Owner',
  client: 'Client',
  dba: 'DBA',
  infra: 'Infra',
  ops: 'Ops',
}

/** "edited today", "edited 1 day ago", "edited 12 days ago" from a unix-ms mtime (03 D4). */
export function editedAgo(mtime: number, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - mtime) / 86_400_000))
  if (days === 0) return 'edited today'
  return days === 1 ? 'edited 1 day ago' : `edited ${days} days ago`
}
