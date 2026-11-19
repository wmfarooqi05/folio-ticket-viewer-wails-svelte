---
type: build
status: blocked
status_note: null
waiting_on: null
blocked_by: ["08"]
blocked_note: null
related: ["03", "06", "07"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 10 — Document view: rendering, header card, tree and theme

## Why

This is the core reading experience. Today the middle pane shows raw text in a `<pre>`, the tree shows no status dots, and the Geist fonts are not bundled.

## To do

- [ ] Renderer per [06-rendering-draft.md](../assets/06-rendering-draft.md) §1–2 and [06](06-rendering-and-size-budget.md) D1, D2 and D6:
  - markdown-it 15.0.3 joined to parser records by line;
  - frontmatter lines and anchors above headings are blanked;
  - an allowlist sanitiser (`<a id>`, `<br>`);
  - a `scanText` autolink rule;
  - task lists;
  - `data-anchor` for headings;
  - link markers with one delegated listener;
  - the broken-link state;
  - images through a Wails asset handler at `/doc/<path>`, with the missing-image placeholder;
  - a CSP meta tag.
- [ ] Header card per [03-design-spec.md](../assets/03-design-spec.md), plus 03 D6's additions:
  - status, type chips, waiting on, blocked-by chips, PR and ADO chips (plain text when no template is set);
  - `status_note`, `blocked_note` and `superseded_by`;
  - the legacy badge and the unknown-status pill;
  - "Open in VS Code" through `ShellService.OpenInVSCode`;
  - "edited N days ago" from mtime.
- [ ] Item decoration: IdTags and state markers.
- [ ] Tree:
  - status dots and open-count badges;
  - the filter box;
  - `_templates` hidden;
  - the pinned views list (links can be stubs until 12).
- [ ] Bundle Geist and Geist Mono (latin, about 52 KB) and about 15 inline Lucide icons (03 D3).
- [ ] Motion per the 03 spec, using CSS and Svelte built-ins only, with `prefers-reduced-motion`. The pulse runs only on the header pill, column headers and graph nodes.
- [ ] **A GPU-off visual check (07 D1):** screenshots of a long ticket with a table, in light and dark, attached to the Outcome.

## Done when

- <a id="ac1"></a>**AC1** — Every fixture trap renders correctly: anchors on their own line, duplicate Q35 headings, a broken link, a missing image, plain-text references autolinked, and a random 5-digit number not linked.
- <a id="ac2"></a>**AC2** — The header card matches the 03 spec for a migrated ticket and for a legacy ticket.
- <a id="ac3"></a>**AC3** — Initial JS is ≤ 120 KB gzip.
- <a id="ac4"></a>**AC4** — Screenshots are attached, with no GPU-off glitches.

## Outcome

*(empty)*
