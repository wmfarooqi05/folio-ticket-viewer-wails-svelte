---
type: build
status: blocked
status_note: "merged Nov 20, 2026; waiting on the owner: build the installer (needs NSIS), clean-profile install test, VM run (AC3), and confirm the budget calls"
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

- [x] `scripts/size-check.mjs`, run by `task build`, fails above the caps (06 D5 targets for JS, CSS and exe, this ticket's 450 KB for Mermaid):
  - initial JS 120 KB gzip, counting every chunk `index.html` loads or modulepreloads;
  - CSS 15 KB;
  - Mermaid 450 KB, the largest diagram-family closure (500 KB for architecture, a named deviation in the Outcome);
  - highlight.js 25 KB;
  - exe 18 MiB.
- [x] A RAM check script (`scripts/ram-check.ps1`, the 01 method: the process tree, private and WS, 30 s idle) for these cases:
  - idle and indexed: about B;
  - two docs open: at most B + 15 MB;
  - after Mermaid: at most B + 45 MB;
  - 50 docs: at most B + 30, and at most 5 MB pass-to-pass drift over distinct documents. **Borderline**, see the Outcome.
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

**AC1, size check.** `task build` now ends with `node scripts/size-check.mjs` (0.2 s; Node built-ins only; `node --test scripts/size-check.test.mjs` is its self-test, also run by `task size`). It reads `dist/index.html` and the Vite manifest (`vite.config.ts` now writes it, moved to `frontend/.vite/` so it is not embedded in the exe). Sizes are gzip level 9, KB = 1000 bytes. Caps: initial JS 120 KB, CSS 15 KB and exe 18 MiB (06 D5's targets, which the build meets), Mermaid 450 KB (the ticket's hard cap), highlight.js 25 KB.

| Budget | Actual | Cap | |
|---|---|---|---|
| Initial JS (index, rolldown-runtime, views, preload-helper) | 107.3 KB | 120 KB | ok |
| CSS | 9.4 KB | 15 KB | ok |
| Mermaid, largest family (treemap, 48 chunks, no KaTeX) | 354.2 KB | 450 KB | ok |
| Mermaid, heavy family (architecture, carries cytoscape) | 483.1 KB | 500 KB (own cap, see below) | ok |
| highlight.js core + 7 grammars | 18.3 KB | 25 KB | ok |
| exe | 14.20 MiB | 18 MiB | ok |

Mermaid families (gzip). Each is mermaid.ts + mermaid.core and its static imports (169.0 KB), plus the diagram chunk and its imports, plus its layout, plus its parser chunk when it has one. The layout is dagre for every family whose closure contains the layout loader chunk (Rolldown put the dynamic imports of dagre, elk and cose-bilkent on that shared chunk, not on mermaid.core; an earlier version of the check missed them and charged no layout), cose-bilkent for mindmap, and none for architecture, which carries cytoscape. The check now throws if a layout chunk is missing from the manifest. Top families: architecture 483.1, treemap 354.2, pie 350.3, gitGraph 342.2, wardley 340.0, peg 338.8, eventmodeling 337.8, treeView 337.3, mindmap 336.9, radar 336.1, packet 335.4; the document types in use: flowDiagram 221.1, sequenceDiagram 230.5, stateDiagram 213.8, classDiagram 216.2, erDiagram 209.6. The parser families are heavy because they pull in the Langium runtime (126 KB, `chunk-NGNAAXSQ`). The five anonymous `diagram-<hash>` chunks are labelled by type (DNEMPZML packet, L3MUGCDN radar, LA4NIPWU treemap, MHCOC4E2 eventmodeling, XPFHEONP treeView) and now include their small parser chunks. KaTeX adds 76.5 KB when a diagram has math. **ELK:** only elkjs (about 466 KB) is stubbed; Mermaid's own elk wrapper chunk stays in the build at 13.5 KB and is never loaded, because `mermaid.ts` pins dagre.

**Named deviation from 06 D5: architecture diagrams have a 500 KB cap, not 450.** Counted as a full closure, the architecture family is 483 KB (560 KB with KaTeX). Cytoscape alone is 139 KB; it loads lazily, only when a document has an `architecture-beta` diagram (none in the corpus). Stubbing it would not shrink the build, because mindmap still pulls cytoscape in. The cap is `BUDGETS.mermaidHeavy` and `HEAVY_FAMILIES` in `scripts/size-check.mjs`; every other family is held to 450. This is the orchestrator's decision, pending the owner's confirmation.

**AC1, RAM.** `scripts/ram-check.ps1` (`task ram`). Each run is a fresh launch of `bin\folio.exe` on `fixtures\docs` with `APPDATA` and `LOCALAPPDATA` pointed at a temp folder (settings, cache and WebView2 profile are throw-away; the real `%APPDATA%\Folio` is never touched), 30 s idle, then private bytes and working set summed over folio.exe and its 6 msedgewebview2 descendants. The script records the Process objects it starts and kills only those (tree kill) at the end, so a Folio the user is running is never touched. Documents are opened through a dev-only hook: `FOLIO_BENCH=1` plus `FOLIO_BENCH_DIR`, kept as a runtime gate with no build tag. Go polls `<dir>/cmd.txt` four times a second (no socket, pipe or listener) and accepts only `open <path>` and `panel <path>` with a relative path free of `..`, `:` and `\`; it emits an event that the frontend honours only for a path that is an own key of the current index. Each command is acknowledged in the Go log through the existing `LogTimings`, and the driver throws rather than overwrite a batch nobody has taken. Unit-tested in `internal/shell/bench_test.go`.

**Budgets, as revised by the orchestrator:** two docs at most B + 15, after Mermaid at most B + 45, 50 docs at most B + 30, and the leak check is the pass-to-pass drift over DISTINCT documents, at most 5 MB. The fixtures hold 75 plain documents (not 100), so case d opens 37 distinct documents in pass 1 and 37 other ones in pass 2.

Private bytes in MB, final exe (with the FreeOSMemory call below), every run:

| Case | Run 1 | Run 2 | Run 3 | Median | Budget |
|---|---|---|---|---|---|
| a. idle, indexed (B) | 164.0 | 164.8 | 169.3 | **164.8** (WS 371.3) | about 160 |
| b. two docs open (middle pane + side panel) | 170.1 | 167.6 | 168.1 | **168.1** (B + 3.3) | ≤ B + 15: ok |
| c. flowchart Mermaid doc open (first build, before FreeOSMemory) | 185.6 | 186.1 | 185.9 | **185.9** (B + 17 against that build's 168.8) | ≤ B + 45: ok |
| d. idle before | 166.0 | 164.7 | 166.2 | 166.0 | |
| d. after pass 1 (37 docs) | 189.2 | 188.5 | 189.5 | 189.2 | |
| d. drift vs idle after pass 1 | +23.2 | +23.8 | +23.3 | **+23.3** | ≤ B + 30: ok |
| d. after pass 2 (37 other docs) | 194.4 | 193.2 | 197.0 | 194.4 | |
| d. pass-to-pass drift | +5.2 | +4.7 | +7.5 | **+5.2** | ≤ 5: **borderline, 0.2 over** |

The same case d on the build without FreeOSMemory: idle before 169.2, pass 1 190.0, pass 2 194.5, drift vs idle +21.2, pass-to-pass +3.9, +4.5, +4.1, **median +4.1**, inside the 5 MB leak budget. The call lowers the idle sample by about 3 MB, and the Go heap then regrows while documents are read, so the pass-to-pass figure is about 1 MB worse with it. Both are within the run-to-run spread, and either way the growth is warm-up plus the Go heap refilling, not a leak that continues without bound (the earlier 50 + 50 same-document test grew by +2 on the second pass). The owner decides whether to keep the call or accept 5.2.

**FreeOSMemory experiment (optional, measured).** `debug.FreeOSMemory()` once, two seconds after the first `LogTimings` call (the start timings, sent once the index is up), in `internal/docs/cache.go`. Case a, 3 runs each, interleaved: without it 168.2, 170.1, 168.5 (median **168.5**, Go process 62.9 MB); with it 166.1, 164.9, 163.5 (median **164.9**, Go process 57.8 MB). Saving 3.6 MB, at least the 3 MB bar, so it is kept. The final-exe run of case a above gives 164.8.

**CPU** (first run, build before FreeOSMemory), 30 s average after a 10 s settle, with the in-progress ticket `one-cash-mover/issues/05` open, the tree showing pulsing dots and the window in front: 1.57, 2.25, 2.86, **median 2.25% of one core**, over the whole process tree (07 saw 3 to 5% for one animated element). Not re-run on the final exe.

**Creep (B 176.6 in 14 against 160 in 07).** B measures 168.5 on the build without FreeOSMemory (Go process 62 MB, WebView2 processes about 106 MB) and 164.8 with it. Attribution by experiment, three runs each, before FreeOSMemory:

| Build or state | Private (median) | Go process |
|---|---|---|
| first-run screen, no folder, no index (`-NoRoot`) | 154.9 | 53.2 |
| indexed, 64 fixture docs (B) | 168.8 | 62.1 |
| indexed, web fonts removed (`fonts.css` emptied for one build) | 169.1 | 62.5 |
| indexed, the production build run again next to it | 168.5 | 62.0 |

- The empty UI already costs 155 MB, close to 07's 160 for its stub app. Opening the folder, scanning, the cache, the watcher and the tree add **14 MB** (Go +9, WebView2 +5). That is most of the creep.
- **Fonts: no effect** (+0.6, noise). The modulepreloaded `views` chunk, the highlight and Mermaid chunks (not loaded at idle) and the Wails asset middleware (a prefix check) were not isolated by an experiment; by size they cannot be more than a MB or two.
- The rest of 14's 176.6 is run-to-run spread (idle runs here span 163.5 to 182.8) and that it was one run under load.
- Candidates, none applied: the Go side's heap at real-repo size (the real repo has many more files than the fixtures, so measure on the VM), `GOGC` and `GOMEMLIMIT` (07 found no effect), WebView2 `MemoryUsageTargetLevel` (trims WS only).

**AC2, installer: not done.** `makensis` is not installed on this machine and installing it system-wide was out of bounds. What is ready: `task package` (per user by default, `INSTALL_SCOPE=machine` for all users) checks for `makensis` first and says how to get it. `build/windows/nsis/project.nsi` installs to `%LOCALAPPDATA%\Programs\Folio` without admin and, for the per-user build, has no directory page (the uninstaller does `RMDir /r` on the install folder, so a user-typed folder must not be possible). It writes `licenses\OFL-Geist.txt` next to the exe, creates a Start menu shortcut only (no desktop icon), registers an uninstaller under HKCU, and refuses to install or uninstall while a window titled "Folio" is open. Uninstalling removes the program, the shortcut and the WebView2 data and leaves `%APPDATA%\Folio` and `%LOCALAPPDATA%\Folio` alone. The version is still 0.1.0. The NSIS script has not been compiled, so a syntax slip is possible (the licence `File` path had a stray form-feed that a review caught; the repo has since been scanned for control bytes). The owner needs NSIS 3 (`winget install NSIS.NSIS`, then a new shell) and network access for the WebView2 bootstrapper that `wails3 generate webview2bootstrapper` fetches, then `task package`. On a clean Windows user profile: run `bin\folio-amd64-installer.exe`, start Folio from the Start menu, pick the folder, check Settings > Apps lists it, uninstall, and check the files and the shortcut are gone.

**AC3** is open: the owner has not run it on the VM.
