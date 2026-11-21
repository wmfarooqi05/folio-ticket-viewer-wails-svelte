---
type: build
status: blocked
status_note: "Nov 22, 2026: design delivered; waiting on its gaps (ticket 37)"
waiting_on: owner
blocked_by: ["35", "37"]
blocked_note: "the design is in (assets/36-factory-board-mockup.html); ticket 37 settles its ten gaps. The route can start once 35 is done"
related: ["33", "34", "35"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 36 — Serve the evidence, and show it in the ticket view

## Why

The owner wants to open a ticket that needs verification, look at the screenshots, play the demo video, read the scenarios, and say "verified" in the agent's chat ([reply](../handoff/factory-board-reply.md), R4). The evidence lives outside the docs folder, for example under `U:\Evidence\`. A page on `http://127.0.0.1` can't open `file:///` URLs, so Folio's server has to serve the files.

This is the first time Folio serves files from outside the docs folder. It needs a security review.

## To do

- [ ] **The evidence root (C1).** Add a `--evidence <folder>` option and a Settings field. With neither, Folio serves no evidence at all.
- [ ] **A read-only route** (GET and HEAD only). It serves a file only if all of these hold:
  - the file is listed in the ticket's parsed board block (ticket 35);
  - its real path (after `realpath`) is inside the evidence root;
  - its extension is on the list: `.png .jpg .jpeg .webp .gif .webm .mp4 .md`.

  The request names the file by ticket and index, never by a path from the query string. The response has no directory listing, and sends `nosniff` and a sandbox CSP.
- [ ] **HTTP Range requests** (206, `Accept-Ranges`, `Content-Range`, 416), so seeking in a video works and a long video doesn't load whole.
- [ ] **The evidence panel**, built from the design:
  - images as thumbnails that open full size;
  - video in a `<video controls>` player;
  - `scenarios.md` and the write-up rendered by Folio's own renderer and sanitizer;
  - the verdict quote;
  - plain notes for "(not reachable)" and "evidence root not set".
- [ ] **A "Needs you" view, or a filter:** `needs-verification` tickets first, then the rest of `waiting_on: owner`. Show `status_note` on the card, plus the hint *say "pay 05 verified" in the agent's chat*, with a copy-ref button.
- [ ] **Tests:**
  - a listed file is served;
  - an unlisted file is refused;
  - a listed file outside the root is refused, including through a symlink or junction;
  - a disallowed extension is refused;
  - no root set means nothing is served;
  - Range requests behave correctly;
  - fuzz the route the way ticket 19 fuzzed `/doc/`.
- [ ] **Security:** update the threat model in the README, and put the new route through semgrep and CodeQL.

## Done when

- <a id="ac1"></a>**AC1** — With the sample block and the evidence root set, the ticket view plays the video with seeking, shows the image, and renders `scenarios.md`.
- <a id="ac2"></a>**AC2** — Any file not listed, outside the root, or of another type is refused (404).
- <a id="ac3"></a>**AC3** — A `(not reachable)` folder, or no evidence root, shows the ticket and a note, never an error.

## Open questions

### <a id="q1"></a>Q1 — How should the evidence panel look?
Above the ticket body, or in a side panel? A thumbnail strip or a grid? Tabs or sections you expand, for the scenarios and the write-up? And is "Needs you" its own view, or a filter on the board? The brief for Claude Design is [36-design-brief.md](../assets/36-design-brief.md).

**Answered 2026-11-22 (Claude Design, adopted by the owner):** see [the mockup](../assets/36-factory-board-mockup.html) and its Choices screen. Evidence sits under the header card; the video is inline with thumbnails beneath; Scenarios and Write-up are tabs; Needs you is Waiting on with Needs verification first. Ticket 37 records these decisions (D1 to D7), the tokens, and ten gaps to settle before building.
