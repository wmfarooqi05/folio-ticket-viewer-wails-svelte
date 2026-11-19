# 05: Index cache and refresh, draft for the decision session

Drafted Nov 19, 2026 as input to [05-index-cache-refresh](../issues/05-index-cache-refresh.md). It recommends; the owner decides.

Sources:
- [01 FINDINGS](../../prototypes/01-wails-shell/FINDINGS.md), and the prototype's `fileservice.go`, `main.go` and `App.svelte`
- the [04 contract](04-parser-contract-draft.md)
- the [03 design spec](03-design-spec.md)
- handoff §7

**The split in one line:** Go stats, reads, watches and stores bytes. JS parses and holds the only copy of the index. Go never interprets Markdown. It keeps one stamp (`mtime`, `size`) per path and no file text.

**Owner questions (section 6):**
- O1: who owns the cache.
- O2: whether to paint from the cache before the scan finishes.
- O3: a settings UI, or a hand-edited config file.

Everything else can be accepted as a block.

---

## 1. Go service API

Rename the template module from `changeme` to `folio` (an 01 follow-up). The bindings are then generated into `frontend/bindings/folio/`. There are two services, both registered with `application.NewService(...)` in the same way as the prototype's `FileService`.

### 1.1 Types

```go
// Every path in the API is POSIX and relative to the docs root ("modules/x/issues/05-a.md"),
// which matches 04 §1.1. Go joins it with docsRoot, rejects absolute paths and anything
// that escapes the root (the prototype's ReadFile check), and accepts only *.md for reads.

type SourceFile struct {           // the parser's SourceFile, exactly
    Path  string `json:"path"`
    Text  string `json:"text"`
    Mtime int64  `json:"mtime"`    // unix ms; the source of "edited N days ago" (03 D4)
}

type ScanResult struct {
    Changed []string `json:"changed"` // new, or the stamp differs from the cache
    Removed []string `json:"removed"` // in the cache, no longer on disk
    Count   int      `json:"count"`   // .md files on disk, for the "Watching N files" footer
    WalkMs  int64    `json:"walkMs"`  // logged, to measure the slow VM
}

type BatchResult struct {
    Files   []SourceFile `json:"files"`
    Missing []string     `json:"missing"` // deleted between scan and read: JS treats these as removed
}

type ChangeSet struct {            // payload of the "docs:changed" event
    Changed []string `json:"changed"`
    Removed []string `json:"removed"`
    Rescan  bool     `json:"rescan"`  // true after a watcher overflow or error (section 3.4)
}
```

### 1.2 DocsService (index I/O)

```go
// LoadCache returns the cached index as raw JSON, or nil when there is no cache, it is
// corrupt, or parserVersion or docsRoot differ. It also loads the stamps into Go.
func (s *DocsService) LoadCache(parserVersion string) (json.RawMessage, error)

// Scan starts the watcher (every directory registered first), then walks the roots and
// diffs the result against the stamps. With no cache, every file is in Changed.
// Watch-then-walk means no change can fall between the walk and the watcher.
func (s *DocsService) Scan() (ScanResult, error)

// ReadBatch reads N files in one IPC call, using a bounded pool (4 goroutines, a const
// to tune on the VM). It stats before reading and records that stamp as "delivered".
func (s *DocsService) ReadBatch(paths []string) (BatchResult, error)

// ReadFile returns one file's text for rendering (the middle pane, or the right panel
// when it extracts a fragment). It does not touch stamps.
func (s *DocsService) ReadFile(path string) (string, error)

// SaveCache writes {envelope, stamps, index} atomically (temp file, then rename).
// Go does not decode the index; it writes the bytes.
func (s *DocsService) SaveCache(parserVersion string, index json.RawMessage) error

// Rescan is the manual "Rescan" command, and the fallback after an overflow (section 3.4).
func (s *DocsService) Rescan() (ScanResult, error)
```

