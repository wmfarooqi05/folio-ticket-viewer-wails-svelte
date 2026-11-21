---
type: build
status: open
status_note: "Nov 22, 2026: from ticket 37"
waiting_on: null
blocked_by: ["38"]
blocked_note: null
related: ["36", "37"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 41 — Needs you, the "to verify" count, and the mirror's live status

## Why

The rest of the design: decision D4, and answers Q2 and Q3 from [ticket 37](37-factory-board-design-gaps.md).

## To do

- [ ] **D4:** in Waiting on, the Owner group starts with a "Needs verification" subgroup, oldest first. Each row shows the key, the title, `status_note`, the evidence counts, copy ref and the age. The rest of Owner follows, then the other people, as today.
- [ ] **The tree's Waiting on row** shows a "N to verify" chip in `--s-verify`.
- [ ] **Q3, ages:** a mirror ticket's age comes from the board block's `Waiting since:` line, if the factory adds it. Otherwise a mirror ticket shows no age; an ordinary ticket keeps its mtime age. Parse the key in ticket 35's parser (`board.waitingSince`).
- [ ] **Q2, the mirror status:** when any ticket has a board block, the board header says "Mirror live · updated HH:MM" and the tree footer adds "· mirror live":
  - "updated" is the time of the last change set;
  - "live" means the event stream is connected, and otherwise it says "reconnecting".

## Done when

- <a id="ac1"></a>**AC1** — With `fixtures/board-mirror`, Waiting on lists 04 and 08 first under Owner, and the tree shows "2 to verify".
- <a id="ac2"></a>**AC2** — A mirror ticket with no `Waiting since` shows no age. One with it shows the age from that time.
- <a id="ac3"></a>**AC3** — The fixture's board header shows "Mirror live" with the time of the last change. `fixtures/docs` shows neither.
