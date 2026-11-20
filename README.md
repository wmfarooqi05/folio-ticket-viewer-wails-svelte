# Folio

Folio is a read-only viewer for file-based tickets, in your browser: markdown files with a small frontmatter convention, kept in a repo under `docs/modules/`, `docs/handoffs/` and `docs/patterns/`, or in a plainer layout of `docs/map.md` and `docs/issues/NN-*.md` (see [Docs layouts](#docs-layouts)). It shows the tree, the status of each ticket, and (as the slices land) boards, a dependency graph, waiting-on and open-question views. It never writes to a ticket. The only files it writes are its own settings and a disposable index cache; [Where Folio writes](#where-folio-writes) lists every place (the retired desktop app also wrote a WebView2 profile).

Folio is lightweight on purpose: it is a small Node server with no dependencies plus the browser you already have open (about 92 MB in total with Edge already open), and size budgets keep it that way (see [Budgets](#budgets)). Since ticket 26 web mode is the only way Folio is built and run; the Go desktop app is [retired and frozen](#retired-desktop-app) (see [RETIRED.md](RETIRED.md)).

## Run it

Folio needs **Node 22 or newer** and nothing else.

**On your own PC (Windows), in an app window.** Install it once, then run it with `--app`:

```
npm install -g folio-viewer
folio --app --docs E:\projects\ticket_ui
```

`--app` opens Folio in an Edge app window: no tabs, no address bar, its own taskbar entry. It looks for `msedge.exe` at its usual install paths (`%ProgramFiles(x86)%`, `%ProgramFiles%`, then a per-user install under `%LOCALAPPDATA%`) and starts it directly, with no shell. If Edge is not found, or this is not Windows, it opens your normal browser instead and prints one line saying so. From a clone, `npm run web -- --app --docs <path>` does the same.

For a Start menu or desktop entry, make a shortcut by hand (right-click the desktop > New > Shortcut) with the target

```
cmd /c folio --app --docs "E:\projects\ticket_ui"
```

and set **Run** to *Minimized* so the console window stays out of the way. If `folio` is not found from a shortcut, use the full path of `node.exe` and of the global package instead (`npm root -g` shows where it is):

```
"C:\Program Files\nodejs\node.exe" "%APPDATA%\npm\node_modules\folio-viewer\folio-web.mjs" --app --docs "E:\projects\ticket_ui"
```

Folio does not write the shortcut for you, on purpose: on a company machine, a Node program that spawns PowerShell to make `.lnk` files can look like malware. Closing the window does not stop the server; stop it with Ctrl+C in its console (or close the minimized console).

**On the company VM (or anywhere), in a browser tab.**

```
npx folio-viewer --docs <path>
```

[Web mode](#web-mode) below has the details.

## Web mode

Folio runs in a browser, from Node alone: on your own PC (see [Run it](#run-it)) and on a company VM that has Node.

```
npx folio-viewer --docs <path>
```

`<path>` is the repo root, or its docs folder (one with `modules/`, `handoffs/` or `patterns/`, or with a `map.md` or an `issues/` folder; the latter is read whole). Node 22 or newer is the only requirement. The command starts a server on `127.0.0.1`, prints a link whose token works once, and opens it in your default browser. To install it once instead: `npm install -g folio-viewer`, then `folio --docs <path>`. `--port <n>` picks the port (default: a random free one), `--app` opens an Edge app window instead of a tab (Windows; see [Run it](#run-it)), `--no-open` only prints the link, and without `--docs` the page asks for a path.

Stop it with Ctrl+C. Under `npx` on Windows the shell may then ask "Terminate batch job (Y/N)?": answer Y, that is fine.

Memory, measured on the fixtures: the server process is about 60 MB. With Edge already open, the whole thing adds about 92 MB, against about 165 MB for the desktop app (which carries its own WebView2).

What is the same as the retired desktop app: the tree, every view, the side panel, Mermaid, live refresh (edits, new files, deletes and renames show within a second), the index cache and `settings.json` (the same files, in the same places, as the desktop app, so an old desktop build can still read `settings.json`).

What is different from the desktop app:

- The folder is a path you type (first run and Settings), or `--docs`; there is no native dialog, so a network or device path (`\\server\share`) is always refused.
- External links open in a new browser tab (`http` and `https` only). "Open in VS Code" is a `vscode://` link; Edge asks once.
- No window bounds, no RAM readout, no "Open settings file".
- Only the browser that used the printed link can talk to the server: it listens on `127.0.0.1` only, accepts only `127.0.0.1:<port>` and `localhost:<port>` as the host, and wants a cookie it gets from the token in the link. Cross-site requests are refused. Images are served under `/doc/` with the same path rules as the desktop app.

For development, from the repo root: `npm run web -- --docs fixtures\docs` (or `task web -- --docs fixtures\docs`) builds what is stale and runs it. `task build` builds `packages/folio-viewer/` (`folio-web.mjs` plus `dist/`), the folder that gets published; run `npm pack` there to check the file list. The server is TypeScript under `frontend/src/server/`, with no dependencies. `task test` runs the frontend tests and the contract suite against the Node server. The Go services are frozen, but `task test:contract:go` (the same as `FOLIO_CONTRACT_GO=1 npm run test:contract`, needs Go) still runs every case against both and checks that the two report the same (`cmd/contract-server` is the Go side of that harness).

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
- **Appearance:** System, Light or Dark, and **Show memory use** (off by default; desktop app only, hidden in web mode).
- **Data:** **Clear data**, see [Clear data](#clear-data).
- **Open settings file** (desktop app only) opens `settings.json` in VS Code. It is plain JSON; unknown keys are kept.

The pane widths and the collapsed tree are saved there too (and, in the retired desktop app, the window position and size).

### Safety rules for settings and folders

- **`settings.json` is checked when it is loaded**, field by field. A field with the wrong type, an `http:` link template, a `..` or absolute `docsDir` or docs root, an unknown theme, or a network repo root falls back to its default and is logged (web mode prints it in the console; the retired exe was run as `bin\folio.exe > folio.log 2>&1` to see it). The rest of the file is kept. Only a file that is not a JSON object at all is moved aside to `settings.json.bad`.
- **A network or device path is not accepted as the repo root:** `\\server\share`, `\\?\...` and `\\.\...` make Windows talk SMB with your sign-in. In the retired exe, one you pick yourself in the folder dialog is allowed for that run, with a warning in the sidebar and in Settings; Folio forgets it when it closes, so you pick it again next time. Only the dialog (which Go runs) can grant that: typing a path, editing `settings.json` or setting `FOLIO_ROOT` cannot. Web mode has no dialog, so there it is always refused (map the share to a drive letter, or open a local copy).
- **Files over 5 MB are not read.** A `.md` larger than that stays in the tree, tagged "too large" with its size, and opening it says why. The check is a stat, so a huge file costs nothing.

### Clear data

**Settings > Data > Clear data** deletes the index cache (a copy of your ticket text) at once. In the retired exe it also deletes the WebView2 profile, but a running WebView2 locks that folder, so that part happens the next time Folio starts (the dialog says so). After a clear the cache is not written again until Folio restarts. `settings.json` and your tickets are never touched, and only Folio's own folders are ever deleted. In web mode there is no profile, so it is the cache only.

## Where Folio writes

Nothing in your tickets repo, ever. Everything else, in web mode and in the retired desktop app:

| What | Where | Written by |
| --- | --- | --- |
| Settings, plus the window bounds and pane widths | `%APPDATA%\Folio\settings.json` (and `settings.json.bad` if the file was not JSON; a temp `.settings-*.tmp` for an instant while saving) | web mode (and the desktop app) |
| Index cache: parsed ticket text and file stamps, plaintext | `%LOCALAPPDATA%\Folio\cache\<12 hex>.json`, one per docs folder | web mode (and the desktop app) |
| Clear data request | `%LOCALAPPDATA%\Folio\purge-profile.pending`, an empty note that makes the next start delete the profile | retired desktop app only |
| WebView2 profile: cookies, cache and local storage of the embedded browser | `%LOCALAPPDATA%\Folio\WebView2` (older builds: `%APPDATA%\folio.exe`) | retired desktop app only |
| The program | `%LOCALAPPDATA%\Programs\Folio` (per-user install) | desktop installer |

Web mode (`folio`, `npx folio-viewer`) writes only the first two rows (the same files, the same places, from Node). It has no WebView2 profile and starts no other process than your browser, which keeps its own data. On a non-Windows machine the settings file is under `~/.config/Folio` (or `$XDG_CONFIG_HOME`) and the cache under `~/.cache/Folio` (`$XDG_CACHE_HOME`).

## Develop

Needs Node 26 (with npm) for release builds and any supported Node for tests, and [task](https://taskfile.dev) (`winget install Task.Task`). No Go, no wails3.

```
task web -- --docs fixtures\docs   # build what is stale and run it (the same as npm run web -- ...)
task build                         # builds packages/folio-viewer (folio-web.mjs and dist/), then the size budgets (build:web is the old name)
task test                          # frontend and Node server tests, the contract suite against the Node server, size-check's self-test
task check                         # svelte-check
task test:contract:go              # also runs the frozen Go services through the contract suite (needs Go)
```

`task test` and `task check` copy the type-only Wails bindings from `frontend/bindings-frozen/` into `frontend/bindings/` when that folder is missing (`scripts/restore-bindings.mjs`), because the real ones are generated by `wails3` and the frontend still imports their types. A desktop build regenerates the real folder, and `restore-bindings` never overwrites it.

### Reproducible builds and releases

`task build` is meant to give the same bytes every time (ticket 17): `npm ci --ignore-scripts` (exactly `package-lock.json`, no dependency install scripts). **A matching hash needs the same Node patch as CI, 26.13.1** (`task build` only refuses a major other than 26; tests and checks run on any supported Node). The first local hashes in ticket 17 came from Node 26.7.0. The retired desktop build also pins Go and wails3; see [Retired: desktop app](#retired-desktop-app).

`.github/workflows/ci.yml` runs on `windows-2025` with every action pinned by commit SHA, and needs Node only (ticket 26 dropped Go, wails3 and the exe job): svelte-check, vitest, the contract tests against the Node server, the size budgets, `npm audit`, then the npm tarball plus `SHA256SUMS-npm`. The build job holds no signing permissions. Every run uploads the files as artifacts; a `v*` tag whose number matches `packages/folio-viewer/package.json` also creates a GitHub Release with the tarball and its checksum file (the release notes name the CI run), and, if the repo is public, a separate `attest` job signs a build-provenance attestation for the tarball. (Releases before ticket 26 also carried `folio.exe`.)

**Verify a downloaded package.** The checksum files only show that the file was not damaged or swapped in transit, and only if you get the hash from somewhere other than the download itself (the CI run page, or a message from the owner): `SHA256SUMS-npm` sits on the same release as the tarball, so anyone who can edit the release can replace both. The real provenance is the attestation (public repo only):

```
(Get-FileHash folio-viewer-0.1.0.tgz).Hash -eq ((Get-Content SHA256SUMS-npm) -split '\s+')[0]
gh attestation verify folio-viewer-0.1.0.tgz --repo <owner>/<repo> --source-ref refs/tags/v0.1.0 --signer-workflow <owner>/<repo>/.github/workflows/ci.yml
```

The first line prints `True` when the hash matches (the comparison is case-insensitive and reads the `hash *file` format). On a private repo there are no attestations (they need GitHub Enterprise Cloud), so the hash from the run page is all there is. For stronger release protection, turn on GitHub's immutable releases for the repo (Settings > General), so a published release's files and tag cannot be changed afterwards.

**Publishing the npm package** is manual and the owner's decision. For every update after 0.1.0, follow the release checklist in [docs/releasing.md](docs/releasing.md). The order matters (ticket 27; rules from docs.npmjs.com, Nov 20, 2026):

1. **0.1.0 is published by hand**, with the checksummed tarball from CI: `npm login`, `npm publish ./folio-viewer-0.1.0.tgz --dry-run`, then `npm publish ./folio-viewer-0.1.0.tgz`, then `npm logout`. A relative tarball path needs the `./` ([npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish)). It cannot be done by the workflow: npm only lets you add a trusted publisher to a package that already exists ([npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust)).
2. **Trusted publishing starts from 0.1.1**, through the `publish-npm` workflow (Actions tab, "Run workflow", on a `v*` tag). It only runs by hand, refuses a tag that is not on `main`, and publishes the tarball from the CI run of that same commit after checking its checksum and attestation. It uses npm trusted publishing (OIDC): there is no npm token anywhere. Right before the 0.1.1 release: make the repo public; in the repo's Settings > Environments create `npm-publish`, add yourself as a required reviewer and limit it to `v*` tags (the reviewer is the gate that holds even against someone with write access, so set it first); then on npmjs.com open the `folio-viewer` package settings and add a GitHub Actions trusted publisher (this repo, workflow `publish-npm.yml`, environment `npm-publish`) and **tick "npm publish"**: trusted publishers created after Sep 03, 2026 allow only `npm stage publish` by default, and the workflow runs `npm publish` ([trusted publishers](https://docs.npmjs.com/trusted-publishers)). npm needs CLI 11.5.1 or newer; Node 26 ships that.
3. **Publish within 2 days of adding the trusted publisher**, or it expires and has to be recreated (same page). After that, `npm audit signatures` on the installing side checks the provenance.


## Budgets

`task build` ends with `node scripts/size-check.mjs`, which checks the web bundle (`packages/folio-viewer/dist`) and fails the build above these caps (gzip, KB = 1000 bytes) and prints a table with the actual sizes:

| What | Cap |
|---|---|
| Initial JS: every chunk `index.html` loads or modulepreloads | 120 KB |
| CSS | 15 KB |
| Largest Mermaid diagram family, from the Vite manifest's import graph (KaTeX's add-on listed apart; ELK is stubbed out) | 450 KB (500 KB for architecture diagrams, which carry cytoscape) |
| highlight.js chunk | 25 KB |
| `bin\folio.exe` (only `task desktop:build`, which runs `size-check.mjs --desktop` on the retired desktop build) | 18 MiB |

Run it alone with `task size` (or `node scripts/size-check.mjs`; `node --test scripts/size-check.test.mjs` is its self-test). It needs `packages/folio-viewer/dist` and `frontend/.vite-web/manifest.json`, both written by `npm run build:web` in `frontend/` (`task build`). With `--desktop` it reads `frontend/dist` and `frontend/.vite/manifest.json` (written by the desktop build) and adds the exe.

## Retired: desktop app

**Frozen since ticket 26 (Nov 20, 2026).** The Go and Wails desktop app is not built, tested or released any more; Node web mode is the only backend. Nothing was deleted: the code, the installer script and their tests stay where they are. [RETIRED.md](RETIRED.md) says what is frozen, why, and how to build it again. The text below describes the app as it was and is kept as it was; every command carries the `desktop:` prefix, and it needs Go 1.27.4 and wails3 v3.1.0.

### Install

Folio installs for the current user only: no admin prompt, files in `%LOCALAPPDATA%\Programs\Folio`, one Start menu entry, and an uninstaller in Settings > Apps.

1. Get `folio-amd64-installer.exe` (build it with `task desktop:package`, see below, or take it from whoever built it) and run it.
2. Start Folio from the Start menu.

Needs Windows 10 or 11 with the WebView2 runtime (Windows 11 has it; the installer fetches it if it is missing). Uninstalling removes the program, its shortcut and the browser profile, and asks whether to delete the index cache and settings too (`%LOCALAPPDATA%\Folio` and `%APPDATA%\Folio`). A silent uninstall keeps them; **Settings > Data > Clear data** or deleting those folders does it by hand.

Without the installer, `bin\folio.exe` runs on its own after `task desktop:build`.

### Stack

- **Wails v3.1.0** (Go backend, WebView2 frontend, Windows only). Go stats, reads and watches files and exposes them as typed services; Wails generates the TypeScript bindings.
- **Svelte 5 + Tailwind v4**, built with Vite. Indigo theme, light and dark.
- **The parser is TypeScript** with no DOM or Svelte imports (`frontend/src/lib/parser`), so it can move into another repo as a plain module. Go does no parsing.
- **fsnotify** for watching.

Very low RAM is the priority. Electron and React were ruled out; see [docs/map.md](docs/map.md).

### Prerequisites

| Tool | Version |
|---|---|
| Go | 1.27 |
| Node | 26 (with npm) |
| wails3 | v3.1.0: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0` (`task desktop:tools:install`) |
| task (go-task) | 3.x: `winget install Task.Task` |

To run the built exe you only need the WebView2 runtime, which Windows 11 already has. `wails3 doctor` checks the rest. A C compiler is not needed.

### Commands

```
task desktop:dev           # Vite hot reload + Go rebuild
task desktop:build         # production exe in bin\folio.exe (regenerates the TS bindings first), then the size check with the exe budget
task desktop:build:bench   # bin\folio-bench.exe: the same plus the RAM bench hook, for task desktop:ram only
task desktop:test          # go test ./... and vitest
task desktop:check         # go vet, regenerate bindings, svelte-check
task desktop:run           # run bin\folio.exe
task desktop:package       # the NSIS installer
```

`FOLIO_ROOT` is a dev override that skips the folder picker. It takes the docs folder (or a repo root) and is never written to settings:

```
set FOLIO_ROOT=E:\projects\ticket_ui\fixtures\docs
bin\folio.exe
```

### Memory readout

The bottom of the tree shows one muted figure, for example `165 MB`: the private bytes of Folio plus its WebView2 processes, summed the way `scripts/ram-check.ps1` does it, so the two agree (Task Manager's Memory column is a different measure, which the tooltip says). Go measures (`internal/mem`) and only sends a number when it moved by 1 MB or more since the last one it sent. It polls every 5 s, re-reading just the known processes and listing every process on the machine once a minute to find new children, and it pauses while the window is minimised or hidden. It is **off by default**, because listing processes can trip endpoint-security heuristics; switch it on with **Show memory use** in Settings (`showMemory` in `settings.json`). While it is off nothing is polled, and no goroutine or timer exists. The readout is also off while the tree is hidden or collapsed.

Packaging needs **NSIS 3** (`makensis` on PATH): `winget install NSIS.NSIS`, then open a new shell. `task desktop:package` builds the exe, fetches the WebView2 bootstrapper through `wails3 generate webview2bootstrapper`, and runs `makensis` on `build/windows/nsis/project.nsi`. It installs per user by default; `task desktop:package INSTALL_SCOPE=machine` makes an all-users (admin) installer. The OFL licence for the embedded Geist fonts is installed next to the exe, in `licenses\`.

**Verify an exe from an older release.** The same checks apply to `folio.exe` and its `SHA256SUMS`:

```
(Get-FileHash folio.exe).Hash -eq ((Get-Content SHA256SUMS) -split '\s+')[0]
gh attestation verify folio.exe --repo <owner>/<repo> --source-ref refs/tags/v0.1.0 --signer-workflow <owner>/<repo>/.github/workflows/ci.yml
```

`go version -m folio.exe` lists `-tags=production`, `-trimpath=true` and the linked modules (Folio, wails v3.1.0, fsnotify, go-ole, x/sys).

Notes:

- `frontend/bindings/` is generated, not committed. `task desktop:build` and `task desktop:check` regenerate it (`task test` and `task check` restore a frozen copy when it is missing). Run one of them (or `wails3 generate bindings -clean=true -ts -i`) before opening the frontend in an editor or running `svelte-check` by hand.
- `main.go` embeds `frontend/dist`. On a fresh clone, `task desktop:test` and `task desktop:check` create an empty `dist` first; a bare `go vet ./...` needs `task desktop:build` (or an empty `frontend/dist`) first.
- The exe has no console. To see the logs, start it from a shell with output redirected: `bin\folio.exe > folio.log 2>&1`.

### Desktop budgets

The exe budget (18 MiB) runs only from `task desktop:build`.

RAM, where **B** is the idle, indexed process-tree private memory (about 169 MB): two documents open at most B + 15 MB, after a Mermaid document at most B + 45 MB, 50 different documents at most B + 30 MB, and a second pass over 50 other documents must not grow it by more than 5 MB (the leak check). `task desktop:ram` (`scripts/ram-check.ps1`) launches `bin\folio-bench.exe` (build it with `task desktop:build:bench`) on `fixtures\docs` with a throw-away `%APPDATA%`, sums private bytes and working set over `folio.exe` and every `msedgewebview2.exe` descendant after 30 s idle, three runs per case, and prints medians plus idle CPU with a pulsing status pill on screen. It drives the UI through a dev-only hook, `FOLIO_BENCH=1` with `FOLIO_BENCH_DIR` (see `internal/shell/bench.go`): off unless both are set, no listener, one polled command file. The hook sits behind the `bench` build tag, so the shipped `bin\folio.exe` contains none of it (the bench exe is a separate build). Close other WebView2 apps first for a quieter machine, and do not run builds while it runs. The numbers from the last full run are in [docs/issues/15-budgets-and-packaging.md](docs/issues/15-budgets-and-packaging.md).

## Layout

```
main.go                  (frozen) desktop app wiring: window "Folio", service registration, WebView2 flags
Taskfile.yml             web, build, test, check, size; the desktop: tasks for the frozen app
RETIRED.md               what is frozen, why, and how to build the desktop app again
internal/docs/           (frozen) DocsService: Scan, ReadBatch, ReadFile, the watcher, the index cache
internal/shell/          (frozen) ShellService: config, folder picker, CheckRoot, open in VS Code, asset middleware, bench hook
internal/settings/       (frozen) settings.json: load, validate, atomic save
internal/mem/            (frozen) the RAM readout: process-tree private bytes, polling, pause
cmd/contract-server/     (frozen) test harness: the Go services behind the web-mode HTTP API (FOLIO_CONTRACT_GO=1)
packages/folio-viewer/   the npm package (web mode): package.json, LICENSE; folio-web.mjs and dist/ are built
scripts/                 size-check.mjs (+ test), restore-bindings.mjs, web.mjs, ram-check.ps1 (desktop)
build/                   (frozen) Wails build files (Windows only), the NSIS installer script
frontend/
  src/App.svelte         three-pane shell: top bar, tree, document
  src/components/        Tree, DocView
  src/lib/api.ts         thin wrapper over the backend (lib/backend.ts picks Wails or HTTP)
  src/server/            web mode: the zero-dependency Node server and CLI
  contract/              the contract suite (Node; Go too with FOLIO_CONTRACT_GO=1)
  bindings-frozen/       snapshot of the generated Wails bindings (types for svelte-check without Go)
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
