---
type: build
status: in-review
status_note: "Nov 22, 2026: built; checked in a browser with three rounds"
waiting_on: null
blocked_by: ["42"]
blocked_note: null
related: ["35", "40"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 43 — The evidence panel groups a round's files by scenario

## Why

The owner, Nov 22, 2026: during a testing round the agent records one video and takes, say, 5 screenshots, and checks each screenshot. The agent never checks the video. When all 5 pass, the round is good, so "can we reference those 6 items in ticket as well?"

The factory writes that reference: its board D9 and board 16 (`factory evidence link`), which are drafted. In the board block it groups a round's files under a sub-heading. The factory settled this shape on Nov 22, 2026, and it stays inside v1 (the handoff's "Amended Nov 22, 2026: evidence grouped by scenario"):

```
### Evidence

Folder: `U:/Evidence/app/pay-05-refunds/`

- [scenarios.md](file:///…) — scenarios
- [pay-05-evidence.md](file:///…) — write-up

#### S1 — Approve a refund
- [pay-05-S1-01-queue.png](file:///…) — image
- [pay-05-S1-approve.webm](file:///…) — video
```

Lines before the first sub-heading belong to no scenario.

## To do

- [x] **The parser** (`lib/parser`, no imports): each evidence file gets `scenario: { id, title } | null` from the `#### S<n> — <title>` above it. A sub-heading in another shape is a `BOARD` warning, and its files get no scenario.
- [x] **The panel:** when any file has a scenario, show one section per scenario, in block order: its heading ("S1 Approve a refund"), its video, then its screenshots. Files with no scenario keep today's layout above the sections. Scenarios and write-up stay as tabs.
- [x] **One note per section:** the video was recorded during the round, and the agent checked the screenshots, not the video. The factory's own words, from its board 16: "Recorded during this round; its screenshots passed. Not checked frame by frame."
- [x] **The image viewer** steps through all served images in block order, across scenarios.
- [x] A block without sub-headings looks exactly as today.
- [x] Tests: the parser (grouping, bad shape, no sub-headings) and the panel. The fixture `fixtures/board-mirror` keeps 04 as it is: it is the ungrouped shape that AC2 must keep rendering the same, and the grouped shape is tested inline from the factory's handoff example.

## Done when

- <a id="ac1"></a>**AC1** — A block with S1 (2 images, 1 video) and S2 (1 image, 1 video) shows two sections, each with its heading, video and screenshots.
- <a id="ac2"></a>**AC2** — Today's blocks, with no sub-headings, render exactly as before.

## Outcome

Built Nov 22, 2026.

- **The parser** (`lib/parser/index.ts`, still no imports):
  - each `EvidenceFile` has `scenario: { id, title } | null`, taken from the `#### S<n> — <title>` above it (an em dash, an en dash or a hyphen);
  - files before the first sub-heading have `null`;
  - a `####` line in another shape gives a `BOARD` warning naming it, and its files get `null`;
  - `BoardScan` gains `warnings`, which `parseFile` turns into diagnostics.
- **The panel** (`EvidencePanel.svelte`):
  - The scenario comes from the parsed block, joined to the server's list by index; the server and the API are unchanged.
  - Files outside any round keep ticket 42's layout.
  - Then one `section.round` per scenario, in block order: its heading, its video, the factory's note, then its screenshots.
  - The video in a round has no caption, since the heading names it. Its accessible name is "S1 Approve a refund (pay-05-S1-approve.webm)".
  - The image viewer still steps through every screenshot in block order, across rounds.
- **Tests:**
  - `board.test.ts`: the handoff example grouped into S1 and S2, a badly shaped sub-heading, and `scenario: null` on every existing file.
  - `EvidencePanel.test.ts`: two rounds in order, the note, no duplicates outside the rounds, and the viewer at "3 / 3" from the last round.
  - **The mutation check:** dropping the scenario lookup turns the AC1 test red.
- **AC1, in a browser:** pay 04 on the stand-in mirror, regrouped by rename-over into S1, S2 and S3, each with one recorded video and one screenshot.
  - It showed three rounds with their headings.
  - The videos loaded: 7.5s, 12.2s and 18.1s, no errors.
  - Each round had the note and its screenshot, and there was no `BOARD` warning.
- **AC2:** the fixture's 04 (no sub-headings) still passes every ticket 35 and 40 test unchanged, apart from `scenario: null` in the exact-match lists.
