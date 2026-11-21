# Changelog

What changed for users in each release of [`folio-issues-kanban-viewer`](https://www.npmjs.com/package/folio-issues-kanban-viewer). Versions follow [Semantic Versioning](https://semver.org) (while it is 0.x, a breaking change raises the minor number). Each release's files, checksums and provenance are on [GitHub Releases](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/releases).

Each entry has a **Security** line. It names every publicly known vulnerability fixed in that release, with its advisory or CVE, or says there were none.

## 0.1.2 — 2026-11-22

Folio can now show the work of AI agents from ai-software-factory as it happens: a live board, a status for tickets waiting on your verification, and each ticket's screenshots and videos beside it. Nothing changes for ordinary tickets. It also adds `folio .`. The version is a patch number by the owner's choice; it adds features and breaks nothing.

- **New status: Needs verification.** A ticket with `status: needs-verification` (built, waiting for the owner to check its evidence) gets its own colour and a Board column between Blocked and In review.
- **A status Folio doesn't know** now shows as written on the card and in the header, for example `needs-review`. Before, only "unknown" was shown. The ticket still sits in Open.
- **The factory board block:** Folio reads the generated `<!-- factory:board begin v1 -->` block that ai-software-factory adds to tickets in its mirror. A card shows the ticket's branch.
- **Mirror folders:** `--docs` works for a docs folder inside `.git`, such as the factory's mirror. A file replaced by a rename now always counts as changed, even when it keeps the same size and modified time.
- **The board, as designed** (ticket 38):
  - Needs verification is orchid, with a solid pill and a ringed dot;
  - its cards show what was built, the hint to say "verified" in the agent's chat, and a copy-ref button;
  - on a narrow window, columns fold into rails (Done first), and In progress and Needs verification never fold;
  - long branch names keep their ending;
  - a card that arrives in Needs verification while you watch gets a short ring.
- **Evidence files** (ticket 39): with `--evidence <folder>`, or a folder saved in Settings, Folio serves the screenshots, videos and scenario files a ticket's board block lists. It serves them only from inside that folder, only of those types, and videos can seek. Without a folder, nothing is served.
- **The evidence panel** (ticket 40): a ticket with evidence shows it under its header:
  - the video, playable and seekable;
  - thumbnails that open full size (← → to move, Esc to close);
  - the scenarios and write-up as tabs;
  - the owner's verdict when there is one;
  - the branch and the agent's worktree in the header.
  - It says plainly when the folder can't be read, a file is missing, or no evidence folder is set.
- **Fixed:** numbered and bulleted lists in documents showed no numbers or bullets.
- **Needs you** (ticket 41):
  - Waiting on lists what needs your verification first, with what was built, the evidence, copy ref and how long it has waited;
  - the tree shows "N to verify";
  - on the factory's mirror, the board and footer say "Mirror live · updated 10:14", or "reconnecting";
  - a mirror ticket's age comes from its `Waiting since:` line, and with no such line it shows none.
- **Several videos on a ticket** (ticket 42): the factory records one video per scenario, so each video now shows its scenario above the player, taken from its file name, for example "S1 approve flow" from `pay-05-S1-approve-flow.webm`. A gap separates the players.
- **Evidence by testing round** (ticket 43): when the factory groups a ticket's evidence under `#### S1 — <title>` sub-headings, each round shows together: its heading, its video with the note that the agent checked the screenshots and not the video, then its screenshots.
- **`folio .`** (ticket 44): the docs folder can be given without `--docs`, so `folio .` opens the folder you're in and `folio <path>` any other. `--docs <path>` still works; give the folder once.
- **Allow an evidence folder from the ticket** (ticket 45): with no evidence folder set, a ticket's evidence panel offers its folder and its parents (for every ticket, this project, or this ticket), with the exact path on each button. One click saves it to Settings and shows the evidence. A drive root or network path is never offered.
- **For contributors:** a pull request that changes only docs skips the test and security jobs in CI.
- **Security:** no vulnerabilities fixed.

## 0.1.1 — 2026-11-21

No change to how Folio works. This release brings the new README to the npm page, and it is the first version published by the release workflow, with npm provenance ("Built and signed on GitHub Actions").

- **Package page:** the README now shows badges (npm version, licence, Node, CI, dependencies, size, Socket, OpenSSF Scorecard, OpenSSF Best Practices) and explains the 4.4 MB unpacked size, and links to the changelog, the contribution guide and the issues page.
- **Project:** added `CONTRIBUTING.md` and this changelog. `LICENSE` is now the plain MIT text, so GitHub and npm detect it.
- **Security:** no vulnerabilities fixed.

## 0.1.0 — 2026-11-21

The first release on npm.

- **Run it with `npx folio-issues-kanban-viewer --docs <path>`.** It starts a small server on 127.0.0.1 and opens your browser. It has no dependencies and needs only Node 22 or newer.
- **Read your Markdown tickets.** It shows a tree of the docs folder, each ticket with its status, and a kanban board for a `map.md` plus `issues/` layout. Mermaid diagrams, maths and code highlighting load only when a document uses them.
- **Read-only and local.** It never writes to your docs, only to its own settings file and index cache. The link it prints works once; after that only the browser that used it gets in.
- **Options:** `--docs`, `--port`, `--app` (an Edge app window on Windows), `--no-open`, `--version` and `--help`.
- **Replaces the Windows desktop app** (`folio.exe`), which is retired ([RETIRED.md](RETIRED.md)).
- **Security:** first release, so no vulnerabilities fixed.
