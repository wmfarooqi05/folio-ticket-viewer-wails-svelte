---
type: build
status: open
status_note: null
waiting_on: null
blocked_by: ["08"]
blocked_note: null
related: ["03", "04"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 12 — Views: Waiting on, Board and Open questions

## Why

These are the views no single file gives (handoff §7, in order of value). The data is one-line filters over the index (04).

## To do

- [ ] **Waiting on:** tickets with `waiting_on`, grouped by person with Owner first, oldest first. Ages use "edited N days ago" from mtime (03 D4).
- [ ] **Board per map:** kanban columns Open, In progress, Blocked, In review, Done. Dropped and superseded go in a collapsed strip. Cards show the number, title, type and blocker chips.
- [ ] **Map modes:** Doc, Board and Graph on a `map.md` (03 D5). Graph is a placeholder until 14.
- [ ] **Open questions:** Q items with no Answered marker. Closed tickets are hidden by default, with a toggle (04 D6).
- [ ] Pinned entries in the tree with counts; empty states per the 03 spec.

## Done when

- <a id="ac1"></a>**AC1** — The view counts match a hand count over the fixtures, including legacy tickets with inferred `waiting_on` (04 D4).
- <a id="ac2"></a>**AC2** — Clicking any row or card opens the ticket in the middle pane.

## Outcome

*(empty)*
