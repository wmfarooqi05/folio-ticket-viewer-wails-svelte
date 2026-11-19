---
type: build
status: blocked
status_note: null
waiting_on: null
blocked_by: ["09", "11", "13", "14"]
blocked_note: null
related: ["06", "07"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 15 — Budgets enforced, installer, v1 release

## Why

This closes the loop on "very lightweight": the budgets from 06 D5, measured on the real UI against 07's baseline, and a way to install Folio on the VM.

## To do

- [ ] `scripts/size-check.mjs`, run by `task build`, fails above the 06 D5 caps:
  - initial JS 150 KB gzip;
  - CSS 25 KB;
  - Mermaid 450 KB;
  - exe 20 MiB.
- [ ] A RAM check script (the 01 method: the process tree, private and WS, 30 s idle) for these cases:
  - idle and indexed: about B, which is 160 MB;
  - two docs open: ≤ B + 15 MB;
  - after Mermaid: ≤ B + 45 MB;
  - 50 docs opened in a row: drift ≤ 5 MB.
- [ ] CPU at idle with the pulse animations visible. Record it.
- [ ] An NSIS installer through `task package`. Install and run it on a clean Windows user profile.
- [ ] Run on the owner's VM against the real `docs/`, and record the cold and warm start times (the slow disk was never measured).
- [ ] README: install, first run and settings.

## Done when

- <a id="ac1"></a>**AC1** — The size check runs in `task build`, and all budgets pass, with the numbers in the Outcome.
- <a id="ac2"></a>**AC2** — The installer works on a clean profile.
- <a id="ac3"></a>**AC3** — The owner has run v1 on the VM against the real repo. This is HITL.

## Outcome

*(empty)*
