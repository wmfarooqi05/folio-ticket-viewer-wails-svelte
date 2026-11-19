---
type: build
status: blocked
status_note: "merged Nov 20, 2026; waiting on the owner: a UI check in the app (AC2) and whether Board shows on every map or only view=kanban"
waiting_on: owner
blocked_by: ["08"]
blocked_note: null
related: ["03", "04"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 12 — Views: Waiting on, Board and Open questions

## Why

These are the views no single file gives (handoff §7, in order of value). The data is one-line filters over the index (04).

## To do

- [x] **Waiting on:** tickets with `waiting_on`, grouped by person with Owner first, oldest first. Ages use "edited N days ago" from mtime (03 D4).
- [x] **Board per map:** kanban columns Open, In progress, Blocked, In review, Done. Dropped and superseded go in a collapsed strip. Cards show the number, title, type and blocker chips.
- [x] **Map modes:** Doc, Board and Graph on a `map.md` (03 D5). Graph is a placeholder until 14.
- [x] **Open questions:** Q items with no Answered marker. Closed tickets are hidden by default, with a toggle (04 D6).
- [x] Pinned entries in the tree with counts; empty states per the 03 spec. (Stopgap above the tree; real rows belong to 10.)

## Done when

- <a id="ac1"></a>**AC1** (met) — The view counts match a hand count over the fixtures, including legacy tickets with inferred `waiting_on` (04 D4).
- <a id="ac2"></a>**AC2** (met in code; not yet checked in a running window) — Clicking any row or card opens the ticket in the middle pane.

## Outcome

Built on branch `worktree-agent-a4dbdbfa818e5a578`. The logic is pure functions in `frontend/src/lib/views.ts` (tests in `views.test.ts`); the components are in `frontend/src/components/views/`.

**Hand count (AC1).** Counted from `fixtures/docs` and `fixtures/expected.json`, then asserted in `views.test.ts`. The functions passed on the first run.

| View | Hand count | How |
|---|---|---|
| Waiting on | 8 tickets: Owner 1 (remove-service-account 05), Client 1 (10), DBA 2 (rsa 06, cash-handling-workflow 21), Infra 2 (rsa 11, cloud-migration 08), Ops 2 (rsa 07, chw 13) | 5 migrated files with `waiting_on:` set (grep), plus 3 legacy: chw 21 "Blocked ... awaiting DBA" and cloud-migration 08 "blocked on infra" (04 D4), and chw 13 "blocked on DBA" with `Type: task + ops`, where the Type token sets ops |
| Board, remove-service-account | Open 1, In progress 1, Blocked 4, In review 1, Done 2, strip 2 (08 dropped, 09 superseded); 11 tickets | statuses in the 11 files |
| Board, cash-handling-workflow | Open 12 (6 open + 6 unknown), In progress 3, Blocked 2, In review 5, Done 12 (includes 100), strip 6 (4 dropped, 2 superseded); 40 tickets | the 39 numbered files plus 100 |
| Board, step2b | Open 2, In progress 1, Blocked 0, In review 1, Done 3, strip 0; 7 tickets | its own folder only, not the parent's |
| Board, cloud-migration | 0/0/1/0/1 | 07 done, 08 blocked |
| Board, one-cash-mover | 1/1/0/0/1 | 06 open, 05 in progress, 01 done |
| Open questions | 10 open Q items, 8 shown by default | open Q items: cloud-migration 07 q1 and its map q1; one-cash-mover 05 q3 and its map q3; rsa 03 q2, 05 q1, 05 q3, 11 q1, map q1, map q3. Hidden by default (D6): cloud-migration 07 q1 and rsa 03 q2, both in done tickets. The step2b 41 Q35 pair is answered, so it counts for nothing |

The tree counts come from `pinnedCounts`: 8 waiting, 8 questions.

**AC2.** Every row and card is a button that calls the existing `select(path)` in `App.svelte`, which opens the ticket in the middle pane and clears the view.

**Decisions and gaps**
- Ages come from `DocRecord.mtime`, which the index already carries, so nothing is stubbed. Tests pin mtimes because checkout time is the disk mtime.
- `unknown`-status tickets (chw 15, 32, 33, 34, 35, 36) go in the Open column with their raw status note, so no ticket vanishes from a board. The spec has only five columns.
- Board mode shows for every map, not only `map.kanban` ones. **Open question for the owner:** conventions.md, handoff §7 and spec G7 say the `view=kanban` hint gates the board, but only remove-service-account carries it, and legacy maps never will. Gate it, or show the board everywhere? The code shows it everywhere until decided.
- Graph is a placeholder text until 14.
- The tree's pinned rows are ticket 10's. This branch ships `pinnedCounts(index)` and a stopgap `PinnedViews.svelte` above the tree in `App.svelte`; at merge, 10's rows replace it (delete the component and its one line in `App.svelte`).
- Icons are text glyphs (◔ ? ▶ ←), to be swapped for 10's inline icons.
- Review fixes: unknown-status cards show a dashed dot and "status unknown" with the raw note; Tree gets `selected={view ? null : selected}`; blocker chips come from one pass over the edges in `boardFor` and skip closed targets and answered or closed items; the chosen map mode is remembered per map; Open questions has "Hide closed tickets" on by default; the board has a map header with "N tickets · N open · N blocked" (open = not done, dropped or superseded) and a progress bar; nested maps are labelled by their path inside the space; one global `button:focus-visible` rule in `app.css`.
- Not checked in a running window: the app needs Wails bindings, so the components were verified by `svelte-check` and `task build` only.
