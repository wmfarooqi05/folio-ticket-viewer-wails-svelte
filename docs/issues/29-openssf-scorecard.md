---
type: build
status: in-progress
status_note: "started Nov 21, 2026"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["19", "28", "30", "32"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 29 — OpenSSF Scorecard: a workflow, a published score and a badge

## Why

Scorecard is the best-known security badge on GitHub ([credibility.md](../credibility.md), section 3). Its badge URL says "invalid repo path" today, because the repo has never been scanned.

## To do

- [ ] **`.github/workflows/scorecard.yml`:**
  - runs `ossf/scorecard-action` v2.6.0, pinned by SHA like every other action;
  - triggers weekly, on pushes to main, on `branch_protection_rule` events, and by hand;
  - sets `publish_results: true`;
  - asks for `id-token: write` and `security-events: write` on the job only, with read-only defaults;
  - uploads the SARIF to code scanning.
- [ ] **Badge:** once the first run on main has published a score, add the badge to both READMEs (ticket 28).
- [ ] **Look at the first score**, and fix whatever is cheap. Expected low checks, and why, are in credibility.md:
  - Maintained;
  - Code-Review;
  - Branch-Protection (ticket 30);
  - Contributors;
  - CII-Best-Practices (ticket 32).

## Done when

- <a id="ac1"></a>**AC1** — The workflow passes actionlint and runs green on main.
- <a id="ac2"></a>**AC2** — `https://api.scorecard.dev/projects/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/badge` shows a score, and the README links it to the Scorecard viewer.
- <a id="ac3"></a>**AC3** — The Outcome lists each check's score, and what was fixed or left (and why).
