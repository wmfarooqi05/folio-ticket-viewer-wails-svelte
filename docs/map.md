---
status: active
ado: null
superseded_by: null
---

# Ticket viewer — Wayfinder Map

Label: wayfinder:map
Charted: Nov 19, 2026.
Source: owner: "we just need a simple ui where i can read my file based tickets"; "i want this to be very light"; v1 scope "Everything in §7" of [the handoff](handoff/handoff.md).

## Destination

A build-ready spec for a **read-only Wails desktop ticket viewer** (Go backend, plain-HTML/JS frontend): parser contract, UI design, rendering and index strategy, and a build order. Reached when no decision remains before someone starts coding. This map plans; it does not build the viewer.

Reached when:
- The Wails shell is confirmed light enough (RAM measured) and its version and frontend approach are chosen.
- The UI design is locked from a mockup.
- The parser and index shape are decided, with a fixture corpus to test against.

## Notes

- **Repo (owner, Nov 20, 2026):** [wmfarooqi05/folio-ticket-viewer-wails-svelte](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte), private. Go module path: `github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte`.
- **Source of truth for conventions:** [conventions.md](handoff/conventions.md) (CONVENTIONS) and [handoff.md](handoff/handoff.md) §1–3 (what it parses), §7 (what it shows).
- **The real ticket repo is not on this PC.** The viewer owns its parser, written from the conventions and the legacy-fallback table. Keep it one self-contained module so it can move into the other repo as `scripts/tickets/lib.mjs` later.
- **Stack (owner, decided Nov 19, 2026):** Wails **v3.1.0** (stable; pins are in [01](issues/01-wails-shell.md)). Go backend (file walk, `fsnotify`, config) exposed as typed Wails services, so v3 generates TypeScript bindings into `frontend/bindings/`. WebView2 frontend. Very low RAM is the priority. Electron was ruled out. A Node/Vite build step is fine, because it costs nothing at runtime.
- **Frontend framework (owner, decided Nov 19, 2026):** **Svelte 5 + Tailwind.** React and Preact are out. Reasons: smaller runtime, fine-grained updates. Confirmed working in 01.
- **Desktop feel:** `user-select: none` on chrome only (buttons, tree, toolbar). Document content and header-card values (IDs, PR numbers, paths) stay selectable. Native dialogs for the folder picker.
- **Parser stays TypeScript** with no React or DOM imports, compiled to plain JS, so it can move into the other repo as `lib.mjs`. Go does no parsing.
- **v1 scope (owner):** everything in handoff §7. The dependency graph comes last.
- **Ticket format:** these tickets follow the conventions they describe (frontmatter, `NN-slug.md`).
- **Design:** Folio, Indigo theme, including motion. The build spec is [03-design-spec.md](assets/03-design-spec.md), amended by [03](issues/03-ui-design.md)'s decisions.

## Order

**Planning destination reached on Nov 20, 2026.** Decisions 01–07 are closed. The build runs as slices 08–15 on the scaffolded app.

1. **Done:** 08 (parser) merged. 13 (settings) merged, waiting on the owner's UI check.
2. **Now, in parallel:** 09 (cache), 10 (document view) and 12 (views).
3. **After 10:** 11 (side panel). After 10 and 12: 14 (graph, Mermaid, highlighting).
4. **Last:** 15 (budgets, installer, v1 on the VM).

## Tickets

