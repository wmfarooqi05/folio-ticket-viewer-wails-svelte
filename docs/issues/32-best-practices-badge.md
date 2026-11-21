---
type: task
status: done
status_note: "passing, Nov 21, 2026 (project 16975)"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["29", "31"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 32 — OpenSSF Best Practices badge ("passing" level)

## Why

The [OpenSSF Best Practices badge](https://www.bestpractices.dev) is a self-certified checklist of how the project is run ([credibility.md](../credibility.md), section 5). It also raises Scorecard's CII-Best-Practices check (ticket 29). Most of the passing criteria are already true here.

## To do

- [x] **Claude: draft an answer**, with a link as evidence, for every passing criterion ([the list](https://bestpractices.dev/criteria/0)), in `docs/assets/32-best-practices-answers.md`. Flag any MUST that isn't met yet.
- [x] **Fix the unmet MUSTs**, if any.
- [x] **Owner:** sign in at bestpractices.dev with GitHub, add the project, and paste the answers in. About an hour.
- [x] **Add the badge** to both READMEs.

## Done when

- <a id="ac1"></a>**AC1** — The project's bestpractices.dev page shows "passing".
- <a id="ac2"></a>**AC2** — Both READMEs show the badge.

## Progress

Nov 21, 2026:
- **Answers drafted** for all 67 criteria in [32-best-practices-answers.md](../assets/32-best-practices-answers.md).
- **The unmet MUSTs are fixed in this PR:**
  - `contribution` and `test_policy`: the new [CONTRIBUTING.md](../../CONTRIBUTING.md);
  - `release_notes` and `release_notes_vulns`: the new [CHANGELOG.md](../../CHANGELOG.md), with a Security line in every entry; [releasing.md](../releasing.md) now makes the CHANGELOG entry part of every release.
- **CodeQL alerts:** the 15 open ones were triaged as false positives, or as mockups that are not shipped. The owner dismisses them; the answers file has the table.
- **The owner confirmed** the two "know secure design" answers (Nov 21).
- **Left for the owner:** paste the 0.1.0 notes onto its Release; dismiss the alerts; fill in the form.

## Outcome

Done Nov 21, 2026.

- **AC1.** The owner filled in the form from the drafted answers. The project page, [bestpractices.dev/projects/16975](https://www.bestpractices.dev/projects/16975), shows **passing** (Metal series).
- **AC2.** Both READMEs show the badge, after the Scorecard badge.
- **Scorecard's CII-Best-Practices check** goes up on its next weekly run.
