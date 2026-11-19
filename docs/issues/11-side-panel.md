---
type: build
status: blocked
status_note: null
waiting_on: null
blocked_by: ["10"]
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

- [ ] A 360px panel with its own stack of `{path, fragment}` entries, plus Back, "Open in middle" and Close (03 spec motion).
- [ ] Internal link click opens in the panel. Ctrl-click or middle-click opens in the middle pane.
- [ ] With a fragment, show only the item using the parser's `extractFragment`. Without one, show the whole doc. Scroll by container-scoped `data-anchor`.
- [ ] "Open in VS Code" from the panel lands on the item's line.
- [ ] Unknown targets show the broken state, with no navigation.

## Done when

- <a id="ac1"></a>**AC1** — In the fixtures, clicking `05 Q3`-style links shows just that Q with its answer marker. Back returns through at least 3 hops.
- <a id="ac2"></a>**AC2** — "Open in middle" promotes the entry, and the webview never navigates away.

## Outcome

*(empty)*
