---
type: build
status: open
status_note: "Nov 22, 2026: from ticket 37"
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

- [ ] **The header card:** a Branch row, and a Claimed by row (D5). Both appear **only** when the block has them (Q6, Q7).
- [ ] **The evidence panel** under the header card (D1). Its head says what's there ("1 video · 3 images · scenarios and write-up · 1 other file") and the folder. For a Needs verification ticket it adds the "Your turn" line, with `status_note`, the hint and copy ref.
- [ ] **The video (D2):** a native `<video controls preload="metadata">`, 16:9, at most 380px tall, radius 8.
- [ ] **The images:** a thumbnail grid (auto-fill, at least 120px, 16:10, gap 8, radius 7). A thumbnail opens the full-size view: a dialog with focus inside, ← → to move, Esc to close, and alt text from the file name.
- [ ] **Scenarios and Write-up as tabs,** Scenarios first (D3). Both are rendered by Folio's own Markdown renderer and sanitizer (Q1).
- [ ] **Other files:** listed by name, marked "not openable".
- [ ] **The verdict:** accepted or rejected, with "by the owner · relayed from chat", the date, and the quote.
- [ ] **The states:** not reachable, root not set (files listed, nothing shown, and how to set the root), a file that's missing, images only, and no board data (nothing new shown).
- [ ] **The right panel's summary,** as in the mockup ("1 video · 3 images · opens in the middle").

## Done when

- <a id="ac1"></a>**AC1** — With the fixture's evidence and the root set, the ticket view plays the video with seeking, opens an image full size, and renders `scenarios.md`.
- <a id="ac2"></a>**AC2** — Every state in the mockup's switcher looks like the mockup, in light and dark.
