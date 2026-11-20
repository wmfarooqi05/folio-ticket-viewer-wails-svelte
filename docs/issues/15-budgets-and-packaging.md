---
type: build
status: in-review
status_note: "on branch worktree-agent-a98dec4e917bf4773, not merged; AC3 (owner on the VM) and a clean-profile installer test are open: makensis is not installed here"
waiting_on: owner
blocked_by: []
blocked_note: null
related: ["06", "07"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 15 — Budgets enforced, installer, v1 release

## Why

This closes the loop on "very lightweight": the budgets from 06 D5, measured on the real UI against 07's baseline, and a way to install Folio on the VM.

## To do

- [x] `scripts/size-check.mjs`, run by `task build`, fails above the caps the tickets actually used (tighter than the 06 D5 hard caps):
  - initial JS 120 KB gzip, counting every chunk `index.html` loads or modulepreloads;
  - CSS 25 KB;
  - Mermaid 450 KB, the largest diagram-family closure (500 KB for architecture, see the Outcome);
  - highlight.js 25 KB;
  - exe 20 MiB.
- [x] A RAM check script (`scripts/ram-check.ps1`, the 01 method: the process tree, private and WS, 30 s idle) for these cases:
  - idle and indexed: about B;
  - two docs open: at most B + 15 MB;
  - after Mermaid: at most B + 45 MB;
  - 50 docs opened in a row: drift at most 5 MB. **Not met as written**, see the Outcome.
- [x] CPU at idle with the pulse animations visible. Recorded.
- [ ] An NSIS installer through `task package`. The config and task are ready; **makensis is not installed here, so no installer was built or tested**. Install and run it on a clean Windows user profile.
- [ ] Run on the owner's VM against the real `docs/`, and record the cold and warm start times (the slow disk was never measured).
- [x] README: install, first run and settings.

## Done when

- <a id="ac1"></a>**AC1** — The size check runs in `task build`, and all budgets pass, with the numbers in the Outcome.
- <a id="ac2"></a>**AC2** — The installer works on a clean profile.
- <a id="ac3"></a>**AC3** — The owner has run v1 on the VM against the real repo. This is HITL.

## Outcome

Built on branch `worktree-agent-a98dec4e917bf4773`, not merged. Measured on the production exe from `task build`, on a machine with about 20 other WebView2 processes and a second Folio instance (the owner's own) running.

**AC1, size check.** `task build` now ends with `node scripts/size-check.mjs` (0.2 s; Node built-ins only; `node --test scripts` is its self-test, also run by `task size`). It reads `dist/index.html` and the Vite manifest (`vite.config.ts` now writes it, moved to `frontend/.vite/` so it is not embedded in the exe). Sizes are gzip level 9, KB = 1000 bytes.

| Budget | Actual | Cap | |
|---|---|---|---|
| Initial JS (index, rolldown-runtime, views, preload-helper) | 107.2 KB | 120 KB | ok |
| CSS | 9.4 KB | 25 KB | ok |
| Mermaid, largest family used by documents (`diagram-LA4NIPWU`, 44 chunks) | 324.6 KB | 450 KB | ok |
| Mermaid, heavy family (architecture, carries cytoscape) | 483.1 KB | 500 KB (own cap) | ok |
| highlight.js core + 7 grammars | 18.3 KB | 25 KB | ok |
| exe | 14.20 MiB | 20 MiB | ok |

Mermaid families (wrapper + mermaid.core and its static imports = 169.0 KB, plus the diagram chunk, its layout and its parser chunk): architecture 483.1, `diagram-LA4NIPWU` 324.6, pie 320.8, gitGraph 312.7, wardley 310.5, peg 309.3; flowDiagram 191.6, sequenceDiagram 201.0. KaTeX adds 76.5 KB when a diagram has math. ELK is stubbed: 0.0 KB instead of about 466 KB.

**Deviation.** Counting the whole closure (14's table did not charge a family for mermaid.core's own chunks), architecture is 483 KB, over 450, and 560 KB with KaTeX. Nothing in the corpus uses it and it cannot be shrunk without disabling the diagram type, so it has its own 500 KB cap (`HEAVY_FAMILIES` in the script) and every other family is held to 450. With KaTeX added, architecture is the only family over 450, and the table prints that. 14's 100.9 KB for initial JS was counted differently; the level 9 count is 107.2 KB.

**AC1, RAM.** `scripts/ram-check.ps1` (`task ram`). Each run is a fresh launch of `bin\folio.exe` on `fixtures\docs` with `APPDATA` and `LOCALAPPDATA` pointed at a temp folder (settings, cache and WebView2 profile are throw-away; the real `%APPDATA%\Folio` is never touched), 30 s idle, then private bytes and working set summed over folio.exe and its 6 msedgewebview2 descendants. Documents are opened through a dev-only hook: `FOLIO_BENCH=1` plus `FOLIO_BENCH_DIR`. Go polls `<dir>/cmd.txt` four times a second (no socket, pipe or listener) and accepts only `open <path>` and `panel <path>` with a relative path free of `..`, `:` and `\`; it emits an event that the frontend honours only for a file in the current index. With the variables unset it costs one `os.Getenv`. Unit-tested in `internal/shell/bench_test.go`. Acknowledged through the existing `LogTimings` binding.

Private bytes in MB, every run:

| Case | Run 1 | Run 2 | Run 3 | Median | Budget |
|---|---|---|---|---|---|
| a. idle, indexed (B) | 168.9 | 168.8 | 167.8 | **168.8** (WS 371.7) | about 160 |
| a, earlier batch (see note) | 182.8 | void | 171.1 | | |
| b. two docs open (middle pane + side panel) | 172.7 | 174.8 | 177.1 | **174.8** (B + 6.0) | ≤ B + 15: ok |
| c. flowchart Mermaid doc open | 185.6 | 186.1 | 185.9 | **185.9** (B + 17.1) | ≤ B + 45: ok |
| d. idle sample before the 50 docs | 167.4 | 167.7 | 167.4 | 167.4 | |
| d. after 50 docs | 191.6 | 193.0 | 191.7 | 191.7 | |
| d. drift, after 50 minus before | +24.2 | +25.3 | +24.3 | **+24.3** | ≤ 5: **not met** |
| d. drift, the same 50 opened again | -0.6 | +1.9 | +2.1 | **+1.9** | |

Note: run 2 of that first batch of case a was void, because I ran `task package` (which rebuilds the exe) while it was running and the exe did not start. The re-run of case a (three clean runs, first row) is what B is.

- **Mermaid** is +17 over B, well inside +45 (14's +40 was one run against a 176.6 B). Automatic rendering stays.
- **Drift:** opening 50 different documents costs +24 MB the first time and opening the same 50 again costs +2 MB. So it is warm-up (the renderer's heap and caches growing to a working size), not a leak, but "≤ 5 MB after 50 docs" is not met as measured against the idle sample. The total after 50 docs is 192 MB, under B + 45. The owner decides: accept about B + 25 as the 50-doc ceiling, or look for what the renderer keeps (candidates: the cached rendered HTML, markdown garbage that Chromium collects late at this heap size). No risky change was made.

**CPU**, 30 s average after a 10 s settle, with the in-progress ticket `one-cash-mover/issues/05` open, the tree showing pulsing dots and the window in front: 1.57, 2.25, 2.86, **median 2.25% of one core**, over the whole process tree (07 saw 3 to 5% for one animated element).

**Creep (B 176.6 in 14 against 160 in 07).** B measures 168.8 here (Go process 62.1 MB, WebView2 processes 106.7 MB). Attribution by experiment, three runs each:

| Build or state | Private (median) | Go process |
|---|---|---|
| first-run screen, no folder, no index (`-NoRoot`) | 154.9 | 53.2 |
| indexed, 64 fixture docs (B) | 168.8 | 62.1 |
| indexed, web fonts removed (`fonts.css` emptied for one build) | 169.1 | 62.5 |
| indexed, the production build run again next to it | 168.5 | 62.0 |

- The empty UI already costs 155 MB, close to 07's 160 for its stub app. Opening the folder, scanning, the cache, the watcher and the tree add **14 MB** (Go +9, WebView2 +5). That is most of the creep.
- **Fonts: no effect** (+0.6, noise). The modulepreloaded `views` chunk, the highlight and Mermaid chunks (not loaded at idle) and the Wails asset middleware (a prefix check) were not isolated by an experiment; by size they cannot be more than a MB or two.
- The rest of 14's 176.6 is run-to-run spread (idle runs here span 167.8 to 182.8) and that it was one run under load. B is about 169, 9 over 07's nominal 160.
- Candidates, none applied: the Go side's 62 MB (the real repo has many more files than the fixtures, so measure on the VM), `GOGC` and `GOMEMLIMIT` (07 found no effect), WebView2 `MemoryUsageTargetLevel` (trims WS only).

**AC2, installer: not done.** `makensis` is not installed on this machine and installing it system-wide was out of bounds. What is ready: `task package` (per user by default, `INSTALL_SCOPE=machine` for all users) checks for `makensis` first and says how to get it. `build/windows/nsis/project.nsi` installs to `%LOCALAPPDATA%\Programs\Folio` without admin, writes `licenses\OFL-Geist.txt` next to the exe, creates a Start menu shortcut only (no desktop icon) and registers an uninstaller under HKCU; uninstalling removes the program, the shortcut and the WebView2 data and leaves `%APPDATA%\Folio` and `%LOCALAPPDATA%\Folio` alone. The version is still 0.1.0. The NSIS script has not been compiled, so a syntax slip is possible. The owner needs NSIS 3 (`winget install NSIS.NSIS`, then a new shell) and network access for the WebView2 bootstrapper that `wails3 generate webview2bootstrapper` fetches, then `task package`. On a clean Windows user profile: run `bin\folio-amd64-installer.exe`, start Folio from the Start menu, pick the folder, check Settings > Apps lists it, uninstall, and check the files and the shortcut are gone.

**AC3** is open: the owner has not run it on the VM.
