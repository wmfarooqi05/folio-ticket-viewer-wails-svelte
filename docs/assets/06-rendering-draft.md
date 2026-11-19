# 06 — Rendering pipeline and size budget: draft for the decision session

Drafted Nov 19, 2026 as input to [06-rendering-and-size-budget](../issues/06-rendering-and-size-budget.md). It recommends; the owner decides.

Sources:
- handoff §5 and §7
- the [04 draft](04-parser-contract-draft.md) (contract D1)
- the [03 design spec](03-design-spec.md) (`Markdown` and `DepGraph` components, G9, G15)
- [01 FINDINGS](01-findings.md)
- the [fixtures](../../fixtures/README.md) traps

**How the sizes were measured:** the packages were installed from npm on Nov 19 and bundled with esbuild 0.28.2 (`--bundle --minify --format=esm`, browser), then compressed with `gzip -9`. That is close to what Vite 8 produces. Speed is node 26, rendering the 78 fixture files (32 KB) 20 times. Figures marked *est.* are estimates.

**Owner-judgement questions:**
- J1: raw HTML policy.
- J2: Mermaid loading mode.
- J3: syntax highlighting.
- J4: markdown-it over marked.

Everything else can be accepted as a block.

---

## 1. Markdown renderer

| | markdown-it 15.0.3 | marked 18.2.1 | micromark 4.0.3 + gfm 3.0.0 | unified 11 + remark-parse/gfm/rehype/stringify |
|---|---|---|---|---|
| min / **gzip** (measured) | 99.7 KB / **41.7 KB** | 51.9 KB / **15.7 KB** | 77.2 KB / **22.3 KB** | 175.6 KB / **54.0 KB** |
| Render speed (measured) | **36 µs/file** | **35 µs/file** | 437 µs/file | 534 µs/file |
| GFM tables / strikethrough | built in | built in | extension | remark-gfm |
| GFM task lists | ~20-line core rule (or a plugin) | built in | extension | remark-gfm |
| **Source line numbers on tokens** | **yes: `token.map` on every block token** | no | positions, but only through the hard extension API | yes (mdast `position`) |
| (a) Link interception | `renderer.rules.link_open` | `renderer.link` override | write an HTML extension (awkward) | rehype visitor |
| (b) Autolink via `scanText` | core rule after `text_join`: split `text` tokens, skipping link and code children | `walkTokens` or a `text` override; you must track being inside a link yourself | tokenizer extension (complex) | `mdast-util-find-and-replace`-style visitor |
| (c) Item ids and decoration | `heading_open` rule, joined to `rec.items` **by line** | only by heading order or slug (fragile) | hard | by position |
| Raw HTML handling | `html: true` plus overriding `html_inline` and `html_block` | `renderer.html` override (no option to disable) | `allowDangerousHtml` on or off | `allowDangerousHtml` |
| Unsafe URLs | `validateLink` blocks `javascript:`, `vbscript:`, `file:` and non-image `data:` by default | **passes `javascript:` through** (checked) | escapes | hast-util-sanitize |

markdown-it's 41.7 KB breaks down as: core 51.7 KB min, `entities` 23.8, `linkify-it` 11.3, `uc.micro` 5.3, `mdurl` 4.8 and `punycode` 2.4. It ships its own TypeScript types (`dist/markdown-it.d.cts`).

**Recommend: markdown-it 15.0.3** (published Oct 16, 2026, so older than two weeks). The deciding point is not speed, because markdown-it and marked are tied. It is `token.map`. The 04 contract keys everything by file line: `Item.line`, `Heading.line`, `Link.line` and `bodyLine`. With line maps the renderer *joins* to the parser's records and never re-derives them, so there is no second parse doing the parser's job. marked would save 26 KB gzip, but item decoration would then need heading-order matching. That breaks on a `###` inside a blockquote or list, which the parser's line scan does not count. See J4.

