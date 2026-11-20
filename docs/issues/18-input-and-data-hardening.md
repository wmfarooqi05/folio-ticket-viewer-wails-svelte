---
type: build
status: in-progress
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["13", "16", "19"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 18 — Input and data hardening

## Why

The low-severity findings in [16-security-assessment.md](../assets/16-security-assessment.md). Each is small, but together they close the ways a hand-edited settings file, a huge file or a network path could make Folio misbehave, and they make Folio's local data easy to explain to IT and easy to remove.

## To do

- [x] **Validate settings on load (L2).** Run the same validation as `SetConfig` when `settings.json` is read; fall back to defaults field by field, and log what was rejected.
- [x] **Reject network and device paths as the repo root (L2):** UNC (`\\host\share`), `\\?\` and `\\.\`. A UNC root makes Folio do SMB with the user's NTLM credentials. Allow it only if the user picks it explicitly in the folder dialog, with a warning.
- [x] **Per-file size cap (L6):** skip `.md` files over about 5 MB in `ReadBatch`, and show them in the tree as too large.
- [x] **Clear data (L5):** a Settings action that deletes the index cache and the WebView2 profile, and an uninstaller option to do the same. Document every location Folio writes in the README.
- [x] **RAM readout off by default (L1)** for the company build, since process enumeration can trip endpoint-security heuristics. It stays available in Settings.
- [x] **Bench hook behind a build tag (L3, optional).** Build a separate bench exe for `scripts/ram-check.ps1`, so the shipped exe has no bench code at all.

## Done when

- <a id="ac1"></a>**AC1** — Go tests show a hand-edited `settings.json` with an `http:` template, `..` in `docsDir` or a UNC root is corrected or rejected on load.
- <a id="ac2"></a>**AC2** — A 10 MB `.md` file is skipped without a stall, and the tree says why.
- <a id="ac3"></a>**AC3** — After "Clear data", the cache and profile folders are gone, and the README lists every place Folio writes.

## Outcome

Built on the `e3ea4f2` main. Every rule is in both backends (Go and the Node web server) and in the contract suite (`frontend/contract`, now 65 cases), except where it says desktop only.

**What was done, and where**

- **L2, validate on load.** `settings.LoadReport` (Go, `internal/settings/settings.go`) and `load()` (Node, `frontend/src/server/settings.ts`) decode field by field: a wrong type, or a value `Validate` would refuse (unknown theme, `docsDir` or a docs root that is absolute or has `..`, an `http:` or `{id}`-less ADO template, an empty docs-root list, a network repo root), falls back to that field's default and is logged (`settings: <file>: <field>: <why>; using the default`; the web CLI prints the same lines). Out-of-range pane widths are clamped. The rest of the file, and unknown keys, are kept and the file is not touched until the next save. **Changed behaviour:** a mistyped field used to move the whole file to `settings.json.bad`; now only a file that is not a JSON object does.
- **L2, network and device roots.** `\\host\share`, `//host/share`, `\\?\`, `\\.\` and `\??\` are refused (same sentence in both backends) by load, `SetConfig`, `CheckRoot`, `CheckDocs`, `FOLIO_ROOT` and `--docs`, before any file-system call (a stat on a UNC path is already SMB). Web mode has no exception. **Desktop exception:** `ShellService.PickFolder` (Go, native dialog) records the folder it returned in Go memory (`pickedNet`); `CheckRoot` accepts exactly that path and records the repo root it resolves to (`allowedNet`); `SetConfig` and `CheckDocs` accept exactly those roots. The frontend never supplies the "picked" fact, so a `SetConfig`/`CheckRoot`/`CheckDocs` call from page script for a UNC path is refused. The exception lives for the run only: the file's UNC root is rejected again at the next start (so the user picks it again). The UI warns while one is in use (sidebar note and a line under the path in Settings).
- **L6, 5 MB cap.** `docs.MaxFileBytes` and `MAX_FILE_BYTES`. `ReadBatch` stats first and never opens a file over the cap; it returns `tooLarge: [{path, size}]`. `Scan` also returns `tooLarge` (every .md over the cap, from the walk's own stat), so a warm start still knows. Oversized files count as delivered (so a delete is seen as `removed` and they are not re-read each scan). `ReadFile` refuses them with `file is too large (10.0 MB; the limit is 5.0 MB)`. A file that grows past the cap between stat and read is caught too. The frontend gives them a one-line stub in the index and the tree shows "too large · 10.0 MB".
- **L5, Clear data.** Settings > Data > Clear data (two clicks). `DocsService.ClearCache` / `DocsService.clearCache` delete the cache folder and stop writing it until restart; only a folder named `<x>\Folio\cache`, never a link, is deleted. Desktop: `internal/localdata` (`LocalDataService.ClearData`) also writes a marker `%LOCALAPPDATA%\Folio\purge-profile.pending`, and `localdata.Paths.RunPending()`, called first in `main()` before any WebView2 exists, deletes `%LOCALAPPDATA%\Folio\WebView2` (ticket 16's folder) and `%APPDATA%\folio.exe` (the Wails v3.1.0 default, from `internal/webview2/pkg/edge/chromium.go`: `%AppData%\<exe file name>`). Folders are computed from the environment, never read from the marker; `removeGuarded` accepts only those exact paths. The dialog says the profile goes at the next start. `settings.json` is kept. Uninstaller (`project.nsi`): always removes both profile folders and the marker, and asks whether to delete `%LOCALAPPDATA%\Folio` and `%APPDATA%\Folio` (a silent uninstall keeps them). README has "Where Folio writes" for both modes.
- **L1, RAM readout.** It was **on** by default (`Defaults().ShowMemory = true`, and the dialog treated a missing key as on). Now off in Go, Node and `draftFrom`; the toggle is still in Settings. Existing settings files with `showMemory: true` stay on.
- **L3, bench hook.** `internal/shell/bench.go` and its test have `//go:build bench`; `bench_off.go` has the empty stand-ins; `main.go` calls `shell.BenchMemLog()` instead of reading `FOLIO_BENCH`. `task build:bench` builds `bin/folio-bench.exe` (`-tags production,bench`), which `scripts/ram-check.ps1` now defaults to. Proof: `go version -m` shows `-tags=production` for `folio.exe` and `-tags=production,bench` for the bench exe; the strings `FOLIO_BENCH_DIR`, `cmd.taken` and `TakeBenchCommands` are in the bench exe and not in `folio.exe`. The frontend still has its (inert) `bench:open` listener in the shipped bundle.

**Both-backend differences.** None in behaviour that the contract suite can see. Desktop only: the explicit-pick exception, the profile deletion at next start, the uninstaller option, the bench build. Web: network roots always refused, Clear data is cache only.

**Owner must check by hand** (none of this can run headless)

1. Pick a real UNC folder in the dialog (`\\server\share\repo`): it should open, with the warning in the sidebar and in Settings; restart and it should be gone (first-run screen, log line about repoRoot).
2. Settings > Data > Clear data on the exe: cache folder gone at once; quit, start, and `%LOCALAPPDATA%\Folio\WebView2` (or `%APPDATA%\folio.exe`) and the marker are gone. The tree should still work after the restart (cold scan).
3. Run the installer's uninstall (needs NSIS to build it; `project.nsi` was edited but `makensis` is not installed here, so it was not compiled): the question box, "No" keeps the folders, "Yes" removes them.
4. A hand-edited `settings.json` with a bad field: the exe starts, the field is the default, `bin\folio.exe > folio.log 2>&1` shows the line.
5. A 6 MB `.md` in a real repo: tree row tagged "too large".
6. `task build:bench`, then `task ram` still runs.

**Left open.** The "picked UNC is forgotten at exit" rule is a choice (a persisted marker in `settings.json` could be forged by whoever can edit the file, which is the L2 threat); say if you would rather persist it. A stat of a network *docs* path inside a local root is not special-cased (junction rules from ticket 16 cover it). Ticket 25 will change `docsRoots` and `CheckRoot`: the network check is the first lines of `InspectRootAllowing` / `InspectDocsAllowing` (Go) and `inspectRoot` / `inspectDocs` (Node) and `rootsError` in load, so it should merge easily.

**Review fixes (second pass)**

- **Save vs Clear data race.** `SaveCache` holds `saveMu` for the whole save, write included, and `ClearCache` takes it first (Go); Node serialises both through one promise chain. Tests: a save held mid-write while Clear runs (Go `TestClearCacheWaitsForASaveInFlight`, Node `hardening.test.ts`).
- **Cap reads.** Node reads through a handle and stops one byte past the cap. Both backends refuse anything that is not a regular file (`Mode().IsRegular()`, `isFile()`): reported as `failed` by `ReadBatch`, an error from `ReadFile`, and not listed by `Scan` (Go walk skips FIFOs and devices; a symlink is still listed as before). Unit tests with a folder named `*.md`; a real FIFO cannot be made portably on Windows, so no contract case.
- **A file that grew** past the cap is reported with a fresh stat size.
- **Uninstaller.** The data lines now run under `SetShellVarContext current` (then `wails.setShellContext` again for the install folder and shortcut), so a machine-scope install cleans only the uninstalling user's data. `RMDir /r` goes through `folioSafeRmDir`, which skips a folder whose attributes have the reparse-point bit (I could not establish whether NSIS's `RMDir /r` follows junctions, so it is guarded). The parent `%LOCALAPPDATA%\Folio` itself being a junction is not checked for the WebView2 delete. "Folio is running" was already checked in `un.onInit`. Still not compiled here (no `makensis`).
- **Second instance.** `RunPending` now renames the profile folder to `<folder>.folio-trash` first and deletes only the renamed folder; a rename that fails (files open: another Folio is running) keeps the marker and deletes nothing. A stale trash folder from an interrupted run is removed first. I did not add `SingleInstance`: it would change what a second launch does, and the rename guard already makes it harmless. Test: an open file inside the profile blocks the delete.
- **Repo root allow-list (Windows).** `RootShapeError` (Go) / `rootShapeError` (Node): a full path with a drive letter, or the dialog-picked network root; relative, `\foo` and `C:foo` are refused at load, `SetConfig`, `CheckRoot`, `CheckDocs`. Not done: warning for a mapped network drive (`GetDriveTypeW`); it needs a Windows-only call path in both backends and I left it out.
- **Symlinks to the network.** `SafeJoin` / `safeJoin` Lstat each segment, and for a symlink follow the chain with `Readlink` only (never Stat or EvalSymlinks) and refuse a network or device target (a local drive written `\?\C:\` is fine). Unit tests with injected `lstat`/`readlink` in both backends. The contract case creates a real symlink when it can; this machine lacks the right (EPERM), so it returned early here.
- **Integers.** Both backends accept whole-number, safe-integer literals only (Go: range check on top of its own decode; Node: `JSON.parse` reviver with `context.source` marks `1e3` and `1.0`, plus `Number.isSafeInteger`). Contract case `integers`.
- **Clear data and links.** Every component from `%LOCALAPPDATA%` (`%APPDATA%` for the old profile) down is Lstat'ed, in both backends (`docs.NoLinksBelow`, Node `clearCache`).
- **UI.** A UNC folder picked in the desktop dialog that lacks the docs roots gets the ordinary no-roots message (`refused` is only set for the typed path box). `Tree.test.ts` renders the tree and checks the "too large" tag (the vitest config now loads the Svelte plugin for component tests).
