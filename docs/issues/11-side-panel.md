---
type: build
status: in-review
status_note: "built on branch worktree-agent-aca622383b057057e, not merged"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["03", "04"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 11 — Right side panel: link targets, fragments and back stack

## Why

Handoff §7: clicking an internal link opens its target in a right panel, not in the middle pane, and a fragment shows only that item. Today the panel is a hidden placeholder.

## To do

- [x] A 360px panel with its own stack of `{path, fragment}` entries, plus Back, "Open in middle" and Close (03 spec motion).
- [x] Internal link click opens in the panel. Ctrl-click or middle-click opens in the middle pane.
- [x] With a fragment, show only the item using the parser's `extractFragment`. Without one, show the whole doc. Scroll by container-scoped `data-anchor`.
- [x] "Open in VS Code" from the panel lands on the item's line.
- [x] Unknown targets show the broken state, with no navigation.

## Done when

- <a id="ac1"></a>**AC1** — In the fixtures, clicking `05 Q3`-style links shows just that Q with its answer marker. Back returns through at least 3 hops.
- <a id="ac2"></a>**AC2** — "Open in middle" promotes the entry, and the webview never navigates away.

## Outcome

Built on branch `worktree-agent-aca622383b057057e`.

### What shipped
- **Stack** (`lib/panel.ts`, pure, tested): `push` (the same entry as the one on show is a no-op), `back` (stops at one entry), `popTo` (trail click), `promote` (returns the entry and a closed stack), `close`, capped at 50 hops.
- **`SidePanel.svelte`**: 44px header with Back (dim at depth 1, Alt+Left), the file name, "Open in middle" and Close (Esc); a trail (`05 Q3 › 07`) once there is more than one hop; the source path with a "VS Code" button. It reads its own file and re-reads it when the record's mtime changes.
- **Fragment-only**: `renderMarkdown` takes a `range` (the parser's `extractFragment` result) and blanks every other line, so token lines, markers and `data-anchor` stay exact. `DocView` gets `variant: 'main' | 'panel'`, `range` and `onpanel`; the panel reuses it, so ticket 14's enhancements will apply there too.
- **Routing**: `dom.ts` already reported Ctrl, meta and middle clicks; `DocView.open` now sends a plain click to the panel and Ctrl or middle to the middle pane. Header-card chips open in the panel. A same-document link scrolls inside its own container with a scoped `data-anchor` query.
- **Broken states**: a broken link renders with no `data-path`, so it routes nowhere. A stale entry whose file is gone shows a not-found card. A fragment that is not in the file shows the whole file under an "Item #x not found" banner.
- **Layout**: the panel animates width 0 to 360 on `--dur` and `--ease-pane`, which are zero under `prefers-reduced-motion`. The tree auto-hides below 1200px while the panel is open.
- **VS Code line**: `OpenInVSCode(path, line)` and `VSCodeURL` already took a line, so Go is unchanged. The panel passes the item's first line (or 0 for a whole file).

### Verification
- Vitest 309 tests pass (after merging main with ticket 09), including the stack (push, 3 hops back, promote, close, dedupe) and happy-dom tests for click routing (plain, Ctrl, middle, broken) and fragment-only rendering of fixture `05 Q1` (with its answer marker) and `05 Q3`.
- `go test ./...`, `go vet ./...`, `npm run check` and `task build` are green. Initial JS is 99.2 KB gzip (limit 120).
- Not checked by eye in the real exe: the panel slide and the trail layout.
