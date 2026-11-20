---
type: build
status: blocked
status_note: "merged Nov 20, 2026; waiting on the owner: AC3 by eye (folio --app --docs E:\projects\ticket_ui)"
waiting_on: owner
blocked_by: []
blocked_note: null
related: ["15", "16", "17", "18", "24", "25"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 26 — Retire the Go desktop app, keep the code

## Why

Folio has two backends doing the same job: Go behind the Wails desktop exe, and Node behind web mode (24). Every rule is written twice and a contract suite keeps them equal. In tickets 18 and 25 nearly every fix and review finding had to be made in both, and some bugs came from the two drifting apart.

The exe only exists because it came first. Web mode already serves the company VM, works on the owner's PC too, and uses less memory: about 92 MB in total with Edge already open, against about 165 MB for the desktop app.

Decided Nov 20, 2026 (owner): retire the Go desktop app and keep Node as the only backend. **No code is deleted.** The Go code, Wails config, installer script and their tests stay in the repo where they are, frozen.

## To do

- [x] **Freeze, don't delete.** Leave every Go file, `go.mod`, `build/`, the NSIS script, `cmd/contract-server` and `frontend/src/lib/backend-wails.ts` in place and unchanged, except where a change is needed to keep the web build and tests green.
  - Add a short `RETIRED.md` at the root saying what is frozen, why, and how to build it again if ever wanted.
  - Add a one-line comment at the top of `main.go`.
- [x] **Web mode becomes the default.**
  - `npm run web` and `task web` are the main way to run Folio.
  - Keep the desktop tasks, renamed under a `desktop:` prefix (`desktop:build`, `desktop:dev`, `desktop:package`, `desktop:ram`), so nothing is lost. Make `task build` build the web package.
  - `task test` runs the frontend and Node server tests only.
- [x] **An app window on the owner's PC.** Add `--app` to the Node CLI. It opens the tokenised URL in an Edge app window (`msedge --app=<url>`, no tabs or address bar), and falls back to the default browser if Edge isn't found.
  - Find Edge without a shell: use the known install paths, then `where`-free checks. Pass the URL as a single argument, never through a shell.
  - Document a Start-menu or desktop shortcut that runs `folio --app --docs <path>`.
  - Don't add a command that writes `.lnk` files. On the company VM, spawning PowerShell from Node could look suspicious.
- [x] **The contract suite** keeps its cases and runs them against the Node server only, by default. The Go side stays runnable behind a flag or an env var (`FOLIO_CONTRACT_GO=1`) and is not in CI.
- [x] **CI** (`.github/workflows/ci.yml`):
  - Drop the exe job, `go test`, `go vet`, `govulncheck`, the bindings step and the wails3 install.
  - Keep vitest, svelte-check, the contract suite (Node), `npm audit`, the npm package build with its checksum, the release and the attestation, for the tarball only.
  - `publish-npm.yml` stays as it is.
- [x] **Size budgets.** `scripts/size-check.mjs` checks the web bundle; the exe budget only runs from `desktop:build`. The initial-JS, CSS, Mermaid and highlight.js budgets stay.
- [x] **Desktop-only UI and settings.** In web mode these are already hidden or ignored: window bounds, the RAM readout and "Open settings file". Leave them alone. `settings.json` stays compatible, so an old desktop build can still read it.
- [x] **README.** Lead with web mode on the PC and on the VM. Move the desktop sections under a "Retired: desktop app" heading. Remove nothing; mark it frozen.
- [x] **Ticket statuses.** On merge, the desktop-only owner checks in 15, 16, 18 and 25 are no longer needed. Set the frontmatter of each and say why:
  - 15 and 16: `superseded_by: "26"`.
  - 18 and 25: `status_note`.

## Done when

- <a id="ac1"></a>**AC1** — `git diff --stat` for this ticket shows no deleted file, and no Go file changed apart from the comment in `main.go`.
- <a id="ac2"></a>**AC2** — `task build` and `task test` succeed on a machine with Node only (no Go, no wails3), and CI no longer needs Go.
- <a id="ac3"></a>**AC3** — `folio --app --docs E:\projects\ticket_ui` opens Folio in an Edge app window, with the tree, map, Waiting on and Open questions working.
- <a id="ac4"></a>**AC4** — `task desktop:build` still builds the exe from the frozen code, checked once.

## Outcome

Built on branch `worktree-agent-a668f473dce493b5f`. Nothing was deleted and no Go file changed except the comment at the top of `main.go`.

- **Frozen, not deleted.** All Go code, `build/`, the NSIS script, `cmd/contract-server` and `backend-wails.ts` stay where they are. [RETIRED.md](../../RETIRED.md) says what is frozen, why, and how to build it again (`task desktop:build`; Go 1.27.4 and wails3 v3.1.0). Two small non-Go edits keep the desktop tasks working under their new names: `build/config.yml` (`wails3 task desktop:build` and `desktop:run`) and a message in `build/Taskfile.yml`.
- **Tasks.** `task build` builds the web package and then checks the size budgets (`build:web` is an alias); `task test` runs vitest, the contract suite against Node only, and size-check's self-test; `task check` is svelte-check. The desktop tasks are `desktop:build`, `desktop:dev`, `desktop:package`, `desktop:ram`, `desktop:check`, `desktop:test`, `desktop:run`, `desktop:build:bench`, `desktop:size` and `desktop:tools:install`, unchanged in behaviour. The Node 26 check from ticket 17 stays on the release builds.
- **Bindings without Go.** `svelte-check` and some tests import the types and modules that `wails3` generates, so a Node-only machine could not pass them. `frontend/bindings-frozen/` is a byte-identical snapshot of what wails3 v3.1.0 generates today (checked with `diff -r` after `task desktop:build`), and `scripts/restore-bindings.mjs` copies it to `frontend/bindings/` only when that folder is missing. `task test`, `task check` and CI run it first.
- **`--app`.** `folio --app` starts `msedge.exe --app=<url>`, found at `%ProgramFiles(x86)%`, `%ProgramFiles%` and `%LOCALAPPDATA%` (in that order), with `spawn(exe, ['--app=' + url], { detached, stdio: 'ignore', shell: false })` and `unref`. Only a URL that passes the existing `isSafeUrl` check is used. On a non-Windows system, with no Edge, or on a failed start it falls back to the normal opener and prints one line. New tests inject spawn, the existence check, the platform and the browser opener, so Edge is never started in tests. The shortcut is documented (`cmd /c folio --app --docs "<path>"`, or the full `node.exe` path); no command writes a `.lnk`.
- **Size check.** `node scripts/size-check.mjs` checks the web bundle (`packages/folio-viewer/dist`, manifest in `frontend/.vite-web/`, written by the web build and kept out of the published `dist/`). `--desktop` checks `frontend/dist` plus the exe budget and is what `task desktop:build` runs. All web budgets are unchanged. Initial JS on the web bundle is 104.2 KB (cap 120).
- **Contract suite.** Node only by default. `FOLIO_CONTRACT_GO=1` (or `task test:contract:go`) also runs the Go side and the cross-backend equality checks; it fails loudly if Go is missing. Every case is kept: 37 pass and 18 cross-backend cases skip on Node only; 92 pass with Go.
- **CI.** Node only. Dropped the exe job, `go test`, `go vet`, `govulncheck`, the bindings step and the wails3 and task installs, and the `GO_*`, `WAILS_*` and `TASK_*` env. Kept svelte-check, vitest, the contract suite (Node), the size self-test, `npm audit`, the npm package build (`npm run build:web`, then size-check, then `npm pack` with its checksum), the release and the attestation, both for the tarball only. Every action keeps its SHA pin. `actionlint` v1.7.12 is clean. `publish-npm.yml` is unchanged (it never referred to the removed jobs).
- **README** leads with web mode on the PC (`folio --app`) and on the VM (`npx folio-viewer --docs <path>`). The desktop sections moved under "Retired: desktop app" with their text, minus what became false (task names, the exe in CI and the release).
- **Tickets 15, 16, 18 and 25.** 15 and 16: `status: superseded`, `superseded_by: "26"`, `waiting_on: null`, with a note. 18: `status: done`, `waiting_on: null`, with a note, since all its remaining hand checks were desktop-only. 25: `status_note` only; the web-mode check stays with the owner. `docs/map.md` is not touched.

Checked in the worktree: AC1, AC2 and AC4, and the `--app` launch (an msedge process started with `--app=http://127.0.0.1:...` against fixtures/docs). AC3 by eye is still the owner's: `folio --app --docs E:\projects\ticket_ui` with the tree, map, Waiting on and Open questions.

**Left open.** AC3 by eye. Closing the app window does not stop the server (Ctrl+C in its console does).
