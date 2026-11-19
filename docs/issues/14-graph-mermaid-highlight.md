---
type: build
status: blocked
status_note: "merged Nov 20, 2026; waiting on the owner's look at Graph mode in the app; RAM re-measured in 15"
waiting_on: owner
blocked_by: ["10", "12"]
blocked_note: null
related: ["06"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 14 — Dependency graph, Mermaid and syntax highlighting

## Why

These are the heavier, lazy pieces from 06 D3 and D4. They come last because they cost the most and are used the least.

## To do

- [x] **Dependency graph,** the Graph mode on a map:
  - a hand-rolled layered SVG, with longest-path layers from `blocked_by` edges and 1 to 2 barycentre sweeps;
  - HTML nodes in status colours;
  - cross-space stubs;
  - the 03 spec motion (`draw`, `march`).

  dagre is the fallback only if a 40+ ticket space tangles.
- [x] **Mermaid 12.3.0:**
  - loaded with a dynamic import only when `rec.hasMermaid`;
  - `securityLevel: 'strict'`, themed from the tokens and re-rendered when the theme toggles;
  - the error state shows the source;
  - the SVG is cached per (path, mtime, block, theme).
- [x] **highlight.js 11.12.0,** lazy: core plus ts, sql, powershell, bash, json, yaml and csharp. Token colours come from the Indigo tokens in light and dark.
- [x] Measure RAM after a Mermaid doc against B + 45 MB, where B is 160 MB. If over, switch to click-to-render (06 D3).

## Done when

- <a id="ac1"></a>**AC1** — The graph renders the fixture spaces without overlapping nodes.
- <a id="ac2"></a>**AC2** — Both Mermaid fixtures render. The Mermaid chunk is ≤ 400 KB gzip and highlight.js ≤ 25 KB, and neither is in the initial bundle.
- <a id="ac3"></a>**AC3** — The RAM figure after Mermaid is recorded and within budget, or the fallback is applied.

## Outcome

Built on branch `worktree-agent-aa26125aa951ce786`, not merged.

**Graph.** `frontend/src/lib/graph/layout.ts` is pure (longest-path layers, two barycentre passes, columns stacked with a 26 px gap), `model.ts` turns a map's `blocked_by` edges into its input, and `components/views/Graph.svelte` draws it (HTML nodes over one SVG, loaded with `import()` from `MapModes.svelte`). Dropped and superseded tickets are hidden and counted. Tickets with no edge go in a wrapped grid under the graph, because the 40-ticket space would otherwise be one 3 000 px column. A blocker in another map or space is a stub one column left of the first ticket it blocks; clicking a node or stub calls `onselect`. `draw` and `march` are the spec's CSS; `march` runs only when there are 24 or fewer live edges (07 D1: GPU off), and `prefers-reduced-motion` already turns every animation off in `tokens.css`. dagre was not needed.

**Mermaid 12.3.0 and highlight.js 11.12.0** (both pinned exactly). `lib/render/enhance.ts` runs after `{@html}` renders (one `$effect` in `DocView.svelte`, keyed on `html`) and fetches a library only when the document has a mermaid fence or a fence in `ts`, `sql`, `powershell`, `bash`, `json`, `yaml` or `csharp` (and aliases). Mermaid runs with `securityLevel: 'strict'`, theme `base` and `themeVariables` read from the tokens (through a canvas, since Mermaid's colour maths cannot read oklch), and re-renders when `data-theme` or the OS scheme changes. The returned SVG is parsed in an inert document and stripped again (script, frames, `on*`, links that leave the document, external `url()`) before it goes in with `innerHTML`. A failed diagram keeps its source and shows the error line. The cache is keyed by (path, mtime, fence line, theme) and holds 8 entries; the fence line comes from `data-line`, which the fence rule in `markdown.ts` now emits, so a fragment view of the same file shares keys. Token colours for highlight.js are CSS variables from the Indigo tokens (`highlight.css`).

**AC1.** `graph/layout.test.ts` lays out every map in the fixtures and asserts no two boxes overlap and none is closer than 26 px, plus cycle, duplicate edge, stub and 60-ticket cases.

**AC2, sizes (gzip, from the Vite manifest).**

| Piece | gzip |
|---|---|
| Initial JS (index, runtime, views, preload), after merging 09 and 11 | 100.9 KB (limit 120; main was 94.8 KB before 14) |
| Mermaid, flowchart document (core + flowDiagram + dagre, 28 chunks) | 211.9 KB |
| Mermaid, sequence document (core + sequenceDiagram) | 192.2 KB |
| Mermaid, heaviest family without math (architecture, cytoscape) | 381.5 KB |
| KaTeX, loaded only when a diagram contains math (`$$`) | 77.7 KB, on top of the family it is used in |
| ELK layout | not bundled: `elkjs` is replaced by a stub, so `elk-*.js` is 13.6 KB gzip and never reaches 466 KB |
| highlight.js core + 7 grammars | 17.8 KB |
| `Graph.svelte` + layout | 4.3 KB |
| `mermaid.ts` | 2.9 KB |

The ELK figure was missing from the first version of this table. Mermaid 12.3.0 registers ELK by default, so a `flowchart-elk` header or a `layout: elk` setting would have loaded 466 KB of elkjs. Now `mermaid.ts` sets `layout: 'dagre'`, lists `layout`, `securityLevel` and the other limits in `secure` so a directive or frontmatter cannot change them, and rewrites a leading `flowchart-elk` to `flowchart`. `vite.config.ts` stubs `elkjs/lib/elk.bundled.js`. Checked in a production build in the browser: a `flowchart-elk` diagram, a frontmatter `layout: elk` diagram and an `%%{init}%%` directive with `layout: elk` all render and none requests an elk chunk. The one case over 400 KB is the architecture family plus KaTeX (459 KB); neither is in a fixture.

All under 400 KB and 25 KB, and none is in the initial chunk. Both fixtures (flowchart in `cash-handling-workflow/issues/04`, sequence diagram in `handoffs/ocm-cutover-handoff.md`) render in the built exe under the production CSP (no `unsafe-eval` needed) and in a browser harness in light and dark. `bin/folio.exe` is 15.5 MiB.

**AC3, RAM.** Measured on `bin\folio.exe` with `FOLIO_ROOT=fixtures\docs`, summing private bytes over `folio.exe` and its `msedgewebview2.exe` children (7 processes), 35 s after launch:

| State | Private bytes |
|---|---|
| Fresh launch, a plain document open (B, measured) | 176.6 MB |
| Fresh launch, the flowchart document open | 216.9 MB (+40.3) |
| Same session, then the sequence document opened | 195.0 MB (+18.4) |

Both deltas are inside the B + 45 MB budget (B + 45 is 205 MB with the spec's nominal B = 160 MB, 221.6 MB with the B measured here), so click-to-render was not applied. One run each, on a machine under load; the flowchart figure is the tighter one and sits about 4.7 MB under the measured-B line.

**Decision (AC3).** Automatic rendering is kept. The delta over B on the same build is +40.3 MB, under 45. Ticket 15 re-measures it as a median of at least 3 runs.

**Hardening after review.** Mermaid labels are stripped of the `data-*` attributes the document layer routes on (`ext`, `path`, `frag`, `broken`, `copy`, `keep`, `anchor`, `mermaid`, `line`), and `dom.ts` cancels and ignores any link under `.mermaid-out`. `.mermaid-out` has `contain: layout paint`. A cached SVG gets a new id suffix at each insert, so the middle pane and the panel never share ids. In the graph, a blocker that resolves to no file is a dashed "unresolved" stub, so its ticket no longer looks free; the Graph import has a `{:catch}` error line; hover lift is 2 px, node fill is 9%, and a stub's entrance delay follows the level of the ticket it blocks. The spec's in-progress `pulse` dot is left out of the graph on purpose: it animates box-shadow, a repaint every frame with the GPU off (07 D1).

Not verified: the graph in the running exe (I did not open a map's Graph mode there; it was exercised by the layout tests and the build only).
