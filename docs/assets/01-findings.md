# Ticket 01 findings: Wails v3 + Svelte 5 + Tailwind shell

Nov 19, 2026. The prototype is built and runnable. The exe is `bin\shell.exe`; set `TICKET_ROOT` to auto-load a folder.

## Acceptance criteria

- **AC1, pass.** The production build lists the .md files, with a count and mtimes.
  - Change events reach the UI: Go logged `file:changed … (WRITE)`, and the Svelte handler confirmed receiving it.
  - A new directory plus a new file was detected. The file was created 1 second after the directory.
- **AC2, pass.** Idle RAM is measured below. The Chrome-tab comparison was not measured.
- **AC3, pass.** Versions are pinned. Svelte 5 and Tailwind v4 build with Wails v3, with no blocking issue. No Preact comparison was needed.

## Pinned versions

| Tool | Version |
|---|---|
| Wails v3 CLI and library | **v3.1.0** (a stable tag, not alpha), @wailsio/runtime 3.1.0 |
| Go | 1.27.4 (the template's go.mod says 1.26.0) |
| Node / npm | 26.7.0 / 11.19.0 |
| Svelte | 5.58.0 (the template ships Svelte 5) |
| Tailwind, @tailwindcss/vite | 4.3.5 |
| Vite / TypeScript | 8.3.8 / 5.9.3 |
| fsnotify | v1.10.1 |
| Task (go-task) | 3.54.0 |
| WebView2 runtime | 157.0.4341.60 |

## Install commands that worked

- `winget install --id Task.Task -e --accept-source-agreements --accept-package-agreements`
- **Go:**
  - `winget install GoLang.Go` hung on elevation, and a retry failed with MSI error 1618.
  - What worked: `curl -sL -o go.zip https://go.dev/dl/go1.27.4.windows-amd64.zip`, unzipped to `E:\tools\go`.
  - `Invoke-WebRequest` was cut off by the server on the same download.
- `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`
- `wails3 init -n shell -t svelte -d <dir>`
- `npm i -D tailwindcss @tailwindcss/vite`
- `go get github.com/fsnotify/fsnotify`
- `wails3 generate bindings -ts`
- `task build PRODUCTION=true`
- `wails3 doctor` reports no issues.
  - CGO is 0, so no C compiler is needed.
  - NSIS, MSIX and the Windows SDK are absent. They matter only for installers.
- PATH was stale after the installs, so tools were called by full path.

To build, the owner needs Go, Node and npm, `wails3` and `task`. To run, the exe needs only WebView2, which Windows 11 already has.

## Measurements

Production build. The test data is 35 modules and 428 .md files of about 3.5 KB each, with nested `step2b-x/issues/`.

| Measure | Result |
|---|---|
| Walk and list of 428 files | 6.3 to 6.5 ms |
| Recursive watcher registration | 15.7 to 16.8 ms |
| Binary size | 10.15 MiB |

Idle RAM is the app plus all 6 descendant msedgewebview2.exe processes, taken after about 30 s idle. Private bytes is commit charge.

| State | Working Set total | Private total | Go process alone (WS / Private) |
|---|---|---|---|
| Baseline, no folder | 397.4 MB | 211.2 MB | 30.9 / 51.1 MB |
| Indexed, run 1 | 430.2 MB | 241.7 MB | 38.5 / 58.6 MB |
| Indexed, run 2 | 422.5 MB | 241.1 MB | 36.8 / 58.6 MB |
| After change events | 440.4 MB | 248.7 MB | 38.6 / 58.6 MB |

Per-process WS / Private (MB) at baseline: shell 30.9 / 51.1; WebView2 processes 119.5 / 34.4, 21.5 / 3.5, 100.5 / 79.0, 40.0 / 12.2, 23.0 / 7.7, 62.0 / 23.3.

- The WebView2 processes are about 90% of the total. The frontend framework is noise.
- Working Set double-counts pages shared between processes. Private bytes is the better "cost" figure.
- About 20 other apps' WebView2 processes were running, and shared memory may make these numbers look lower than on a clean machine.
- WebView2 memory flags were not tried.

## Bindings and events

- `FileService` is registered with `application.NewService(&FileService{})`. It generates typed TS in `frontend/bindings/shellproto/`, and calls worked first try.
- `application.RegisterEvent[string]("file:changed")` generates typed event helpers. Go emits with `app.Event.Emit`, and Svelte listens with `Events.On`.
- fsnotify is not recursive. `Watch` adds every directory and new ones on Create, and skips `node_modules` and dot-folders.

## Rough edges

- `wails3 init -d` nests the folder one level deeper.
- The template module is named `changeme`, and the binding path follows it. Rename it.
- The template ships demo assets (JPEGs, a font, large CSS) that need deleting.
- The template's `.npmrc` gives a harmless warning, `minimum-release-age`.
- There is no debounce, so one save can fire two events.
- A file created in the same instant as its new directory could be missed.

## Not verified

- RAM against a Chrome tab.
- Clicking the native folder picker. It is bound but untested; `TICKET_ROOT` was used instead.
- Tailwind rendering, checked visually. The classes are present in the built CSS.
- `wails3 dev`.
- Load with thousands of files, or heavy rename churn.
- Config persistence.
- Installer packaging.
