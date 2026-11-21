---
type: build
status: in-review
status_note: "Nov 22, 2026: built; one click checked in a browser"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["39", "40"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 45 — Allow the evidence folder from the panel

## Why

The owner, Nov 22, 2026, asked why `--evidence` is needed. It isn't there to find the files: the ticket's board block names them. It's there to say which folder Folio's server may read from (C1 in [the reply](../handoff/factory-board-reply.md#c1)), because the files a ticket names would otherwise decide what Folio reads from the disk.

The rule stays, but setting it was clumsy: a flag on every run, or a trip to Settings. The owner chose "Add an Allow button".

## To do

- [x] When no evidence folder is set and the ticket lists files, the panel offers the ticket's `Folder:` and up to two of its parents, broadest first. The factory lays evidence out as `<root>/<project>/<ticket>/` (its board D5), so each choice says what it covers: every ticket, this project or this ticket.
- [x] The exact path is on the button, so the owner sees what they allow. A drive or filesystem root is never offered, and neither is a relative, network or dotted path.
- [x] A click saves it through `setEvidence`, the same call the Settings field uses, with the same checks on the server. The list is fetched again, and the media appear.
- [x] A refused or unreachable folder shows its reason, and nothing else changes.
- [x] `--evidence` for this run still wins. The button only shows when no folder is set at all.
- [x] Tests: `lib/evidence-root.test.ts` for the choices, and `EvidencePanel.test.ts` for the click, the refusal and the network case.

## Not here

- A ticket whose files are outside an existing folder ("outside the root"). Folio has one evidence folder, and replacing it from a ticket's suggestion would be surprising. Change it in Settings.

## Done when

- <a id="ac1"></a>**AC1** — With no folder set, one click on "Allow U:/Evidence" shows the ticket's videos and screenshots, and Settings shows the folder.
- <a id="ac2"></a>**AC2** — A ticket whose folder is a network path or a drive root offers no such button.

## Outcome

Built Nov 22, 2026.

- **`lib/evidence-root.ts`:** `allowChoices(folder)` gives the folder and up to two parents, broadest first. It never offers a drive or filesystem root, and nothing for an empty, relative, network, dotted or NUL-containing path. Backslashes count as separators.
- **`EvidencePanel.svelte`:** in the "started without an evidence folder" state, a box lists the choices as full-width rows ("**Allow** `<path>` · every ticket").
  - A click calls `api.setEvidence`, then refetches the list.
  - If the folder was saved but can't be read, it says so.
  - A refusal shows the server's message (`role=alert`).
- **Tests:**
  - 4 for the choices;
  - 3 for the panel: a click saves `U:/Evidence` and loads the media, a refusal shows its reason and reloads nothing, and a network folder offers no button.
  - **The mutation check:** dropping the broadest choice turns the click test red.
- **AC1, in a browser:** a fresh Settings and no `--evidence`, on the stand-in mirror's pay 04.
  - The panel offered three choices: `…/realmirror/Evidence` for every ticket, `…/Evidence/app` for this project, and `…/Evidence/app/pay-04` for this ticket.
  - One click on the first made the box go away, and all three rounds appeared: videos of 7.5s, 12.2s and 18.1s, and the three screenshots loaded.
  - `settings.json` then had `evidenceRoot` ending in `\realmirror\Evidence`.
  - The first layout wrapped "Allow" across two lines on long paths, so the rows are now full width, with the path wrapping between "Allow" and its scope.
- **AC2:** covered by `allowChoices` (no drive root, no `//server/...`) and the panel's network test.