**How it fits the parser (no duplicate work):**
- **Frontmatter:** blank the lines before `rec.bodyLine` (do not cut them), so `token.map[0] + 1` equals the file line.
- **Anchors above a heading** (the rsa 05 and rsa 11 traps): blank the anchor line for each `rec.items` entry with `anchor: 'above'` (`Item.line` is that line). This is required. Both markdown-it and marked treat an unclosed `<a id="q1">` line as the start of an HTML block, which **swallows the next `### Q1` heading as raw text** (verified on rsa 11). The closed form becomes an empty `<p>`.
- **Headings:** `heading_open` looks up `rec.headings` and `rec.items` by line. It sets `data-anchor` (the item id, else the explicit anchor, else the GitHub slug from the parser) and adds the IdTag and marker decoration (G9). The renderer never computes slugs.
- **Links:** `link_open` calls `resolveHref(href, path, index)` (04 D1). This is cheap and needs no matching against `rec.links`.
- **Autolinks:** a core rule, `ticket_autolink`, pushed after `text_join`. It runs `scanText(token.content, path, index)` on each `text` child that is not between `link_open` and `link_close`. `code_inline` and fences are separate token types, so code is skipped automatically. Ranges become `link_open` / `text` / `link_close` tokens. Keep `linkify: true` for bare `https://` URLs (GFM autolink literals): linkify-it is in the bundle anyway, and linkify runs before our rule.
- **Task lists:** a ~20-line core rule that renders a disabled checkbox with `pointer-events: none` (03 spec: display-only). This avoids `markdown-it-task-lists` 2.1.1, which is stale (last published 2022).
- **Fences:** `fence` rule. A `mermaid` fence becomes a placeholder `<div data-mermaid="n">` holding the escaped source. Any other fence becomes `<pre><code>` plus the copy button (03 spec), handled by a delegated click listener.
- **Ids across panes:** the middle pane and the right panel can show the same doc in one DOM, so **use `data-anchor` and container-scoped `querySelector`, not `id`**, for scrolling. That way duplicate ids (including DUP_ANCHOR cases like step2b 41) cannot collide.
- **Output:** an HTML string per render through Svelte `{@html}`. Render only the visible docs (middle and panel) and cache nothing beyond them, because the index holds no bodies (04 §1.1).

## 2. Sanitising

**Recommend: no DOMPurify. markdown-it with `html: true` plus a whitelist in the two HTML renderer rules.**

- `html: false` is wrong here: it escapes `<a id="q1"></a>`, so it shows up as literal text.
- `html_inline` handling:
  - `^<a\s+id=(["'])([\w.-]+)\1\s*>$` is re-serialised from the captured id, never passed through. Inside a heading it emits nothing, because `heading_open` already set the anchor. Elsewhere (AC list items) it emits `<a data-anchor="x"></a>`.
  - `</a>` emits nothing.
  - Everything else is escaped (J1).
