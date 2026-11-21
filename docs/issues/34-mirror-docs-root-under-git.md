---
type: task
status: open
status_note: "Nov 21, 2026: from the factory board handoff"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["33", "35", "36"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 34 — A docs root under `.git`, and a mirror rewritten by renames

## Why

The factory writes its mirror to `<repo>/.git/factory/board/docs/`, file by file, each written to a temporary name and renamed over the old one ([reply](../handoff/factory-board-reply.md), R2 and C2). Reading the code suggests both already work: the dot-folder skip applies only below the docs root, and the watcher handles renames. This ticket proves it with tests, so a later change can't break it.

## To do

- [ ] **A test:** `--docs` pointing at a folder under `.git` (and under another dot folder) lists its tickets. The CLI, the first-run detection and the Settings path box all accept it.
- [ ] **A test:** a burst of temporary-write-then-rename updates (for example 50 files in a second) ends with the board showing every file's last content, with no restart. Temporary names that don't end in `.md` never show up as tickets.
- [ ] **Windows:** Folio never holds a mirror file open between reads (check the parser and cache reads).
- [ ] **Find out whether a `--docs` path is remembered** for the next start, as the reply promises to check. If not, decide whether it should be.
- [ ] **Fix whatever the tests find.**

## Done when

- <a id="ac1"></a>**AC1** — `npx folio-issues-kanban-viewer --docs <repo>/.git/factory/board/docs` shows the mirror's tickets.
- <a id="ac2"></a>**AC2** — The rename-burst test passes on Windows in CI.
