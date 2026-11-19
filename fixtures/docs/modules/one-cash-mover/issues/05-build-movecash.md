---
type: build
status: in-progress
status_note: null
waiting_on: null
blocked_by: ["01"]
blocked_note: null
related: []
superseded_by: null
pr: [212]
ado: [72650]
afk: false
---

# 05 — Build the single move-cash path

## Why

Replaces the per-bank movers. See [remove-service-account 03](../../remove-service-account/issues/03-decide-key-owner.md).

## Open questions

### <a id="q1"></a>Q1 — One path for all banks
**Answered 2026-11-10 (client):** yes.

### <a id="q3"></a>Q3 — Who moves the cash in Step 4
Open. Referenced by [remove-service-account 07](../../remove-service-account/issues/07-ops-delete-secret.md).

## Done when

- <a id="ac1"></a>**AC1** — One path moves cash for all banks.
