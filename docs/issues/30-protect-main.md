---
type: task
status: open
status_note: null
waiting_on: null
blocked_by: ["29"]
blocked_note: "after the ticket 28/29 PR is merged, so that PR is not caught by its own rule"
related: ["28", "29"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 30 — Protect main with a ruleset

## Why

Nothing stops a push straight to main, or a merge with red checks. On Nov 20 the TypeScript 7 bump was merged while its checks were failing, and main stayed broken until PR 2. Scorecard's Branch-Protection check also scores this ([credibility.md](../credibility.md), sections 3 and 9).

## To do

- [ ] **A repository ruleset targeting the default branch:**
  - changes come through a pull request, with 0 required approvals, because there is one maintainer;
  - the main checks from `ci` and `security` must pass;
  - force pushes and deletion are blocked.
- [ ] **The owner (repository admin) may bypass it**, for emergencies. Say in this ticket what that means: a direct push still works for the owner, so the rule guards against mistakes, not against the owner.
- [ ] **Update [releasing.md](../releasing.md)** if this changes the release steps. Ticket status updates now go through a PR, or through the owner's bypass.

## Done when

- <a id="ac1"></a>**AC1** — `gh api repos/{owner}/{repo}/rulesets` lists the ruleset, active on the default branch.
- <a id="ac2"></a>**AC2** — A PR with a failing required check cannot be merged without bypass.
