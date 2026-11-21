---
type: build
status: done
status_note: "score 6.8 on Nov 21, 2026; the rest rises with time, 0.1.1 (31) and the badge (32)"
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

## Outcome

**First score: 5.7 / 10** (Nov 21, 2026, `4937ab2`; the workflow ran green on main). By check:

| Check | Score | Why | What we do |
|---|---|---|---|
| Token-Permissions, Binary-Artifacts, Dangerous-Workflow, Dependency-Update-Tool, Pinned-Dependencies, Vulnerabilities, License | 10 | — | Keep it so. |
| SAST | 7 | 7 of the last 9 commits went through CodeQL. The other two were pushed straight to main. | Rises by itself now that main needs PRs (ticket 30). |
| CI-Tests | 6 | 2 of 3 merged PRs ran CI. PR 1 was merged red. | Rises by itself with PRs. |
| Security-Policy | 4 | "no linked content". | **Fixed in this PR:** SECURITY.md links to the reporting form, and adds a reply/fix/disclosure timeline. |
| Branch-Protection | 3 | Main had only deletion and force-push blocked. With ticket 30's ruleset, it still warns: there are 0 required approvers, the admin can bypass, and there's no stale-review dismissal or code owners. | 0 approvers and the admin bypass stay: one maintainer can't approve their own PRs. That caps this check. |
| Signed-Releases | 0 | The v0.1.0 Release had no signature file: the attestation lives in GitHub's attestation store, not in the Release. It also says the release is "not immutable". | **Fixed:** `folio-issues-kanban-viewer-0.1.0.intoto.jsonl` (the signed provenance, which `gh attestation verify --bundle` accepts offline) was added to the v0.1.0 Release. `ci.yml` now attaches it to every Release. "Immutable releases" is a repo setting, and the owner's call: it would stop the delete-and-retag fix in releasing.md. |
| Packaging | ? | "no publishing workflow detected". `publish-npm.yml` has never run. | Rises after the first workflow publish (ticket 31). |
| Fuzzing | 0 | Scorecard only recognises fuzzing frameworks such as `fast-check` for TypeScript. The fuzz tests here use plain vitest with a seeded generator, deliberately with no dependency (ticket 19). | Left: adding `fast-check` as a dev dependency would score it. That's the owner's call. |
| Maintained | 0 | The repo is under 90 days old. | Rises by itself. |
| Code-Review | 0 | 0 of 23 changesets were approved by a second person. | Can't be met by a solo maintainer. |
| Contributors | 0 | No contributing organisations. | Expected for a solo project. |
| CII-Best-Practices | 0 | No badge yet. | Ticket 32. |

**After the fixes (PR 4, `f1117df`): 6.8 / 10.**
- Security-Policy went from 4 to 10.
- Signed-Releases went from 0 to 10. The provenance file is enough, without immutable releases.
- SAST went from 7 to 8, and CI-Tests from 6 to 7.

The rest is as the table says:
- Maintained, SAST and CI-Tests rise with time and PRs;
- Packaging rises after ticket 31;
- CII-Best-Practices rises with ticket 32;
- Code-Review, Contributors and Branch-Protection are capped for a solo maintainer;
- Fuzzing waits on the owner's call about `fast-check`.

AC1–AC3 are met.
