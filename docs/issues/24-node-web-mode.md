---
type: build
status: open
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["09", "16", "18", "22", "23"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 24 — Web mode: a zero-dependency Node server

## Why

The owner wants Folio on the company VM without running an exe of their own. Go always compiles to an exe, even with `go run`. Node is already installed and used daily on the VM, so a Node script is the route that adds no new executable. The desktop exe stays as it is for the owner's own PC.

Decided Nov 20, 2026 (owner): exe on the owner's PC, Node web mode on the company VM. Node and npm are installed on the VM and npm packages are downloaded there routinely.

## To do

- [ ] **A Node backend matching the Go services,** in TypeScript, with **no runtime dependencies**: only Node's `http`, `fs`, `fs/promises`, `path`, `crypto` and `fs.watch`. It covers:
  - the docs folder: check the root, scan, read in batches, and the stamps the frontend uses;
  - watching: recursive `fs.watch`, with the same rules as ticket 09:
    - 200 ms trailing and 1 s maximum debounce, judged by stat at flush;
    - rename, delete and new-directory handling;
    - a full rescan on watcher error;
    - the scope skips (`_`, dot folders, `node_modules`);
  - the cache: the same `<hash>.json` format and location (`%LOCALAPPDATA%\Folio\cache`), written atomically;
  - settings: the same `settings.json` and validation rules as Go, including ticket 18's checks once they land;
  - images at `/doc/<path>`: port `SafeJoin` and the asset rules exactly. Block `..`, absolute, UNC and device paths, `:` (alternate data streams), and junctions or symlinks that leave the root. Send images only, with `nosniff` and a sandbox CSP for SVG.
- [ ] **Transport.** Plain JSON over HTTP for the calls, and Server-Sent Events for `docs:changed`.
- [ ] **Frontend switch.** `frontend/src/lib/api.ts` picks Wails or HTTP in one place. In web mode the Wails runtime is never imported.
- [ ] **Browser differences:**
  - **Choosing a folder:** a path box in Settings and first run, plus a `--docs <path>` argument.
  - **External links:** normal links in a new tab (`rel="noopener noreferrer"`), still http and https only.
  - **"Open in VS Code":** a `vscode://` link. Edge asks once.
  - **Dropped in web mode:** window bounds, the RAM readout and "Open settings file".
- [ ] **Localhost security:**
  - bind to `127.0.0.1` only;
  - reject requests whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>` (blocks DNS rebinding);
  - require a random token generated at startup, set as an HttpOnly SameSite=Strict cookie from the URL printed at start;
  - reject cross-site requests (`Sec-Fetch-Site`);
  - send the existing CSP and security headers on every response;
  - never serve anything outside `dist/` and the docs root.
- [ ] **One command.**
  - `npm run web -- --docs <path>` (or `node dist-web/folio-web.mjs --docs <path>`) builds if needed, starts the server and prints the URL with its token.
  - Also produce a single bundled `folio-web.mjs` plus `dist/`, so a copy can run with plain `node` and no `npm install`.
- [ ] **Publish as a public npm package** (the owner is happy for the repo and the package to be public):
  - The package is the bundled `folio-web.mjs` plus `dist/`, with a `bin` entry `folio`. It has no dependencies, so an install downloads only this package.
  - On the VM, run `npx folio-viewer --docs <path>` or `npm install -g folio-viewer` and then `folio --docs <path>`. Check the package name is free on npm first.
  - The server opens the default browser at the tokenised URL when it starts, and `--no-open` turns that off.
- [ ] **Contract tests** that run the same cases against the Go services and the Node server, so the two backends can't drift. Cover the docs fixtures, the stamps, the watcher events, settings validation and the image path rules.
- [ ] README: web mode, the command, and what differs from the desktop app.

## Done when

- <a id="ac1"></a>**AC1** — `npm run web -- --docs fixtures\docs` serves Folio in Edge. Every view works, and an edit, create, delete or rename in the fixtures shows within 1 s.
- <a id="ac2"></a>**AC2** — The contract tests pass against both backends.
- <a id="ac3"></a>**AC3** — Tests show a request with a wrong `Host`, no token, or a cross-site origin is rejected. A `/doc/` path that leaves the root (including through a junction or `::$DATA`) returns 404.
- <a id="ac5"></a>**AC5** — `npx folio-viewer --docs <path>` works from a clean folder on a machine with only Node installed.
- <a id="ac4"></a>**AC4** — The server has no runtime dependencies (`npm ls --omit=dev` for its package is empty, or it's bundled to one file), and it listens on `127.0.0.1` only.

## Outcome

*(empty)*
