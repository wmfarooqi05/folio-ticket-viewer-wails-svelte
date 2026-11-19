---
type: build
status: in-review
status_note: "built on branch worktree-agent-a1ef64e7b3ee009e0, not merged"
waiting_on: null
blocked_by: ["08"]
blocked_note: null
related: ["05"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 09 — Cache, warm start and live refresh

## Why

The slow VM disk makes a cold scan expensive. 05 decided on a Go-owned JSON cache, a warm start that paints first, and a debounced watcher. `LoadCache`, `SaveCache` and `Rescan` are stubs today, and the frontend ignores `docs:changed`.

## To do

- [x] Go: `LoadCache`, `SaveCache` (atomic) and `Rescan` per [05-index-cache-draft.md](../assets/05-index-cache-draft.md) §2–3:
  - the file is `%LOCALAPPDATA%\Folio\cache\<hash>.json`;
  - stamps are path + mtime + size;
  - the whole cache is dropped when `parserVersion` changes, which is injected by Vite as a hash of `lib.mjs`.
- [x] Watcher:
  - 200 ms trailing and 1 s maximum debounce, judged by stat at flush;
  - directory delete and rename handling;
  - new directories walked after they are added;
  - overflow triggers a rescan;
  - scope is only the configured roots, skipping `_`, dot and `node_modules` folders.
- [x] Frontend:
  - a serial mutation queue holding the index in `$state.raw`;
  - the cold start reads in batches of 100 with one batch in flight;
  - the warm start paints from the cache, then reconciles, with the footer showing "Checking N files…";
  - Ctrl+R rescans;
  - `SaveCache` is debounced to 2 s.
- [x] Re-render the open document silently when it changes, keeping the scroll position.

## Done when

- <a id="ac1"></a>**AC1** — The second launch paints the tree from the cache before the scan returns. Log both timings.
- <a id="ac2"></a>**AC2** — An edit, create, delete or rename in the fixtures shows in the tree within 1 s, with no duplicate updates.
- <a id="ac3"></a>**AC3** — Changing the parser invalidates the cache, giving one cold start.
- <a id="ac4"></a>**AC4** — Go tests cover the debounce, rename and new-directory cases.

## Outcome

Built Nov 20, 2026 on branch `worktree-agent-a1ef64e7b3ee009e0`. Go tests, `go vet`, the frontend tests (205, 13 new), `npm run check` and `task build` are green.

**Go (`internal/docs`)**
- `cache.go`: `LoadCache` and `SaveCache` write `%LOCALAPPDATA%\Folio\cache\<first 12 hex of sha1(docsRoot)>.json` as `{v, parserVersion, docsRoot, roots, stamps: path -> [mtime, size], index}`. Go never decodes `index`. A different `v`, `parserVersion`, docs root or roots list is a cold start. A corrupt file is deleted. The save goes through a temp file in the same folder, `Sync`, then a rename. Tests use a temp dir through the unexported `setCacheDir`, and one test asserts nothing is written inside the docs root. `LogTimings` is a small binding that lets the frontend put its timings in the Go log.
- `watcher.go`:
  - **Debounce:** 200 ms trailing, 1 s maximum, with tests for both.
  - **Stamp check:** each path is judged by stat at flush against the delivered stamp and the last announced stamp, so a no-op save or a repeated flush produces no event.
  - **Delete and rename:** a file rename is `removed: [old]` plus `changed: [new]`. A directory delete or rename away sweeps every known path under that prefix.
  - **New directories:** the directory is added to the watcher first, then walked.
  - **Overflow:** any watcher error runs a `Scan` (which starts a fresh watcher, registering first) and emits a `ChangeSet` with `Rescan: true` that carries the diff. The buffer is raised to 256 KB with `fsnotify.WithBufferSize`.
- Scope: `_`-prefixed folders now join dot folders and `node_modules` in `skipDir`, so the walk and the watcher both skip `_templates`.
- `Rescan` and its test are unchanged apart from also clearing the announced stamps.

**Frontend**
- `lib/index-engine.ts`: pure logic with injected dependencies.
  - It holds a serial mutation queue. A failing step rejects only its caller.
  - Reads are batches of 100, with the next read issued before the previous batch is parsed, so one is always in flight.
  - Cold start fills the tree progressively.
  - Warm start publishes the cached index at once, the footer shows "Checking N files…", then the stat-only scan reconciles.
  - `SaveCache` is debounced to 2 s and runs through the queue, so Go's stamps match the index being written. The cold start saves right away.
- `lib/index-store.svelte.ts`: the reactive face. `indexStore.index` is `$state.raw`. `status`, `scanInfo` and `docVersion` are exposed too, with `touched(path)` and `removed(path)` for the latest bump.
- `vite.config.ts`: `__PARSER_VERSION__` is `lib-` plus a sha1 of the `lib.mjs` that `vite.lib.config.ts` builds in memory. It needs no earlier `build:lib` and writes no file.
- `App.svelte`: `load()` calls `indexStore.start()`. An `$effect` moves to the ready phase as soon as an index exists. Ctrl+R rescans. Another `$effect` re-reads the open document when `docVersion` bumps and that path was touched. It assigns `text` with the same `path`, so DocView keeps its scroll. A deleted file shows "This file was deleted."

**Timings (AC1).** Real runs of `bin/folio.exe` against `E:\projects	icket_uiixtures` (76 `.md` files, 133 KB cache), read from the Go log:

| | Cold (no cache) | Warm (second launch) |
|---|---|---|
| Tree painted from the cache | n/a | **14 ms** |
| Scan returned | 24 ms (walk 1 ms) | **30 ms** (walk 1 ms, 0 changed) |
| Fully current | 127 ms (first run), 245 ms (a second cold run) | 30 ms |
| `SaveCache` | 25 ms | none, nothing changed |

These are on the dev PC. The slow VM is unmeasured, and the warm path reading nothing is what should matter there.

**Live refresh (AC2).** Against a temp copy of the fixtures, the app logged one `docs:changed` per action, about 200 ms after it. Frontend apply took 1 to 6 ms each: an edit, a new directory with a file, a file rename (1 changed, 1 removed) and a directory delete. There were no duplicate events. I did not look at the tree itself; the check was the Go log.

**AC3.** The `parserVersion` test in Go covers a different version giving a cold start, and the Vite define changes whenever `lib.mjs` changes.

**Not done or open**
- The window-close flush is not wired: a quit within 2 s of the last change skips the save, and the next start just reconciles.
- Ctrl+R shows no UI beyond the footer text "Rescanning…".
