---
type: task
status: done
status_note: "Nov 22, 2026: merged in PR 10; the same-ms rename gap it found is fixed"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["33", "35", "36"]
superseded_by: null
pr: ["10"]
ado: []
afk: true
---

# 34 — A docs root under `.git`, and a mirror rewritten by renames

## Why

The factory writes its mirror to `<repo>/.git/factory/board/docs/`, file by file, each written to a temporary name and renamed over the old one ([reply](../handoff/factory-board-reply.md), R2 and C2). Reading the code suggests both already work: the dot-folder skip applies only below the docs root, and the watcher handles renames. This ticket proves it with tests, so a later change can't break it.

## To do

- [x] **A test:** `--docs` pointing at a folder under `.git` (and under another dot folder) lists its tickets. The CLI, the first-run detection and the Settings path box all accept it.
- [x] **A test:** a burst of temporary-write-then-rename updates (for example 50 files in a second) ends with the board showing every file's last content, with no restart. Temporary names that don't end in `.md` never show up as tickets.
- [x] **Windows:** Folio never holds a mirror file open between reads (check the parser and cache reads).
- [x] **Find out whether a `--docs` path is remembered** for the next start, as the reply promises to check. If not, decide whether it should be.
- [x] **Fix whatever the tests find.**

## Done when

- <a id="ac1"></a>**AC1** — `npx folio-issues-kanban-viewer --docs <repo>/.git/factory/board/docs` shows the mirror's tickets.
- <a id="ac2"></a>**AC2** — The rename-burst test passes on Windows in CI.

## Outcome

Nov 21, 2026. The tests are in `server/mirror.test.ts`.

- **AC1.** A docs folder under `.git` (and under any dot folder) works. `inspectRoot`, which `--docs` and the path box both use, accepts it, and the scan lists every file. The dot-folder rule only applies below the docs folder.
- **AC2.** A burst of 60 rename-over writes (20 files × 3 rounds, `.<name>.tmp` renamed over the target) ends with every file at its last content. No `.tmp` is ever reported, and nothing is reported as removed. A reader runs in parallel with the renames, and every rename still succeeds on Windows, so Folio never holds a mirror file open.
- **Found and fixed:** a file replaced in **the same millisecond with the same size** was not seen as changed, because a stamp was only mtime and size. A stamp now also carries the file ID (`ino`), which a rename-over always changes. The cache keeps format `v: 1`, which is shared with the frozen Go app: a stamp is now `[mtime, size, ino]`, and Go's `[2]int64` decode drops the third value. An older cache reads every file as changed once.
- **Is `--docs` remembered?** No, by design: `server.ts` applies a `--docs` path in memory only and never writes it to `settings.json`. A folder chosen in the page is saved. So the owner passes `--docs <mirror>` each time, or uses a shortcut (README, "A Windows shortcut").
