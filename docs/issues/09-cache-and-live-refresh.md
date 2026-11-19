---
type: build
status: open
status_note: null
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

- [ ] Go: `LoadCache`, `SaveCache` (atomic) and `Rescan` per [05-index-cache-draft.md](../assets/05-index-cache-draft.md) §2–3:
  - the file is `%LOCALAPPDATA%\Folio\cache\<hash>.json`;
  - stamps are path + mtime + size;
  - the whole cache is dropped when `parserVersion` changes, which is injected by Vite as a hash of `lib.mjs`.
- [ ] Watcher:
  - 200 ms trailing and 1 s maximum debounce, judged by stat at flush;
  - directory delete and rename handling;
  - new directories walked after they are added;
  - overflow triggers a rescan;
  - scope is only the configured roots, skipping `_`, dot and `node_modules` folders.
- [ ] Frontend:
  - a serial mutation queue holding the index in `$state.raw`;
  - the cold start reads in batches of 100 with one batch in flight;
  - the warm start paints from the cache, then reconciles, with the footer showing "Checking N files…";
  - Ctrl+R rescans;
  - `SaveCache` is debounced to 2 s.
- [ ] Re-render the open document silently when it changes, keeping the scroll position.

## Done when

- <a id="ac1"></a>**AC1** — The second launch paints the tree from the cache before the scan returns. Log both timings.
- <a id="ac2"></a>**AC2** — An edit, create, delete or rename in the fixtures shows in the tree within 1 s, with no duplicate updates.
- <a id="ac3"></a>**AC3** — Changing the parser invalidates the cache, giving one cold start.
- <a id="ac4"></a>**AC4** — Go tests cover the debounce, rename and new-directory cases.

## Outcome

*(empty)*
