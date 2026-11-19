// The shell's layout state: both drag dividers, the tree's collapsed flag and the computed
// geometry. App.svelte owns one Layout and wires the handlers to the divider elements.
// The sums live in resize.ts (pure, tested); this file only holds the state and the pointer
// plumbing that both dividers share.
import * as api from './api'
import { PANEL, TREE, clampWidth, computeLayout, dragWidth, keyWidth, type DividerSpec } from './resize'

interface SplitterDeps {
  /** the pane's fixed edge in client px: its left edge (tree) or its right edge (panel) */
  anchor: () => number | null
  /** the widest the pane may be right now */
  max: () => number
  /** the width drawn now (the wish, clamped) */
  width: () => number
  save: (width: number) => Promise<unknown>
}

/** One divider: pointer capture, a rAF-throttled drag, keyboard steps, double-click reset. */
export class Splitter {
  /** what the user asked for; the width drawn is this clamped to what fits */
  wish = $state(0)
  dragging = $state(false)
  #x = 0
  #raf = 0
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    readonly spec: DividerSpec,
    private deps: SplitterDeps,
  ) {
    this.wish = spec.def
  }

  /** From settings.json; 0 (never saved) gives the default. */
  load(saved: number) {
    this.wish = clampWidth(this.spec, saved)
  }

  #save() {
    clearTimeout(this.#timer)
    this.deps.save(this.deps.width()).catch((err) => console.error('could not save the pane width', err))
  }

  start = (e: PointerEvent) => {
    if (e.button !== 0 || this.deps.anchor() === null) return
    e.preventDefault() // no text selection or native drag
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    this.dragging = true
  }

  move = (e: PointerEvent) => {
    if (!this.dragging) return
    this.#x = e.clientX
    if (this.#raf) return // one update per frame
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0
      const a = this.deps.anchor()
      if (a !== null) this.wish = dragWidth(this.spec, this.#x, a, this.deps.max())
    })
  }

  end = (e: PointerEvent) => {
    if (!this.dragging) return
    this.dragging = false
    cancelAnimationFrame(this.#raf)
    this.#raf = 0
    const a = this.deps.anchor()
    if (a !== null && e.type === 'pointerup') this.wish = dragWidth(this.spec, e.clientX, a, this.deps.max())
    this.#save() // once, at the end of the drag
  }

  reset = () => {
    this.wish = this.spec.def
    this.#save()
  }

  key = (e: KeyboardEvent) => {
    const next = keyWidth(this.spec, e.key, this.deps.width(), this.deps.max())
    if (next === null) return
    e.preventDefault()
    this.wish = next
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.#save(), 400) // a held key is one save, not many
  }
}

export class Layout {
  /** width of the row that holds the three panes; 0 until measured */
  bodyW = $state(0)
  treeEl = $state<HTMLElement>()
  panelEl = $state<HTMLElement>()
  /** the user's choice, shared by the header button and `[`; saved to settings.json */
  treeOpen = $state(true)

  #panelOpen: () => boolean = () => false

  readonly tree: Splitter = new Splitter(TREE, {
    anchor: () => this.treeEl?.getBoundingClientRect().left ?? null,
    max: () => this.geo.treeMax,
    width: () => this.geo.treeW,
    save: api.setSidebarWidth,
  })
  readonly panel: Splitter = new Splitter(PANEL, {
    anchor: () => this.panelEl?.getBoundingClientRect().right ?? null,
    max: () => this.geo.panelMax,
    width: () => this.geo.panelW,
    save: api.setPanelWidth,
  })

  /** Where every pane goes right now: the wishes, clamped to the window. */
  readonly geo = $derived(
    computeLayout({
      body: this.bodyW,
      treeWish: this.tree.wish,
      panelWish: this.panel.wish,
      panelOpen: this.#panelOpen(),
      treeOpen: this.treeOpen,
    }),
  )

  constructor(panelOpen: () => boolean) {
    this.#panelOpen = panelOpen
  }

  /** From settings.json. */
  load(c: { sidebarWidth: number; panelWidth: number; sidebarCollapsed: boolean }) {
    this.tree.load(c.sidebarWidth)
    this.panel.load(c.panelWidth)
    this.treeOpen = !c.sidebarCollapsed
  }

  /** The header button and `[`. */
  toggleTree() {
    this.treeOpen = !this.treeOpen
    api.setSidebarCollapsed(!this.treeOpen).catch((err) => console.error('could not save the sidebar state', err))
  }

  get dragging() {
    return this.tree.dragging || this.panel.dragging
  }
}
