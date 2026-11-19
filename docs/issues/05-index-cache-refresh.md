---
type: decision
status: done
status_note: "decided Nov 20, 2026 (owner)"
waiting_on: null
blocked_by: ["01"]
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: false
---

# 05 — Go/JS split, index cache and refresh

Label: wayfinder:grilling

## Why

The disk is slow. Go can walk and watch natively, and the parser is JavaScript (one parser, portable to the other repo). The split between them decides startup time and RAM.

## To do

- [ ] Decide the Go binding API: list files with mtimes, read a file, watch for changes, get and set config.
- [ ] Decide where parsing runs (webview JS, in a Web Worker or not) and what is cached: a JSON index on disk written by Go, keyed by path + mtime.
- [ ] Decide the refresh flow: `fsnotify` event, then re-read and re-parse that one file, then update the index and views.
- [ ] Decide config (repo root, ADO and PR URL templates, VS Code path) and where it is stored.

## Done when

- <a id="ac1"></a>**AC1** — The binding API, cache format and refresh flow are written down.

## Outcome

Decided Nov 20, 2026 (owner). The spec is [05-index-cache-draft.md](../assets/05-index-cache-draft.md), amended by D4.

### <a id="d1"></a>D1 — The split and the API
- Go stats, reads, watches and stores bytes. JS parses and holds the only index, with `$state.raw`. Go keeps stamps only, never file text.
- There are two services:
  - `DocsService`: LoadCache, Scan, ReadBatch, ReadFile, SaveCache and Rescan.
  - `ShellService`: GetConfig, SetConfig, PickFolder, CheckRoot, OpenInVSCode and OpenExternal.
- One debounced event, `docs:changed` (a ChangeSet).
- The template module is renamed to `folio`.

### <a id="d2"></a>D2 — The cache is a Go-owned JSON file
- Location: `%LOCALAPPDATA%\Folio\cache\<hash(docsRoot)>.json`.
- Key: path + mtime + size per file. The whole cache is dropped when `parserVersion`, a build-time hash of `lib.mjs`, changes.
- Warm start paints from the cache first, then reconciles with a stat-only scan. The footer shows "Checking N files…" meanwhile.

### <a id="d3"></a>D3 — Refresh
- 200 ms trailing debounce with a 1 s maximum, judged by stat at flush.
- New directories are walked after they are added to the watcher, which closes the race from 01.
- A watcher overflow triggers a full rescan. A manual "Rescan" is on Ctrl+R.
- Nothing rescans on a click or on focus.
- Only the configured docs roots are watched.

### <a id="d4"></a>D4 — An in-app settings screen (owner, amends the draft's O3)
- **Access:** a gear button in the top bar opens a **Settings** dialog. A modal dialog was picked over a full screen: it is lighter and fits the 03 design.
- **v1 fields:** repo root (with the native picker), docs roots, the ADO work-item URL template, the PR URL template and the theme.
- **Extensible:** sections and fields are driven by one schema, so later settings are added in one place.
- **Saving:** through `ShellService.SetConfig`, which validates (an `https://` URL containing `{id}`, an existing root). Errors show inline.
- **Storage:** config stays in `%APPDATA%\Folio\config.json`.
- **Not ticket data:** it writes only the app's own config, never a ticket file, so the read-only rule holds.
- **Design gap:** the dialog is not in the 03 mockup. It uses the existing tokens and components.

### <a id="d5"></a>D5 — Open in VS Code
Go builds a `vscode://file/<abs path>:<line>` URL with `%20` escaping and opens it through the OS. There is no `code` binary dependency and no VS Code path setting.
