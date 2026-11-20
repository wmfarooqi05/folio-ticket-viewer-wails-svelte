---
type: build
status: in-progress
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["04", "13", "18", "24"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 25 — Any docs layout, and choosing the docs roots in Settings

## Why

Folio only understands one layout: `docs/modules/<space>/…`, with tickets at `…/issues/NN-*.md`, plus `docs/handoffs/` and `docs/patterns/`. A repo laid out any other way shows nothing. This repo is the example: it has `docs/map.md` and `docs/issues/NN-*.md`, and Folio finds no roots at all.

Settings can't fix it either. The roots chips offer only `modules`, `handoffs` and `patterns`, so there is no way to point Folio at another folder.

Raised by the owner, Nov 20, 2026.

## To do

- [ ] **A generic space rule in the parser.**
  - A *space* is a folder that holds a `map.md` or an `issues/` folder.
  - Its name is the folder name. For the docs folder itself, the name is the repo folder's name, for example `ticket_ui`.
  - A ticket is `issues/NN-*.md` under a space, at any depth the current rule allows.
  - `modules/<space>/…` must keep giving exactly the same spaces, keys and records as today. Every fixture in `fixtures/docs/` and its `expected.json` stays green, unchanged.
  - Nested spaces: the nearest folder with `map.md` or `issues/` wins.
  - Ticket refs, map links and `blocked_by` resolve within the space as they do now.
  - Bump the parser version, so caches rebuild once.
- [ ] **Docs roots can be any folder, including the docs folder itself.**
  - A root of `.` means "the whole docs folder".
  - The scope skips still apply: `_`, dot folders and `node_modules`.
  - Validation stays the same: relative, inside the docs folder, no `..`, and at least one root must exist.
- [ ] **Auto-detect when the default roots are missing.** If the docs folder has none of `modules`, `handoffs` or `patterns` but has a `map.md` or an `issues/` folder, CheckRoot accepts it and proposes `.`. First run and Change folder then work on this repo with no manual step.
- [ ] **Settings: choose the roots.**
  - The chips list the docs folder's top-level folders that hold any `.md` (found by CheckRoot or a new call), plus "Whole docs folder (.)".
  - Add a small text box to add another relative folder.
  - Each chip keeps its found or missing dot.
  - The no-roots warning names what was looked for.
- [ ] **Both backends.** Go and the Node server (24) get the same CheckRoot, validation and scan. Add contract cases for:
  - a `docs/issues` + `docs/map.md` layout;
  - a `.` root;
  - a mixed layout with both `modules/` and a top-level `issues/`.
- [ ] Update the README and the `--docs` help text in `frontend/src/server/cli.ts`.

## Done when

- <a id="ac1"></a>**AC1** — Opening `E:\projects\ticket_ui` with a fresh settings file shows this repo's 25 tickets as one space, with the map, Waiting on and Open questions working, in the desktop app and in web mode.
- <a id="ac2"></a>**AC2** — The fixture corpus gives byte-identical results before and after: the existing parser tests and `expected.json` pass unchanged.
- <a id="ac3"></a>**AC3** — In Settings you can turn `.` and any detected top-level folder on and off, and add a typed one. A bad or missing root is refused with a clear message, by both backends (contract test).

## Outcome

*(empty)*
