# Design brief: the factory board in Folio (Needs verification, evidence, Needs you)

For Claude Design. Written Nov 21, 2026, for [ticket 36](../issues/36-evidence-route-and-panel.md), with the small card pieces of [ticket 33](../issues/33-needs-verification-status-and-branch-badge.md).

**Attach these with the brief:**
- `03-design-spec.md`: the Indigo theme, the tokens, every screen and component, and the motion;
- `03-folio-mockup.html`: the approved mockup, open it in a browser;
- `10-doc-light.png` and `10-doc-dark.png`: the real ticket view as built.

**Design inside this system.** Use its tokens, type, spacing, radius and motion. Don't invent a new look: these screens should look as if they were always part of Folio.

## What Folio is

Folio is a **read-only** viewer for Markdown tickets: files with YAML frontmatter, kept in a git repo. It runs as a small local server and is used in a browser tab or an Edge app window. Its layout:
- a 44px top bar with a `READ-ONLY` tag;
- a file tree on the left (280px);
- the document in the middle;
- a side panel on the right (360px) that opens linked items.

The views are the Document, a Map in Table, Board or Graph mode, **Waiting on** (tickets grouped by who they wait on, Owner first) and Open questions. It has light and dark themes, both required.

Folio never changes a ticket. There are no edit, approve or status buttons, and that stays true here.

## The new situation

The owner runs AI agents that build tickets in the background. Folio now shows a live **mirror** of their work: as an agent moves a ticket, the board updates by itself. When an agent finishes, it stages **evidence**: screenshots, a short demo video, a `scenarios.md` (what to try) and a write-up. It then moves the ticket to a new status, **Needs verification**, with `waiting_on: owner`.

The owner's moment, in their words:

> "You work in the background; I see two tickets in progress and one moved to human verification, open it, play the evidence video, verify it, and tell you it is verified."

The verdict is given **in the agent's chat, not in Folio**. Folio's job is to show:
- what needs the owner;
- the evidence, in a way that makes judging it quick;
- the ticket ref to paste into the chat, for example `pay 05 verified`.

## What to design

### 1. The Needs verification status

- A new status between In progress and In review, with its own colour token, light and dark, next to the existing `--s-open`, `--s-prog`, `--s-block`, `--s-rev`, `--s-done` and `--s-mute` (spec 1.2).
- **It means "your turn".** It should pull the eye more than In review does, but not look like an error, which is Blocked's red.
- Show it on the StatusDot, the StatusPill and in the tree.
- **The Board** gets a sixth column: Open, In progress, Blocked, **Needs verification**, In review, Done, then the collapsed "Dropped & superseded" strip. Check that six columns still fit at 1280px wide, with both side panes, and say what happens when they don't.

### 2. Board card additions

- **A branch badge:** the git branch the ticket is moving in, for example `feature/refunds`. It's often long. Tickets from the main checkout have none.
- **For a Needs verification card:**
  - the `status_note`, one line saying what was built;
  - a hint, *say "pay 05 verified" in the agent's chat*;
  - a **copy ref** control that copies `pay 05`.
- **"Claimed by"** (which agent worktree has the ticket, and since when): decide whether it belongs on the card, or only in the ticket view.

### 3. The evidence panel in the ticket view (the main piece)

A ticket with evidence shows it in the Document view. Today the view has a mono path, a header card of frontmatter fields, then the rendered body. Design:
- **Where the panel goes:** above the body, under the header card, or in the right panel, or somewhere else. Say why. For a Needs verification ticket, the evidence is the reason the owner opened it.
- **Video:** usually one short `.webm` or `.mp4` demo, played with the browser's native controls. Decide whether it plays inline, full width or as a poster that expands, and how it sits next to the images.
- **Images:** 1 to about 10 screenshots, as thumbnails. Clicking one opens it full size, with next and previous. Design that full-size view too.
- **Scenarios and write-up:** two short Markdown documents, rendered with Folio's own Markdown style. Tabs, sections you expand, or shown one after the other?
- **The verdict:** after the owner has decided, the ticket may carry a line like *accepted by the owner, relayed from chat, 2026-11-21: "looks right, approve flow works"*, or a rejection. Show it as a quote with its date and outcome.
- **Branch and claim** for the ticket, as in 2.
- **Other files:** listed by name, and not openable. Folio doesn't serve other file types.

### 4. The Needs you view

Everything waiting on the owner, with Needs verification tickets first, oldest first. **Waiting on** (spec screen 3) already groups tickets by person, Owner first, with an age bar. Decide whether this is:
- (a) a new pinned view in the tree;
- (b) Waiting on with the Needs verification tickets lifted to the top of the Owner group;
- (c) a filter on the Board.

Say which, and why. Show the copy-ref control here too.

## States to draw

Light and dark for each:

| State | What it looks like in the data |
|---|---|
| Full evidence | a video, 3 images, scenarios, write-up, branch, claim |
| Images only | no video |
| Evidence folder not reachable | the block names the folder followed by "(not reachable)", and no files are listed. Show the ticket and a plain note, never an error screen. |
| Evidence root not set | the owner started Folio without `--evidence`. The block lists files, but Folio serves none. Show a plain note saying how to set it (`--evidence <folder>`, or Settings). |
| A file failed to load | for example a deleted video. Folio's existing missing-image placeholder is the model. |
| Verdict accepted, and verdict rejected | |
| No board data | an ordinary ticket, as today. Nothing new shows. |
| A long branch name | for example `feature/pay-05-refund-screen-approval-flow` |
| A live update | the ticket moves column while the board is open. Use the existing motion tokens (spec 6). |

**Settings** gets one new field, the evidence root folder. Match `05-settings-dialog.png` and `13-settings-mockup.html`. It's a path box like the docs folder's.

## The data available

From the ticket's frontmatter: `status`, `status_note`, `waiting_on`, `type`, `afk`, `blocked_by`, plus the ticket key, for example `pay 05`, and its title.

From the generated board block, any field may be missing:

```
branch     "feature/refunds"
claim      "worktree C:/work/app-refunds, since 2026-11-21 10:02"
verdict    "accepted by the owner, relayed from chat, 2026-11-21: \"looks right, approve flow works\""
evidence   folder: "U:/Evidence/app/pay-05-refund-screen/", reachable: true
           files: [ { name, kind: image | video | scenarios | write-up | file } ]
```

## Constraints

- **Read-only.** The only new controls are copy ref, play, and opening an image full size.
- **Keep it light.** Folio has a strict bundle-size budget, so use CSS and Svelte only: no carousel, lightbox or player library. Native `<video controls>` is fine.
- **Keyboard:** Esc closes the full-size image view, the arrow keys move between images, and everything shows a visible focus ring.
- **Widths:** it must work at 1280px wide with the tree and the right panel open, and at 1600px.
- **Accessibility:** don't rely on colour alone to show status, as the existing dot and label already do. Images need alt text from the file name.

## Deliverable

- An HTML mockup in the style of `03-folio-mockup.html`, with light and dark, covering:
  - the Board with six columns and the new cards;
  - the ticket view with the evidence panel, in each state above;
  - the full-size image view;
  - the Needs you view;
  - the Settings field.
- Exact values for every new token: the status colour, and any spacing or size.
- A short list of the choices you made, and why: where the panel goes, how video and images are laid out, which Needs you option, where the claim goes.

## Out of scope

- Any way to approve, reject or change a ticket inside Folio.
- Uploading or managing evidence.
- Calling git or the factory's tools.
- Changing the existing screens beyond what's listed here.
