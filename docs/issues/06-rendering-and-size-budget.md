---
type: decision
status: done
status_note: "decided Nov 20, 2026 (owner)"
waiting_on: null
blocked_by: ["01"]
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# 06 — Rendering pipeline and file-size budget

Label: wayfinder:grilling

## Why

The bundled frontend must carry a Markdown renderer, a sanitiser, Mermaid and the autolinker. That is where "very light" is won or lost.

## To do

- [ ] Choose the libraries (GFM tables and task lists, sanitising that allows `<a id>`, Mermaid) and their pinned versions.
- [ ] Libraries are bundled into the Wails assets, so there is no CDN. Mermaid is the largest piece.
- [ ] Decide whether Mermaid is loaded lazily, only when a doc contains a block.
- [ ] Set a webview memory target (from the RAM figure in ticket 01) and a bundle-size budget.
- [ ] Decide how the autolink rules (handoff §7) are configured.

## Done when

- <a id="ac1"></a>**AC1** — The library list, versions, Mermaid loading and the budgets are written down.

## Outcome

Decided Nov 20, 2026 (owner). The spec is [06-rendering-draft.md](../assets/06-rendering-draft.md), amended by D4.

### <a id="d1"></a>D1 — markdown-it 15.0.3
Chosen for `token.map`, so the renderer joins the parser's items, headings and links by line and never re-derives them.
- Frontmatter lines and anchors placed above headings are blanked before rendering.
- Autolinking is a core rule that calls `scanText`.
- Task lists use a small custom rule.
- `data-anchor` replaces DOM ids, so the two panes never collide.

### <a id="d2"></a>D2 — Sanitising with no DOMPurify
`html: true` with an allowlist in the `html_inline` and `html_block` rules:
- `<a id>` is re-serialised from the captured id.
- A bare `<br>` is allowed.
- Everything else is escaped and shown as text.

Also: `validateLink` stays on, images are served only from `/doc/…`, and a CSP meta tag is added.

### <a id="d3"></a>D3 — Mermaid 12.3.0, lazy and automatic
- It loads with a dynamic import only when `rec.hasMermaid`, then renders automatically with `securityLevel: 'strict'`, themed from the CSS tokens.
- If it breaks the B + 45 MB budget, the fallback is click-to-render.
- The **dependency graph** is a hand-rolled layered SVG (about 3 to 5 KB), with dagre as the fallback only.

### <a id="d4"></a>D4 — highlight.js 11.12.0, lazy (owner, amends the draft's J3)
- Core plus ts, sql, powershell, bash, json, yaml and csharp, about 18.5 KB gzip.
- It loads only when a doc has a fence in a known language. Unknown languages stay plain.
- Token colours come from the Indigo theme tokens, in light and dark.

### <a id="d5"></a>D5 — Budgets
| Budget | Target |
|---|---|
| Initial JS | ≤ 120 KB gzip, with a hard cap of 150 |
| CSS | ≤ 15 KB gzip |
| Mermaid chunk | ≤ 400 KB gzip |
| highlight.js chunk | ≤ 25 KB gzip |
| Exe | ≤ 18 MiB |

RAM, where **B** is 07's tuned idle baseline:
- B + 15 MB with two docs open.
- B + 45 MB after a Mermaid doc.
- B + 5 MB drift after opening 50 docs (the leak check).

`scripts/size-check.mjs` enforces the JS caps after `vite build`.

### <a id="d6"></a>D6 — Links and images
- Every link is a data-attribute marker with one delegated listener:
  - an internal link opens in the right panel; Ctrl-click opens it in the middle pane;
  - an external link opens through the OS browser;
  - a broken link shows the `lk-broken` state.
- Known spaces come from `index.spaces`, and the ADO and PR templates come from config (05 D4).
- Images are served by a Wails asset handler at `/doc/<path>`. A missing image shows the placeholder.
