---
type: build
status: in-review
status_note: "Built on branch worktree-agent-ab391769d24973bff; waiting for the owner to review, merge, and run npm publish (not published)."
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

- [x] **A Node backend matching the Go services,** in TypeScript, with **no runtime dependencies**: only Node's `http`, `fs`, `fs/promises`, `path`, `crypto` and `fs.watch`. It covers:
  - the docs folder: check the root, scan, read in batches, and the stamps the frontend uses;
  - watching: recursive `fs.watch`, with the same rules as ticket 09:
    - 200 ms trailing and 1 s maximum debounce, judged by stat at flush;
    - rename, delete and new-directory handling;
    - a full rescan on watcher error;
    - the scope skips (`_`, dot folders, `node_modules`);
  - the cache: the same `<hash>.json` format and location (`%LOCALAPPDATA%\Folio\cache`), written atomically;
  - settings: the same `settings.json` and validation rules as Go, including ticket 18's checks once they land;
  - images at `/doc/<path>`: port `SafeJoin` and the asset rules exactly. Block `..`, absolute, UNC and device paths, `:` (alternate data streams), and junctions or symlinks that leave the root. Send images only, with `nosniff` and a sandbox CSP for SVG.
- [x] **Transport.** Plain JSON over HTTP for the calls, and Server-Sent Events for `docs:changed`.
- [x] **Frontend switch.** `frontend/src/lib/api.ts` picks Wails or HTTP in one place. In web mode the Wails runtime is never imported.
- [x] **Browser differences:**
  - **Choosing a folder:** a path box in Settings and first run, plus a `--docs <path>` argument.
  - **External links:** normal links in a new tab (`rel="noopener noreferrer"`), still http and https only.
  - **"Open in VS Code":** a `vscode://` link. Edge asks once.
  - **Dropped in web mode:** window bounds, the RAM readout and "Open settings file".