`json.RawMessage` generates as `any` in TS, so the index crosses IPC as JSON exactly once in each direction, with no string inside JSON. If the v3.1.0 generator rejects it, use `string` and `JSON.parse` in JS. That costs one extra parse of about 1 to 4 MB, roughly 10 to 30 ms.

The event is registered in `init()` as in the prototype: `application.RegisterEvent[ChangeSet]("docs:changed")`. Go emits it with `app.Event.Emit("docs:changed", cs)`.

### 1.3 ShellService (config, dialogs, links)

```go
func (s *ShellService) GetConfig() (Config, error)
func (s *ShellService) SetConfig(p ConfigPatch) (Config, error) // validates, saves atomically, returns the new config
func (s *ShellService) PickFolder() (string, error)             // the prototype's dialog; "" means cancelled
func (s *ShellService) CheckRoot(abs string) (RootCheck, error) // first run: what is in the picked folder (section 4)
func (s *ShellService) OpenInVSCode(path string, line int) error // relative path; line 0 means the top
func (s *ShellService) OpenExternal(url string) error            // http/https only; for ADO, PR and external links
```

`ConfigPatch` has pointer fields, so the TS fields are optional and a patch cannot overwrite the window bounds by accident. Go alone writes the window bounds (section 4).

### 1.4 Open in VS Code: recommend the `vscode://file/` URL, built in Go

- Go builds `vscode://file/` followed by the absolute path with forward slashes and `:line`. It escapes each path segment with `url.PathEscape`, so spaces become `%20` while `E:` and `/` stay as they are. Example: `vscode://file/E:/src/Lockbox%20and%20Cash%20Payment/docs/modules/x/issues/05-a.md:12`. Go opens it with the Wails browser manager (`application.Get().Browser.OpenURL`; check the exact name in v3.1.0), which goes through the Windows protocol handler.
- **Why not run `code`:**
  - It depends on PATH, and 01 found PATH stale after installs.
  - `code` is a `.cmd` wrapper, so it flashes a console window unless it is hidden.
  - It needs a "VS Code path" config field.
  - The URL needs none of that and supports `:line` for free.
- **The cost:** the file opens in the last active VS Code window, not necessarily the repo's workspace. That is fine for reading.
- **Free extra:** the right panel can pass `item.line`, so "Open in VS Code" lands on the Q or D item itself.
- **Config:** this drops the ticket's "VS Code path" field. Only an Insiders user would need a scheme setting, and that can wait.

### 1.5 Generated TS usage

```ts
import { Events } from '@wailsio/runtime';
import { DocsService, ShellService } from '../bindings/folio';
import type { ChangeSet } from '../bindings/folio/models';

const cached = await DocsService.LoadCache(PARSER_VERSION);         // Index | null
const scan   = await DocsService.Scan();                            // ScanResult
const { files, missing } = await DocsService.ReadBatch(scan.changed.slice(0, 100));
const text   = await DocsService.ReadFile(rec.path);
await DocsService.SaveCache(PARSER_VERSION, index);

Events.On('docs:changed', (e) => enqueue(e.data as ChangeSet));     // same shape as App.svelte
await ShellService.OpenInVSCode(rec.path, item?.line ?? 0);
```

A Go `(T, error)` return becomes `Promise<T>`, and an error rejects the promise.

**06 hook:** whether a relative image exists, and how to serve it, belongs to 06. Likely answers are an asset-handler route or an `ImageExists(path)` method on DocsService. 05 does not fix it.

---

## 2. The cache

### 2.1 Owner: Go writes a JSON file (recommended; this is O1)

