import { describe, expect, it } from 'vitest'
import { MIN_MAIN, PANEL, STEP, TREE, clampWidth, computeLayout, dragWidth, keyWidth, type LayoutInput } from './resize'

describe('clampWidth', () => {
  it('limits to the range and rounds', () => {
    expect(clampWidth(TREE, 100)).toBe(TREE.min)
    expect(clampWidth(TREE, 900)).toBe(TREE.max)
    expect(clampWidth(TREE, 300.6)).toBe(301)
    expect(clampWidth(PANEL, 100)).toBe(PANEL.min)
    expect(clampWidth(PANEL, 700)).toBe(700)
  })
  it('falls back to the default for unset or bad values', () => {
    expect(clampWidth(TREE, 0)).toBe(TREE.def)
    expect(clampWidth(TREE, NaN)).toBe(TREE.def)
    expect(clampWidth(TREE, -5)).toBe(TREE.def)
    expect(clampWidth(PANEL, 0)).toBe(360)
  })
  it('respects a smaller max but never goes below the minimum', () => {
    expect(clampWidth(TREE, 400, 320)).toBe(320)
    expect(clampWidth(TREE, 400, 100)).toBe(TREE.min)
    expect(clampWidth(TREE, 0, 250)).toBe(250)
    expect(clampWidth(PANEL, 900, 500)).toBe(500)
    expect(clampWidth(PANEL, 0, 330)).toBe(330)
  })
})

describe('keyWidth', () => {
  it('steps by 16, towards the pane for the tree', () => {
    expect(keyWidth(TREE, 'ArrowRight', 280)).toBe(280 + STEP)
    expect(keyWidth(TREE, 'ArrowLeft', 280)).toBe(280 - STEP)
  })
  it('steps the other way for the panel, whose divider is on its left edge', () => {
    expect(keyWidth(PANEL, 'ArrowLeft', 360)).toBe(360 + STEP)
    expect(keyWidth(PANEL, 'ArrowRight', 360)).toBe(360 - STEP)
  })
  it('stops at the limits', () => {
    expect(keyWidth(TREE, 'ArrowLeft', 205)).toBe(TREE.min)
    expect(keyWidth(TREE, 'ArrowRight', 475)).toBe(TREE.max)
    expect(keyWidth(TREE, 'ArrowRight', 350, 360)).toBe(360)
    expect(keyWidth(PANEL, 'ArrowRight', 325)).toBe(PANEL.min)
    expect(keyWidth(PANEL, 'ArrowLeft', 590, 600)).toBe(600)
  })
  it('Home and End go to the min and the current max', () => {
    expect(keyWidth(TREE, 'Home', 300)).toBe(TREE.min)
    expect(keyWidth(TREE, 'End', 300)).toBe(TREE.max)
    expect(keyWidth(TREE, 'End', 300, 400)).toBe(400)
    expect(keyWidth(PANEL, 'Home', 500)).toBe(PANEL.min)
    expect(keyWidth(PANEL, 'End', 500, 720)).toBe(720)
  })
  it('End never goes below the minimum when the window leaves no room', () => {
    expect(keyWidth(PANEL, 'End', 320, 100)).toBe(PANEL.min)
  })
  it('ignores other keys', () => expect(keyWidth(TREE, 'a', 300)).toBeNull())
})

describe('dragWidth', () => {
  it('tree: the pointer offset from the tree left edge, clamped', () => {
    expect(dragWidth(TREE, 350, 0)).toBe(350)
    expect(dragWidth(TREE, 50, 0)).toBe(TREE.min)
    expect(dragWidth(TREE, 2000, 0)).toBe(TREE.max)
    expect(dragWidth(TREE, 450, 100, 400)).toBe(350)
  })
  it('panel: the distance from the pointer to the panel right edge, clamped', () => {
    expect(dragWidth(PANEL, 1000, 1600)).toBe(600)
    expect(dragWidth(PANEL, 1500, 1600)).toBe(PANEL.min)
    expect(dragWidth(PANEL, 100, 1600, 900)).toBe(900)
  })
})

const at = (body: number, over: Partial<LayoutInput> = {}) =>
  computeLayout({ body, treeWish: 280, panelWish: 360, panelOpen: true, treeOpen: true, ...over })

describe('computeLayout: the panel maximum', () => {
  it('is 60% of the window on a wide window', () => {
    expect(at(2000).panelMax).toBe(1200)
    expect(at(1600).panelMax).toBe(960)
  })
  it('is lowered so the middle pane keeps 480, which beats the 60% cap on a small window', () => {
    // 60% of 1000 is 600, but 1000 - 480 leaves only 520
    expect(at(1000).panelMax).toBe(520)
    // 60% of 900 is 540, but 900 - 480 leaves only 420
    expect(at(900).panelMax).toBe(420)
    // just past the crossover (body * 0.6 = body - 480 at 1200): the 60% cap takes over
    expect(at(1200).panelMax).toBe(720)
    expect(at(1300).panelMax).toBe(780)
  })
  it('never goes below the panel minimum, even when the middle pane must give way', () => {
    expect(at(700).panelMax).toBe(PANEL.min)
    expect(at(700, { panelWish: 600 }).panelW).toBe(PANEL.min)
  })
  it('clamps a saved wish to the maximum', () => {
    expect(at(1600, { panelWish: 1500 }).panelW).toBe(960)
    expect(at(1000, { panelWish: 800 }).panelW).toBe(520)
  })
  it('falls back to the absolute maximum before the window is measured', () => {
    expect(at(0).panelMax).toBe(PANEL.max)
  })
})

describe('computeLayout: the tree', () => {
  it('keeps its width when everything fits', () => {
    const g = at(1600)
    expect(g.treeW).toBe(280)
    expect(g.treeVisible).toBe(true)
    expect(g.treeAutoHidden).toBe(false)
  })
  it('shrinks to make room for the panel before it hides', () => {
    // 1100 - 360 - 480 = 260 left for the tree
    const g = at(1100)
    expect(g.treeMax).toBe(260)
    expect(g.treeW).toBe(260)
    expect(g.treeVisible).toBe(true)
  })
  it('hides when even its minimum would leave the middle pane under 480', () => {
    // 1040 - 360 - 480 = 200: exactly its minimum, still shown
    expect(at(1040).treeVisible).toBe(true)
    // one pixel less and it hides
    const g = at(1039)
    expect(g.treeVisible).toBe(false)
    expect(g.treeAutoHidden).toBe(true)
  })
  it('hides sooner when the panel is wider', () => {
    expect(at(1300, { panelWish: 600 }).treeVisible).toBe(true) // 1300 - 600 - 480 = 220
    expect(at(1300, { panelWish: 700 }).treeVisible).toBe(false) // 120
    expect(at(1600, { panelWish: 960 }).treeVisible).toBe(false) // the 60% cap leaves no room for a tree
  })
  it('does not count the panel when it is closed', () => {
    const g = at(900, { panelOpen: false })
    expect(g.treeVisible).toBe(true) // 900 - 480 = 420
    expect(g.treeMax).toBe(420)
    expect(at(600, { panelOpen: false }).treeVisible).toBe(false) // the window is too small even alone
  })
  it('stays hidden when the user collapsed it, without calling that auto-hide', () => {
    const g = at(1600, { treeOpen: false })
    expect(g.treeVisible).toBe(false)
    expect(g.treeAutoHidden).toBe(false)
  })
  it('is always at least the minimum wide', () => {
    expect(at(700).treeW).toBe(TREE.min)
    expect(MIN_MAIN).toBe(480)
  })
  it('is visible before the window is measured', () => expect(at(0).treeVisible).toBe(true))
})
