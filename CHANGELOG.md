# Changelog

What changed for users in each release of [`folio-issues-kanban-viewer`](https://www.npmjs.com/package/folio-issues-kanban-viewer). Versions follow [Semantic Versioning](https://semver.org) (while it is 0.x, a breaking change raises the minor number). Each release's files, checksums and provenance are on [GitHub Releases](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/releases).

Each entry has a **Security** line. It names every publicly known vulnerability fixed in that release, with its advisory or CVE, or says there were none.

## Unreleased

- **Package page:** the README now shows badges (npm version, licence, Node, CI, dependencies, size, Socket, OpenSSF Scorecard) and explains the 4.4 MB unpacked size.
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
