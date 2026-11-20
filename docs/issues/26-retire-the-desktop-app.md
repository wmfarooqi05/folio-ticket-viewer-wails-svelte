---
type: build
status: in-progress
status_note: null
waiting_on: null
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

- [ ] **Freeze, don't delete.** Leave every Go file, `go.mod`, `build/`, the NSIS script, `cmd/contract-server` and `frontend/src/lib/backend-wails.ts` in place and unchanged, except where a change is needed to keep the web build and tests green.
  - Add a short `RETIRED.md` at the root saying what is frozen, why, and how to build it again if ever wanted.
  - Add a one-line comment at the top of `main.go`.
- [ ] **Web mode becomes the default.**
  - `npm run web` and `task web` are the main way to run Folio.
  - Keep the desktop tasks, renamed under a `desktop:` prefix (`desktop:build`, `desktop:dev`, `desktop:package`, `desktop:ram`), so nothing is lost. Make `task build` build the web package.
  - `task test` runs the frontend and Node server tests only.
- [ ] **An app window on the owner's PC.** Add `--app` to the Node CLI. It opens the tokenised URL in an Edge app window (`msedge --app=<url>`, no tabs or address bar), and falls back to the default browser if Edge isn't found.
  - Find Edge without a shell: use the known install paths, then `where`-free checks. Pass the URL as a single argument, never through a shell.
  - Document a Start-menu or desktop shortcut that runs `folio --app --docs <path>`.
  - Don't add a command that writes `.lnk` files. On the company VM, spawning PowerShell from Node could look suspicious.
- [ ] **The contract suite** keeps its cases and runs them against the Node server only, by default. The Go side stays runnable behind a flag or an env var (`FOLIO_CONTRACT_GO=1`) and is not in CI.
- [ ] **CI** (`.github/workflows/ci.yml`):
  - Drop the exe job, `go test`, `go vet`, `govulncheck`, the bindings step and the wails3 install.
  - Keep vitest, svelte-check, the contract suite (Node), `npm audit`, the npm package build with its checksum, the release and the attestation, for the tarball only.
  - `publish-npm.yml` stays as it is.
- [ ] **Size budgets.** `scripts/size-check.mjs` checks the web bundle; the exe budget only runs from `desktop:build`. The initial-JS, CSS, Mermaid and highlight.js budgets stay.
- [ ] **Desktop-only UI and settings.** In web mode these are already hidden or ignored: window bounds, the RAM readout and "Open settings file". Leave them alone. `settings.json` stays compatible, so an old desktop build can still read it.
- [ ] **README.** Lead with web mode on the PC and on the VM. Move the desktop sections under a "Retired: desktop app" heading. Remove nothing; mark it frozen.
- [ ] **Ticket statuses.** On merge, the desktop-only owner checks in 15, 16, 18 and 25 are no longer needed. Set the frontmatter of each and say why:
  - 15 and 16: `superseded_by: "26"`.
  - 18 and 25: `status_note`.

## Done when

- <a id="ac1"></a>**AC1** — `git diff --stat` for this ticket shows no deleted file, and no Go file changed apart from the comment in `main.go`.
- <a id="ac2"></a>**AC2** — `task build` and `task test` succeed on a machine with Node only (no Go, no wails3), and CI no longer needs Go.
- <a id="ac3"></a>**AC3** — `folio --app --docs E:\projects\ticket_ui` opens Folio in an Edge app window, with the tree, map, Waiting on and Open questions working.
- <a id="ac4"></a>**AC4** — `task desktop:build` still builds the exe from the frozen code, checked once.

## Outcome

*(empty)*
