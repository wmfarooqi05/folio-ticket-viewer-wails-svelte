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

1. 07 (running).
2. Then build slicing, which graduates from the fog once 07 fixes the RAM baseline B.

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
| 07 | [Can WebView2 be tuned well below 240 MB?](issues/07-webview2-tuning.md) | spike | — | — | in-progress | — |
<!-- tickets:end -->

## Decisions so far

- [Build a fixture corpus from the conventions](issues/02-fixture-corpus.md): 64 fake tickets in `fixtures/docs/`, with `expected.json` as the parser oracle and 21 legacy-rule ambiguities for the parser contract.
- [Parser module contract](issues/04-parser-contract.md): a pure TS module taking `{path, text, mtime}` records. It narrows the superseded rule, lets "merged" win, infers `waiting_on` for legacy tickets, and normalises typography only. No Web Worker in v1.
- [Wails v3 + Svelte shell](issues/01-wails-shell.md): the stack works on Wails v3.1.0 (stable). Idle cost is about 240 MB private, about 90% WebView2, so tuning goes to 07 before accepting it.
- [Lock the UI design from the mockup](issues/03-ui-design.md): Folio, Indigo theme, with motion kept. Geist fonts bundled, ages taken from mtime, map modes Doc/Board/Graph, no diagnostics panel in v1.
- [Go/JS split, index cache and refresh](issues/05-index-cache-refresh.md): Go stats, reads and watches, and JS holds the only index. A Go-owned JSON cache paints instantly on a warm start, with a debounced, stat-judged refresh. An **in-app Settings dialog behind a gear button** covers the repo root, the ADO and PR URLs and the theme, built to be extended.
- [Rendering pipeline and file-size budget](issues/06-rendering-and-size-budget.md): markdown-it joined to the parser by line, an allowlist sanitiser (no DOMPurify), lazy Mermaid and lazy highlight.js, a hand-rolled SVG graph. Initial JS ≤ 120 KB gzip, RAM ≤ B + 15 MB.

## Not yet specified

- **Build slicing:** how to cut the viewer into vertical slices once 05–07 close. The right panel and the cross-space views are now specified by 03's spec and 04's contract, and go into the slices.
- **Upstream amendments:** D2 to D5 in ticket 04 change handoff §3. Someone has to carry them into the other repo's CONVENTIONS and the handoff when the parser moves there.
- **Packaging:** build and distribution (a prebuilt `.exe` or the owner builds it), and WebView2 availability on other machines. 01 showed the exe needs only WebView2; installer packaging (NSIS or MSIX) is still undecided.

## Out of scope

- Writing or editing tickets from the viewer (read-only by design).
- Part A of the handoff: the `tickets` CLI, `CONVENTIONS.md` edits, PR template, migrating modules.
- Hosting, auth, a database, GitHub Issues or Azure DevOps boards.

## Risks

### <a id="r1"></a>R1 — Wails may be heavier or rougher than hoped
Measured in 01: about 240 MB private at idle, mostly WebView2. Ticket 07 tests tuning. If tuning fails, the fallback is the Go server plus an Edge `--app` window, with the same code.

## Open questions (owner)

### <a id="q1"></a>Q1 — Which browser do you use for this?
**Dropped 2026-11-19:** the stack is Wails, so the browser no longer matters.
