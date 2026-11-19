// Pane widths: the tree on the left and the side panel on the right share one set of
// rules (clamp, key step, drag, reset), kept pure so they can be tested. The Go side
// clamps to the same absolute bounds (settings.Min/Max SidebarWidth and PanelWidth).

export interface DividerSpec {
  min: number
  /** the absolute maximum; the window can only lower it */
  max: number
  def: number
  /** +1 when widening the pane moves its divider right (the tree), -1 when left (the panel) */
  grow: 1 | -1
}

export const TREE: DividerSpec = { min: 200, max: 480, def: 280, grow: 1 } // 03 design spec: left tree 280
export const PANEL: DividerSpec = { min: 320, max: 4000, def: 360, grow: -1 } // ticket 11: right panel 360
export const STEP = 16
/** The middle pane never gets narrower than this (when the window allows it). */
export const MIN_MAIN = 480
/** The panel may take at most this share of the window (the owner's limit). */
export const PANEL_FRACTION = 0.6


/** Rounds to whole pixels and limits to [spec.min, max]. NaN and 0 (never saved) give the default. */
export function clampWidth(spec: DividerSpec, w: number, max: number = spec.max): number {
  const hi = Math.max(spec.min, Math.min(max, spec.max))
  if (!Number.isFinite(w) || w <= 0) return Math.min(spec.def, hi)
  return Math.min(Math.max(Math.round(w), spec.min), hi)
}

/** The width a key press asks for, or null when the key is not a resize key. */
export function keyWidth(spec: DividerSpec, key: string, w: number, max: number = spec.max): number | null {
  switch (key) {
    case 'ArrowRight':
      return clampWidth(spec, w + STEP * spec.grow, max)
    case 'ArrowLeft':
      return clampWidth(spec, w - STEP * spec.grow, max)
    case 'Home':
      return spec.min
    case 'End':
      return clampWidth(spec, max, max)
    default:
      return null
  }
}

/**
 * The width for a pointer at clientX. `anchor` is the pane's fixed edge: its left edge
 * for the tree, its right edge for the panel.
 */
export function dragWidth(spec: DividerSpec, clientX: number, anchor: number, max: number = spec.max): number {
  return clampWidth(spec, spec.grow === 1 ? clientX - anchor : anchor - clientX, max)
}

export interface LayoutInput {
  /** width of the row that holds the three panes; 0 until measured */
  body: number
  treeWish: number
  panelWish: number
  panelOpen: boolean
  /** the user's choice (button or `[`), not whether it fits */
  treeOpen: boolean
}

export interface Geometry {
  treeW: number
  treeMax: number
  panelW: number
  panelMax: number
  /** the tree is drawn: wanted, and the window has room for it */
  treeVisible: boolean
  /** the tree is wanted but the window is too narrow for it beside the open panel */
  treeAutoHidden: boolean
}

/**
 * Where every pane goes. The panel may take 60% of the window, but never so much that the
 * middle pane drops below MIN_MAIN (that wins on small windows; the panel's own minimum
 * wins over both). The tree shrinks towards its minimum to make room, and hides when even
 * its minimum would leave the middle pane under MIN_MAIN. This replaces the old fixed
 * "tree hides under 1200px when the panel is open" rule.
 */
export function computeLayout(i: LayoutInput): Geometry {
  const measured = i.body > 0
  const panelMax = measured
    ? Math.max(PANEL.min, Math.min(PANEL.max, Math.floor(i.body * PANEL_FRACTION), i.body - MIN_MAIN))
    : PANEL.max
  const panelW = clampWidth(PANEL, i.panelWish, panelMax)
  const room = i.body - (i.panelOpen ? panelW : 0) - MIN_MAIN
  const treeMax = measured ? Math.max(TREE.min, Math.min(TREE.max, room)) : TREE.max
  const treeW = clampWidth(TREE, i.treeWish, treeMax)
  const fits = !measured || room >= TREE.min
  return {
    treeW,
    treeMax,
    panelW,
    panelMax,
    treeVisible: i.treeOpen && fits,
    treeAutoHidden: i.treeOpen && !fits,
  }
}