| | Go JSON file in `%LOCALAPPDATA%\Folio\cache\` | IndexedDB in the webview |
|---|---|---|
| Stamps diff | Go already holds the stamps, so `Scan` returns only what changed: one call | JS needs the full list with stamps over IPC, then diffs it |
| Inspect or clear | Delete one file | Buried in the WebView2 user-data folder |
| Survives a WebView2 profile reset | yes | no |
| Matches handoff §7 ("cache to a JSON file") | yes | no |
| Cost | The index crosses IPC once at load and once per save (about 1 to 4 MB) | Structured clone, no IPC |

The file is `%LOCALAPPDATA%\Folio\cache\<first 12 hex chars of sha1(docsRoot)>.json`, so switching folders does not destroy the other folder's cache.

### 2.2 Format and key

```json
{ "v": 1,
  "parserVersion": "lib-3f9a1c2e",
  "docsRoot": "E:/src/Lockbox and Cash Payment/docs",
  "roots": ["modules", "handoffs", "patterns"],
  "stamps": { "modules/x/issues/05-a.md": [1763550000000, 3512] },
  "index": { "version": 1, "files": {}, "spaces": [], "tickets": {}, "edges": [], "diagnostics": [] } }
```

- **Per-file key:** path, `mtime` and `size`. A file is reused only if both match. Size catches an edit with the same mtime.
- **Whole-file invalidation:** a different `v`, `parserVersion`, `docsRoot` or `roots`, or a parse failure, means a cold start. A corrupt file is deleted.
- **parserVersion:** a build-time content hash of the compiled `lib.mjs`, injected by Vite with `define`. Nobody has to remember to bump it, and any parser change forces one cold start. `Index.version` from 04 stays as the schema version inside `index`.
- **Stamps are Go's.** They are the stamps of the bytes Go actually delivered through `ReadBatch`, taken by a stat before the read. If a file changes during a read, the next comparison sees the difference.
- **What is stored:** the parser's serialised `Index` only. There is no text, because the index holds no body text (04 §1.1). The size is an estimate of about 2 to 4 KB per file, so 1 to 2 MB for 428 files and 2 to 4 MB for 1,000. Log the real size.

### 2.3 Cold start (no cache, or the parser changed)

1. `GetConfig`. With no root set, show the first-run screen (section 4).
2. `LoadCache` returns null.
3. `Scan`: watcher registration (about 16 ms in 01), then the walk (about 6 ms for 428 files in 01). All files are in `changed`.
4. JS loop. Keep one `ReadBatch` of 100 paths in flight while the previous batch is parsed: `index = updateIndex(index, files, missing)`, then assign. The tree fills progressively (04 §4).
5. When all batches are done, `SaveCache` once.

### 2.4 Warm start

1. `GetConfig`.
2. `LoadCache` returns the index. Paint the tree and the last document now (O2).
3. `Scan`, a stat-only walk that reads no files, returns a few changed paths, or none.
4. `ReadBatch(changed)`, then `updateIndex(index, files, [...removed, ...missing])`.
5. If anything changed, `SaveCache` (debounced, section 3.5).

### 2.5 Expected timings

01 measured on the dev PC with 428 files of about 3.5 KB. The parse cost is from 04's estimate.

| Step | Cold | Warm |
|---|---|---|
| Watcher and walk | about 23 ms | about 23 ms |
| Load cache, IPC, parse (about 1.5 MB) | — | about 20 to 40 ms |
| Read 1.5 MB in 5 batches | about 20 to 60 ms (estimate) | only the changed files, under 5 ms |
| Parse (`updateIndex`) | about 25 to 65 ms (04: 50 to 150 ms per 1,000) | under 5 ms |
| **First paint** | first batch about 40 ms | **about 40 ms, from the cache** |
| **Fully current** | **about 100 to 200 ms** | **under 100 ms** |

**The slow VM is unmeasured.** The 120 s `find` ran under Git Bash, where MSYS stat emulation is notoriously slow. Native `WalkDir` should be far faster, but nobody has measured it. On that disk, cold reads dominate and the warm path reads nothing. That is why the cache and O2 matter. `ScanResult.WalkMs` and a log line for each `ReadBatch` give the numbers on the first run there.

---

## 3. Refresh

### 3.1 Debounce and batching (in Go)

- Collect watcher events into a set of paths (`map[string]struct{}`), with a **200 ms trailing window and a 1 s maximum wait**. This absorbs the double WRITE that 01 saw, and it bundles a `git checkout` of 300 files into a few ChangeSets.
- **At flush, judge by stat, not by event type.** For each path:
  - It exists, is `.md`, and its stamp differs from the delivered one: `changed`.
  - It is gone, and it is a known path: `removed`.
  - Its stamp is unchanged: drop it. This covers no-op saves and duplicate events.
- One rule covers Create, Write, Remove and Rename, so events never need pairing.

### 3.2 Delete and rename

- **File rename.** On Windows, fsnotify delivers Rename for the old name and Create for the new name. The stat rule turns these into `removed: [old]` and `changed: [new]`. The parser treats a renamed ticket as remove plus add, and the cross-file pass fixes the edges.
- **Directory removed or renamed away.** The event names only the directory. At flush, every known path under that prefix that no longer exists goes into `removed`. Go can find them because it holds the stamps map.
- **Directory created or renamed in:** see 3.3.

### 3.3 New-directory race (01's follow-up)

When a Create event names a directory:
1. `watcher.Add` the directory and its subdirectories, as `addTree` does.
2. **Then** walk the directory and put every `.md` path into the pending set.

A file created before the watch existed is found by the walk. A file created after it arrives as an event. A file seen by both is collapsed by the stamp check. This closes the "same instant" gap in 01.

### 3.4 Watcher overflow and other errors

- When `w.Errors` yields `fsnotify.ErrEventOverflow` (the ReadDirectoryChangesW buffer filled, for example by a large checkout), or any other watcher error:
  1. Drop the pending set.
  2. Rebuild the watcher if it closed.
  3. Run a full `Rescan` (stat-only walk plus diff) and emit `ChangeSet{Rescan: true, ...}`.
- **Buffer size.** Raise the Windows buffer with `AddWith(dir, fsnotify.WithBufferSize(256<<10))` if v1.10.1 exposes it; check this. The default is 64 KB.
- **Manual rescan.** A "Rescan" command (footer link plus Ctrl+R) calls the same path.
- **No rescan on a click or on focus.** Handoff §7 says never rescan on a click.

### 3.5 Watch scope and the JS side

- **Watch scope:** only `<docsRoot>/<root>` for each configured root, not the whole repo as the prototype did. Skip `node_modules`, dot folders and `_`-prefixed folders, which is the same scope rule as 04 §2.9 and hides `_templates`.
- **JS side:**
  - One serial queue holds every index mutation: cold batches, ChangeSets and rescans. Each step is `ReadBatch(changed)`, then `updateIndex`, then assign.
  - If the open document or the panel document changed, re-fetch it with `ReadFile` and re-render silently, keeping the scroll position (03 G16).
  - `SaveCache` is debounced to 2 s after the last mutation. Never save on every event.

---

## 4. Config

**Location:** `%APPDATA%\Folio\config.json`. It is roaming, small, and written atomically by Go.

```json
{ "v": 1,
  "repoRoot": "E:\\src\\Lockbox and Cash Payment",
  "docsDir": "docs",
  "docsRoots": ["modules", "handoffs", "patterns"],
  "adoWorkItemUrl": "https://dev.azure.com/skywardins/Lockbox%20and%20Cash%20Payment/_workitems/edit/{id}",
  "adoPrUrl": "https://dev.azure.com/skywardins/Lockbox%20and%20Cash%20Payment/_git/<repo>/pullrequest/{id}",
  "theme": "system",
  "window": { "x": 120, "y": 80, "width": 1440, "height": 900, "maximised": false } }