<!-- tickets:begin view=kanban -->
| # | Ticket | Type | Blocked by | Waiting on | Status | PR |
|---|---|---|---|---|---|---|
| 01 | [Wails v3 + Svelte shell: confirm it builds, measure RAM](issues/01-wails-shell.md) | spike | — | — | done — stack confirmed, RAM tuning moved to 07 | — |
| 02 | [Build a fixture corpus from the conventions](issues/02-fixture-corpus.md) | task | — | — | done — corpus built Nov 19, 2026 | — |
| 03 | [Lock the UI design from the mockup](issues/03-ui-design.md) | decision | — | — | done — Folio, Indigo theme (owner) | — |
| 04 | [Parser module contract](issues/04-parser-contract.md) | decision | [02](issues/02-fixture-corpus.md) | — | done — decided Nov 19, 2026 (owner) | — |
| 05 | [Go/JS split, index cache and refresh](issues/05-index-cache-refresh.md) | decision | [01](issues/01-wails-shell.md) | — | done — decided Nov 20, 2026 (owner) | — |
| 06 | [Rendering pipeline and file-size budget](issues/06-rendering-and-size-budget.md) | decision | [01](issues/01-wails-shell.md) | — | done — decided Nov 20, 2026 (owner) | — |
| 07 | [Can WebView2 be tuned well below 240 MB?](issues/07-webview2-tuning.md) | spike | — | — | done — GPU-off flags applied, B is about 160 MB | — |
| 08 | [Parser passes the fixture oracle](issues/08-parser.md) | build | — | — | done — merged Nov 20, 2026 | — |
| 09 | [Cache, warm start and live refresh](issues/09-cache-and-live-refresh.md) | build | [08](issues/08-parser.md) | — | open | — |
| 10 | [Document view: rendering, header card, tree and theme](issues/10-document-view.md) | build | [08](issues/08-parser.md) | — | open | — |
| 11 | [Right side panel: link targets, fragments and back stack](issues/11-side-panel.md) | build | [10](issues/10-document-view.md) | — | blocked | — |
| 12 | [Views: Waiting on, Board and Open questions](issues/12-cross-space-views.md) | build | [08](issues/08-parser.md) | — | blocked — merged, waiting on owner (UI check, Board gating) | — |
| 13 | [Settings dialog and first-run flow](issues/13-settings-dialog.md) | build | — | — | blocked — merged, waiting on owner UI check | — |
| 14 | [Dependency graph, Mermaid and syntax highlighting](issues/14-graph-mermaid-highlight.md) | build | [10](issues/10-document-view.md), [12](issues/12-cross-space-views.md) | — | blocked | — |
| 15 | [Budgets enforced, installer, v1 release](issues/15-budgets-and-packaging.md) | build | [09](issues/09-cache-and-live-refresh.md), [11](issues/11-side-panel.md), [13](issues/13-settings-dialog.md), [14](issues/14-graph-mermaid-highlight.md) | — | blocked | — |
<!-- tickets:end -->

## Decisions so far

- [Build a fixture corpus from the conventions](issues/02-fixture-corpus.md): 64 fake tickets in `fixtures/docs/`, with `expected.json` as the parser oracle and 21 legacy-rule ambiguities for the parser contract.
- [Parser module contract](issues/04-parser-contract.md): a pure TS module taking `{path, text, mtime}` records. It narrows the superseded rule, lets "merged" win, infers `waiting_on` for legacy tickets, and normalises typography only. No Web Worker in v1.
- [Wails v3 + Svelte shell](issues/01-wails-shell.md): the stack works on Wails v3.1.0 (stable). Idle cost is about 240 MB private, about 90% WebView2, so tuning goes to 07 before accepting it.
- [Lock the UI design from the mockup](issues/03-ui-design.md): Folio, Indigo theme, with motion kept. Geist fonts bundled, ages taken from mtime, map modes Doc/Board/Graph, no diagnostics panel in v1.
- [Go/JS split, index cache and refresh](issues/05-index-cache-refresh.md): Go stats, reads and watches, and JS holds the only index. A Go-owned JSON cache paints instantly on a warm start, with a debounced, stat-judged refresh. An **in-app Settings dialog behind a gear button** covers the repo root, the ADO and PR URLs and the theme, built to be extended.
- [Rendering pipeline and file-size budget](issues/06-rendering-and-size-budget.md): markdown-it joined to the parser by line, an allowlist sanitiser (no DOMPurify), lazy Mermaid and lazy highlight.js, a hand-rolled SVG graph. Initial JS ≤ 120 KB gzip, RAM ≤ B + 15 MB.
- [Can WebView2 be tuned well below 240 MB?](issues/07-webview2-tuning.md): GPU off cuts idle private memory from about 236 MB to about 160 MB (B), applied in `main.go`. No single-process mode, and no patched Wails for the Low memory target.

## Not yet specified

- **Upstream amendments:** D2 to D5 in ticket 04 change handoff §3. Someone has to carry them into the other repo's CONVENTIONS and the handoff when the parser moves there.
- **Distribution beyond the owner's VM:** whether anyone else installs Folio, and how to handle machines without WebView2. 15 covers only the NSIS installer for the owner.

## Out of scope

- Writing or editing tickets from the viewer (read-only by design).
- Part A of the handoff: the `tickets` CLI, `CONVENTIONS.md` edits, PR template, migrating modules.
- Hosting, auth, a database, GitHub Issues or Azure DevOps boards.

## Risks

### <a id="r1"></a>R1 — Wails may be heavier or rougher than hoped
**Closed 2026-11-20:** 07 cut idle private memory to about 160 MB with GPU-off flags. Tuned Edge `--app` reaches about 125 MB, so it remains a fallback if the real UI blows the budget.

## Open questions (owner)

### <a id="q1"></a>Q1 — Which browser do you use for this?
**Dropped 2026-11-19:** the stack is Wails, so the browser no longer matters.
