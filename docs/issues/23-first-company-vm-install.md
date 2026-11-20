---
type: verify
status: blocked
status_note: null
waiting_on: null
blocked_by: ["24"]
blocked_note: "needs the published npm package"
related: ["15", "22"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 23 — First run on the company VM

## Why

The last step: run the published package on the company VM against the real docs. It also carries ticket 15's AC3 (v1 on the VM with cold and warm start times recorded).

## To do

- [ ] On the VM: `npx folio-viewer --docs <path to the repo>`. Edge opens Folio.
- [ ] Check that it listens on `127.0.0.1` only: `Get-NetTCPConnection -State Listen | ? LocalPort -eq <port>`.
- [ ] Use it on the real docs. Record the cold and warm start times.

## Done when

- <a id="ac1"></a>**AC1** — Folio runs on the VM against the real repo, with the start times recorded here. This closes ticket 15's AC3.

## Outcome

*(empty)*
