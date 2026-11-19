---
type: task
status: blocked
status_note: null
waiting_on: ops
blocked_by: ["one-cash-mover 05", "one-cash-mover 05#q3", "one-cash-mover#q3"]
blocked_note: null
related: ["cloud-migration 07"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 07 — Ops delete the old Key Vault secret

## Why

Blocked until one-cash-mover moves cash without the key: [one-cash-mover 05 Q3](../../one-cash-mover/issues/05-build-movecash.md#q3).
Also see the broken link [old notes](../notes/gone.md) and cloud-migration 07 (plain text, unlinked).

## Done when

- <a id="ac1"></a>**AC1** — Secret deleted, and the vault audit log shows it.
