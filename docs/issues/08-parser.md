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

- [ ] Implement the 04 contract in `frontend/src/lib/parser/`:
  - the viewer API: `buildIndex`, `updateIndex`, `resolveHref`, `extractFragment` and `scanText`;
  - the exported pieces: `parseFile`, `parseFrontmatter`, `parseLegacy`, `parseItems`, `parseLinks` and `resolveRef`.

  Spec: [04-parser-contract-draft.md](../assets/04-parser-contract-draft.md), amended by [04](04-parser-contract.md) D2–D7.
- [ ] Legacy fallback with the amended rules: superseded narrowed, "merged" wins, `waiting_on` inferred only when blocked, typography-only normalisation.
- [ ] Keep it free of DOM, Svelte and imports, so it compiles to a standalone `lib.mjs`.
- [ ] Turn every `it.todo` in `index.test.ts` into a real test, and assert every record and section of `expected.json`: tickets, ambiguities, items, links, refs, textRefs and hidden.
- [ ] Add a build target that emits `dist-lib/lib.mjs`, and a ~15-line Node adapter `buildIndexFromDisk(root)` for the upstream CLI.
- [ ] A perf test: fixtures copied to about 1,000 files. Record the cold `buildIndex` time against 04 Q1's thresholds (a batch over 50 ms or a cold build over 300 ms would mean adding a worker).

## Done when

- <a id="ac1"></a>**AC1** — `npm test` passes with every `expected.json` assertion live, and no `it.todo` is left in the parser tests.
- <a id="ac2"></a>**AC2** — `lib.mjs` builds with zero imports.
- <a id="ac3"></a>**AC3** — The 1,000-file timing is recorded in the Outcome.

## Outcome

*(empty)*
