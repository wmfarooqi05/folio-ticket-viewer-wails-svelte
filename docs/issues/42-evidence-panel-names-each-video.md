---
type: build
status: in-review
status_note: "Nov 22, 2026: built; checked in a browser with five videos"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["36", "40"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 42 — The evidence panel names each video

## Why

The factory now records **one video per scenario**, its map's D8. A ticket with three scenarios carries three videos. The owner's words, Nov 22, 2026: the agent starts recording when it starts testing, takes and checks its screenshots as before, and "when he finish a testing round, he knows that 5 screenshot and 1 video he took are ok because 5 screenshots are ok". The agent never checks the video itself.

Folio's panel ([40](40-evidence-panel-in-the-ticket-view.md)) stacks every video full-width with no name and no gap. With several videos the owner can't tell which scenario each one shows. This was found while playing four recorded scenarios in one ticket ([36](36-evidence-route-and-panel.md), Nov 22, 2026).

The factory names a scenario's video `<space>-<NN>-S<n>-<slug>.webm`, for example `pay-05-S1-approve-flow.webm`. So the file name already carries the scenario.

## To do

- [x] A caption above each video: the scenario id and its title from the file name ("**S1** approve flow"), then the file name in mono. A name without `-S<n>-` shows only the file name.
- [x] One video whose name carries no scenario id stays as today, with no caption, as in the mockup.
- [x] A gap between videos, so two players never touch.
- [x] The player's accessible name is the caption, not just the file name.
- [x] A missing video keeps its placeholder, with the same caption.
- [x] Tests in `EvidencePanel.test.ts`.

## Not here

- Grouping a round's screenshots with its video under the scenario: [43](43-evidence-grouped-by-scenario.md). The factory settled the shape on Nov 22, 2026: a `#### S<n> — <title>` sub-heading under *Evidence*, kept inside v1.

## Done when

- <a id="ac1"></a>**AC1** — A ticket with videos `pay-05-S1-approve-flow.webm` and `pay-05-S2-reject.webm` shows "S1 approve flow" and "S2 reject" above their players, with a gap between them.
- <a id="ac2"></a>**AC2** — A ticket with one `demo.webm` looks as it did before.

## Outcome

Built Nov 22, 2026.

- **`EvidencePanel.svelte`:** each video sits in a `figure.clip`.
  - **The caption:** when there is more than one video, or a name carries `-S<n>-`, a caption shows the scenario id in bold, the title from the slug, and the file name in mono on the right. A name without an id shows only the file name.
  - **The accessible name:** the player's name is "S1 approve flow (pay-05-S1-approve-flow.webm)".
  - **The gap:** `.clip + .clip` adds 14px between players.
  - **A missing video** keeps its placeholder, under its caption.
- **Tests:** two new tests in `EvidencePanel.test.ts`.
  - Three videos (two named, one plain): each caption, the accessible name, and the missing one's placeholder.
  - One plain `demo.webm`: no caption, as before.
  - **The mutation check:** making the caption rule never fire turns the first test red.
- **AC1, in a browser:** pay 04 on the stand-in mirror, with `demo.webm` and the four recorded `docs-3x-S<n>-…webm` videos ([36](36-evidence-route-and-panel.md)).
  - Each showed its caption, "S1 board 1600 light", "S2 board 1280 both panes live", and so on.
  - The players had a 14px gap between them.
  - `demo.webm` showed only its name.
- **AC2:** covered by the second test. A lone `demo.webm` has no caption, the same as the fixture's ticket before.
