---
type: build
status: open
status_note: "Nov 22, 2026: from ticket 37"
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

- [ ] **Tokens:** `--s-verify`, `--s-verify-ink` and `--lightbox`, light and dark, replacing ticket 33's provisional colour.
- [ ] **D7:** Needs verification is the only solid pill (`--s-verify` fill, `--s-verify-ink` text) and the only ringed dot (7px, a 1.5px ring at 1.5px offset), in the tree, the header and the column heading. The column and the strips get an 8% tint, with a 32% hairline.
- [ ] **D6, the columns:** a 168px minimum, an 8px gap, and 40px rails below 1,048px, folding Done, then Open, then In review, then Blocked. In progress and Needs verification never fold. A rail shows its count and its vertical label, and expands on click. The board scrolls sideways if that still overflows.
- [ ] **Q5:** the "your turn" tag shows only when the column heading fits it. The status name is never truncated.
- [ ] **The card additions:**
  - the `status_note` on one line;
  - the hint *say "pay 05 verified" in the agent's chat*;
  - a copy-ref button, 22px, that flips to "copied" for 1.5s;
  - **Q10:** the copy is announced through an `aria-live` region. If the copy fails, the button says "select and copy".
- [ ] **Q4, the branch badge:** 19px high, mono 10.5px. The last 12 characters never shrink, and only the head truncates. The title and accessible name give the whole branch.
- [ ] **Q9:** a card arriving in Needs verification gets a 3px `--s-verify` ring that fades over 1.6s. Other moves get the plain rise. With reduced motion, neither.

## Done when

- <a id="ac1"></a>**AC1** — At 1440px and at 1280px, with the tree open, the board on `fixtures/board-mirror` matches the mockup: the rails fold in D6's order, and no column heading truncates.
- <a id="ac2"></a>**AC2** — A long branch keeps its last 12 characters on a 168px card.
- <a id="ac3"></a>**AC3** — Copy ref puts `pay 04` on the clipboard and announces it.
