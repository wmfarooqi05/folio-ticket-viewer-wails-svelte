# Folio

Folio is a read-only desktop viewer for file-based tickets: markdown files with a small frontmatter convention, kept in a repo under `docs/modules/`, `docs/handoffs/` and `docs/patterns/`. It shows the tree, the status of each ticket, and (as the slices land) boards, a dependency graph, waiting-on and open-question views. It never writes to a ticket. The only file it writes is its own `%APPDATA%\Folio\settings.json`.

Folio is lightweight on purpose: idle RAM is the priority (about 160 MB private for the whole process tree, WebView2 included), the exe is about 14 MiB, and a ticket 15 check keeps it that way (see [Budgets](#budgets)).

## Install

Folio installs for the current user only: no admin prompt, files in `%LOCALAPPDATA%\Programs\Folio`, one Start menu entry, and an uninstaller in Settings > Apps.

1. Get `folio-amd64-installer.exe` (build it with `task package`, see below, or take it from whoever built it) and run it.
2. Start Folio from the Start menu.

Needs Windows 10 or 11 with the WebView2 runtime (Windows 11 has it; the installer fetches it if it is missing). Uninstalling removes the program and its shortcut and leaves your settings and index cache alone (`%APPDATA%\Folio` and `%LOCALAPPDATA%\Folio`); delete those folders by hand for a clean slate.

Without the installer, `binolio.exe` runs on its own after `task build`.

## First run

1. The first launch shows a **Choose folder** screen. Pick the **repo root**, the folder that contains `docs/` (not `docs/` itself). Folio checks that `docs/modules`, `docs/handoffs` and `docs/patterns` can be found and shows what it found.
2. Folio scans the folder, builds an index, and shows the tree. The index is cached under `%LOCALAPPDATA%\Folio\cache`, so the next start is quick, and the tree stays live: edits, new files and deletions show up within a second or two.
3. Folio never writes to your tickets. The only file it writes is `%APPDATA%\Folio\settings.json` (and the disposable cache).

## Using it

- Click a ticket in the tree to read it. Links between tickets open in the side panel; Ctrl-click opens one in the middle pane instead.
- `[` hides or shows the tree, `]` hides or shows the side panel, Esc closes the panel, Alt+Left goes back inside it.
- The pinned views at the top of the tree (Waiting on, Open questions) and each module's map (list, board, graph) cut across the tickets.
- **Resizable panes:** drag the divider between the tree and the document, or between the document and the side panel. Widths are remembered. Double-click a divider to reset it.
- **Change folder:** the button at the bottom of the tree opens the folder picker again; Folio rescans the new folder.

## Settings

Open them with the gear in the header or Ctrl+,. The dialog has three sections; Save stays disabled until something changes, Esc closes, Enter saves.

- **Docs folder:** the repo root (with the picker), the docs folder name (default `docs`), and the docs roots to index (default `modules`, `handoffs`, `patterns`), with "found/missing" chips and the last scan time.
- **Links:** the Azure DevOps work item and pull request URL templates (`https://` with an `{id}`), with a live preview.
- **Appearance:** System, Light or Dark.
- **Open settings file** opens `settings.json` in VS Code. It is plain JSON; unknown keys are kept.

Window position and size, the pane widths and the collapsed tree are saved there too.

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
task test                # go test ./... and vitest
task check               # go vet, regenerate bindings, svelte-check
task run                 # run bin\folio.exe
```

`FOLIO_ROOT` is a dev override that skips the folder picker. It takes the docs folder (or a repo root) and is never written to settings:

```
set FOLIO_ROOT=E:\projects\ticket_ui\fixtures\docs
bin\folio.exe
```

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
| CSS | 25 KB |
| Largest Mermaid diagram family, from the Vite manifest's import graph (KaTeX's add-on listed apart; ELK is stubbed out) | 450 KB (500 KB for architecture diagrams, which carry cytoscape) |
| highlight.js chunk | 25 KB |
| `binolio.exe` | 20 MiB |

Run it alone with `task size` (or `node scripts/size-check.mjs`; `node --test scripts` is its self-test). It needs `frontend/dist` and `frontend/.vite/manifest.json`, both written by `npm run build` in `frontend/`.

RAM, where **B** is the idle, indexed process-tree private memory (about 160 to 180 MB): two documents open at most B + 15 MB, after a Mermaid document at most B + 45 MB, and opening 50 documents in a row must not drift by more than 5 MB. `task ram` (`scripts/ram-check.ps1`) launches `binolio.exe` on `fixtures\docs` with a throw-away `%APPDATA%`, sums private bytes and working set over `folio.exe` and every `msedgewebview2.exe` descendant after 30 s idle, three runs per case, and prints medians plus idle CPU with a pulsing status pill on screen. It drives the UI through a dev-only hook, `FOLIO_BENCH=1` with `FOLIO_BENCH_DIR` (see `internal/shell/bench.go`): off unless both are set, no listener, one polled command file. Close other WebView2 apps first for a quieter machine, and do not run builds while it runs. The numbers from the last full run are in [docs/issues/15-budgets-and-packaging.md](docs/issues/15-budgets-and-packaging.md).

## Layout

```
main.go                  app wiring: window "Folio", service registration, WebView2 flags
Taskfile.yml             dev, build (with the size check), test, check, size, ram, package
internal/docs/           DocsService: Scan, ReadBatch, ReadFile, the watcher, the index cache
internal/shell/          ShellService: config, folder picker, CheckRoot, open in VS Code, asset middleware, bench hook
internal/settings/       settings.json: load, validate, atomic save
scripts/                 size-check.mjs (+ test) and ram-check.ps1
build/                   Wails build files (Windows only), the NSIS installer script
frontend/
  src/App.svelte         three-pane shell: top bar, tree, document
  src/components/        Tree, DocView
  src/lib/api.ts         thin wrapper over the generated bindings
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
