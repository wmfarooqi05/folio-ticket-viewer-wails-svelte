---
type: build
status: in-review
status_note: "Nov 22, 2026: built; every state checked in a browser, light and dark"
waiting_on: null
blocked_by: ["38", "39"]
blocked_note: null
related: ["36", "37"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 40 — The evidence panel in the ticket view

## Why

The main piece of the design ([mockup](../assets/36-factory-board-mockup.html), Ticket screen): decisions D1 to D3 and D5, and answers Q1, Q6 and Q7 from [ticket 37](37-factory-board-design-gaps.md).

## To do

- [x] **The header card:** a Branch row, and a Claimed by row (D5). Both appear **only** when the block has them (Q6, Q7).
- [x] **The evidence panel** under the header card (D1). Its head says what's there ("1 video · 3 images · scenarios and write-up · 1 other file") and the folder. For a Needs verification ticket it adds the "Your turn" line, with `status_note`, the hint and copy ref.
- [x] **The video (D2):** a native `<video controls preload="metadata">`, 16:9, at most 380px tall, radius 8.
- [x] **The images:** a thumbnail grid (auto-fill, at least 120px, 16:10, gap 8, radius 7). A thumbnail opens the full-size view: a dialog with focus inside, ← → to move, Esc to close, and alt text from the file name.
- [x] **Scenarios and Write-up as tabs,** Scenarios first (D3). Both are rendered by Folio's own Markdown renderer and sanitizer (Q1).
- [x] **Other files:** listed by name, marked "not openable".
- [x] **The verdict:** accepted or rejected, with "by the owner · relayed from chat", the date, and the quote.
- [x] **The states:** not reachable, root not set (files listed, nothing shown, and how to set the root), a file that's missing, images only, and no board data (nothing new shown).
- [x] **The right panel's summary,** as in the mockup ("1 video · 3 images · opens in the middle").

## Done when

- <a id="ac1"></a>**AC1** — With the fixture's evidence and the root set, the ticket view plays the video with seeking, opens an image full size, and renders `scenarios.md`.
- <a id="ac2"></a>**AC2** — Every state in the mockup's switcher looks like the mockup, in light and dark.

## Outcome

Built Nov 22, 2026.

- **`EvidencePanel.svelte`,** under the header card (D1), draws what ticket 39's `evidenceFiles` returns and nothing else. It re-asks when the ticket changes on disk.
  - **The head:** "1 video · 3 images · scenarios and write-up · 1 other file", and the folder.
  - **For a Needs verification ticket:** the "Your turn" strip, with `status_note`, the hint and copy ref (24px).
  - **A verdict replaces that strip:** ✓ Accepted or ✕ Rejected, "by the owner, relayed from chat", the date, and the quote.
  - **The video (D2):** a native `<video controls preload="metadata">`, full width, 16:9, at most 380px tall.
  - **Thumbnails:** auto-fill at 120px or more, 16:10.
  - **Scenarios and Write-up tabs** (D3, Scenarios first). Each is fetched through the route and rendered by `renderMarkdown` with a parsed record (Q1). It goes through the same sanitizer as any document, so a `<script>` in a write-up shows as text.
  - **Other files:** "not openable".
- **`ImageViewer.svelte`:** the full-size view, a modal dialog on `--lightbox`. Focus moves inside, ← → move with wrap-around, Esc closes it, focus returns to the thumbnail, and the alt text comes from the file name ("01-refund-list.png" gives "refund list").
- **The header card (D5, Q6, Q7):** Branch, with "uncommitted" when the block says so, and Claimed by ("C:/work/app-refunds · agent worktree, since …"). Both appear only when the block has the line.
- **The ticket body** no longer repeats the board block: its lines are blanked, not cut, so the parser's line numbers still match.
- **The side panel:** the compact summary ("· opens in the middle", Your turn, copy ref, and "Open it in the middle"), with no media loaded.
- **Found in passing, and fixed:** ordered and unordered lists in **every** document had no numbers or bullets. Tailwind's reset removes them, and `doc.css` never set them again. `.doc ul` is now disc (circle when nested), and `.doc ol` decimal. Task lists keep no markers.
- **Tests:** `EvidencePanel.test.ts`, 7 tests: full evidence, no root, not reachable, missing files, accepted and rejected verdicts, no block, and compact.
- **Checked in a browser,** with a real 20s `.webm`, three PNGs, scenarios, a write-up and a zip, from a declared root, in dark and light. Each state was produced by rewriting the ticket on disk (the view updated live) or by restarting:
  - full evidence;
  - the viewer: focus, ← → wrapping, Esc, focus back;
  - the Write-up tab, with its `<script>` shown as text;
  - Rejected;
  - a missing video and a missing image;
  - not reachable (08);
  - no board data (01: no panel and no Branch row);
  - no evidence root (files listed, no media, **0** evidence requests);
  - the side panel's summary and "Open it in the middle".

  There were no console errors.
