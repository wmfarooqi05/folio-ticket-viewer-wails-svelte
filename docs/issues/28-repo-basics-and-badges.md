---
type: build
status: done
status_note: "merged Nov 21, 2026 (PR 3)"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["27", "29", "30", "31"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 28 — GitHub recognises the licence, the About box is filled in, both READMEs show badges

## Why

From [credibility.md](../credibility.md), sections 6 and 9:
- **GitHub reports the licence as "NOASSERTION".** `LICENSE` ends with two lines about the Geist fonts, so GitHub's detector can't match the MIT text, and the repo page shows no "MIT" label.
- **The repo's About box is empty:** no description, website or topics.
- **Neither README has badges.** All of these work today for the package: npm version, licence, Node version, CI status, dependencies, unpacked size and Socket score.

## To do

- [ ] **`LICENSE`** (root and `packages/folio-issues-kanban-viewer/`) is the exact MIT text. The Geist font note moves to the READMEs. `dist/licenses/OFL-Geist.txt` and `THIRD-PARTY-NOTICES.txt` already ship.
- [ ] **One line of badges** under the title in the root README and the package README:
  - npm version, licence, Node, CI, dependencies and size, plus Socket;
  - OpenSSF Scorecard, once ticket 29's first run has published a score.
- [ ] **The package README says why it is 4.4 MB:** Mermaid, KaTeX and highlight.js, each loaded only when a document needs it.
- [ ] **The About box** (`gh repo edit`):
  - description;
  - homepage, the npm page;
  - topics.

## Done when

- <a id="ac1"></a>**AC1** — `gh api repos/{owner}/{repo}/license` reports `MIT`.
- <a id="ac2"></a>**AC2** — Both READMEs show the badges, and each badge renders a value rather than an error.
- <a id="ac3"></a>**AC3** — The repo page shows the description, the npm link and the topics.

## Outcome

Merged in PR 3 on Nov 21, 2026.

- **AC1.** `LICENSE`, at the root and in the package, is the plain MIT text. GitHub's licence API now reports `MIT` (it was `NOASSERTION`). The Geist font note moved to a new License section in the root README; the package README already had it.
- **AC2.** Both READMEs have one line of badges: npm version, licence, Node, CI, dependencies, unpacked size, Socket (80) and OpenSSF Scorecard. Each badge URL was checked against the live package. The package README also explains the 4.4 MB unpacked size, and mentions the `map.md` + `issues/` layout. These badges reach the npm page only with the next version (ticket 31).
- **AC3.** The About box (via `gh repo edit`):
  - the description, with the npx command;
  - the npm page as homepage;
  - topics: `markdown`, `kanban`, `kanban-board`, `issue-tracker`, `tickets`, `markdown-viewer`, `cli`, `npm-package`, `svelte`, `nodejs`.
