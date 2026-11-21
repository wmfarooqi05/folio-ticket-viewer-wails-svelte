---
type: build
status: in-review
status_note: "Nov 22, 2026: built; checked in the browser"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["36", "37"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 38 — The board: verify tokens, folding columns, and the card additions

## Why

This is the board part of the design ([mockup](../assets/36-factory-board-mockup.html), decisions D5 to D7 and the tokens in [ticket 37](37-factory-board-design-gaps.md#decisions)), with answers Q4, Q5, Q9 and Q10.

## To do

- [x] **Tokens:** `--s-verify`, `--s-verify-ink` and `--lightbox`, light and dark, replacing ticket 33's provisional colour.
- [x] **D7:** Needs verification is the only solid pill (`--s-verify` fill, `--s-verify-ink` text) and the only ringed dot (7px, a 1.5px ring at 1.5px offset), in the tree, the header and the column heading. The column and the strips get an 8% tint, with a 32% hairline.
- [x] **D6, the columns:** a 168px minimum, an 8px gap, and 40px rails below 1,048px, folding Done, then Open, then In review, then Blocked. In progress and Needs verification never fold. A rail shows its count and its vertical label, and expands on click. The board scrolls sideways if that still overflows.
- [x] **Q5:** the "your turn" tag shows only when the column heading fits it. The status name is never truncated.
- [x] **The card additions:**
  - the `status_note` on one line;
  - the hint *say "pay 05 verified" in the agent's chat*;
  - a copy-ref button, 22px, that flips to "copied" for 1.5s;
  - **Q10:** the copy is announced through an `aria-live` region. If the copy fails, the button says "select and copy".
- [x] **Q4, the branch badge:** 19px high, mono 10.5px. The last 12 characters never shrink, and only the head truncates. The title and accessible name give the whole branch.
- [x] **Q9:** a card arriving in Needs verification gets a 3px `--s-verify` ring that fades over 1.6s. Other moves get the plain rise. With reduced motion, neither.

## Done when

- <a id="ac1"></a>**AC1** — At 1440px and at 1280px, with the tree open, the board on `fixtures/board-mirror` matches the mockup: the rails fold in D6's order, and no column heading truncates.
- <a id="ac2"></a>**AC2** — A long branch keeps its last 12 characters on a 168px card.
- <a id="ac3"></a>**AC3** — Copy ref puts `pay 04` on the clipboard and announces it.

## Outcome

Built Nov 22, 2026.

- **Tokens:** `--s-verify` (`oklch(.55 .19 330)` light, `oklch(.76 .14 330)` dark), `--s-verify-ink` and `--lightbox` in all three theme blocks. The ring is a new `verify-ring` keyframe.
- **D7:** `StatusDot` draws Needs verification with a ring (a 1.5px outline at 1.5px offset), everywhere it appears: the tree, the column heading and the header pill. `StatusPill` is solid for it, with its dot in the ink colour. The column has an 8% tint and a 32% hairline, and its cards a tinted border.
- **D6:** `foldedColumns()` in `views.ts` (tested): a 168px minimum, 40px rails and an 8px gap, with folding below 1,048px in the order Done, Open, In review, Blocked. A rail is a button that shows its dot, count and vertical label. Opening one keeps it open, and the board scrolls sideways.
- **Q5:** the column heading wraps rather than truncating, and "your turn" shows only when the column is at least 240px wide (a container query).
- **The card:** it's now a `div` whose title button covers the card (`::after`), so copy ref is a real button that isn't nested in another one. A Needs verification card shows `status_note`, the hint and copy ref (`CopyRef.svelte`, with an `aria-live` announcement and a "select and copy" fallback).
- **Q4:** `BranchBadge.svelte` keeps the last 12 characters and truncates only the head. If even the tail doesn't fit, it cuts from its start. The whole Branch line is in the title, and the whole branch in a screen-reader label.
- **Q9:** a card arriving in Needs verification while the board is open gets the 1.6s ring. Reduced motion turns it off (the global rule).
- **Checked in the browser,** on `fixtures/board-mirror` in dark mode:
  - **AC1:** at 1440px all six columns show; at 1280px Done folds to a rail with no overflow, and "Needs verification" is never cut. Opening the rail keeps it open.
  - **AC2:** `feature/payment-intents` shows as `fea…ment-intents`, `feature/chargebacks` as `fea…/chargebacks`, and `feature/refunds` whole.
  - **The arrival ring:** renaming a changed 05 over the file (as the factory writes) moved it live into Needs verification with the ring.
  - **AC3, partly:** the copy button didn't open the ticket, and when the clipboard refused, the fallback showed. The embedded test browser refuses clipboard writes (`NotAllowedError`), even for a real click, so the success path ("copied", announced) is **not verified here**. Check it once in a normal browser.
