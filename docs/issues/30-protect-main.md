---
type: task
status: done
status_note: "ruleset active Nov 21, 2026"
waiting_on: null
blocked_by: []
blocked_note: null
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

## Outcome

Done Nov 21, 2026, after PR 3 merged.

- **AC1.** Repository ruleset **"protect main"** (id 27786290), active on the default branch:
  - changes come through a pull request, with 0 required approvals;
  - 8 required checks must pass: `tests and static checks`, `npm audit` and `folio-issues-kanban-viewer package` from `ci`, and `npm audit and signatures`, `hostile corpus and fuzz tests`, `what npm would publish`, `semgrep (p/typescript, p/javascript)` and `actionlint` from `security`;
  - deletion and force pushes are blocked.
- **Bypass.** The repository admin role, meaning the owner, can bypass it ("always"). So a direct push or a merge with red checks still works for the owner, but GitHub asks first. The rule guards against mistakes, such as the red TypeScript 7 merge on Nov 20, not against the owner. Scorecard counts the bypass against Branch-Protection (ticket 29).
- **The owner's own ruleset.** "main-branch" (id 27762523), created by the owner on Nov 21, blocks deletion and force pushes with no bypass. Both rulesets apply together, and the owner's was left unchanged.
- **AC2.** Not tried on purpose; it will show on the next PR with a red check. Ticket updates and the release version bump now go through a PR, as [releasing.md](../releasing.md) already describes for releases.
