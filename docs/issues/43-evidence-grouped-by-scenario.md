---
type: build
status: open
status_note: null
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

- [ ] **The parser** (`lib/parser`, no imports): each evidence file gets `scenario: { id, title } | null` from the `#### S<n> — <title>` above it. A sub-heading in another shape is a `BOARD` warning, and its files get no scenario.
- [ ] **The panel:** when any file has a scenario, show one section per scenario, in block order: its heading ("S1 Approve a refund"), its video, then its screenshots. Files with no scenario keep today's layout above the sections. Scenarios and write-up stay as tabs.
- [ ] **One note per section:** the video was recorded during the round, and the agent checked the screenshots, not the video. This is in the factory's own words from board 16 once it's built.
- [ ] **The image viewer** steps through all served images in block order, across scenarios.
- [ ] A block without sub-headings looks exactly as today.
- [ ] Tests: the parser (grouping, bad shape, no sub-headings) and the panel. Update the fixture `fixtures/board-mirror` 04 with two scenarios.

## Done when

- <a id="ac1"></a>**AC1** — A block with S1 (2 images, 1 video) and S2 (1 image, 1 video) shows two sections, each with its heading, video and screenshots.
- <a id="ac2"></a>**AC2** — Today's blocks, with no sub-headings, render exactly as before.

## Outcome
