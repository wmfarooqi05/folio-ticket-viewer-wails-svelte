// Tree sidebar width: the clamp, step and reset rules, kept pure so they can be tested.
// The Go side clamps to the same 200 to 480 range (settings.MinSidebarWidth/MaxSidebarWidth).

export const MIN_WIDTH = 200
export const MAX_WIDTH = 480
export const DEFAULT_WIDTH = 280 // 03 design spec: left tree 280
export const STEP = 16
/** The middle pane never gets narrower than this, so the tree cannot crowd the document out. */
export const MIN_MAIN = 480
export const PANEL_WIDTH = 360

/** The widest the tree may be: 480, less whatever keeps the middle pane readable. Never below the minimum. */
export function maxWidth(container: number, panelOpen: boolean): number {
  const room = container - (panelOpen ? PANEL_WIDTH : 0) - MIN_MAIN
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, room))
}

/** Rounds to whole pixels and limits to [MIN_WIDTH, max]. NaN and 0 (never saved) give the default. */
export function clampWidth(w: number, max: number = MAX_WIDTH): number {
  if (!Number.isFinite(w) || w <= 0) return Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, max))
  return Math.min(Math.max(Math.round(w), MIN_WIDTH), Math.max(MIN_WIDTH, max))
}

/** The width a key press asks for, or null when the key is not a resize key. */
export function keyWidth(key: string, w: number, max: number = MAX_WIDTH): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(w - STEP, max)
    case 'ArrowRight':
      return clampWidth(w + STEP, max)
    case 'Home':
      return MIN_WIDTH
    case 'End':
      return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, max))
    default:
      return null
  }
}

/** The width for a pointer at clientX, given the tree's left edge. */
export function dragWidth(clientX: number, left: number, max: number = MAX_WIDTH): number {
  return clampWidth(clientX - left, max)
}
