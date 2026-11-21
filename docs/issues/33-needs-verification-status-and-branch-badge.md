---
type: build
status: open
status_note: "Nov 21, 2026: from the factory board handoff"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["34", "35", "36"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 33 — The `needs-verification` status and column, and the branch badge

## Why

The factory's agents move a ticket to `needs-verification` when it is built and its evidence is ready for the owner ([reply](../handoff/factory-board-reply.md), R1). Folio knows a fixed set of statuses, so today such a ticket shows as `unknown` in the Open column. The factory's board block also names the branch a ticket is moving in (R5).

## To do

- [ ] **Add `needs-verification`**, labelled "Needs verification", in the four places statuses live:
  - the `Status` type and `STATUSES` list in `lib/parser/index.ts`;
  - the labels in `lib/status.ts`, with a colour token of its own in the theme;
  - the columns in `lib/views.ts`, between In progress and In review: `open, in-progress, blocked, needs-verification, in-review, done`;
  - the colours in `components/views/Board.svelte`.
- [ ] **Show the raw value of an unknown status** on its card, for example `unknown: needs-review`. It stays in the Open column.
- [ ] **The branch badge** on a card, from ticket 35's `board.branch`. Its look comes from ticket 36's design.
- [ ] **The frozen Go parser** doesn't know the new status. Keep `test:contract:go` passing, or record the expected difference.
- [ ] Update the package README if it lists statuses, and the CHANGELOG.

## Done when

- <a id="ac1"></a>**AC1** — A fixture with one ticket per status shows a Needs verification column in the right place.
- <a id="ac2"></a>**AC2** — A ticket with a status Folio doesn't know shows its raw value, in Open.
- <a id="ac3"></a>**AC3** — A card whose ticket has a board block with a `Branch` line shows the branch.