- [x] **Localhost security:**
  - bind to `127.0.0.1` only;
  - reject requests whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>` (blocks DNS rebinding);
  - require a random token generated at startup, set as an HttpOnly SameSite=Strict cookie from the URL printed at start;
  - reject cross-site requests (`Sec-Fetch-Site`);
  - send the existing CSP and security headers on every response;
  - never serve anything outside `dist/` and the docs root.
- [x] **One command.**
  - `npm run web -- --docs <path>` (or `node dist-web/folio-web.mjs --docs <path>`) builds if needed, starts the server and prints the URL with its token.
  - Also produce a single bundled `folio-web.mjs` plus `dist/`, so a copy can run with plain `node` and no `npm install`.
- [x] **Publish as a public npm package** (the owner is happy for the repo and the package to be public):
  - The package is the bundled `folio-web.mjs` plus `dist/`, with a `bin` entry `folio`. It has no dependencies, so an install downloads only this package.
  - On the VM, run `npx folio-viewer --docs <path>` or `npm install -g folio-viewer` and then `folio --docs <path>`. Check the package name is free on npm first.
  - The server opens the default browser at the tokenised URL when it starts, and `--no-open` turns that off.
- [x] **Contract tests** that run the same cases against the Go services and the Node server, so the two backends can't drift. Cover the docs fixtures, the stamps, the watcher events, settings validation and the image path rules.
- [x] README: web mode, the command, and what differs from the desktop app.

## Done when

- <a id="ac1"></a>**AC1** — `npm run web -- --docs fixtures\docs` serves Folio in Edge. Every view works, and an edit, create, delete or rename in the fixtures shows within 1 s.
- <a id="ac2"></a>**AC2** — The contract tests pass against both backends.
- <a id="ac3"></a>**AC3** — Tests show a request with a wrong `Host`, no token, or a cross-site origin is rejected. A `/doc/` path that leaves the root (including through a junction or `::$DATA`) returns 404.
- <a id="ac5"></a>**AC5** — `npx folio-viewer --docs <path>` works from a clean folder on a machine with only Node installed.
- <a id="ac4"></a>**AC4** — The server has no runtime dependencies (`npm ls --omit=dev` for its package is empty, or it's bundled to one file), and it listens on `127.0.0.1` only.

## Outcome

Built on branch `worktree-agent-ab391769d24973bff`. Not merged, not published.

**Where things are**

- The server is TypeScript in `frontend/src/server/` (paths, settings, docs, assets, security, server, cli). It sits in the frontend project so it shares the one toolchain: vite builds it, vitest tests it, svelte-check types it, and there is no second `node_modules`. It imports Node built-ins only. `vite.server.config.ts` bundles it into one `folio-web.mjs` (43 KB, no imports except `node:*`).
- The package is `packages/folio-viewer/` (name `folio-viewer`, checked free on npm with `npm view` on Nov 20, 2026): `package.json` (no dependencies, `bin` is `folio`, `engines` node 22), `LICENSE` (MIT, the same as the root LICENSE), the built `folio-web.mjs` and `dist/` (which carries `licenses/OFL-Geist.txt`). `files` lists exactly those, plus the README. `npm pack` gives 127 files, 1.2 MB packed, 4.2 MB unpacked. Installing the tarball in an empty folder adds one package and `npx folio-viewer --docs <path>` runs.
- `api.ts` calls a backend picked in one place, `lib/backend.ts`: the Wails one by default, `backend-http.ts` in the web build (`vite.web.config.ts` swaps the module). The web output contains no Wails runtime and no bindings (checked by grepping `dist/` and `folio-web.mjs`). The desktop build is unchanged apart from moving the same calls into `backend-wails.ts`; `task build` passes the size budgets.
- Transport: `POST /api/<name>` with the arguments as a JSON list, one name per `api.ts` call, errors as `{"error": "..."}` with the same text Go gives; `GET /api/events` is Server-Sent Events for `docs:changed`. After an SSE reconnect the client diffs with a scan, so nothing is missed.
- `npm run web -- --docs <path>` (repo root) or `task web -- --docs <path>` builds what is stale and runs it. `--docs` is applied in memory only, like `FOLIO_ROOT`, and fails with the reason if the folder has no docs roots.

**Tests**

- `frontend/contract/` is the contract suite: one set of cases run once against the Go services and once against the Node server, then a block that checks the two reports are equal (settings file bytes, validation messages, scan results, cache envelope, watcher events, `/doc/` statuses, vscode URLs). The Go side is `cmd/contract-server`, a small HTTP wrapper over the real `internal/docs`, `internal/shell` and `internal/settings` (simpler than a Go test helper because the cases are written once, in TypeScript). It also checks that a cache written by one backend is read by the other. Run with `task test:contract`; it builds the harness and needs Go, and Windows for the junction (`cmd /c mklink /J`).
- `frontend/src/server/security.test.ts` covers AC3: wrong Host, no or wrong token, the token exchange and its redirect, `Sec-Fetch-Site`, Origin, headers on every response, the CSP equal to index.html's, the 127.0.0.1-only binding, and `/doc/` escapes. `docs.test.ts`, `settings.test.ts`, `cli.test.ts` and `lib/external.test.ts` (the Go external-link and vscode cases) cover the rest.

**Differences from the desktop app, and from Go**

- Link opening: the renderer's click handler stays; in web mode it calls `window.open(url, '_blank', 'noopener,noreferrer')` after the same http/https check, instead of rendering `target=_blank` anchors.
- A junction or symlink that stays inside the docs root is served by Node; Go refuses any junction on the way (Node cannot tell a junction from a symlink). Both refuse one that leaves the root, which is the security rule, and the contract suite tests exactly that.
- Node also refuses Windows device names (`CON.png`, `nul`) in a path.
- Renaming a folder that Go's watcher holds open fails with EPERM on Windows, so the contract suite leaves it out; the Node watcher handles it (tested in `docs.test.ts`).
- A bad percent-escape in a `/doc/` URL gets 404 from Node and 400 from Go's HTTP server; not a path case.
- `logTimings` and the bench hook do nothing in web mode.

**Accepted gaps**

- Time of check to time of use in `/doc/`: the path is checked with `realpath` and then opened, so a link swapped in between could slip through. Go has the same gap. It needs write access to the docs folder, which already means the attacker can read it.
- A link that stays inside the docs root is served by Node; Go refuses any junction (see above).
- A watcher overflow cannot be provoked on the Go side of the contract suite, so it is tested on the Node side only (an event with no file name runs a full rescan).

**Memory (measured on the fixtures)**

| | Private memory |
|---|---|
| Node server process | about 60 MB |
| Web mode in total, Edge already open | about 92 MB |
| Desktop app (with WebView2) | about 165 MB |

**Review (two Opus reviews, verdict: merge after fixes)**

Security layering, the `/doc/` port, the contract suite and the package held up. Fixed after the review:

1. A watcher overflow (an event with no file name, no error event) was dropped. It now runs a full rescan with `rescan: true`.
2. The cookie was shared by every instance on 127.0.0.1 (cookies ignore the port). It is now `folio_session_<port>`.
3. The URL token was not single-use. It now works once; the cookie holds a separate random value, so the link left in history or in the launcher's arguments is dead.
4. A flaky watcher test: a flush now waits for directory events still being resolved, and the test reads the union of events.
5. `setConfig` accepted wrong types (`showMemory: "x"` was written and the desktop app would then move the file aside). Every field is type-checked; the contract suite checks both backends reject the patches and write nothing.
6. `/doc/` streams use `pipeline`, so a read error or an aborted client closes the handle and does not crash.
7. Mermaid's `themeCSS`, `themeVariables`, `fontFamily` and `htmlLabels` are locked against directives (`SECURE_KEYS`, tested).
Also: `__proto__` and `constructor` as frontmatter keys and heading slugs (null-prototype objects; this changes the parser version, so caches rebuild once), the launcher only receives a URL of the exact loopback shape, `/api/events` is GET only and capped at 4 streams, Node 22 or newer (recursive `fs.watch` on Linux in Node 20 is an emulation with known bugs), a note in Settings when `--docs` wins for the session, the percent-escape and trailing dot or space cases in the contract suite, and the existing Mermaid test that timed out under load now has a 30 s timeout.

