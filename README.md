# Folio

Folio is a read-only desktop viewer for file-based tickets: markdown files with a small frontmatter convention, kept in a repo under `docs/modules/`, `docs/handoffs/` and `docs/patterns/`, or in a plainer layout of `docs/map.md` and `docs/issues/NN-*.md` (see [Docs layouts](#docs-layouts)). It shows the tree, the status of each ticket, and (as the slices land) boards, a dependency graph, waiting-on and open-question views. It never writes to a ticket. The only files it writes are its own settings, a disposable index cache and the WebView2 profile; [Where Folio writes](#where-folio-writes) lists every place, for the exe and for web mode.

Folio is lightweight on purpose: idle RAM is the priority (about 169 MB private for the whole process tree, WebView2 included), the exe is about 14 MiB, and a ticket 15 check keeps it that way (see [Budgets](#budgets)).

## Install

Folio installs for the current user only: no admin prompt, files in `%LOCALAPPDATA%\Programs\Folio`, one Start menu entry, and an uninstaller in Settings > Apps.

1. Get `folio-amd64-installer.exe` (build it with `task package`, see below, or take it from whoever built it) and run it.
2. Start Folio from the Start menu.

Needs Windows 10 or 11 with the WebView2 runtime (Windows 11 has it; the installer fetches it if it is missing). Uninstalling removes the program, its shortcut and the browser profile, and asks whether to delete the index cache and settings too (`%LOCALAPPDATA%\Folio` and `%APPDATA%\Folio`). A silent uninstall keeps them; **Settings > Data > Clear data** or deleting those folders does it by hand.

Without the installer, `bin\folio.exe` runs on its own after `task build`.

## First run

1. The first launch shows a **Choose folder** screen. Pick the **repo root**, the folder that contains `docs/` (not `docs/` itself). Folio checks that `docs/modules`, `docs/handoffs` or `docs/patterns` can be found, or that `docs/` holds a `map.md` or an `issues/` folder, and shows what it found. A `map.md` or `issues/` layout needs no setup: Folio reads the whole docs folder.
2. Folio scans the folder, builds an index, and shows the tree. The index is cached under `%LOCALAPPDATA%\Folio\cache`, so the next start is quick, and the tree stays live: edits, new files and deletions show up within a second or two.
3. Folio never writes to your tickets. What it does write is listed under [Where Folio writes](#where-folio-writes).

## Using it

- Click a ticket in the tree to read it. Links between tickets open in the side panel; Ctrl-click opens one in the middle pane instead.
- `[` hides or shows the tree, `]` hides or shows the side panel, Esc closes the panel, Alt+Left goes back inside it.
- The pinned views at the top of the tree (Waiting on, Open questions) and each module's map (list, board, graph) cut across the tickets.
- **Resizable panes:** drag the divider between the tree and the document, or between the document and the side panel. Widths are remembered. Double-click a divider to reset it.
- **Change folder:** the button at the bottom of the tree opens the folder picker again; Folio rescans the new folder.

## Docs layouts

A **space** is a folder that holds a `map.md` or an `issues/` folder, and a ticket is `issues/NN-*.md` under a space. Ticket keys are `<space> NN`, and refs, map links and `blocked_by` resolve inside the space.

- `docs/modules/<space>/...` gives the space `<space>`, as before.
- `docs/map.md` plus `docs/issues/NN-*.md` (this repo) is one space named after the repo folder, for example `ticket_ui`. Settings picks the root **Whole docs folder (`.`)** for it, and so does the first run when it finds no `modules`, `handoffs` or `patterns`.
- A mix works too: `modules/<x>/` spaces beside a top-level `issues/` folder, with the root `.`. Under `.` the usual skips apply: `_` folders, dot folders and `node_modules`. `handoffs/` and `patterns/` belong to no space.
- When spaces are nested, the nearest folder with a `map.md` or `issues/` wins.

## Settings

Open them with the gear in the header or Ctrl+,. The dialog has four sections; Save stays disabled until something changes, Esc closes, Enter saves.

- **Docs folder:** the repo root (with the picker), the docs folder name (default `docs`), and the docs roots to index (default `modules`, `handoffs`, `patterns`). The roots are chips: **Whole docs folder (.)**, the usual three, and every top-level folder of the docs folder that holds a `.md`, each with a found or missing dot. A small box adds any other relative folder. The last scan time is shown too.
- **Links:** the Azure DevOps work item and pull request URL templates (`https://` with an `{id}`), with a live preview.
- **Appearance:** System, Light or Dark, and **Show memory use** (off by default).
- **Data:** **Clear data**, see [Clear data](#clear-data).
- **Open settings file** opens `settings.json` in VS Code. It is plain JSON; unknown keys are kept.

Window position and size, the pane widths and the collapsed tree are saved there too.

### Memory readout

The bottom of the tree shows one muted figure, for example `165 MB`: the private bytes of Folio plus its WebView2 processes, summed the way `scripts/ram-check.ps1` does it, so the two agree (Task Manager's Memory column is a different measure, which the tooltip says). Go measures (`internal/mem`) and only sends a number when it moved by 1 MB or more since the last one it sent. It polls every 5 s, re-reading just the known processes and listing every process on the machine once a minute to find new children, and it pauses while the window is minimised or hidden. It is **off by default**, because listing processes can trip endpoint-security heuristics; switch it on with **Show memory use** in Settings (`showMemory` in `settings.json`). While it is off nothing is polled, and no goroutine or timer exists. The readout is also off while the tree is hidden or collapsed.

### Safety rules for settings and folders

- **`settings.json` is checked when it is loaded**, field by field. A field with the wrong type, an `http:` link template, a `..` or absolute `docsDir` or docs root, an unknown theme, or a network repo root falls back to its default and is logged (`bin\folio.exe > folio.log 2>&1` shows it). The rest of the file is kept. Only a file that is not a JSON object at all is moved aside to `settings.json.bad`.
- **A network or device path is not accepted as the repo root:** `\\server\share`, `\\?\...` and `\\.\...` make Windows talk SMB with your sign-in. In the exe, one you pick yourself in the folder dialog is allowed for that run, with a warning in the sidebar and in Settings; Folio forgets it when it closes, so you pick it again next time. Only the dialog (which Go runs) can grant that: typing a path, editing `settings.json` or setting `FOLIO_ROOT` cannot. Web mode has no dialog, so there it is always refused (map the share to a drive letter, or open a local copy).
- **Files over 5 MB are not read.** A `.md` larger than that stays in the tree, tagged "too large" with its size, and opening it says why. The check is a stat, so a huge file costs nothing.

### Clear data

**Settings > Data > Clear data** deletes the index cache (a copy of your ticket text) at once. In the exe it also deletes the WebView2 profile, but a running WebView2 locks that folder, so that part happens the next time Folio starts (the dialog says so). After a clear the cache is not written again until Folio restarts. `settings.json` and your tickets are never touched, and only Folio's own folders are ever deleted. In web mode there is no profile, so it is the cache only.

## Where Folio writes

Nothing in your tickets repo, ever. Everything else, by mode:

| What | Where | Written by |
| --- | --- | --- |
| Settings, plus the window bounds and pane widths | `%APPDATA%\Folio\settings.json` (and `settings.json.bad` if the file was not JSON; a temp `.settings-*.tmp` for an instant while saving) | exe and web mode |
| Index cache: parsed ticket text and file stamps, plaintext | `%LOCALAPPDATA%\Folio\cache\<12 hex>.json`, one per docs folder | exe and web mode |
| Clear data request | `%LOCALAPPDATA%\Folio\purge-profile.pending`, an empty note that makes the next start delete the profile | exe only |
| WebView2 profile: cookies, cache and local storage of the embedded browser | `%LOCALAPPDATA%\Folio\WebView2` (older builds: `%APPDATA%\folio.exe`) | exe only |
| The program | `%LOCALAPPDATA%\Programs\Folio` (per-user install) | installer |

Web mode (`npx folio-viewer`) writes only the first two rows (the same files, the same places, from Node). It has no WebView2 profile and starts no other process than your browser, which keeps its own data. On a non-Windows machine the settings file is under `~/.config/Folio` (or `$XDG_CONFIG_HOME`) and the cache under `~/.cache/Folio` (`$XDG_CACHE_HOME`).

## Web mode (no exe)

The same viewer runs in a browser, from Node alone. Use it where you cannot or do not want to run an exe, for example on a company VM that has Node.

```
npx folio-viewer --docs <path>
```

`<path>` is the repo root, or its docs folder (one with `modules/`, `handoffs/` or `patterns/`, or with a `map.md` or an `issues/` folder; the latter is read whole). Node 22 or newer is the only requirement. The command starts a server on `127.0.0.1`, prints a link whose token works once, and opens it in your default browser. To install it once instead: `npm install -g folio-viewer`, then `folio --docs <path>`. `--port <n>` picks the port (default: a random free one), `--no-open` only prints the link, and without `--docs` the page asks for a path.

Stop it with Ctrl+C. Under `npx` on Windows the shell may then ask "Terminate batch job (Y/N)?": answer Y, that is fine.

Memory, measured on the fixtures: the server process is about 60 MB. With Edge already open, the whole thing adds about 92 MB, against about 165 MB for the desktop app (which carries its own WebView2).

What is the same: the tree, every view, the side panel, Mermaid, live refresh (edits, new files, deletes and renames show within a second), the index cache and `settings.json` (the same files, in the same places, as the desktop app).

What is different:

- The folder is a path you type (first run and Settings), or `--docs`; there is no native dialog, so a network or device path (`\\server\share`) is always refused.
- External links open in a new browser tab (`http` and `https` only). "Open in VS Code" is a `vscode://` link; Edge asks once.
- No window bounds, no RAM readout, no "Open settings file".
- Only the browser that used the printed link can talk to the server: it listens on `127.0.0.1` only, accepts only `127.0.0.1:<port>` and `localhost:<port>` as the host, and wants a cookie it gets from the token in the link. Cross-site requests are refused. Images are served under `/doc/` with the same path rules as the desktop app.

For development, from the repo root: `npm run web -- --docs fixtures\docs` (or `task web -- --docs fixtures\docs`) builds what is stale and runs it. `task build:web` builds `packages/folio-viewer/` (`folio-web.mjs` plus `dist/`), the folder that gets published; run `npm pack` there to check the file list. The server is TypeScript under `frontend/src/server/`, with no dependencies. `task test:contract` runs the same cases against the Go services and the Node server (`cmd/contract-server` is the Go side of that harness), so the two cannot drift.

## Stack

- **Wails v3.1.0** (Go backend, WebView2 frontend, Windows only). Go stats, reads and watches files and exposes them as typed services; Wails generates the TypeScript bindings.
- **Svelte 5 + Tailwind v4**, built with Vite. Indigo theme, light and dark.
- **The parser is TypeScript** with no DOM or Svelte imports (`frontend/src/lib/parser`), so it can move into another repo as a plain module. Go does no parsing.
- **fsnotify** for watching.

Very low RAM is the priority. Electron and React were ruled out; see [docs/map.md](docs/map.md).

## Prerequisites

| Tool | Version |
|---|---|
| Go | 1.27 |
| Node | 26 (with npm) |
| wails3 | v3.1.0: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0` |
| task (go-task) | 3.x: `winget install Task.Task` |

To run the built exe you only need the WebView2 runtime, which Windows 11 already has. `wails3 doctor` checks the rest. A C compiler is not needed.

## Commands

```
task dev                 # Vite hot reload + Go rebuild
task build               # production exe in bin\folio.exe (regenerates the TS bindings first)
task build:bench         # bin\folio-bench.exe: the same plus the RAM bench hook, for task ram only
task test                # go test ./... and vitest
task check               # go vet, regenerate bindings, svelte-check
task run                 # run bin\folio.exe
```

`FOLIO_ROOT` is a dev override that skips the folder picker. It takes the docs folder (or a repo root) and is never written to settings:

```
set FOLIO_ROOT=E:\projects\ticket_ui\fixtures\docs
bin\folio.exe
```

### Reproducible builds and releases

`task build` and `task build:web` are meant to give the same bytes every time (ticket 17): `npm ci --ignore-scripts` (exactly `package-lock.json`, no dependency install scripts), `GOFLAGS=-mod=readonly`, `go mod verify` instead of `go mod tidy`, `-trimpath -buildvcs=false`, and a pinned `wails3` (`task tools:install`; the build stops unless `wails3 version` is exactly v3.1.0). **A matching hash needs the same toolchain:** Go 1.27.4 (the `toolchain` line in `go.mod` is a minimum, so check `go version`) and the same Node patch as CI, 26.13.1 (`task build` and `task build:web` only refuse a major other than 26; tests and checks run on any supported Node). The first local hashes in ticket 17 came from Go 1.27.4 and Node 26.7.0. If you set `GOFLAGS` in your environment, keep `-mod=readonly` in it: Task does not override a variable that is already set.

`.github/workflows/ci.yml` runs the same steps on `windows-2025` with every action pinned by commit SHA: go test, go vet, govulncheck, svelte-check, vitest, the contract tests, the size budgets, `npm audit`, then builds `folio.exe` plus `SHA256SUMS` and the npm tarball plus `SHA256SUMS-npm`. The build jobs hold no signing permissions. Every run uploads the files as artifacts; a `v*` tag whose number matches `packages/folio-viewer/package.json` also creates a GitHub Release with all four files (the release notes name the CI run), and, if the repo is public, a separate `attest` job signs a build-provenance attestation for the exe and the tarball.

**Verify a downloaded exe or package.** The checksum files only show that the file was not damaged or swapped in transit, and only if you get the hash from somewhere other than the download itself (the CI run page, or a message from the owner): `SHA256SUMS` sits on the same release as the exe, so anyone who can edit the release can replace both. The real provenance is the attestation (public repo only):

```
(Get-FileHash folio.exe).Hash -eq ((Get-Content SHA256SUMS) -split '\s+')[0]
(Get-FileHash folio-viewer-0.1.0.tgz).Hash -eq ((Get-Content SHA256SUMS-npm) -split '\s+')[0]
gh attestation verify folio.exe --repo <owner>/<repo> --source-ref refs/tags/v0.1.0 --signer-workflow <owner>/<repo>/.github/workflows/ci.yml
gh attestation verify folio-viewer-0.1.0.tgz --repo <owner>/<repo> --source-ref refs/tags/v0.1.0 --signer-workflow <owner>/<repo>/.github/workflows/ci.yml
```

The first two lines print `True` when the hash matches (the comparison is case-insensitive and reads the `hash *file` format). On a private repo there are no attestations (they need GitHub Enterprise Cloud), so the hash from the run page is all there is. For stronger release protection, turn on GitHub's immutable releases for the repo (Settings > General), so a published release's files and tag cannot be changed afterwards. To also check what was built, `go version -m folio.exe` lists `-tags=production`, `-trimpath=true` and the linked modules (Folio, wails v3.1.0, fsnotify, go-ole, x/sys).

**Publishing the npm package** is manual and the owner's decision. Either `npm publish folio-viewer-<version>.tgz` by hand with the checksummed tarball, or run the `publish-npm` workflow (Actions tab, "Run workflow", on a `v*` tag). That workflow only runs by hand, refuses a tag that is not on `main`, and publishes the tarball from the CI run of that same commit after checking its checksum and attestation. It uses npm trusted publishing (OIDC): there is no npm token anywhere. Setup, all required: make the repo public; on npmjs.com open the `folio-viewer` package settings and add a GitHub Actions trusted publisher (this repo, workflow `publish-npm.yml`, environment `npm-publish`; npm needs CLI 11.5.1 or newer, Node 26 ships that); in the repo's Settings > Environments create `npm-publish`, add yourself as a required reviewer and limit it to `v*` tags. The required reviewer is the gate that holds even against someone with write access to the repo, so set it before you enable the trusted publisher. A trusted-publisher entry has to complete its first publish within 2 days or it expires. After that, `npm audit signatures` on the installing side checks the provenance.

Packaging needs **NSIS 3** (`makensis` on PATH): `winget install NSIS.NSIS`, then open a new shell. `task package` builds the exe, fetches the WebView2 bootstrapper through `wails3 generate webview2bootstrapper`, and runs `makensis` on `build/windows/nsis/project.nsi`. It installs per user by default; `task package INSTALL_SCOPE=machine` makes an all-users (admin) installer. The OFL licence for the embedded Geist fonts is installed next to the exe, in `licenses\`.

Notes:

- `frontend/bindings/` is generated, not committed. `task build` and `task check` regenerate it. Run one of them (or `wails3 generate bindings -clean=true -ts -i`) before opening the frontend in an editor or running `svelte-check` by hand.
- `main.go` embeds `frontend/dist`. On a fresh clone, `task test` and `task check` create an empty `dist` first; a bare `go vet ./...` needs `task build` (or an empty `frontend/dist`) first.
- The exe has no console. To see the logs, start it from a shell with output redirected: `bin\folio.exe > folio.log 2>&1`.

## Budgets

`task build` ends with `node scripts/size-check.mjs`, which fails the build above these caps (gzip, KB = 1000 bytes) and prints a table with the actual sizes:

| What | Cap |
|---|---|
| Initial JS: every chunk `index.html` loads or modulepreloads | 120 KB |
| CSS | 15 KB |
| Largest Mermaid diagram family, from the Vite manifest's import graph (KaTeX's add-on listed apart; ELK is stubbed out) | 450 KB (500 KB for architecture diagrams, which carry cytoscape) |
| highlight.js chunk | 25 KB |
| `bin\folio.exe` | 18 MiB |

Run it alone with `task size` (or `node scripts/size-check.mjs`; `node --test scripts/size-check.test.mjs` is its self-test). It needs `frontend/dist` and `frontend/.vite/manifest.json`, both written by `npm run build` in `frontend/`.

RAM, where **B** is the idle, indexed process-tree private memory (about 169 MB): two documents open at most B + 15 MB, after a Mermaid document at most B + 45 MB, 50 different documents at most B + 30 MB, and a second pass over 50 other documents must not grow it by more than 5 MB (the leak check). `task ram` (`scripts/ram-check.ps1`) launches `bin\folio-bench.exe` (build it with `task build:bench`) on `fixtures\docs` with a throw-away `%APPDATA%`, sums private bytes and working set over `folio.exe` and every `msedgewebview2.exe` descendant after 30 s idle, three runs per case, and prints medians plus idle CPU with a pulsing status pill on screen. It drives the UI through a dev-only hook, `FOLIO_BENCH=1` with `FOLIO_BENCH_DIR` (see `internal/shell/bench.go`): off unless both are set, no listener, one polled command file. The hook sits behind the `bench` build tag, so the shipped `bin\folio.exe` contains none of it (the bench exe is a separate build). Close other WebView2 apps first for a quieter machine, and do not run builds while it runs. The numbers from the last full run are in [docs/issues/15-budgets-and-packaging.md](docs/issues/15-budgets-and-packaging.md).

## Layout

```
main.go                  app wiring: window "Folio", service registration, WebView2 flags
Taskfile.yml             dev, build (with the size check), test, check, size, ram, package
internal/docs/           DocsService: Scan, ReadBatch, ReadFile, the watcher, the index cache
internal/shell/          ShellService: config, folder picker, CheckRoot, open in VS Code, asset middleware, bench hook
internal/settings/       settings.json: load, validate, atomic save
internal/mem/            the RAM readout: process-tree private bytes, polling, pause
cmd/contract-server/     test harness: the Go services behind the web-mode HTTP API (contract suite)
packages/folio-viewer/   the npm package (web mode): package.json, LICENSE; folio-web.mjs and dist/ are built
scripts/                 size-check.mjs (+ test) and ram-check.ps1
build/                   Wails build files (Windows only), the NSIS installer script
frontend/
  src/App.svelte         three-pane shell: top bar, tree, document
  src/components/        Tree, DocView
  src/lib/api.ts         thin wrapper over the backend (lib/backend.ts picks Wails or HTTP)
  src/server/            web mode: the zero-dependency Node server and CLI
  contract/              the contract suite (Go and Node)
  src/lib/parser/        the ticket 04 contract; only a trivial buildIndex is real
  src/lib/theme/         Indigo tokens (Tailwind @theme + CSS variables), motion, theme switch
fixtures/                a fake ticket corpus and expected.json, the parser oracle
docs/                    the plan: map, decisions, specs
```

## Decisions and plan

- [docs/map.md](docs/map.md): the map, the stack and constraints, the order of work.
- [01 Wails shell](docs/issues/01-wails-shell.md): the stack works on Wails v3.1.0 (findings in [docs/assets/01-findings.md](docs/assets/01-findings.md)).
- [02 Fixture corpus](docs/issues/02-fixture-corpus.md): the 64 fake tickets in `fixtures/`.
- [03 UI design](docs/issues/03-ui-design.md): Folio, the Indigo theme, motion.
- [04 Parser contract](docs/issues/04-parser-contract.md): the pure TS module and its types.
- [05 Index cache and refresh](docs/issues/05-index-cache-refresh.md): the Go/JS split, the cache, refresh, settings.
- [06 Rendering and size budget](docs/issues/06-rendering-and-size-budget.md).
- [07 WebView2 tuning](docs/issues/07-webview2-tuning.md): can idle RAM go well below 240 MB.
