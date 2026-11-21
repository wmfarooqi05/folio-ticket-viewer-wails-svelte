---
type: build
status: done
status_note: "Nov 22, 2026: merged in PR 11"
waiting_on: null
blocked_by: ["38"]
blocked_note: null
related: ["36", "37"]
superseded_by: null
pr: ["11"]
ado: []
afk: true
---

# 41 — Needs you, the "to verify" count, and the mirror's live status

## Why

The rest of the design: decision D4, and answers Q2 and Q3 from [ticket 37](37-factory-board-design-gaps.md).

## To do

- [x] **D4:** in Waiting on, the Owner group starts with a "Needs verification" subgroup, oldest first. Each row shows the key, the title, `status_note`, the evidence counts, copy ref and the age. The rest of Owner follows, then the other people, as today.
- [x] **The tree's Waiting on row** shows a "N to verify" chip in `--s-verify`.
- [x] **Q3, ages:** a mirror ticket's age comes from the board block's `Waiting since:` line, if the factory adds it. Otherwise a mirror ticket shows no age; an ordinary ticket keeps its mtime age. Parse the key in ticket 35's parser (`board.waitingSince`).
- [x] **Q2, the mirror status:** when any ticket has a board block, the board header says "Mirror live · updated HH:MM" and the tree footer adds "· mirror live":
  - "updated" is the time of the last change set;
  - "live" means the event stream is connected, and otherwise it says "reconnecting".

## Done when

- <a id="ac1"></a>**AC1** — With `fixtures/board-mirror`, Waiting on lists 04 and 08 first under Owner, and the tree shows "2 to verify".
- <a id="ac2"></a>**AC2** — A mirror ticket with no `Waiting since` shows no age. One with it shows the age from that time.
- <a id="ac3"></a>**AC3** — The fixture's board header shows "Mirror live" with the time of the last change. `fixtures/docs` shows neither.

## Outcome

Built Nov 22, 2026.

- **D4:** `waitingOn()` gives each group a `verify` list: the owner's Needs verification tickets, oldest first. `rows` holds the rest. `WaitingOn.svelte` draws `verify` first, in an orchid-tinted block headed "Needs verification · oldest first". Each row shows the key, the title, `status_note` with the evidence counts ("1 video · 3 images", from the block, with no server call), copy ref, and a short age ("15h", "2d").
- **The tree:** `pinnedCounts()` has `verify`, and the Waiting on row shows a solid orchid "2 to verify" chip.
- **Q3:** the parser reads `- Waiting since: 2026-11-21 10:02` (`board.waitingSince`).
  - `waitingSince(rec)` gives the age's start: for a ticket with a board block, its `Waiting since` or **no age** ("—", with a title explaining why); for any other ticket, its mtime as before.
  - Sorting puts tickets with no age last.
  - Other mirror rows say "waiting N days ago", not "edited".
- **Q2:**
  - `lib/live.svelte.ts` holds `connected` and `lastChange`;
  - the event stream reports open and error through a new optional `onState` callback on `onDocsChanged` (the desktop backend calls it with `true`);
  - `isMirror(index)` is true when any ticket has a board block;
  - the board header shows "Mirror live · updated HH:MM" (or "Mirror reconnecting", with an amber dot);
  - the tree footer adds "· mirror live" or "· mirror reconnecting".
- **Tests** in `board.test.ts`:
  - AC1 on the mirror fixture (04 and 08 under Needs verification, "2 to verify", the pinned badge);
  - the `Waiting since` key;
  - AC2 (ages from `Waiting since`, none without it, mtime for ordinary tickets);
  - the order with no-age tickets last;
  - `shortAge`;
  - AC3 (`isMirror`: true for the mirror, false for `fixtures/docs` and for an empty index);
  - the evidence counts.
- **Checked in a browser** on a scratch mirror with a real evidence folder:
  - "2 to verify" in the tree;
  - Owner shows Needs verification first: 04 at "15h" with its counts and copy ref, and 08 with "—";
  - Infra's 03, a ticket with no block, shows "edited today";
  - the footer said "Watching 10 files · mirror live";
  - the board header said "Mirror live", then "· updated 01:34" right after a rename-over at 01:34;
  - with the server stopped, both said "Mirror reconnecting".
