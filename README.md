# Folio

Folio is a read-only desktop viewer for file-based tickets: markdown files with a small frontmatter convention, kept in a repo under `docs/modules/`, `docs/handoffs/` and `docs/patterns/`. It shows the tree, the status of each ticket, and (as the slices land) boards, a dependency graph, waiting-on and open-question views. It never writes to a ticket. The only file it writes is its own `%APPDATA%\Folio\settings.json`.

Status: a walking skeleton. One thin path works end to end: launch, choose a folder, scan, read, build a trivial index, list the files, show one file's raw text. The parser, cache, watching, rendering and the rest of the UI are specified in `docs/` and come in later slices.

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

Notes:

- `frontend/bindings/` is generated, not committed. `task build` and `task check` regenerate it. Run one of them (or `wails3 generate bindings -clean=true -ts -i`) before opening the frontend in an editor or running `svelte-check` by hand.
- `main.go` embeds `frontend/dist`. On a fresh clone, `task test` and `task check` create an empty `dist` first; a bare `go vet ./...` needs `task build` (or an empty `frontend/dist`) first.
- The exe has no console. To see the logs, start it from a shell with output redirected: `bin\folio.exe > folio.log 2>&1`.

## Layout

```
main.go                  app wiring: window "Folio", service registration
Taskfile.yml             dev, build, test, check
internal/docs/           DocsService: Scan, ReadBatch, ReadFile, the watcher; cache methods are stubs
internal/shell/          ShellService: config, folder picker, CheckRoot, open in VS Code
internal/settings/       settings.json: load, validate, atomic save
build/                   Wails build files (Windows only)
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
