---
type: build
status: in-review
status_note: "PRs open, Nov 18"
waiting_on: null
blocked_by: ["01"]
blocked_note: null
related: ["03#d1"]
superseded_by: null
pr: [204, 205]
ado: []
afk: false
---

# 02 — Cut over: nothing scheduled calls a route

## Why

After [01](01-entrypoints-and-callers.md) the old route has no callers. See [D1](03-decide-key-owner.md#d1).

## Done when

- <a id="ac1"></a>**AC1** — No scheduled task calls the app.
- <a id="ac2"></a>**AC2** — `ApiKey.LastUsedAt` does not move after the merge on any environment.

| Environment | Checked | Result |
|---|---|---|
| dev | 2026-11-17 | pass |
| uat | pending | - |

![before cutover](evidence/02-lastused-before.png)