```

- **Docs root.** The docs root is `repoRoot/docsDir`, the folder that 04's relative paths hang from. `docsRoots` are relative to it.
- **Theme.** `theme` is `system`, `light` or `dark` (03 §1.6). JS reads it before mounting, so there is no flash of the wrong theme.
- **Window bounds.**
  - Go saves them on the window-closing event and applies them in `WebviewWindowOptions`.
  - If the saved rectangle is not on any current screen (checked with the screen manager), Go uses a centred default instead. This handles an unplugged monitor.
- **Dev override.** The prototype's `TICKET_ROOT` env var stays as a dev override, renamed `FOLIO_ROOT`.

**First run:**
1. There is no config, or `repoRoot` no longer exists. Show the first-run card ("Choose folder…", which opens the native dialog, per 03 D6).
2. `PickFolder`, then `CheckRoot(abs)`. CheckRoot accepts either a repo root that contains `docs/modules`, or the docs folder itself (it then sets `repoRoot` to the parent and `docsDir` to the folder name). It returns which of the three roots it found.
3. Validation:
   - No root found: an inline error ("expects modules/ · handoffs/ · patterns/") with a "Choose again" button.
   - Some roots found: proceed. A missing root shows as empty, with no error.
4. `SetConfig`, then the cold start.

**Validation in `SetConfig`:**
- `repoRoot` must be an existing directory.
- At least one root must exist.
- Each URL template must be empty, or `https://…` containing `{id}`. An empty template renders PR and ADO chips as plain text, not links.
- `theme` must be one of the enum values.
- Unknown keys are kept and rewritten unchanged.

