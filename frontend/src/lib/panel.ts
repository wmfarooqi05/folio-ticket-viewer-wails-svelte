// The right panel's back stack (ticket 11). Pure functions over an array of entries; the
// last entry is the one on show and an empty stack means the panel is closed.

export interface PanelEntry {
  path: string
  fragment: string | null
}

export type PanelStack = readonly PanelEntry[]

/** A panel that has seen this many hops drops the oldest, so a long session stays small. */
export const MAX_DEPTH = 50

export const sameEntry = (a: PanelEntry | undefined, b: PanelEntry): boolean =>
  !!a && a.path === b.path && (a.fragment ?? null) === (b.fragment ?? null)

/** Opens `entry` on top. The same entry as the one on show is a no-op (same stack back). */
export function push(stack: PanelStack, entry: PanelEntry): PanelStack {
  const e = { path: entry.path, fragment: entry.fragment ?? null }
  if (sameEntry(stack[stack.length - 1], e)) return stack
  const next = [...stack, e]
  return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next
}

export const canBack = (stack: PanelStack): boolean => stack.length > 1

/** One hop back. The last entry stays: closing is a separate act. */
export const back = (stack: PanelStack): PanelStack => (canBack(stack) ? stack.slice(0, -1) : stack)

/** Jumps back to the entry at `index` (a trail click), dropping everything after it. */
export const popTo = (stack: PanelStack, index: number): PanelStack =>
  index >= 0 && index < stack.length - 1 ? stack.slice(0, index + 1) : stack

export const close = (): PanelStack => []

export const top = (stack: PanelStack): PanelEntry | null => stack[stack.length - 1] ?? null

/** Promotes the entry on show to the middle pane: the entry to open there, and the closed stack. */
export function promote(stack: PanelStack): { entry: PanelEntry | null; stack: PanelStack } {
  return { entry: top(stack), stack: [] }
}

/** A short trail label: `05 Q3` for an item, `05` for a whole ticket, the file name otherwise. */
export function label(e: PanelEntry): string {
  const base = e.path.split('/').pop()!.replace(/\.md$/i, '')
  const n = /^(\d+)-/.exec(base)?.[1]
  const name = n ?? base
  if (!e.fragment) return name
  const frag = /^[a-z]{1,2}\d+$/.test(e.fragment) ? e.fragment.toUpperCase() : `#${e.fragment}`
  return `${name} ${frag}`
}
