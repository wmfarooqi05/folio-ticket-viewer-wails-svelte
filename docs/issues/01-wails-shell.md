---
type: spike
status: done
status_note: "decided Nov 19, 2026: stack confirmed; RAM tuning moved to 07"
waiting_on: null
blocked_by: []
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# 01 — Wails v3 + Svelte shell: confirm it builds, measure RAM

Label: wayfinder:prototype

## Why

The stack is Wails (Go backend, WebView2 window). Owner priority is low RAM. Before anything is designed around it, confirm the shell is light enough and pick the shape of the project.

## To do

- [ ] Wails **v3** is decided (owner). Pick and pin the exact alpha version, and check its Windows build story and that the generated TypeScript bindings work.
- [ ] Build a hello-world that lists `.md` files of a chosen folder with mtimes through a Go service, and pushes a change event from `fsnotify`.
- [ ] Confirm Wails v3 has a working Svelte template with TypeScript, and that Svelte 5 and Tailwind build with it.
- [ ] Measure idle RAM (all WebView2 processes plus the Go process) with the folder indexed. Compare to a Chrome tab.
- [ ] If Svelte 5 has a blocking problem with Wails v3, report it and bring back Preact as the fallback. Otherwise there is no comparison to run.
- [ ] Note the toolchain the owner needs (Go, Wails CLI, WebView2 is already on Windows 11) and the binary size.
- [ ] Decide how the repo root is chosen: a folder picker at first run, saved in a config file.

## Done when

- <a id="ac1"></a>**AC1** — A runnable hello-world lists files and reacts to a file change.
- <a id="ac2"></a>**AC2** — Idle RAM is measured and recorded.
- <a id="ac3"></a>**AC3** — The pinned v3 version, the Svelte 5 + Tailwind setup and the toolchain are confirmed.

## Outcome

Done Nov 19, 2026. Findings: [01-findings.md](../assets/01-findings.md). The throwaway prototype was deleted once the real app was scaffolded.

### <a id="d1"></a>D1 — The stack works; pins
Pinned versions:
- Wails **v3.1.0**, a stable tag, so the map's "alpha" note is obsolete.
- Go 1.27.4 and Node 26.7.0.
- Svelte 5.58.0, Tailwind 4.3.5 and Vite 8.3.8.
- fsnotify 1.10.1 and Task 3.54.0.

What the prototype showed:
- Typed bindings and typed events work.
- The walk of 428 files takes about 6 ms, and the recursive watcher about 16 ms.
- The exe is 10 MB.
- To build, the owner needs Go, Node, `wails3` and `task`. The exe needs only WebView2.

### <a id="d2"></a>D2 — RAM is too high as is; tune before accepting
Idle cost is about **240 MB private** (about 430 MB working set, which double-counts), and about 90% of it is WebView2. The owner chose to tune WebView2 before accepting it or changing the stack. See [07](07-webview2-tuning.md).

### Follow-ups for the build
- Debounce watcher events, since one save fires two.
- Re-scan a newly created directory, to catch files created in the same instant.
- Rename the template module from `changeme`.
- Delete the template's demo assets.
