---
type: build
status: open
status_note: "Nov 21, 2026: from the factory board handoff; format v1 waits on the factory's reply to C3"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["33", "34", "36"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 35 — Parse the factory's board block (v1)

## Why

The factory appends a generated block to each ticket in its mirror, holding the branch, the claim, the owner's verdict and the evidence files. It sits between `<!-- factory:board begin v1 -->` and `<!-- factory:board end -->` (the format is R3 in [the factory's handoff](https://github.com/wmfarooqi05/ai-software-factory/blob/main/docs/handoffs/folio-board-integration.md); see also [the reply](../handoff/factory-board-reply.md), C3). Tickets 33 and 36 need it parsed.

## To do

- [ ] **The parser** (`lib/parser/`, pure TypeScript, no DOM) reads the block into `board: { branch?, claim?, verdict?, evidence?: { folder, reachable, files: [{ name, url, kind }] } }` on the ticket record.
- [ ] Each `- <Key>: <value>` line under *Board* is read. Keys other than `Branch`, `Claimed by` and `Verdict` are ignored.
- [ ] Evidence lines: `- [name](file:///…) — kind`, with kind one of `image`, `video`, `scenarios`, `write-up`, `file`. Percent-decode the URL into a local path, but don't check the path here: that's ticket 36's job.
- [ ] **Tests:**
  - the handoff's sample block;
  - a block whose folder is `(not reachable)`;
  - a ticket with no block;
  - a `v2` marker (ignored as a block, and the ticket still shown);
  - an unclosed block;
  - two blocks (only the first is read).
- [ ] The block still renders as ordinary Markdown in the ticket body until ticket 36 replaces it with the panel.

## Done when

- <a id="ac1"></a>**AC1** — Every test case above passes. The parser never throws on a bad block.
