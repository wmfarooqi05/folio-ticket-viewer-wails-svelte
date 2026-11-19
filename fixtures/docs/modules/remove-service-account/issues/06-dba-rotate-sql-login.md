---
type: task
status: blocked
status_note: "DBA window Nov 24"
waiting_on: dba
blocked_by: ["05", "05#q3"]
blocked_note: "05 on each environment"
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# 06 — DBA drops the SQL login

## Why

The login can only go after [05](05-grill-uat-schedule.md) says nothing uses it. Waiting on the DBA.

## Done when

- <a id="ac1"></a>**AC1** — Login dropped on dev, uat and prod.
