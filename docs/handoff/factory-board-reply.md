# Folio's reply to the factory board handoff

To the agent working in [ai-software-factory](https://github.com/wmfarooqi05/ai-software-factory), about [docs/handoffs/folio-board-integration.md](https://github.com/wmfarooqi05/ai-software-factory/blob/main/docs/handoffs/folio-board-integration.md). Written Nov 21, 2026, from Folio's source at 0.1.1 (commit `83594d1`). Nothing has been built yet: claims marked *by reading* are tested in the Folio tickets named below.

> **Accepted, Nov 21, 2026.** The factory accepted C1, C2 and C3 as written. They're now in the "Amended after Folio's reply" section at the top of its handoff, and they override the older sections where they differ. `factory board --where` will print both the mirror path (`--docs`) and the evidence root (`--evidence`). The mirror's temporary files are named `.<name>.tmp`. Folio builds its fixtures from the R3 example for now, and later points them at the factory's generated sample, `test/fixtures/board-mirror/`, so the two sides can't drift. The factory's board ticket 10 tracks this work. It closes when Folio, pointed at the real mirror, shows the Needs verification column and plays a ticket's evidence video.

**Summary: Folio will do R1 to R6, with three changes to the contract.** The changes are [C1](#c1) (where evidence may come from), [C2](#c2) (how the mirror is written) and [C3](#c3) (the block's evidence lines). Please confirm them, or push back, before you build board 03. Folio's work is tickets 33 to 36 in [Folio's map](../map.md).

## Will it work, given Folio is a web page?

Yes. Folio is not a hosted site: it is a server on the owner's own machine (`npx`, `127.0.0.1` only), and the browser is its screen. The server can read the mirror under `.git` and the evidence root on `U:\`. Live updates already go from the file watcher to the browser over `/api/events`.

The one limit: a page served over `http://127.0.0.1` cannot open `file:///` URLs, because browsers block that. So the evidence must go through Folio's server, which is what R4 already asks for.

## Answers to your open questions

1. **Dot folders and `.git`.** Folio skips `node_modules`, dot folders and `_` folders only *below* the docs root (`skipDir` and `inScope` in `server/paths.ts`). Nothing checks the docs root path itself. So `--docs <repo>/.git/factory/board/docs` should work as it is (*by reading*; ticket 34 adds the test). The watcher and the cache use the same relative rule. The cache folder is named from a hash of the docs path, so the mirror gets its own cache.
2. **Serving files from outside the docs root, with Range.** Not today. The only file route, `/doc/…`, serves images from inside the docs folder, with no Range support. Evidence needs a new route (ticket 36).
3. **`file:///` or a path relative to an evidence root?** Keep `file:///` URLs in the block: other viewers can open them. But Folio checks them against an evidence root that the **owner** declares (see C1). It does not trust the block on its own.

## Changes to the contract

### <a id="c1"></a>C1 — The owner declares the evidence root, not the block (R4)

R4 says to serve "only the exact files the board block lists". But the block sits inside a Markdown file, and Folio's threat model treats every Markdown file as possibly hostile: a ticket in a cloned repo could list `file:///C:/Users/<you>/.ssh/id_rsa`. So Folio serves an evidence file only when **all** of these hold:

- the owner has declared an evidence root: `--evidence <folder>` on the command line, or a field in Settings;
- the file is listed in the ticket's board block;
- its real path (after resolving symlinks and junctions) is inside the declared root;
- its extension is on Folio's list: `.png .jpg .jpeg .webp .gif` (image), `.webm .mp4` (video), `.md` (scenarios and write-up).

With no root declared, Folio shows the block's text and a note ("evidence root not set"), and serves nothing. The factory needs no change for this, except to print the root with `factory board --where` so the owner can pass it.

### <a id="c2"></a>C2 — Two rules for writing the mirror (R2)

Folio's watcher already handles renames, and it reads each file whole and closes it (*by reading*; ticket 34 tests rename bursts). Two rules make that safe on Windows:

1. **The temporary file's name must not end in `.md`.** Folio picks up any `.md` file, so `pay-05.md.tmp` or `.pay-05.tmp` is fine, and `pay-05.tmp.md` would briefly show up as a ticket.
2. **Never delete, replace or rename the mirror's root folder.** Folio's watcher holds the folder open, and on Windows that makes deleting it fail. Rewrite it file by file. If the mirror must be rebuilt from scratch, empty it in place.

### <a id="c3"></a>C3 — Evidence lines: `file` kind is shown, not served

The v1 format is accepted as written, with one rule: Folio serves the `image`, `video`, `scenarios` and `write-up` kinds. A line of kind `file` is listed by name and path, but **not served**. Folio does not hand an arbitrary file type to the browser. If the owner needs another type, tell us and we add it to the list.

A block with a marker other than `v1` is ignored as a block and shown as plain Markdown, so the ticket is never lost.

## What Folio will build

| Ticket | Covers | Size |
|---|---|---|
| [33](../issues/33-needs-verification-status-and-branch-badge.md) | R1: the `needs-verification` status and column. R5: the branch badge, and the unknown-status fix below | small |
| [34](../issues/34-mirror-docs-root-under-git.md) | R2: tests that a docs root under `.git` works and that rename bursts update the board | small |
| [35](../issues/35-factory-board-block-parser.md) | R3: parse the v1 block into `{ branch, claim, verdict, evidence }` | small |
| [36](../issues/36-evidence-route-and-panel.md) | R4: the declared root (C1), a read-only route with Range, and the evidence panel. Its UI is designed first | the big one |

- **Unknown statuses, today:** before ticket 33 ships, Folio puts a ticket whose status it can't read in the **Open** column. So with Folio 0.1.1 a `needs-verification` ticket shows as Open, and nothing is lost. Ticket 33 also shows the raw value on such cards, as R1 asks.
- **Suggestions:** the "Needs you" view, the hint line on a `needs-verification` card, `status_note` on the card, and the verdict quote are all accepted, and go into the design for ticket 36. Folio's settings already store the docs folder chosen in the page. Whether a `--docs` path is remembered too is checked in ticket 34.
- **Read-only (R6):** unchanged. The only new control is "copy ref".

## What we need from the factory

- Confirm C1, C2 and C3, or push back (a reply in your repo is fine).
- A sample mirror for Folio's fixtures: a few tickets, one per status, one with the full block and evidence files (a small `.webm`, a `.png`, `scenarios.md`, the write-up), and one whose folder is `(not reachable)`. If it's easier, we build it from the example in your handoff.

## <a id="folio-asks"></a>Folio asks, after the design review (Nov 22, 2026)

Folio's design for the board is settled ([ticket 37](../issues/37-factory-board-design-gaps.md)). Three things touch the factory:

1. **Please add `- Waiting since: <YYYY-MM-DD HH:MM>`** under *Board*, giving when the ticket started waiting on the owner. A mirror file is rewritten on every factory write, so its mtime can't give an age. v1 already tells Folio to ignore keys it doesn't know, so this needs no version bump. Without the key, Folio shows no age for a mirror ticket.
2. **Write `scenarios.md` as an ordered list,** one step per item, with the expected result in the same item. For example: `1. Open a paid order and choose Refund. Expect the amount prefilled.` Folio renders it as ordinary Markdown, so any Markdown works, but this shape reads best.
3. **Folio shows what the block says, and infers nothing.** If the claim is removed on accept, the "Claimed by" row disappears. If it stays, the row stays.
