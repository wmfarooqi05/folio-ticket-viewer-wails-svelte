---
type: build
status: done
status_note: "Nov 22, 2026: merged in PR 11"
waiting_on: null
blocked_by: ["35"]
blocked_note: null
related: ["36", "37"]
superseded_by: null
pr: ["11"]
ado: []
afk: true
---

# 39 — The evidence route and the evidence root

## Why

The server side of [ticket 36](36-evidence-route-and-panel.md): it serves the files a ticket's board block lists, only from the folder the owner declares (C1 in [the reply](../handoff/factory-board-reply.md#c1)), with answer Q8 from [ticket 37](37-factory-board-design-gaps.md#q8).

## To do

- [x] **`--evidence <folder>`** on the command line. Like `--docs`, it's in memory only and never saved, and it wins over Settings.
- [x] **The Settings field (Q8):** a typed path box like the docs folder's, showing "Reachable" or "Not reachable" from a single `stat`, and no folder count. When `--evidence` is set, the field says "set by --evidence for this run".
- [x] **The route:** `GET` and `HEAD` on `/evidence/<ticket path>/<index>`. The server reads the ticket and parses its board block itself, and never trusts a path from the request. It serves a file only if all of these hold:
  - the file is listed in that block;
  - its kind is image, video, scenarios or write-up;
  - its extension is on the list (`.png .jpg .jpeg .webp .gif .webm .mp4 .md`);
  - its real path, after `realpath`, is inside the declared root.
- [x] **The response headers:** `nosniff`, a sandbox CSP and `Cache-Control: no-store`.
- [x] **Range requests:** 206 for one range, `Accept-Ranges: bytes`, `Content-Range`, and 416 for a range it can't satisfy. A multi-range request gets the whole file (200).
- [x] **An API call for the panel:** each listed file with whether it's served, and why not ("root not set", "outside the root", "type not served", "missing").
- [x] **Tests:**
  - a listed file is served;
  - an unlisted index is refused;
  - outside the root is refused, including through a symlink or junction;
  - a `file` kind is refused, and so is a disallowed extension;
  - with no root, nothing is served;
  - Range requests: the first bytes, a middle range, a suffix, an unsatisfiable range, and HEAD;
  - fuzzed indexes and paths, as ticket 19 did.
- [x] **The README's security section:** the new route, and what limits it.

## Done when

- <a id="ac1"></a>**AC1** — Every test above passes, and the route never serves a byte from outside the declared root.
- <a id="ac2"></a>**AC2** — In a browser, a `.webm` from the fixture seeks without loading the whole file.

## Outcome

Built Nov 22, 2026.

- **`server/evidence.ts`** holds every rule, for both the route and the panel's list:
  - `/evidence/<ticket path>/<index>` re-reads the ticket on each request and parses its block with Folio's own parser (`parseFile`, so only a ticket's block counts);
  - no declared root: nothing is served;
  - the kind and the extension must agree (images, `.webm`/`.mp4` video, and `.md` for scenarios and the write-up, served as `text/plain`), so SVG is never served;
  - `realpath` of the file must be within `realpath` of the root, and nothing that reaches a network path is stat'ed;
  - the response: GET and HEAD, `nosniff`, a sandbox CSP, `no-store` and `Accept-Ranges`;
  - one byte range is a 206, a range starting past the end is a 416 with `bytes */size`, and several ranges or a malformed header get the whole file;
  - every refusal is the same 404.
- **The evidence root:** `--evidence <folder>` (in memory, wins for the run; a network path stops the start, like `--docs`), or Settings.
  - Settings saves it as an **extra** key, `evidenceRoot`, written only when set. A `settings.json` without it stays exactly what the frozen Go app writes, and `getConfig` is unchanged, so the Go contract suite is unaffected.
  - `getEvidence`, `setEvidence` and `evidenceFiles` are separate API calls. The desktop backend stubs them.
  - **A bug found by the tests:** `setEvidence` resolved a relative path against the server's working folder before checking it, so "relative/folder" was accepted. It's now checked as typed.
- **The Settings field (Q8):** `EvidenceField.svelte`, in the Docs folder section in web mode. It's a typed path, with "Use folder" and "Clear". It shows "Reachable" or "Not reachable now" from one `stat`, never a listing, and the "Set by --evidence … for this run" note.
- **`evidenceFiles`** gives each listed file `served`, or a reason: `root not set`, `not reachable`, `type not served`, `outside the root` or `missing`. Ticket 40's panel draws from it.
- **Tests:** `server/evidence.test.ts`, 31 tests:
  - serving, with every header checked;
  - Range: first bytes, a middle range, an open end, a suffix, an end past the file, 416, several ranges, malformed ranges, and HEAD;
  - refusals: a `file` kind, outside the root, **out through a junction**, SVG as an image, `.md` as an image, missing, an index past the list, indexes that aren't numbers, paths in place of the ticket, a `(not reachable)` folder, and no root;
  - 200 fuzzed paths, none of which leak;
  - the panel list and its reasons;
  - `--evidence` and Settings, including saving, clearing, relative and network paths;
  - `parseRange` on its own.
- **AC2, in a browser:** a real 20-second `.webm` (from ffmpeg, 638 KB) served from a declared root loaded its metadata, then seeked to 15s through three 206 range requests, about 261 KB transferred in all. There were no console errors. The Settings field showed the `--evidence` note and "Reachable".
- **README:** the web-mode security list has the evidence route and its limits. The package README lists `--evidence`.
