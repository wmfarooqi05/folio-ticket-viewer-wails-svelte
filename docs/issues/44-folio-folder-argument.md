---
type: build
status: in-review
status_note: "Nov 22, 2026: built; checked from the built package"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["24"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 44 — `folio .`: the docs folder without `--docs`

## Why

The owner, Nov 22, 2026: "yes `folio .` means `folio --docs`. it is just a helpful". Before this, `folio .` stopped with `unknown argument "."`.

## To do

- [x] A bare word on the command line is the docs folder: `folio .` is `folio --docs .`, and `folio <folder>` works from anywhere.
- [x] The folder is given once. A second folder, or a folder and `--docs`, is refused with a message naming both forms.
- [x] Anything starting with `-` is still an option (`-x` is refused as before), so a folder whose name starts with `-` needs `--docs`.
- [x] `--help` shows both forms, with examples. Both READMEs too.
- [x] Tests in `server/cli.test.ts`.

## Done when

- <a id="ac1"></a>**AC1** — `folio .` in a repo opens it, the same as `folio --docs .`.
- <a id="ac2"></a>**AC2** — `folio . --docs x` and `folio a b` are refused with one line saying to give the folder once.

## Outcome

Built Nov 22, 2026.

- **`server/cli.ts`:** `parseArgs` treats a word that doesn't start with `-` as the docs folder, through the same setter as `--docs`, which refuses a second folder. `HELP` shows `folio [<folder>]` and two examples.
- **Tests:** a bare `.`, a path with a space, a folder after an option, `folio .` equal to `folio --docs .`, and four refusals. The old "stray word" rejection is now `-x`, since a stray word is a folder.
- **From the built package** (`task build`, then `node packages/folio-issues-kanban-viewer/folio-web.mjs`, which is what `folio` runs):
  - **AC1:** `folio . --no-open` in `E:\projects\ticket_ui` started, and the server's `getConfig` returned `repoRoot: E:\projects\ticket_ui`.
  - **AC2:** `folio . --docs x` and `folio a b` each printed `folio: give the docs folder once: "folio <folder>" or "--docs <folder>", not both`.
  - `--help` shows the new usage and examples.
