---
type: build
status: blocked
status_note: null
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

- [ ] **Dependency graph,** the Graph mode on a map:
  - a hand-rolled layered SVG, with longest-path layers from `blocked_by` edges and 1 to 2 barycentre sweeps;
  - HTML nodes in status colours;
  - cross-space stubs;
  - the 03 spec motion (`draw`, `march`).

  dagre is the fallback only if a 40+ ticket space tangles.
- [ ] **Mermaid 12.3.0:**
  - loaded with a dynamic import only when `rec.hasMermaid`;
  - `securityLevel: 'strict'`, themed from the tokens and re-rendered when the theme toggles;
  - the error state shows the source;
  - the SVG is cached per (path, mtime, block, theme).
- [ ] **highlight.js 11.12.0,** lazy: core plus ts, sql, powershell, bash, json, yaml and csharp. Token colours come from the Indigo tokens in light and dark.
- [ ] Measure RAM after a Mermaid doc against B + 45 MB, where B is 160 MB. If over, switch to click-to-render (06 D3).

## Done when

- <a id="ac1"></a>**AC1** — The graph renders the fixture spaces without overlapping nodes.
- <a id="ac2"></a>**AC2** — Both Mermaid fixtures render. The Mermaid chunk is ≤ 400 KB gzip and highlight.js ≤ 25 KB, and neither is in the initial bundle.
- <a id="ac3"></a>**AC3** — The RAM figure after Mermaid is recorded and within budget, or the fallback is applied.

## Outcome

*(empty)*
