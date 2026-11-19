---
type: build              # build | decision | grilling | task | bug | spike | verify, or a list: [decision, build]
status: open             # open | in-progress | blocked | in-review | done | dropped | superseded
status_note: null        # one line: the date and why
waiting_on: null         # owner | client | dba | infra | ops
blocked_by: []           # quoted refs: "05", "05#q3", "one-cash-mover 05", "one-cash-mover#q3"
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# NN — Title

<!--
Copy to docs/modules/<space>/…/issues/NN-short-slug.md.
NN = the space's highest ticket number + 1 (two digits minimum), never reused.
Rules: docs/modules/CONVENTIONS.md. Delete the sections that do not apply, and this comment.
Anchors go INSIDE the heading: ### <a id="q1"></a>Q1 — …  Never on a line of their own.
-->

## Why

## To do

- [ ] 

## Done when

- <a id="ac1"></a>**AC1** — 

## Open questions

<!-- Never renumber. Answer under the heading: **Answered YYYY-MM-DD (who):** … -->

### <a id="q1"></a>Q1 — 

## Decisions

### <a id="d1"></a>D1 — 

## Risks

### <a id="r1"></a>R1 — 

## Outcome

*(empty)*
