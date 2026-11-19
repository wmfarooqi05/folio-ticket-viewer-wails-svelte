---
type: [decision, build]
status: done
status_note: "decided Nov 14, 2026"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["02"]
superseded_by: null
pr: []
ado: [72640, 72641]
afk: false
---

# 03 — Decide who owns the Key Vault key

## Why

Someone must own the key after the account is gone.

## Done when

- <a id="ac1"></a>**AC1** — D1 is written.

## Open questions

### <a id="q1"></a>Q1 — Is the key shared with the lockbox job
**Answered 2026-11-13 (client):** No, separate keys.

### <a id="q2"></a>Q2 — Does the DBA rotate it
Open. No answer yet.

### <a id="q3"></a>Q3 — Who deletes the old secret
**Answered 2026-11-14 (owner):** Ops deletes it after the cutover.

## Decisions

### <a id="d1"></a>D1 — Ops owns the key
Ops rotate it yearly.

### <a id="d2"></a>D2 — The DBA rotates it
**Superseded by [D1](#d1):** ops rotate, not the DBA.

## Risks

### <a id="r1"></a>R1 — Key left in a Library variable group
**Closed 2026-11-15:** group cleaned.

### <a id="r2"></a>R2 — A job we did not find
**Dropped 2026-11-15:** the list in [01](01-entrypoints-and-callers.md) is complete.

## Outcome

Decided: ops own the key. Cross-space: see [one-cash-mover 05 Q3](../../one-cash-mover/issues/05-build-movecash.md#q3).
