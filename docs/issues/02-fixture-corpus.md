---
type: task
status: done
status_note: "corpus built Nov 19, 2026: 64 tickets, 78 files"
waiting_on: null
blocked_by: []
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: true
---

# 02 — Build a fixture corpus from the conventions

Label: wayfinder:task

## Why

The real repo is not on this PC. The parser and every view need realistic files to test against, including the messy legacy ones.

## To do

- [ ] Create `fixtures/docs/modules/` with 3 number spaces: one migrated (frontmatter, items, anchors, generated map table), one legacy (body `Status:` / `Type:` / `Blocked by:` lines), one nested (a `step2b-…` folder inside a space).
- [ ] Cover every legacy status shape named in handoff §3 (30+ shapes: `✅ resolved`, `built … on claude/…`, `done — merged to dev in PR 208`, etc.) and the `Type:` combinations.
- [ ] Include the traps: duplicate `### Q35 answered` headings, a ticket number of 100, a cross-space relative link, plain-text "cloud-migration 07" references, a Mermaid block, an `evidence/` image reference.
- [ ] Include a `docs/handoffs/` and `docs/patterns/` file so the tree has all three roots.

## Done when

- <a id="ac1"></a>**AC1** — The corpus has at least 25 ticket files covering every row of the legacy status table.
- <a id="ac2"></a>**AC2** — Each trap above appears in at least one file.

## Outcome

Done Nov 19, 2026. Corpus at [fixtures/docs/](../../fixtures/docs/). It has 78 files and 64 tickets in 5 spaces:
- `remove-service-account`: migrated.
- `cash-handling-workflow`: legacy, with nested `step2b-payment-identification/` and ticket 100.
- `one-cash-mover`: mixed.
- `cloud-migration` and `cash-movement-engine`: small legacy link targets.

The tree also has `handoffs/`, `patterns/` and a hidden `_templates/`.

- [fixtures/README.md](../../fixtures/README.md) maps every trap and coverage item to its files. AC1 and AC2 are met.
- [fixtures/expected.json](../../fixtures/expected.json) is the parser's test oracle: the expected parse of every ticket, with the legacy `rule` that matched.
- `expected.json` also lists **21 ambiguities** in the handoff §3 fallback rules. They are input to ticket 04. The main ones:
  - Rule 1 catches "Dropped — superseded by 30".
  - A curly-apostrophe "Won’t" is missed, so U+2019 needs normalising.
  - "Built on claude/…, merged" still maps to `in-review`.
  - "blocked on DBA" sets no `waiting_on`, so legacy tickets are absent from the Waiting-on view.
  - `**Status:**` has its colon inside the bold.
  - `task + ops` is mapped to `[task]` with `waiting_on: ops`.
  - Hyphen ranges are treated like en-dash ranges.
