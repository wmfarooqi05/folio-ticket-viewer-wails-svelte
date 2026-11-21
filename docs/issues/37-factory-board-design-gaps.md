---
type: decision
status: done
status_note: "Nov 22, 2026: all ten answered as proposed; the build is tickets 38 to 41"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["33", "35", "36"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 37 — Close the gaps in the factory board design before building it

## Why

Claude Design delivered the mockup for ticket 36 ([36-factory-board-mockup.html](../assets/36-factory-board-mockup.html), from [the brief](../assets/36-design-brief.md)). Open it in a browser. Its screens are Board, Ticket, Needs you, Settings and Choices, with a switcher for the evidence states.

It's good, and it covers almost all of the brief:
- all nine evidence states;
- light and dark;
- the full-size image view: a real dialog, with focus moved into it, the arrow keys to page, Esc to close, and alt text from the file name;
- the Needs you view;
- the Settings field;
- the live update;
- seven decisions with exact tokens (the Choices screen, D1 to D7).

The decisions are adopted as they are ([Decisions](#decisions)). Reviewing it on Nov 22, 2026, at 1440px and 1280px, light and dark, against Folio's code and the factory contract, found ten gaps. Each needs an answer before ticket 36 is built. Most have a proposed answer below. The owner confirms or changes each one; the factory or Claude Design is asked only where marked.

## Gaps

### <a id="q1"></a>Q1 — The scenarios are drawn as a step and expect checklist, but the contract has no such format
The mockup renders `scenarios.md` as numbered steps, each with an "Expect …" line. The contract only says it's a Markdown file. Folio would have to guess that structure.

**Proposed:** render it with Folio's own Markdown renderer, as the brief said. If the factory writes an ordered list (`1. Open a paid order and choose Refund. Expect the amount prefilled.`), it looks close to the mockup, and nothing new needs agreeing. Tell the factory that this is the shape that reads best.

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q2"></a>Q2 — "Mirror live · updated 10:14" needs a signal Folio doesn't have
The board header shows "Mirror live, updated 10:14", and the tree footer shows "· mirror live". Nothing tells Folio that a docs folder is a mirror.

**Proposed:**
- the docs folder counts as a mirror when any ticket in it has a board block;
- "updated" is the time of the last change set Folio received;
- "live" means the event stream is connected. Folio already knows this; today it shows "Watching N files".

**Answered 2026-11-22 (owner):** accepted as proposed.

No contract change is needed.

### <a id="q3"></a>Q3 — The ages in Needs you would be wrong for a mirror
The Waiting on view shows an age ("1d", "2h"), and Folio computes it from the file's mtime (03 D4). The factory rewrites a mirror file on **every** CLI write, so its mtime is always recent. "2h" would mean "the mirror last refreshed this file", not "waiting on you for 2 hours".

**Proposed:** ask the factory for one more key in the v1 block, `- Waiting since: 2026-11-21 10:02`. The contract already says Folio ignores keys it doesn't know, so this needs no version bump. Folio uses it for the age when it's there, and otherwise shows no age for a mirror ticket. **Factory: please confirm.**

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q4"></a>Q4 — The branch badge loses its tail on narrow cards
D6's rule is "truncate in the middle and keep the last 12 characters". But on a 170px card, the mockup cuts both ends (`fea… tial-refun…`, `fea… dger-colum…`), so the part meant to be kept is cut too.

**Proposed:** the last 12 characters never shrink, and only the head does. If even `…` plus 12 characters doesn't fit, show `…` plus as much of the tail as fits. The badge's tooltip and accessible name always give the whole branch.

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q5"></a>Q5 — "Needs verification" truncates in its own column header
At 1280px, and at 1440px with the right panel open, the header reads "Needs ve… your turn". The status name is the one word that must not be cut.

**Proposed:** drop the "your turn" tag when the column is narrower than its content. The ringed dot and the tinted column already mark it. If it still doesn't fit, wrap to two lines.

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q6"></a>Q6 — The "No board data" state still shows Branch and Claimed by
In this state the header card keeps the Branch and Claimed by rows (`feature/refunds`, `C:/work/app-refunds`). The brief says an ordinary ticket shows nothing new.

**Proposed:** a mockup slip. With no block, neither row is drawn. Build it from the data, not from the mockup.

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q7"></a>Q7 — Accepted drops Claimed by and Rejected keeps it
In the Accepted state the Claimed by row disappears; in Rejected it stays. Folio can't know why.

**Proposed:** Folio draws whatever the block contains and infers nothing. If the factory removes the claim on accept, the row goes. Tell the factory that this is how its block is read.

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q8"></a>Q8 — Settings: "Choose folder…" doesn't exist in web mode, and the folder count is a directory listing
Two problems with the Evidence folder field:
- **"Choose folder…" doesn't exist in web mode.** There is no native folder dialog, and the docs folder is a typed path box (`shell.ts`, "Web mode has no native folder dialog").
- **"Reachable · 14 ticket folders"** means listing the evidence root's directory, which C1 keeps Folio away from.

**Proposed:**
- a path box like the docs folder's, with "Reachable" or "Not reachable" from a single `stat`, and no count;
- `--evidence` works like `--docs`: in memory only, never saved, and it wins over the Settings value. The field then says "set by --evidence for this run".

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q9"></a>Q9 — Which moves get the live-update ring?
The live update on the Choices screen adds a 3px `--s-verify` ring that fades over 1.6s. The mockup shows it when pay 04 moves into Needs verification. It doesn't say whether other moves get it.

**Proposed:** only a card arriving in Needs verification gets the ring, because that's the one that needs the owner. Other moves get the plain rise. With reduced motion, neither.

**Answered 2026-11-22 (owner):** accepted as proposed.

### <a id="q10"></a>Q10 — "copied" must be announced
The copy-ref button changes its label to "copied" for 1.5s. A screen reader won't hear that unless it's announced.

**Proposed:** an `aria-live="polite"` region announces "pay 05 copied". The clipboard needs a secure context, and `http://127.0.0.1` counts as one. If the copy fails, the button says "select and copy" and the ref becomes selectable.

**Answered 2026-11-22 (owner):** accepted as proposed.

## To do

- [x] **The owner** confirms or changes Q1 to Q10.
- [x] **Ask the factory** for the `Waiting since` key (Q3), and tell it the scenarios list shape (Q1) and how a removed claim reads (Q7). One message is enough: the "Folio asks" section of [the reply](../handoff/factory-board-reply.md#folio-asks).
- [x] **Update [ticket 36](36-evidence-route-and-panel.md)** with the answers. Its build order is then:
  1. adopt the tokens from the Choices screen;
  2. column rails;
  3. the card additions (status note, hint, copy ref);
  4. the evidence route;
  5. the panel and its states;
  6. the full-size view;
  7. Needs you;
  8. Settings.
- [x] **No new design round,** unless an answer changes a screen. Q4 and Q5 are small enough to settle while building.

## Done when

- <a id="ac1"></a>**AC1** — Every question above has an **Answered** line.
- <a id="ac2"></a>**AC2** — Ticket 36 lists the answers and no longer waits on the design.

## Decisions

Adopted from the mockup's Choices screen (Nov 22, 2026):

- **D1:** the evidence panel sits under the header card, above the body.
- **D2:** the video plays inline at full panel width, 16:9, at most 380px tall, with a row of thumbnails beneath it. The video never opens the full-size view, because its native controls already have fullscreen.
- **D3:** Scenarios and Write-up are tabs, Scenarios first.
- **D4:** Needs you is Waiting on, with Needs verification lifted to the top of the Owner group, plus a "to verify" count on the tree's Waiting on row.
- **D5:** Claimed by appears in the ticket's header card only, never on the card.
- **D6:** below 1,048px the columns fold into 40px rails, in this order: Done, Open, In review, Blocked. In progress and Needs verification never fold. The column minimum is 168px, the rail 40px, and the gap 8px. This replaces ticket 33's 140px minimum.
- **D7:** Needs verification is the only solid pill and the only ringed dot.
- **Tokens:**
  - `--s-verify`: `oklch(.55 .19 330)` light, `oklch(.76 .14 330)` dark. It replaces ticket 33's provisional `oklch(.6 .17 320)` and `oklch(.74 .15 320)`.
  - `--s-verify-ink`: `#ffffff` light, `#151514` dark.
  - `--lightbox`: `rgba(20,20,15,.9)` light, `rgba(0,0,0,.92)` dark.
  - Sizes, as on the Choices screen: the verify dot (7px, with a 1.5px ring at 1.5px offset), the 22px pill, 8% and 32% tints, the badge at 19px, the copy ref at 22px (24px in the ticket), the evidence panel radius of 12, the video and thumbnail sizes, and the live-update ring of 1.6s.
