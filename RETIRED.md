# The Go desktop app is retired

Decided Nov 20, 2026 ([ticket 26](docs/issues/26-retire-the-desktop-app.md)). Folio now has one backend: the Node server behind web mode (`folio`, `npx folio-issues-kanban-viewer`). Nothing was deleted.

## What is frozen

Left in place and not changed, except for a one-line comment at the top of `main.go`:

- All the Go code: `main.go`, `origin_dev.go`, `origin_production.go`, `internal/` (docs, shell, settings, mem, localdata), `go.mod`, `go.sum` and their tests.
- `cmd/contract-server`, the Go side of the contract suite.
- The Wails config and build files in `build/`, including the NSIS installer script (`build/windows/nsis`).
- `frontend/src/lib/backend-wails.ts`, the desktop backend (the web build swaps it for `backend-http.ts`).
- `frontend/bindings-frozen/`, a snapshot of the bindings `wails3` generated from this Go code. It exists so `svelte-check` and the tests can run without Go (`scripts/restore-bindings.mjs` copies it to `frontend/bindings/` when that is missing).
- `scripts/ram-check.ps1`, the RAM benchmark of the exe.

Small edits made for the retirement, so the desktop tasks keep working under their new names: `build/config.yml` calls `desktop:build` and `desktop:run`, and a message in `build/Taskfile.yml` names `desktop:tools:install`.

The desktop-only UI and settings stay as they were (window bounds, the RAM readout, "Open settings file"). Web mode already hides or ignores them. `settings.json` stays compatible, so an old desktop build can still read the file web mode writes.

## Why

Two backends did the same job. Every rule was written twice (Go and Node) and a contract suite kept them equal. In tickets 18 and 25 nearly every fix and review finding had to be made in both, and some bugs came from the two drifting apart. Web mode also serves the company VM, works on the owner's PC (`folio --app` gives an Edge app window with no tabs), and uses less memory: about 92 MB in total with Edge already open, against about 165 MB for the desktop app.

## What no longer happens

- CI (`.github/workflows/ci.yml`) does not install or run Go or wails3, does not build `folio.exe`, and the release carries the npm tarball only.
- `task build` and `task test` build and test the web package only. The Go tests, `go vet` and `govulncheck` are not run.
- The contract suite runs against the Node server only, unless `FOLIO_CONTRACT_GO=1` is set (`task test:contract:go`).

## How to build it again

You need Go 1.27.4, wails3 v3.1.0 (`task desktop:tools:install`), Node 26 and [task](https://taskfile.dev). Windows only.

```
task desktop:build        # bin\folio.exe, then the size budgets including the exe (18 MiB)
task desktop:package      # the NSIS installer (needs NSIS 3 on PATH)
task desktop:dev          # hot reload
task desktop:test         # go test ./... and the frontend tests
task desktop:check        # go vet, regenerate the bindings, svelte-check
task desktop:ram          # the RAM benchmark (build it first with task desktop:build:bench)
task test:contract:go     # the contract suite against Node and the Go services, with the cross-backend checks
```

The README section "Retired: desktop app" keeps the full desktop documentation (install, settings, memory readout, installer, benchmarks). Tickets 15 and 16 describe the installer and the WebView2 hardening.

If Go code is ever changed again, run `task test:contract:go` so the two backends stay equal.

After any change to the Go services, also copy `frontend/bindings` over `frontend/bindings-frozen` (`task desktop:build` and `task desktop:check` fail with "refresh bindings-frozen" when they differ).
