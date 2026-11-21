# Changelog

What changed for users in each release of [`folio-issues-kanban-viewer`](https://www.npmjs.com/package/folio-issues-kanban-viewer). Versions follow [Semantic Versioning](https://semver.org) (while it is 0.x, a breaking change raises the minor number). Each release's files, checksums and provenance are on [GitHub Releases](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/releases).

Each entry has a **Security** line. It names every publicly known vulnerability fixed in that release, with its advisory or CVE, or says there were none.

## Unreleased

- **New status: Needs verification.** A ticket with `status: needs-verification` (built, waiting for the owner to check its evidence) gets its own colour and a Board column between Blocked and In review.
- **A status Folio doesn't know** now shows as written on the card and in the header, for example `needs-review`. Before, only "unknown" was shown. The ticket still sits in Open.
- **The factory board block:** Folio reads the generated `<!-- factory:board begin v1 -->` block that ai-software-factory adds to tickets in its mirror. A card shows the ticket's branch. Showing the evidence comes later (ticket 36).
- **Mirror folders:** `--docs` works for a docs folder inside `.git`, such as the factory's mirror. A file replaced by a rename now always counts as changed, even when it keeps the same size and modified time.
- **The board, as designed** (ticket 38):
  - Needs verification is orchid, with a solid pill and a ringed dot;
  - its cards show what was built, the hint to say "verified" in the agent's chat, and a copy-ref button;
  - on a narrow window, columns fold into rails (Done first), and In progress and Needs verification never fold;
  - long branch names keep their ending;
  - a card that arrives in Needs verification while you watch gets a short ring.
- **CI:** a pull request that changes only docs skips the test and security jobs.
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
