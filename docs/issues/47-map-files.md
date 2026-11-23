---
type: build
status: in-review
status_note: "Nov 23, 2026: built"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["25", "46"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 47 — Map files: map.md or README.md, set in Settings

## Why

The owner, Nov 23, 2026: "by default `map.md` and `Readme.md` can be the root for viewing kanban. but user can tell what file is used for mapping all tickets"

A repo has many `README.md` files (for example `docs/evidence/*/README.md`), so a README is a map only when tickets sit in `issues/` beside it. `map.md` stays a map on its own, as before.

## To do

- [x] The rule: `map.md` is a map on its own. Every other listed name (`README.md` by default) is a map only when tickets sit directly in `<its folder>/issues/`. If `map.md` is removed from the list, it is a plain doc: the list is the truth.
- [x] Names match in any case (`Readme.md`, `README.MD`, `Map.md`).
- [x] Precedence: in one folder the earliest qualifying name in the list wins and the others are docs. On a tie in a case-sensitive file system, the first sorted path wins.
- [x] The setting: the extra key `mapFiles` in `settings.json`, per machine, written only when it differs from the default (so a default file stays what the Go app writes). Own calls `getMapFiles` and `setMapFiles`, not part of `getConfig`. Web mode only; the desktop stub keeps the default.
- [x] The cache key is the parser version plus the names, so a changed list rebuilds the index. The index stores `mapFiles`.
- [x] Settings › Docs folder › Map files, saved with "Use names", rebuilds the index at once.
- [x] Go and the contract suite: Go keeps the unknown key; the contract test checks that it survives and that Node reads it.

## Not here

- The tickets folder stays `issues/`.
- Ticket naming and status reading are unchanged.
- Hand edits to `settings.json` while Folio runs apply after the next restart, as for the evidence folder (the server reads settings from memory).

## Done when

- <a id="ac1"></a>**AC1** — A `README.md` beside an `issues/` folder of tickets gets the board and graph, like `map.md`.
- <a id="ac2"></a>**AC2** — A `README.md` with no tickets beside it is a plain doc.
- <a id="ac3"></a>**AC3** — Names set in Settings change which file is the map after "Use names".

## Outcome

Built Nov 23, 2026.

- **`lib/parser/index.ts`:** a file whose name is in the list carries `mapForm`; the cross-file pass decides on every run which candidate is the map (`asMap`), so adding or removing tickets flips a README between map and doc, also from a cached index. `Index.mapFiles` records the list.
- **`server/shell.ts`, `server/server.ts`:** `getMapFiles` and `setMapFiles` with validation (at most 10 names, each ending in `.md`, no path, no leading dot).
- **`lib/index-store.svelte.ts`, `components/MapFilesField.svelte`, `SettingsDialog.svelte`, `App.svelte`:** the store reads the names at `start()` and keys the cache by them; the Settings field restarts it.
- **Tests:** `parser/maps.test.ts`, `server/map-files.test.ts`, `components/MapFilesField.test.ts`, `parseMapFiles`, `cacheKey`, and the contract case: the key survives a write, and on the Node side `getMapFiles` reads it (Go only keeps it, and was not run).
- **Review fixes:**
  1. Restarting with new names emptied the index and saved it empty: the server kept its stamps after a cache miss, so the next scan found no changes. Now any cache miss does a full rescan (`index-engine.ts`) and `loadCache` clears the stamps on a miss. Regression test: `server/map-files-restart.test.ts` (real `DocsService`, engine and parser, then a fresh service on the saved cache).
  2. `mapOfSpace` takes `modules/<space>/map.md` when it is a map, else the shallowest map of the space, so a space's README beside `issues/` is its map (refs like `x#q1` point at it) and beats a nested `a/map.md`.
  3. The cache key is `JSON.stringify(names)`, and names with `,` or `<>:"|?*` are refused.
  4. The contract test checks `getMapFiles` on the Node side.
  5. The "Not here" list says hand edits apply after a restart.
- **AC1–AC3, in a browser,** from the built package (`folio-web.mjs .`) with scratch settings, on a folder with `tickets/README.md`, `tickets/issues/01-03` (open, in progress, done) and a stray `notes/run1/README.md`:
  - `tickets/README.md` had the Doc / Board / Graph tabs, and its Board read "3 tickets · 2 open · 0 blocked".
  - `notes/run1/README.md` opened as a plain doc, with no tabs.
  - Settings › Map files set to `map.md` and **Use names**: the tree kept all 5 files, and `tickets/README.md` became a plain doc. `settings.json` gained `mapFiles`.
  - After a restart the tree still had 5 files (the cache was right). **Reset** made the README a map again, and removed `mapFiles` from `settings.json`.
