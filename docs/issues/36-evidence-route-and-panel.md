---
type: build
status: done
status_note: "Nov 22, 2026: delivered by 38 to 41, merged in PRs 10 and 11"
waiting_on: null
blocked_by: ["38", "39", "40", "41"]
blocked_note: "the umbrella for the evidence work: 38 the board, 39 the route, 40 the panel, 41 Needs you"
related: ["33", "34", "35"]
superseded_by: null
pr: ["10", "11"]
ado: []
afk: false
---

# 36 — Serve the evidence, and show it in the ticket view

> **Split, Nov 22, 2026.** Once the design was settled ([37](37-factory-board-design-gaps.md)), this became four build tickets: [38](38-board-verify-styling-rails-and-card.md) the board, [39](39-evidence-route-and-evidence-root.md) the route and root, [40](40-evidence-panel-in-the-ticket-view.md) the panel, and [41](41-needs-you-and-mirror-status.md) Needs you. The list below is the original scope. Its ACs are met when those four are done.

## Why

The owner wants to open a ticket that needs verification, look at the screenshots, play the demo video, read the scenarios, and say "verified" in the agent's chat ([reply](../handoff/factory-board-reply.md), R4). The evidence lives outside the docs folder, for example under `U:\Evidence\`. A page on `http://127.0.0.1` can't open `file:///` URLs, so Folio's server has to serve the files.

This is the first time Folio serves files from outside the docs folder. It needs a security review.

## To do

- [x] **The evidence root (C1).** Add a `--evidence <folder>` option and a Settings field. With neither, Folio serves no evidence at all.
- [x] **A read-only route** (GET and HEAD only). It serves a file only if all of these hold:
  - the file is listed in the ticket's parsed board block (ticket 35);
  - its real path (after `realpath`) is inside the evidence root;
  - its extension is on the list: `.png .jpg .jpeg .webp .gif .webm .mp4 .md`.

  The request names the file by ticket and index, never by a path from the query string. The response has no directory listing, and sends `nosniff` and a sandbox CSP.
- [x] **HTTP Range requests** (206, `Accept-Ranges`, `Content-Range`, 416), so seeking in a video works and a long video doesn't load whole.
- [x] **The evidence panel**, built from the design:
  - images as thumbnails that open full size;
  - video in a `<video controls>` player;
  - `scenarios.md` and the write-up rendered by Folio's own renderer and sanitizer;
  - the verdict quote;
  - plain notes for "(not reachable)" and "evidence root not set".
- [x] **A "Needs you" view, or a filter:** `needs-verification` tickets first, then the rest of `waiting_on: owner`. Show `status_note` on the card, plus the hint *say "pay 05 verified" in the agent's chat*, with a copy-ref button.
- [x] **Tests:**
  - a listed file is served;
  - an unlisted file is refused;
  - a listed file outside the root is refused, including through a symlink or junction;
  - a disallowed extension is refused;
  - no root set means nothing is served;
  - Range requests behave correctly;
  - fuzz the route the way ticket 19 fuzzed `/doc/`.
- [x] **Security:** update the threat model in the README, and put the new route through semgrep and CodeQL.

## Done when

- <a id="ac1"></a>**AC1** — With the sample block and the evidence root set, the ticket view plays the video with seeking, shows the image, and renders `scenarios.md`.
- <a id="ac2"></a>**AC2** — Any file not listed, outside the root, or of another type is refused (404).
- <a id="ac3"></a>**AC3** — A `(not reachable)` folder, or no evidence root, shows the ticket and a note, never an error.

## Outcome

Done Nov 22, 2026, through its four build tickets. [38](38-board-verify-styling-rails-and-card.md) merged in PR 10, and [39](39-evidence-route-and-evidence-root.md), [40](40-evidence-panel-in-the-ticket-view.md) and [41](41-needs-you-and-mirror-status.md) in PR 11.

- **AC1:** met by 40. With the fixture's block and a declared root, the panel played a real `.webm` and seeked through 206 range requests, opened the image in the viewer, and rendered `scenarios.md` and the write-up.
- **AC2:** met by 39. `server/evidence.test.ts` (31 tests) refuses unlisted indexes, files outside the root (including through a junction), `file` kinds and wrong extensions, and 200 fuzzed paths.
- **AC3:** met by 39 and 40. A `(not reachable)` folder and a missing root each show the ticket with a note, never an error.
- **Checked again on Nov 22, 2026, after the merge,** against a mirror laid out as the contract says (`<repo>/.git/factory/board/docs/`, written by rename-over) with a real evidence folder. The factory hasn't built its own mirror yet (its board 03 is open), so this stands in for it:
  - the board in light mode at 1600px with the tree: all six columns ([screenshot](../assets/36-check-board-1600-light.jpg));
  - at 1280px with the tree **and** the right panel open: Done, Open, In review and Blocked fold to rails, In progress and Needs verification stay open, and the page doesn't scroll sideways ([screenshot](../assets/36-check-board-1280-both-panes.jpg));
  - the 20s `.webm` from the mirror played and seeked to 15s (a 206 response), and the three screenshots loaded ([screenshot](../assets/36-check-evidence-video.jpg), paused at 0:15);
  - copy ref in a real Edge window: see [38](38-board-verify-styling-rails-and-card.md);
  - **a bug, fixed:** in the side panel's narrow Your turn strip, copy ref wrapped onto two lines. `CopyRef.svelte` now never shrinks or wraps ([screenshot after the fix](../assets/38-check-copy-ref-side-panel.png), Edge, dark).
- **Security:** the README's web-mode security list covers the route and its limits. semgrep and CodeQL ran on both PRs, and CodeQL has no alert on the evidence code.

## Open questions

### <a id="q1"></a>Q1 — How should the evidence panel look?
Above the ticket body, or in a side panel? A thumbnail strip or a grid? Tabs or sections you expand, for the scenarios and the write-up? And is "Needs you" its own view, or a filter on the board? The brief for Claude Design is [36-design-brief.md](../assets/36-design-brief.md).

**Answered 2026-11-22 (Claude Design, adopted by the owner):** see [the mockup](../assets/36-factory-board-mockup.html) and its Choices screen. Evidence sits under the header card; the video is inline with thumbnails beneath; Scenarios and Write-up are tabs; Needs you is Waiting on with Needs verification first. Ticket 37 records these decisions (D1 to D7), the tokens, and ten gaps to settle before building.
