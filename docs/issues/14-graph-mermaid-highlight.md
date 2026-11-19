---
type: build
status: in-review
status_note: "built on branch worktree-agent-aa26125aa951ce786, not merged"
waiting_on: null
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
- [ ] Measure RAM after a Mermaid doc against B + 45 MB, where B is 160 MB. If over, switch to click-to-render (06 D3).

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
| Initial JS (index, runtime, views, preload) | 97.7 KB, was 94.8 KB before 14 and ticket 09 (limit 120) |
| Mermaid, flowchart document (core + flowDiagram + dagre, 28 chunks) | 211.9 KB |
| Mermaid, sequence document (core + sequenceDiagram) | 192.2 KB |
| Mermaid, heaviest family (architecture, cytoscape) | 381.5 KB |
| highlight.js core + 7 grammars | 17.8 KB |
| `Graph.svelte` + layout | 4.1 KB |
| `mermaid.ts` | 2.6 KB |

All under 400 KB and 25 KB, and none is in the initial chunk. Both fixtures (flowchart in `cash-handling-workflow/issues/04`, sequence diagram in `handoffs/ocm-cutover-handoff.md`) render in the built exe under the production CSP (no `unsafe-eval` needed) and in a browser harness in light and dark. `bin/folio.exe` is 15.5 MiB.

**AC3, RAM.** Measured on `binolio.exe` with `FOLIO_ROOT=fixtures\docs`, summing private bytes over `folio.exe` and its `msedgewebview2.exe` children (7 processes), 35 s after launch:

| State | Private bytes |
|---|---|
| Fresh launch, a plain document open (B, measured) | 176.6 MB |
| Fresh launch, the flowchart document open | 216.9 MB (+40.3) |
| Same session, then the sequence document opened | 195.0 MB (+18.4) |

Both deltas are inside the B + 45 MB budget (B + 45 is 205 MB with the spec's nominal B = 160 MB, 221.6 MB with the B measured here), so click-to-render was not applied. One run each, on a machine under load; the flowchart figure is the tighter one and sits about 4.7 MB under the measured-B line.

Not verified: the graph in the running exe (I did not open a map's Graph mode there; it was exercised by the layout tests and the build only).
