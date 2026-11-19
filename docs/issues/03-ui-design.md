---
type: decision
status: done
status_note: "decided Nov 19, 2026 (owner): Folio mockup, Indigo theme"
waiting_on: null
blocked_by: []
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# 03 — Lock the UI design from the mockup

Label: wayfinder:prototype

## Why

"How should it look" is the key question, so the discussion needs a concrete artifact. The owner feeds [design-prompt.md](../design-prompt.md) to Claude Design and brings the mockup back.

## To do

- [ ] Owner runs the prompt in Claude Design and shares the result.
- [ ] Review it against handoff §7: three panes, header card, Table/Board toggle, right panel, Waiting on, Board, Open questions, graph.
- [ ] Decide what to cut or simplify for a single static file.

## Done when

- <a id="ac1"></a>**AC1** — A mockup is linked from this ticket.
- <a id="ac2"></a>**AC2** — The layout, the status colours and the views to build are decided, with any cuts listed.

## Outcome

Decided Nov 19, 2026 (owner).
- Mockup: [03-folio-mockup.html](../assets/03-folio-mockup.html).
- Build spec: [03-design-spec.md](../assets/03-design-spec.md). It holds the tokens, the Motion section, the screen coverage and 17 Svelte components. The spec is the source; the decisions below amend it.

### <a id="d1"></a>D1 — Folio, Indigo theme
The accent is `oklch(.54 .15 268)` in light and `oklch(.74 .12 268)` in dark. Teal and Tangerine are dropped. A light/dark toggle in the top bar follows the OS by default. The app name is **Folio**.

### <a id="d2"></a>D2 — Motion is kept as specified
Plain CSS and Svelte built-ins only. Easings are `cubic-bezier(.2,.7,.2,1)` for entering and `(.3,.7,.2,1)` for panes, with a .26s base. `prefers-reduced-motion` is added. The continuous pulse runs only on the header pill, board column headers and graph nodes, not on every tree dot.

### <a id="d3"></a>D3 — Fonts and icons
Bundle Geist and Geist Mono, latin subsets only, about 52 KB. Use about 15 Lucide icons as inline SVG Svelte components, about 5 KB, with no dependency.

### <a id="d4"></a>D4 — Ages are "edited N days ago"
They come from the file's mtime. No git dependency, and no claim of "waiting since".

### <a id="d5"></a>D5 — Map modes are Doc / Board / Graph
Doc renders `map.md` itself, which includes the generated table and the PR column. The mockup's synthetic Table is dropped.

### <a id="d6"></a>D6 — v1 cuts and fixes
- No "Try the sample docs" button.
- No diagnostics panel. Broken links show an inline state, specified in the spec because the mockup lacks it.
- The first-run text is rewritten for Wails: a native folder dialog, with no browser or tab wording.
- The header card adds `status_note`, `blocked_note` and `superseded_by`, which the mockup lacks.
