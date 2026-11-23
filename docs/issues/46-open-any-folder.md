---
type: build
status: in-review
status_note: "Nov 23, 2026: built"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["25", "44"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 46 — Open any folder

## Why

The owner, Nov 23, 2026: "shouldn't we be open for this? it should start and if any pattern doesn't exists no issues. just render what we have?"

Folio refused a folder with no `modules/`, `handoffs/`, `patterns/`, `map.md` or `issues/`, so `folio <folder>` failed for plain notes.

## To do

- [x] Any local folder opens (`folio <folder>`, `--docs`, the path box). The known layouts are tried first. Otherwise Folio reads the folder's `docs/` when that holds Markdown, else the folder itself, read whole (the root `.`).
- [x] A folder with no Markdown opens empty, and the main pane says "No Markdown files in this folder."
- [x] A drive root (`C:\` or `/`) is refused with "a whole drive is too big to read; pick a folder inside it". The walk and the recursive watcher have no total cap on entries, so a drive could hang the server.
- [x] A non-folder and a network path are still refused, as before.
- [x] The sidebar says so when a folder is read whole with no space in it: "No modules/, map.md or issues/ here, so every Markdown file is shown."
- [x] The Node server now differs from the frozen Go app, which still refuses such folders. The contract suite records that split, and keeps comparing the two on everything else.
- [x] Tests: `server/open-any-folder.test.ts`, `anyFolderNote` in `lib/folder.test.ts`, `components/DocView.test.ts`, and the two contract cases split by backend.

## Not here

- A total-entries cap on the walk and the watcher (a follow-up). Until then a very large folder is slow, but a drive root is refused.

## Done when

- <a id="ac1"></a>**AC1** — `folio <plain folder>` opens and lists its Markdown, with the sidebar note.
- <a id="ac2"></a>**AC2** — A non-folder, a network path and a drive root are still refused.

## Outcome

Built Nov 23, 2026.

- **`server/shell.ts`:** `inspectRoot` no longer ends in a refusal. After the known layouts it takes `docs/` when that has Markdown, else the folder, and suggests `.`. A drive root gets `DRIVE_ROOT_MESSAGE`. `expectsMessage` is gone (only Go says it now).
- **`lib/folder.ts`, `App.svelte`, `DocView.svelte`:** `anyFolderNote` drives the sidebar note, and `DocView` has an `empty` prop for the no-Markdown state.
- **Tests:** ten for `inspectRoot` and `--docs`, four for the note, two for `DocView`; the mutation check (the old refusal put back) turns six of the ten red.
- **AC1, in a browser,** from the built package (`folio-web.mjs <folder>`) with scratch settings:
  - **A plain folder:** `README.md`, `notes/idea.md`, `notes/sub/deep.md` and `node_modules/x/x.md`.
    - It opened, and the tree listed `notes/` and `README.md`.
    - `node_modules` was skipped ("Watching 3 files").
    - The sidebar note read "No modules/, map.md or issues/ here, so every Markdown file is shown."
    - Change folder was pre-filled with the folder itself, not its parent.
  - **An empty folder:** it opened with "No Markdown files in this folder."
- **AC2, from the CLI:** `E:/` printed "a whole drive is too big to read; pick a folder inside it", and a missing path printed "that is not a folder".
- **How it was built:** an Opus design pass, a Sonnet build, then an Opus review that found six issues, all fixed before commit:
  1. the path boxes were pre-filled with the parent folder;
  2. the note was wrong for a map-only docs folder;
  3. known layouts were missed with custom saved roots;
  4. a network-path test used a broken string;
  5. a link to a drive root got past the refusal;
  6. a drive-root space name, which was checked and is cosmetic.
- **AC2:** covered by the `inspectRoot` tests (not a folder, network path, drive root).
