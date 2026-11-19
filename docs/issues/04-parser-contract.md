---
type: decision
status: done
status_note: "decided Nov 19, 2026 (owner)"
waiting_on: null
blocked_by: ["02"]
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# 04 — Parser module contract

Label: wayfinder:grilling

## Why

The viewer owns its parser, written from handoff §1–5. The contract must be fixed first so the module can later move into the other repo as `lib.mjs` without change.

## To do

- [ ] Decide the exports (`buildIndex`, `parseFile`, plus the pieces) and the index record shape: path, space, number, title, meta, legacy flag, items, links.
- [ ] Decide how it works in the webview with no `fs`: input is `{path, text, mtime}` records from the Go binding, not a path.
- [ ] Confirm the legacy fallback rules and `unknown` handling against the fixtures. Start from the 21 `ambiguities` in [fixtures/expected.json](../../fixtures/expected.json), and decide each one.
- [ ] Decide link resolution and the item-extraction rule (handoff §4).

## Done when

- <a id="ac1"></a>**AC1** — The function signatures and the index record shape are written down.
- <a id="ac2"></a>**AC2** — Every legacy shape in the fixtures has an agreed status.

## Open questions

### <a id="q1"></a>Q1 — Does the parser run in a Web Worker?
**Answered 2026-11-19 (owner, accepting the draft):** No for v1. Go does the slow-disk I/O, and parsing about 5 MB takes about 100 ms in batches. Move to a worker only if a 1,000-file run shows a batch over 50 ms or a cold build over 300 ms.

Keeps the UI responsive on a slow disk; costs a little complexity in one file.

## Outcome

Decided Nov 19, 2026. The full contract and rule detail are in [04-parser-contract-draft.md](../assets/04-parser-contract-draft.md). That draft is the spec, amended by the decisions below.

### <a id="d1"></a>D1 — Contract
A pure TypeScript module with no imports, compiled to `lib.mjs`.
- **Input:** `SourceFile {path, text, mtime}` records from Go.
- **Viewer API:** `buildIndex`, `updateIndex`, `resolveHref`, `extractFragment` and `scanText`, which does the plain-text autolinking.
- **Handoff pieces still exported** for the other repo's CLI: `parseFile`, `parseFrontmatter`, `parseLegacy`, `parseItems`, `parseLinks` and `resolveRef`. A Node adapter, `buildIndexFromDisk(root)`, covers the CLI.
- **Index contents:** `DocRecord`s, resolved edges and diagnostics.

### <a id="d2"></a>D2 — Rule 1 is narrowed (amends handoff §3)
`superseded` only when the text starts with "superseded" or contains "superseded by NN". "Resolved (superseded by the D3 amendment)" is `done`.

### <a id="d3"></a>D3 — "Merged" wins (amends handoff §3 rule 4)
"merged" without "not" means `done`, even with a branch name. "Not merged … built on …" means `in-review`.

### <a id="d4"></a>D4 — `waiting_on` is inferred for legacy tickets
Person words in the status text (owner, client, DBA, infra, ops) set `waiting_on`, but **only when the legacy status maps to `blocked`** (the draft's A5). So "Pending client answer" stays `unknown` with no `waiting_on`, which keeps D5's no-new-words rule. A `Type: … + ops` token sets `waiting_on: ops` while the ticket is not done, dropped or superseded.

### <a id="d5"></a>D5 — The fallback stretches typography only
Normalise curly quotes, dashes, bold colons and backticks, and allow word-order variants. No new words: `unblocked`, `parked` and `pending` stay `unknown` with their raw text.

### <a id="d6"></a>D6 — Open questions hides closed tickets by default
Q items in done, dropped or superseded tickets are hidden, with a toggle to show them. The owner did not object to this default.

### <a id="d7"></a>D7 — The other 16 ambiguities follow the draft
They have obvious answers and are accepted as the draft recommends.
