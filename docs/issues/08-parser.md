---
type: build
status: open
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["04", "02"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 08 — Parser passes the fixture oracle

## Why

Every view reads the index. The parser is the 04 contract, and `fixtures/expected.json` is its test oracle. Today `frontend/src/lib/parser/index.ts` is a stub with a trivial `buildIndex`.

## To do

- [x] Implement the 04 contract in `frontend/src/lib/parser/`:
  - the viewer API: `buildIndex`, `updateIndex`, `resolveHref`, `extractFragment` and `scanText`;
  - the exported pieces: `parseFile`, `parseFrontmatter`, `parseLegacy`, `parseItems`, `parseLinks` and `resolveRef`.

  Spec: [04-parser-contract-draft.md](../assets/04-parser-contract-draft.md), amended by [04](04-parser-contract.md) D2–D7.
- [x] Legacy fallback with the amended rules: superseded narrowed, "merged" wins, `waiting_on` inferred only when blocked, typography-only normalisation.
- [x] Keep it free of DOM, Svelte and imports, so it compiles to a standalone `lib.mjs`.
- [x] Turn every `it.todo` in `index.test.ts` into a real test, and assert every record and section of `expected.json`: tickets, ambiguities, items, links, refs, textRefs and hidden.
- [x] Add a build target that emits `dist-lib/lib.mjs`, and a ~15-line Node adapter `buildIndexFromDisk(root)` for the upstream CLI.
- [x] A perf test: fixtures copied to about 1,000 files. Record the cold `buildIndex` time against 04 Q1's thresholds (a batch over 50 ms or a cold build over 300 ms would mean adding a worker).

## Done when

- <a id="ac1"></a>**AC1** — `npm test` passes with every `expected.json` assertion live, and no `it.todo` is left in the parser tests.
- <a id="ac2"></a>**AC2** — `lib.mjs` builds with zero imports.
- <a id="ac3"></a>**AC3** — The 1,000-file timing is recorded in the Outcome.

## Outcome

Built Nov 20, 2026 on the worktree branch; `status:` is left for the orchestrator to close.

**What was built**

- `frontend/src/lib/parser/index.ts`: the full 04 contract, with no imports. Viewer API: `buildIndex`, `updateIndex`, `resolveHref`, `extractFragment`, `scanText`. Pieces: `parseFile`, `parseFrontmatter`, `parseLegacy`, `parseItems`, `parseLinks`, `resolveRef`. Legacy fallback follows D2 to D5 (rule 1 narrowed, "merged" wins, `waiting_on` only for blocked legacy tickets or a Type token on an open ticket, typography-only normalisation).
- `frontend/src/lib/parser/node.ts`: the Node adapter `buildIndexFromDisk(root)` (about 15 lines of logic) plus `readDocsRoot`. It is not in `lib.mjs`.
- `frontend/vite.lib.config.ts`, `npm run build:lib` and `task build:lib` emit `frontend/dist-lib/lib.mjs` (git-ignored, about 28 kB, 9 kB gzip). It has zero imports and exports the 11 functions.
- `index.test.ts`: 173 tests, no `it.todo`. Every record and section of `expected.json` is asserted: all 64 tickets (every meta key, `key`, `title`, `legacy`, `legacyRule`), each of the 21 ambiguities plus T1, `items` (8 files, exact), `links` (10 files), `refs` (10 files, exact against `index.edges`), `textRefs` (8 files) and `hidden`. It also covers `updateIndex`, `extractFragment`, `resolveHref` and the frontmatter and legacy edge cases.

**Timing (04 Q1, AC3).** A corpus of 1,092 files (the 78 fixtures copied 14 times with the space names suffixed, built in memory; 1,064 are indexed because the two template files per copy are hidden), measured in Node 26 / V8 on this machine. The first `buildIndex` on a fresh corpus, then a second fresh corpus fed in batches of 100:

| Measure | Result | Threshold |
|---|---|---|
| Cold `buildIndex` of all 1,092 files | about 25 ms in the test run (the module is JIT-warm from the earlier tests); 42 ms in a fresh process running `dist-lib/lib.mjs` | 300 ms |
| Worst `updateIndex` batch of 100 files (each batch reruns the full cross-file pass) | about 7 ms | 50 ms |

Both are far under the thresholds, so no worker is needed, as 04 Q1 recommended. This is Node, not WebView2; the 04 draft's exit criterion asks for a run inside WebView2, which belongs to the integration tickets. The perf test always logs the numbers and asserts the 300/50 ms thresholds only with `PERF=1` (otherwise at 5x, so a loaded machine does not flake); it has an explicit 30 s timeout.

**Where `expected.json` and the contract differ (the oracle was followed)**

- `endLine` of an item is the last non-blank line of its range (the oracle's `format` note). The draft's wording, "to the line before the next item", would include trailing blank lines. Renderers and `extractFragment` callers get exactly those lines.
- `items` entries carry a `fragments` array for q35 in ticket 41. The draft does not list it, so `Item.fragments?` was added (optional; only set when a legacy "Qn answered" follow-up adds a slug).
- `links` lists every link for 9 of the 10 files, and the tests assert the full list for those. Only `modules/remove-service-account/map.md` is partial (4 of its 18 links), so there each listed link must be present and equal and the file must have more.
- Image links have `resolved: null` in the oracle. The parser leaves `resolved` unset for images, so the renderer (ticket 10) must resolve image paths itself and ask Go whether the file exists; the parser never reports a missing image.
- `textRefs` includes `kind: "none"` entries. `scanText` returns no entry for those, and the test asserts that nothing covers the text. Its `line` and `text` are tested against the offsets `scanText` returns per line.
- The index holds 76 files, not the 78 on disk, because `modules/_templates/` is hidden (the old skeleton test said 78).
- Not in the oracle, but real: `modules/cash-movement-engine/issues/08-shared-matcher.md` links to `../map.md`, which does not exist in the fixtures, so it gets a `LINK` warning. The tests pin it.

No ticket, ambiguity or item value in `expected.json` had to be edited, and it was not.

**Decisions the contract left open**

- `map.issuesDir` is always `<map dir>/issues` (the parser cannot see the folder from one file).
- Cross-file results (`links[].resolved`, `edges`, `diagnostics` of kind `LINK`, `FM_REF`, `DUP_NUM`) are written to copies of the records, so `updateIndex` never mutates the index it was given. An unresolved legacy ref is an `FM_REF` warning; a migrated one is an error.
- `parseLegacy` also returns `warnings` (code `LEGACY_TYPE` for a dropped Type token); `parseFile` turns them into diagnostics.

**Review fixes (Nov 20, 2026)**

- D3: "merged" now wins only when no "not" precedes it in the same clause, so "Built on claude/x, not yet merged" is `in-review`.
- D5: rule matching normalises curly double quotes, `‐ ‑ – —` to `-` and leading quotes (so "In–progress" and "“Done”" match). `status_note` is unchanged.
- `resolveHref`: only http, https, mailto and vscode are `external` and `ok`. Any other scheme (javascript:, file:, data:, ftp:) gives `ok: false` with the new `problem: 'bad-scheme'`. A `?query` is stripped, `\` becomes `/`, and each segment is decoded after the split, so `%2F` stays inside one segment.
- An unclosed `---` block now raises `FM_PARSE` on line 1 (the file is still read as legacy).
- Reference fields keep their raw tokens (`blocked_by: [02]` is `"02"`). `FM_ENUM` and `FM_REF` report the line of their key (`DocRecord.fmLines`; for legacy files the line of the `Status:` or `Blocked by:` label).
- `map.issuesDir` is typed `string`. `scanText` matches "ticket NN" case-insensitively and caches the space regex per `index.spaces`. `extractFragment` does one `findIndex` per kind.
- Tests: the legacy FM_REF warning branch, the per-line `textRefs` count (body text only, links blanked as the renderer would), and the new rule, scheme and path cases.