---
type: build
status: open
status_note: "Nov 22, 2026: from ticket 37"
waiting_on: null
blocked_by: ["35"]
blocked_note: null
related: ["36", "37"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 39 — The evidence route and the evidence root

## Why

The server side of [ticket 36](36-evidence-route-and-panel.md): it serves the files a ticket's board block lists, only from the folder the owner declares (C1 in [the reply](../handoff/factory-board-reply.md#c1)), with answer Q8 from [ticket 37](37-factory-board-design-gaps.md#q8).

## To do

- [ ] **`--evidence <folder>`** on the command line. Like `--docs`, it's in memory only and never saved, and it wins over Settings.
- [ ] **The Settings field (Q8):** a typed path box like the docs folder's, showing "Reachable" or "Not reachable" from a single `stat`, and no folder count. When `--evidence` is set, the field says "set by --evidence for this run".
- [ ] **The route:** `GET` and `HEAD` on `/evidence/<ticket path>/<index>`. The server reads the ticket and parses its board block itself, and never trusts a path from the request. It serves a file only if all of these hold:
  - the file is listed in that block;
  - its kind is image, video, scenarios or write-up;
  - its extension is on the list (`.png .jpg .jpeg .webp .gif .webm .mp4 .md`);
  - its real path, after `realpath`, is inside the declared root.
- [ ] **The response headers:** `nosniff`, a sandbox CSP and `Cache-Control: no-store`.
- [ ] **Range requests:** 206 for one range, `Accept-Ranges: bytes`, `Content-Range`, and 416 for a range it can't satisfy. A multi-range request gets the whole file (200).
- [ ] **An API call for the panel:** each listed file with whether it's served, and why not ("root not set", "outside the root", "type not served", "missing").
- [ ] **Tests:**
  - a listed file is served;
  - an unlisted index is refused;
  - outside the root is refused, including through a symlink or junction;
  - a `file` kind is refused, and so is a disallowed extension;
  - with no root, nothing is served;
  - Range requests: the first bytes, a middle range, a suffix, an unsatisfiable range, and HEAD;
  - fuzzed indexes and paths, as ticket 19 did.
- [ ] **The README's security section:** the new route, and what limits it.

## Done when

- <a id="ac1"></a>**AC1** — Every test above passes, and the route never serves a byte from outside the declared root.
- <a id="ac2"></a>**AC2** — In a browser, a `.webm` from the fixture seeks without loading the whole file.
