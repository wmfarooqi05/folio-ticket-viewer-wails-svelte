---
type: build
status: in-review
status_note: "on branch worktree-agent-a9105567b2c93a48e, not merged"
waiting_on: null
blocked_by: ["08"]
blocked_note: null
related: ["03", "06", "07"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 10 — Document view: rendering, header card, tree and theme

## Why

This is the core reading experience. Today the middle pane shows raw text in a `<pre>`, the tree shows no status dots, and the Geist fonts are not bundled.

## To do

- [x] Renderer per [06-rendering-draft.md](../assets/06-rendering-draft.md) §1–2 and [06](06-rendering-and-size-budget.md) D1, D2 and D6:
  - markdown-it 15.0.3 joined to parser records by line;
  - frontmatter lines and anchors above headings are blanked;
  - an allowlist sanitiser (`<a id>`, `<br>`);
  - a `scanText` autolink rule;
  - task lists;
  - `data-anchor` for headings;
  - link markers with one delegated listener;
  - the broken-link state;
  - images through a Wails asset handler at `/doc/<path>`, with the missing-image placeholder;
  - a CSP meta tag.
- [x] Header card per [03-design-spec.md](../assets/03-design-spec.md), plus 03 D6's additions:
  - status, type chips, waiting on, blocked-by chips, PR and ADO chips (plain text when no template is set);
  - `status_note`, `blocked_note` and `superseded_by`;
  - the legacy badge and the unknown-status pill;
  - "Open in VS Code" through `ShellService.OpenInVSCode`;
  - "edited N days ago" from mtime.
- [x] Item decoration: IdTags and state markers.
- [x] Tree:
  - status dots and open-count badges;
  - the filter box;
  - `_templates` hidden;
  - the pinned views list (links can be stubs until 12).
- [x] Bundle Geist and Geist Mono (latin, about 52 KB) and about 15 inline Lucide icons (03 D3).
- [x] Motion per the 03 spec, using CSS and Svelte built-ins only, with `prefers-reduced-motion`. The pulse runs only on the header pill, column headers and graph nodes.
- [x] **A GPU-off visual check (07 D1):** screenshots of a long ticket with a table, in light and dark, attached to the Outcome.

## Done when

- <a id="ac1"></a>**AC1** — Every fixture trap renders correctly: anchors on their own line, duplicate Q35 headings, a broken link, a missing image, plain-text references autolinked, and a random 5-digit number not linked.
- <a id="ac2"></a>**AC2** — The header card matches the 03 spec for a migrated ticket and for a legacy ticket.
- <a id="ac3"></a>**AC3** — Initial JS is ≤ 120 KB gzip.
- <a id="ac4"></a>**AC4** — Screenshots are attached, with no GPU-off glitches.

## Outcome

Built on branch `worktree-agent-a9105567b2c93a48e`.

### What shipped
- **Renderer** (`frontend/src/lib/render/`): markdown-it pinned to exactly 15.0.3.
  - `prepare()` blanks the frontmatter and every anchor-only line outside a fence (not only the ones above headings, so an unclosed `<a id>` cannot swallow the next line), and never removes a line, so `token.map[0] + 1` is the file line.
  - One core rule joins headings and items to `rec.headings` and `rec.items` by line. It sets `data-anchor` (item id, then explicit anchor, then slug), adds the IdTag and the marker row, decorates AC list items, and renders task lists as display-only checkboxes.
  - Plain-text references go through `scanText`; `card NNNNN` is a link only when the ADO template is set, otherwise plain mono text. A random 5-digit number is never wrapped.
  - Links are data-attribute markers handled by one delegated listener (`dom.ts`). The broken state is `lk-broken` with no `href`. `bad-scheme` is broken; `outside` is plain text with a title.
  - Images are rebuilt as `/doc/<docs-relative path>`. External images show as links. A missing image swaps to the placeholder through a capture-phase `error` listener (the CSP forbids inline `onerror`).
  - The sanitiser (`sanitize.ts`) is an allowlist: `<a id>` re-serialised from the captured id, `</a>` only to close one we opened, a bare `<br>`, everything else escaped.
- **Go**: `internal/shell/docassets.go`, a middleware for `/doc/<path>`: GET and HEAD only, image extensions only, `docs.SafeJoin` (no `..`, no absolute path, no escaping symlink), `nosniff` and a sandbox CSP header. Wired in `main.go` with one option.
- **UI**: `DocView`, `HeaderCard`, `StatusDot`, `StatusPill`, `RefChip` (header card per 03 spec plus D6: `status_note`, `blocked_note`, `superseded_by`, LEGACY badge and "inferred", unknown-status pill with raw text, PR and ADO chips, Open in VS Code, "edited N days ago" from mtime). `Tree` has status dots, open-count badges, folding, the `/` filter, `_templates` hidden, and the pinned views rows fed by `pinnedCounts(index)`.
- **Theme and assets**: Geist and Geist Mono latin, variable cut to weights 400 to 600 (22.5 KB + 23.9 KB = 46.5 KB, from the `geist` npm package, OFL licence shipped as `dist/licenses/OFL-Geist.txt` from `frontend/public/licenses`). 16 inline Lucide icons in `lib/icons`. CSP meta tag in `index.html`. Motion tokens and `prefers-reduced-motion` were already in `tokens.css`; the pulse runs only on the header pill.

### Checks
- `go test ./...`, `go vet ./...`, `npx vitest run` (273 tests, including happy-dom tests for the click and image-error handlers), `npm run check` (0 errors) and `task build` are green.
- Renderer tests cover every AC1 trap against the real fixtures: both anchor-above forms, the duplicate Q35 headings, broken links, the missing image, autolinked plain-text refs, `order 51234` and `invoice 90817` not linked, the sanitiser allowlist, and every fixture rendering with no `id=`, `<script>` or `onerror=`.
- **AC3: initial JS is 94.8 KB gzip** (248.1 KB min), under the 120 KB target. CSS is 8.6 KB gzip. Fonts 46.5 KB.

### AC4: GPU-off screenshots
Taken with Edge (the WebView2 engine) in headless mode with `--disable-gpu --disable-gpu-compositing`, against the dev harness (`frontend/harness`, run with `npx vite --config vite.harness.config.ts`), not inside the Wails window:
- [light](../assets/10-doc-light.png) and [dark](../assets/10-doc-dark.png): a migrated ticket with a table, task-style AC rows and the missing-image placeholder (remove-service-account 02)
- [legacy light](../assets/10-legacy-light.png) and [legacy dark](../assets/10-legacy-dark.png): a legacy ticket with the LEGACY badge, a task list and a mermaid source block (cash-handling-workflow 04)

No glitches seen (no missing glyphs, no clipped borders, no blank regions). Still for a human: look at the real Wails exe once with the GPU flags from `main.go`, and check the pulse on an in-progress ticket and the theme toggle fade. The long-scroll case was not driven through the app.

### Review fixes (Opus review)
- An `<a id>` is now emitted as a closed, empty `<a data-anchor="x"></a>` and every `</a>` emits nothing, so an unclosed anchor cannot wrap the rest of the document. The `anchorOpen` state is gone. The repro is a test.
- `docs.SafeJoin` refuses any `EvalSymlinks` error other than not-exist, refuses `:` in a path (NTFS alternate data streams), and refuses junctions: Go's `EvalSymlinks` does not follow them, so each folder on the way is checked with `Lstat` for the irregular-file mode. `DocAssets` also requires `EvalSymlinks(full)` to succeed and stay inside `EvalSymlinks(root)`. Junction tests (`mklink /J`, no admin) run and pass on Windows in both packages; they fail rather than skip if the junction cannot be made.
- DocView renders keyed on the record's path and mtime, the text and the ADO and PR templates, not on `index`, so a live refresh of another file does not re-render the open document.
- A link to the document that is already open scrolls to the fragment instead of reloading the file.
- Legacy tickets: the first Status, Type and Blocked by line before the first `##` heading is blanked, since the header card shows them. Screenshots re-taken.
- The in-progress pulse is a `::after` ring animating transform and opacity (`.pulse-dot` in `tokens.css`); ticket 12's Board column header uses the same class now.
- The comment regex no longer hides text between two comments on one line.
- CSP: `data:` is gone from `img-src` and the websocket entries are gone from `connect-src`; a dev-only Vite plugin adds the loopback websocket when serving.

### Deviations
- HTML comments render as nothing (D2 says "everything else is escaped"); the generated map block has `<!-- tickets:begin -->` markers that should not show.
- Every anchor-only line outside a fence is blanked, not only those above headings.
- `mailto:` and `vscode:` links are inert (muted, with a tooltip): `OpenExternal` allows http and https only, and it must not be reimplemented.
- The mermaid fence renders its source in a code block with `data-mermaid`; ticket 14 swaps in the diagram.
- Internal link clicks open the target in the middle pane for now (no right panel until ticket 11). Ctrl-click is passed to the handler as `middle` and is the same until then.
- The Board pinned row is not in the tree: ticket 12 has no Board pinned view, so the list has Waiting on and Open questions.
- Fonts are a variable instance cut with fonttools (weights 400 to 600, latin), because the npm package ships only full-glyph files.

