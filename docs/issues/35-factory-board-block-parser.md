---
type: build
status: done
status_note: "Nov 22, 2026: merged in PR 10"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["33", "34", "36"]
superseded_by: null
pr: ["10"]
ado: []
afk: true
---

# 35 — Parse the factory's board block (v1)

## Why

The factory appends a generated block to each ticket in its mirror, holding the branch, the claim, the owner's verdict and the evidence files. It sits between `<!-- factory:board begin v1 -->` and `<!-- factory:board end -->` (the format is R3 in [the factory's handoff](https://github.com/wmfarooqi05/ai-software-factory/blob/main/docs/handoffs/folio-board-integration.md); see also [the reply](../handoff/factory-board-reply.md), C3). Tickets 33 and 36 need it parsed.

## To do

- [x] **The parser** (`lib/parser/`, pure TypeScript, no DOM) reads the block into `board: { branch?, claim?, verdict?, evidence?: { folder, reachable, files: [{ name, url, kind }] } }` on the ticket record.
- [x] Each `- <Key>: <value>` line under *Board* is read. Keys other than `Branch`, `Claimed by` and `Verdict` are ignored.
- [x] Evidence lines: `- [name](file:///…) — kind`, with kind one of `image`, `video`, `scenarios`, `write-up`, `file`. Percent-decode the URL into a local path, but don't check the path here: that's ticket 36's job.
- [x] **Tests:**
  - the handoff's sample block;
  - a block whose folder is `(not reachable)`;
  - a ticket with no block;
  - a `v2` marker (ignored as a block, and the ticket still shown);
  - an unclosed block;
  - two blocks (only the first is read).
- [x] The block still renders as ordinary Markdown in the ticket body until ticket 36 replaces it with the panel.

## Done when

- <a id="ac1"></a>**AC1** — Every test case above passes. The parser never throws on a bad block.

## Outcome

Built Nov 21, 2026.

- **The parser** (`lib/parser/index.ts`, a new "factory's board block" section, still with no imports) gives each ticket record `board: { branch, branchNote, claim, verdict, evidence: { folder, reachable, files: [{ name, path, kind }] }, line } | null`. File URLs become local paths (`fileUrlToPath`): drive paths, POSIX paths and `file://localhost/` are read. A UNC host, a malformed escape and a NUL are refused. An unknown kind becomes `file`.
- **AC1.** `board.test.ts` covers:
  - the handoff's sample block;
  - `(not reachable)`;
  - a block without evidence;
  - no block;
  - a `v2` marker and an unclosed block (no board, and a `BOARD` warning);
  - two blocks (the first is read);
  - a block inside fenced code (ignored, so a ticket can quote the format);
  - a block in a doc that is not a ticket (ignored);
  - evidence lines it can't read;
  - and malformed blocks, which never throw.
- The block still renders as plain Markdown in the ticket body until ticket 36.