- `html_block` handling: anchor-only lines are already blanked. Any other block is escaped into a muted `<p class="raw-html">`.
- `validateLink` (default) blocks `javascript:` and similar schemes. `link_open` then emits only resolved hrefs (section 6), so no attacker-controlled `href` reaches the DOM.
- **Images:** `src` is only ever rebuilt as `/doc/<resolved docs-relative path>` (section 6). External `http(s)` images are not loaded (offline app). Show them as a link.
- **Defence in depth:** a CSP meta tag in `index.html`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`. Mermaid needs inline styles in its SVG. Verify that Wails v3's runtime and Mermaid run without `unsafe-eval`.
- This is correct by construction (an allowlist of one tag), and costs about 0.5 KB against DOMPurify's measured **12.3 KB gzip**. Mermaid bundles its own DOMPurify for its SVG (`securityLevel: 'strict'`), so that copy arrives only in the lazy chunk.

## 3. Mermaid and the dependency graph

**Mermaid 12.3.0** (published Nov 3, 2026, so 16 days old). Measured with esbuild code-splitting:

| Piece | gzip | min |
|---|---|---|
| All chunks (107 files), the cost on disk in the exe | 1.53 MB | 5.34 MB |
| Core static closure (needed for any diagram) | 243 KB | — |
| Core + flowchart + dagre layout (cash-handling-workflow 04) | **367 KB** | 1.47 MB |
| Sequence diagram (ocm-cutover-handoff) | 245–300 KB *est.* | — |
| `@mermaid-js/tiny` 12.3.0 (a single IIFE, no splitting) | 759 KB | 2.85 MB (worse; do not use) |
| `beautiful-mermaid` 1.1.3 (pulls in elkjs) | 470 KB | 1.56 MB (not lighter) |

**Recommend:**
- Load it with `const { default: mermaid } = await import('mermaid')` only when `rec.hasMermaid` is true (04 already gives that flag).
- Initialise with `startOnLoad: false`, `securityLevel: 'strict'`, `theme: 'base'`, and `themeVariables` taken from the CSS tokens (`--code`, `--fg`, `--acc`). Re-render when the theme toggles.
- Render each `[data-mermaid]` placeholder in order. On a render error, show the source with an error line (03 spec state).
- Cache the SVG by (path, mtime, block index, theme) for the two panes only.

Vite splits the diagram types automatically, so a flowchart doc pulls in about 370 KB gzip and nothing else. The cost is about +5.5 MB in the exe, because embedded assets are stored uncompressed. RAM cost is about +20–35 MB private once loaded (*est.*, measure it). ES modules cannot be unloaded. If the measurement breaks the budget, the fallback is to render inside a throwaway same-origin `<iframe>`, copy the SVG out, and remove the iframe so its heap is freed.

**Alternatives considered:** source-only display (0 KB, see J2). Pre-rendering in Go is out: mermaid-cli needs Chromium.

**Dependency graph:**

| Option | Size | Verdict |
|---|---|---|
| Mermaid `flowchart` | +367 KB gzip lazy, no HTML nodes, cannot do the spec's motion or styling | no |
| elkjs 0.12.1 | **450 KB** gzip | no |
| @dagrejs/dagre 3.1.3 | **17.3 KB** gzip | fallback only |
| **Hand-rolled layered SVG** | about 3–5 KB min *est.* | **recommend** |

The hand-rolled option is what the 03 spec already specifies (`DepGraph`: "longest-path layering, no library"). It works like this:
- Longest-path layers from `edges` with `field === 'blocked_by'`.
- One or two barycentre sweeps to reduce edge crossings (about 40 lines).
- Fixed grid: 176 px columns and 84 px rows; nodes are HTML (144×58); edges are SVG cubic paths with `pathLength="1"` for the `draw` and `march` motion.
- Cross-space edges become stubs.

Switch to dagre only if a real space with 40+ tickets looks tangled.

## 4. Syntax highlighting

There are no fenced code blocks with a language in the fixtures, apart from Mermaid. The convention docs have 9 in total. Code blocks render in Geist Mono on `--code` with the copy button.

- **Recommend: none in v1 (0 KB)** (J3).
- If wanted later: highlight.js **11.12.0** core plus ts, sql, powershell, bash, json, yaml and csharp, measured at **18.5 KB gzip**. Load it lazily the same way as Mermaid, only when the doc has a fence with a known language. Unknown languages stay plain.
- Shiki 4.6.0 is not recommended: it needs a WASM regex engine plus grammars, hundreds of KB.

## 5. Budgets

Gzip matters less here than on the web, because assets load from the exe and not over a network. What costs is parse, compile and heap, so track min size too.

| Budget | Target | Hard cap | Basis |
|---|---|---|---|
| Initial JS | **≤ 120 KB gzip, ≤ 400 KB min** | 150 KB gzip | markdown-it 41.7 (measured) + Svelte runtime and components 35–50 *est.* + parser `lib.mjs` 8–12 *est.* + @wailsio/runtime ~5 *est.* + icons ~5 (03 D3) |
| CSS | ≤ 15 KB gzip | 25 KB | Tailwind 4 purged, plus tokens |
| Fonts | 52 KB woff2 | — | 03 D3, decided |
| Lazy: Mermaid | ≤ 400 KB gzip per diagram family | 450 KB | measured 367 KB for flowchart |
| Lazy: highlight.js (only if J3 is yes) | ≤ 25 KB gzip | — | measured 18.5 KB |
| Exe | ≤ 18 MiB | 20 MiB | 01: 10.15 MiB, + about 5.5 MB Mermaid chunks, + fonts and app |

**Webview memory**, measured as in 01 (private bytes summed over the app and all `msedgewebview2.exe` processes, after 30 s idle). **B** = ticket 07's tuned "indexed, idle" figure (01 untuned: 241 MB).
- **B + ≤ 15 MB:** a typical ticket rendered in the middle pane and another in the panel, with no Mermaid loaded.
- **B + ≤ 45 MB:** after a Mermaid doc has been shown.
- **No upward trend:** after opening 50 docs in a row, B + ≤ 5 MB above the first-doc figure. This is the leak check.

**Enforce it:** a ~20-line `scripts/size-check.mjs` run after `vite build`. It gzips every `dist/assets/*.js` that `index.html` reaches statically, and fails above the hard cap. The memory figures are a manual check per release slice.

## 6. Autolink configuration and link interception

**Known spaces:** these come from `index.spaces` (04 `Index`), which `scanText(text, fromPath, index)` already reads. There is no separate config and no list kept in the renderer. A space added on disk shows up after the next `updateIndex`.

**ADO and PR URL templates:** these live in Go config. Ticket 05 owns the file and its persistence; this ticket only fixes the keys:

```json
{ "ado": {
  "workItemUrl": "https://dev.azure.com/skywardins/Lockbox%20and%20Cash%20Payment/_workitems/edit/{id}",
  "prUrl":       "https://dev.azure.com/skywardins/Lockbox%20and%20Cash%20Payment/_git/<repo>/pullrequest/{id}" } }
```

- Use one whole template per kind, with the repo name baked into `prUrl`. This avoids composing org, project and repo parts.
- The frontend reads it once at startup through a typed binding (`ConfigService.Get()`) into a `$state`.
- A key left unset means `ado:` and `pr:` values and `card NNNNN` refs show as plain mono text with no link. They are never guessed.
- `scanText`'s `kind: 'ado'` refs and the header card both use the same `adoUrl(id)` and `prUrl(id)` helpers.

**Link-click interception:** `link_open` emits markers only:

| Resolved | Emitted |
|---|---|
| internal, `ok` | `<a href="#" data-path="…" data-frag="…" title="<path>">` |
| internal, `!ok` | `<a class="lk-broken" aria-disabled="true" title="Not found: …">` (03 spec 4.1; rsa 07 `../notes/gone.md`, cash-handling-workflow 16 `15-gone-ticket.md`) |
| `outside` | plain text with a title |
| external (http, https, mailto) | `<a href="#" data-ext="…">` |
| `vscode:` | `data-ext`, handed to Go |
| bare `#frag` | `data-frag` only |

There is one delegated `click` and `auxclick` listener on each `Markdown` root:
- `data-path` calls `onLink(path, frag)`, which opens the target in the right panel (handoff §7). Ctrl-click or middle-click opens it in the middle pane.
- `data-frag` only: scroll within the same container.
- `data-ext`: open with `Browser.OpenURL` from `@wailsio/runtime`.

A capture-phase listener on `document` calls `preventDefault` on any other `<a>`, so the webview never navigates away from the app.

**Images:** these depend on the Go side, which 05 must add. A Wails v3 asset-handler middleware serves `/doc/<docs-relative path>`:
- image extensions only, inside the docs root, with `..` rejected;
- everything else returns 404.

The renderer emits `<img src="/doc/…" loading="lazy">`. A capture-phase `error` listener on the root (CSP forbids inline `onerror`) swaps a failed image for the placeholder: "Not in this checkout: `evidence/02-lastused-before.png`" (rsa 02, cash-handling-workflow 09). This avoids base64 copies in JS memory.

## 7. Questions for the owner

### J1 — Raw HTML other than `<a id>`
Options:
- (a) Escape it, so it shows as literal text and nothing is hidden.
- (b) Strip the tags and keep the inner text (GitHub-like).
- (c) Same as (a), but also allow a bare `<br>`, which is common in GFM table cells.

**Recommend (c).** `<br>` takes no attributes, so it carries no risk. Escaping the rest keeps agent-written oddities visible in a read-only viewer.

### J2 — How Mermaid loads
Options:
- (a) Lazy import, rendered automatically when the doc has a block.
- (b) Lazy import, but only after a "Render diagram" click. The source shows until then.
- (c) Never: show the source only, saving 0 KB of JS and about 5.5 MB of exe.

**Recommend (a).** Only 2 docs use it, so the about 370 KB / +20–35 MB RAM cost is rare and is paid only when such a doc is opened. If the measured RAM breaks the B + 45 MB budget, move to (b) before trying the iframe trick.

### J3 — Syntax highlighting in v1
Options:
- (a) None.
- (b) highlight.js core plus 7 languages, lazy, measured at 18.5 KB gzip.

**Recommend (a).** Ticket code blocks are rare and short. (b) is a one-file add later.

### J4 — markdown-it (41.7 KB gzip) or marked (15.7 KB gzip)
Both render at about 35 µs per file. markdown-it costs 26 KB more, which is about 100 KB of JS to parse and well under 1 MB of heap: noise next to WebView2's ~210 MB. In return:
- line maps, so rendering joins to the parser's `items` and `headings` by line;
- unsafe-URL blocking by default;
- a token stream that makes the `scanText` autolink rule simple.

**Recommend markdown-it.**

## Pinned versions (proposal)

| Package | Version | Published | Role |
|---|---|---|---|
| markdown-it | 15.0.3 | Oct 16, 2026 | renderer (ships its own types) |
| mermaid | 12.3.0 | Nov 3, 2026 | lazy chunk |
| highlight.js | 11.12.0 | Aug 12, 2026 | only if J3 is (b) |
| @dagrejs/dagre | 3.1.3 | Oct 24, 2026 | graph fallback only, not installed in v1 |
| DOMPurify, marked, micromark, remark, Shiki, elkjs | — | — | not used |

Not yet verified (put it in the first build slice):
- markdown-it 15's renderer and `core.ruler` API in a full Svelte build. It was checked in node: `core.ruler` holds `…linkify, replacements, smartquotes, text_join`, and `token.map` is present.
- Mermaid under the CSP.
- The real Svelte and parser chunk sizes.
- The memory figures against 07's tuned baseline.
