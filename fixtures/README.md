# Fixture corpus

Invented but realistic docs for testing the ticket parser and every view. Paths below are relative to
`fixtures/docs/`. `expected.json` is the parser oracle (decisions D2 to D7 of ticket 04 applied). It holds: `tickets` (64
entries, each with the full TicketMeta plus `key`, `title`, `legacy` and `legacyRule`, the section 3 rule that
matched, null for migrated files); `ambiguities` (the 21 legacy cases, each with its `decision` D2 to D7 and
final `chosen` answer, so none is open; T1 is the deliberate trap); `items`, `links`, `refs` and `textRefs`
(keyed by docs-relative path, for the files that exercise them); `hidden` (templates absent from the index);
`viewDefaults` (D6: hide Q items of closed tickets). Every ticket record carries every meta key.
`modules/_templates/` must be hidden by the viewer. `fixtures/README.md` and
`expected.json` are outside `docs/`.

Number spaces: `remove-service-account` (migrated), `cash-handling-workflow` (legacy, nested
`step2b-payment-identification`), `one-cash-mover` (mixed), `cloud-migration` and
`cash-movement-engine` (small legacy, cross-space targets).

## Traps

| Trap | Files |
|---|---|
| Duplicate `### Q35 — …` and `### Q35 answered — 2026-10-14` | modules/cash-handling-workflow/step2b-payment-identification/issues/41-grill-payment-ids.md |
| Ticket number 100 | modules/cash-handling-workflow/issues/100-final-cutover.md |
| Nested folder sharing the number space (40 to 46) and nested map | modules/cash-handling-workflow/step2b-payment-identification/ |
| Cross-space relative link with fragment | remove-service-account issues/03 and 07, cash-handling-workflow issues/04 (to one-cash-mover issues/05 `#q3`); handoffs/ocm-cutover-handoff.md |
| Plain-text "cloud-migration 07" | remove-service-account issues/07, cash-handling-workflow issues/07, handoffs/migration-notes.md ("cloud-migration 08") |
| Plain-text "cash-movement-engine ticket 08" | cash-handling-workflow issues/14 |
| Plain-text "with ticket 77" | cash-handling-workflow issues/22 |
| Mermaid block (2 files) | cash-handling-workflow issues/04-build-movecash.md, handoffs/ocm-cutover-handoff.md |
| Missing image `evidence/…png` | remove-service-account issues/02 (`02-lastused-before.png`), cash-handling-workflow issues/09 |
| Broken relative link | remove-service-account issues/07 (`../notes/gone.md`), cash-handling-workflow issues/16 (`15-gone-ticket.md`) |
| Closed anchor on its own line above a heading | remove-service-account issues/05-grill-uat-schedule.md |
| Unclosed anchor on its own line above a heading | remove-service-account issues/11-vnet-rule.md |
| GFM table | remove-service-account issues/02, cash-handling-workflow issues/06, patterns/pull-request-guide.md |
| Task list | most tickets ("To do"); handoffs/ocm-cutover-handoff.md |
| H1 with no number | cash-handling-workflow issues/02-entrypoint.md and 26-build-export.md |
| Map table, non-standard columns | cash-handling-workflow/map.md (Recommend, Size, no Status); cloud-migration/map.md (Recommend, Size, Built); step2b map.md (Resolved); one-cash-mover/map.md (standard but legacy, no frontmatter) |
| Client question files, J2/K5 IDs | modules/cash-handling-workflow/client-questions.md, client-answers-2026-10-13.md, answers.md |
| 5-digit ADO number after "card" (link) | remove-service-account issues/10 (`card 84997`), cash-handling-workflow issues/13 (`card 72633`) |
| Random 5-digit number (must NOT link) | remove-service-account issues/10 (`order 51234`), cash-handling-workflow issues/13 (`invoice 90817`) |
| Duplicate anchor ids across heading styles | step2b issues/41 |
| Hidden templates | modules/_templates/ |

## Coverage

| Item | Files |
|---|---|
| Every status enum value (migrated) | remove-service-account issues/01 done, 02 in-review, 04 in-progress, 05 open, 06 blocked, 08 dropped, 09 superseded |
| waiting_on owner / client / dba / infra / ops | issues/05, 10, 06, 11, 07 |
| blocked_by forms `"05"`, `"05#q3"`, `"space 05"`, `"space 05#q3"`, `"space#q3"` | issues/06 (first two), issues/07 (other three), issues/10 (`"cloud-migration 07#q3"`) |
| type list, afk, pr, ado | issues/03 (`[decision, build]`, ado), 10 (`[build, verify]`), 01 (afk, pr, ado), 02 (two PRs) |
| Q open and answered, D superseded, R closed and dropped, AC Closed and Dropped | remove-service-account issues/03 and 01, map.md |
| Generated map block | remove-service-account/map.md |
| Mixed space (legacy and migrated files) | modules/one-cash-mover |
| Legacy Status rules 1 to 8 (after D2, D3, D5) | rule 1: cash-handling-workflow issues/12, 20; rule 2: 10, 11, 28, 29; rule 3: 13, 21; rule 4: 04, 14, 17, 18, 38, 42; rule 5: 08, 27, 30, 44; rule 6: 01, 03, 05, 06, 16, 19, 22, 23, 24, 31, 39; rule 7: 02, 07, 09, 25, 26, 37; rule 8: 15, 32, 33, 34, 35, 36 |
| Legacy waiting_on inferred (D4) | cash-handling-workflow issues/21 (dba), cloud-migration issues/08 (infra); issues/13 keeps ops from its Type token |
| Legacy superseded_by (D2, A2) | cash-handling-workflow issues/12 (45), 20 (30); 19 is done, not superseded |
| Oracle sections items, links, refs, textRefs | items: step2b 41, remove-service-account 01, 03, 05, 11, map, cloud-migration 07, one-cash-mover 05; links: answers.md, remove-service-account 02, 03, 07, map, cash-handling-workflow 04, 09, 16, handoffs/ocm-cutover-handoff.md; refs: every migrated ticket; textRefs: the plain-text trap files |
| Status shape variants | bold `**Status:**` (08), backtick (09), `✅` (05, 35), missing line (34), curly apostrophe (11, dropped by D5), `Not merged` first (38, in-review by D3), `merged` with a branch name (39, done by D3), `Unblocked` and `Pending` (36, 32, stay unknown by D5) |
| Type values | build, grilling, decision, `decision + build`, task, bug, `task (AFK)`, spike, fix, verify, `task + ops`, `Build` (25) |
| Blocked by shapes | bare `01`, range `03–07` (en dash: 09, 100, 46), list `04, 05`, mixed `01, 03–05` (100), free text (07, 13, 26, 32), `none` and empty |

## Deliberate broken reference (FM_REF trap)

`remove-service-account` issues/10 has `blocked_by: ["cloud-migration 07#q3"]`. `cloud-migration` issues/07 has no `q3` anchor, so this ref must fail to resolve. It is the only intentionally dangling frontmatter ref. `"one-cash-mover#q3"` (issues/07) resolves to the Q3 anchor in `one-cash-mover/map.md`. Also recorded as T1 in `expected.json` ambiguities.