**A corrupt config** is renamed to `config.json.bad` and the first-run screen is shown. It is never silently overwritten.

---

## 5. RAM

- **One copy of the index, in JS.** Hold it with Svelte's **`$state.raw`**, not `$state`. A deep `$state` would proxy every record in a multi-megabyte object, which costs memory and time. `updateIndex` returns a new `Index`, so assigning it triggers the views.
- **Go holds only the stamps.** That is about 1,000 entries of path, mtime and size, under about 200 KB, plus the watcher and the debounce set.
- **Go keeps no file text.** `ReadBatch` and `ReadFile` read the file, return it and drop it, and `LoadCache` and `SaveCache` pass the bytes straight through. The text lives only transiently in an IPC call, and JS keeps the text of at most two documents (the middle pane and the right panel).
- **Release large strings.** In the `string` fallback for `LoadCache`, let the JSON string go out of scope after parsing. Run `SaveCache`'s `JSON.stringify` only on the 2 s debounce.
- **Not 05's problem.** Go's runtime baseline (about 51 MB private in 01) and WebView2 (about 90% of the total) belong to 07. A `GOMEMLIMIT` or `debug.SetMemoryLimit` experiment could go there.

---

## 6. Questions for the owner

### O1: Who owns the cache?
(a) Go writes a JSON file in `%LOCALAPPDATA%\Folio\cache\`. (b) The frontend stores it in IndexedDB.
**Recommend (a).** Go already holds the stamps, so a warm start is one `Scan` call that returns only the changes. The file is easy to inspect and delete, survives a WebView2 profile reset, and matches handoff §7. The cost is about 1 to 4 MB over IPC on load and save.

### O2: Paint from the cache before the scan finishes?
(a) Show the cached tree immediately, then reconcile, which takes milliseconds on the dev PC and is unknown on the slow VM. (b) Wait for `Scan` before the first paint.
**Recommend (a)**, with the footer reading "Checking N files…" until the scan returns. On the slow disk it is the difference between an instant window and a blank one. The stale state lasts only until the scan returns, and the diff then updates the views silently, as any live change does.

### O3: How are the ADO and PR URL templates set?
(a) No settings UI in v1. The owner edits `config.json` through an "Open settings file" action, which opens it with `OpenInVSCode`, and Go watches that one file and reloads it. (b) A small settings dialog for the two URLs and the docs roots.
**Recommend (a).** The values are set once and are long URLs, the 03 design has no settings screen, and it costs no new component. The first run still needs only the folder picker.
