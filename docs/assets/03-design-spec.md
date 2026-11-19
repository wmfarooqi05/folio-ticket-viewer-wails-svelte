# 03 — Design spec: Folio Ticket Viewer, Indigo theme

Extracted Nov 19, 2026 from [03-folio-mockup.html](03-folio-mockup.html), as input to [03-ui-design](../issues/03-ui-design.md). **Already decided (owner):** this mockup is the design, and the theme is **Indigo**. This spec captures that design and flags gaps. It does not reopen the choice.

Other sources: [design-prompt.md](../design-prompt.md), [map.md](../map.md) (Wails v3 + Svelte 5 + Tailwind v4, read-only, low RAM), [handoff §7](../handoff/handoff.md), [04 parser contract](04-parser-contract-draft.md) (`DocRecord`, `Index`).

**About the mockup file.** It is a bundler export. A loader script unpacks a base64+gzip manifest: React 18.3.1 UMD (about 142 KB, used only for the demo), a 69 KB runtime, 11 Geist woff2 subsets and a 94 KB HTML template. All values below come from the decoded template and its component script (`renderVals()`). The mockup uses no CSS file and no Tailwind: every style is inline, and the colours are CSS custom properties set on the root element.

Labels: **[R]** is a recommendation from this spec. **[O]** needs the owner. Anything without a label is extracted from the mockup.

---

## 1. Theme tokens (Indigo)

The mockup has **light and dark**. The accent is `oklch(L C H)`, with hue `H = 268` for Indigo. The other accents differ only in hue.

### 1.1 Colour tokens (exact)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#fafaf8` | `#151514` | app background, middle pane |
| `--side` | `#f3f3f0` | `#1a1a19` | top bar, left tree |
| `--card` | `#ffffff` | `#1f1f1d` | header card, tables, board cards, right panel, buttons |
| `--colbg` | `rgba(30,30,20,.03)` | `rgba(255,255,240,.025)` | board column background |
| `--hover` | `rgba(30,30,20,.05)` | `rgba(255,255,240,.05)` | row and button hover |
| `--line` | `rgba(30,30,20,.08)` | `rgba(255,255,240,.075)` | hairlines, card borders |
| `--line2` | `rgba(30,30,20,.15)` | `rgba(255,255,240,.15)` | stronger borders, inputs, scrollbar thumb |
| `--fg` | `#1c1c1a` | `#ecece7` | primary text |
| `--fg2` | `#585850` | `#a9a9a1` | secondary text |
| `--fg3` | `#8b8b83` | `#77776f` | tertiary text, labels, IDs |
| `--chip` | `rgba(30,30,20,.05)` | `rgba(255,255,240,.06)` | type chips, ID tags, badges |
| `--code` | `#f5f5f2` | `#1a1a18` | code and mermaid block background |
| `--glass` | `rgba(255,255,255,.78)` | `rgba(31,31,29,.78)` | demo screen switcher only (cut, see 4) |
| `--shadow` | `0 1px 2px rgba(30,30,20,.05)` | `0 1px 2px rgba(0,0,0,.3)` | header card, board cards |
| `--shadow2` | `0 10px 30px -12px rgba(30,30,20,.25)` | `0 10px 30px -10px rgba(0,0,0,.6)` | card and node hover, toast |
| `--acc` (Indigo) | `oklch(.54 .15 268)` ≈ `#4967c5` | `oklch(.74 .12 268)` ≈ `#8aa8f7` | accent: links, AFK tag, primary button, checked AC, brand mark |
| `--acc-ink` | `#ffffff` | `#151514` | text on accent |
| `--sel` | `color-mix(in oklab, var(--acc) 9%, transparent)` | same, **16%** | selected tree row, panel item highlight, first-run glow |

The hex values marked ≈ are sRGB conversions for reference. **Use the oklch values:** WebView2 (Chromium 111 or later) supports `oklch()` and `color-mix()`.

### 1.2 Status colours (exact)

| Status | Token | Light | Dark | Label | Extra |
|---|---|---|---|---|---|
| open | `--s-open` | `#8b8b85` | `#8f8f88` | Open | — |
| in-progress | `--s-prog` | `oklch(.6 .14 245)` ≈ `#1f86cd` | `oklch(.72 .13 245)` ≈ `#56acf0` | In progress | dot pulses (see 6) |
| blocked | `--s-block` | `oklch(.58 .17 27)` ≈ `#cb473f` | `oklch(.68 .16 27)` ≈ `#ea6b60` | Blocked | — |
| in-review | `--s-rev` | `oklch(.73 .14 75)` ≈ `#da992c` | `oklch(.8 .13 80)` ≈ `#e9b452` | In review | — |
| done | `--s-done` | `oklch(.62 .12 152)` ≈ `#459b61` | `oklch(.73 .12 152)` ≈ `#69bd82` | Done | blocker chip pointing to a done ticket at `opacity:.55` |
| dropped | `--s-mute` | `#b5b5ae` | `#5f5f59` | Dropped | label struck through, title in `--fg3` |
| superseded | `--s-mute` | `#b5b5ae` | `#5f5f59` | Superseded | struck through, same as dropped |
| unknown | none | — | — | **raw text** | dot `transparent` with `1.5px dashed var(--fg3)`; pill background `transparent`, border `var(--line2)` |

**Pill recipe** (the header card, table and panel use the same one): background `color-mix(in oklab, <status> 13%, transparent)`, border `1px solid color-mix(in oklab, <status> 30%, transparent)`, a dot filled with `<status>`, and text in `--fg`. The pill is 22px tall in the header card and panel and 20px in the table, with radius 999px, padding `0 9px 0 8px`, font 12px/500 (11.5px in the table) and a 7px dot (6px in the table). **Graph node fill:** `color-mix(in oklab, <status> 9%, var(--card))`, with the pill's border.

**Unknown, in data terms:** the contract gives `status: 'unknown'` and keeps the raw text in `status_note`. The pill shows `status_note`, or `unknown` when that is null. **[R]**

**Other semantic colours:**
- Waiting and question **age bar** (44×4px): `--s-block` at 14 days or more, `--s-rev` at 7 days or more, otherwise `--fg3`. The fill is `age/20` capped at 100%. The age text turns `--s-block` at 14 days or more, otherwise `--fg2`.
- **Item markers:** answered and mitigated use `--s-done`. Open, or moved elsewhere, uses `--s-rev` (moved is an outline dot). Decided uses `--acc`.

### 1.3 Typography (exact)

| Token | Value |
|---|---|
| `--sans` | `'Geist', system-ui, sans-serif` |
| `--mono` | `'Geist Mono', ui-monospace, Menlo, monospace` |
| Base | 13px, `-webkit-font-smoothing: antialiased` |
| Weights | 400, 500 and 600. Geist is a variable font: one file per subset covers all three. |

Type scale, by role:

| px | Weight | Role |
|---|---|---|
| 28 | 600, ls −.025em | first-run H1 |
| 23 | 600, ls −.02em, lh 1.25 | document, map and view H1 |
| 16 | 600, ls −.01em | Markdown H2 (margin `30px 0 10px`) |
| 15.5 | 600, ls −.01em, lh 1.35 | panel item title |
| 14.5 | 400, lh 1.7 | Markdown paragraph; first-run lead (lh 1.6) |
| 14 | 500 | item and question titles, AC rows, view lead text (fg2, lh 1.6) |
| 13.5 | 400, lh 1.65 | panel paragraph; brand "Folio" (600, ls −.01em) |
| 13 | 400/500 | tables, board card title (500, lh 1.35), item body (fg2, lh 1.55) |
| 12.5 | 400 | tree rows, search, crumb, panel links, code (mono, lh 1.65) |
| 12 | 500 | buttons, table headers (fg2), board column header (600), pills, graph node title (500) |
| 11.5 | 400 | mono path above the card, chips, markers, age text, header-card IDs (mono 12) |
| 11 | 400 | badges, footer, LINKS label (ls .04em), mono column counts |
| 10.5 | 400 | mono badges, ID tags (`Q3`, `AC1`), code-block header, `READ-ONLY` tag (ls .04em) |
| 10 / 9.5 | 400 | `LEGACY` and `AFK` tags (10, ls .05em); tree `legacy` tag and board AFK (9.5) |

`text-wrap: pretty` is applied to titles and paragraphs.

### 1.4 Spacing, size, radius, border (exact)

- **Layout:** top bar 44px. Left tree **280px** (collapsible to 0). Right panel **360px** (0 when closed), with its own 44px header. When the panel is open and the viewport is under **1200px**, the tree auto-hides.
- **Middle max-width:** document 780px, with padding `22px clamp(18px,4vw,40px) 120px`. Map 900px in Table mode and 1180px in Board and Graph. Waiting on and Open questions 900px, with padding `26px 40px 120px`.
- **Control heights:** tree row min 26px, pinned row 28px, search 30px, button 28px (segmented toggle 26px), pill 22/20px, chip 22px (board chip 19px), first-run button 40px.
- **Tree indent:** `8 + depth × 14` px. Module rows 22px, module children 36px, tickets 64px.
- **Header card:** padding `16px 20px 14px`. Field grid `88px | 1fr`, row gap 9px, column gap 12px, with a top hairline.
- **Board:** 5 columns, `repeat(5, minmax(180px,1fr))`, gap 10px. Column padding 8px, radius 12px, min height 260px. Card padding `10px 11px`, radius 9px, gap 7px.
- **Graph:** node 144×58px, radius 10px. Column step 176px, row step 84px. Stub 136×26px, radius 7px. Canvas dot grid `radial-gradient(var(--line2) 1px, transparent 1px) 18px 18px`. Arrowhead is an 8×8 path filled with `--fg3`.
- **Radii in use:** 3, 4, 5, 6, 7, 8, 9, 10, 12 and 999 px. Mapped to tokens: xs 4, sm 6, md 7, lg 10, xl 12, full.
- **Borders:** always `1px solid var(--line)`, or `--line2` for stronger ones. **Dashed** borders mean "not really here": legacy tag, cross-module stub, missing image, outline dots.
- **Scrollbar** (WebKit): 10px, thumb `--line2`, radius 10, with a 3px transparent border.

### 1.5 Tailwind v4 (`app.css`)

```css
@import "tailwindcss";

/* Raw tokens. Light is the default. */
:root {
  --bg:#fafaf8; --side:#f3f3f0; --card:#ffffff; --colbg:rgba(30,30,20,.03);
  --hover:rgba(30,30,20,.05); --line:rgba(30,30,20,.08); --line2:rgba(30,30,20,.15);
  --fg:#1c1c1a; --fg2:#585850; --fg3:#8b8b83; --chip:rgba(30,30,20,.05); --code:#f5f5f2;
  --shadow:0 1px 2px rgba(30,30,20,.05); --shadow2:0 10px 30px -12px rgba(30,30,20,.25);
  --s-open:#8b8b85; --s-prog:oklch(.6 .14 245); --s-block:oklch(.58 .17 27);
  --s-rev:oklch(.73 .14 75); --s-done:oklch(.62 .12 152); --s-mute:#b5b5ae;
  --acc:oklch(.54 .15 268); --acc-ink:#ffffff; --sel-pct:9%;
  --sel:color-mix(in oklab, var(--acc) var(--sel-pct), transparent);
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg:#151514; --side:#1a1a19; --card:#1f1f1d; --colbg:rgba(255,255,240,.025);
  --hover:rgba(255,255,240,.05); --line:rgba(255,255,240,.075); --line2:rgba(255,255,240,.15);
  --fg:#ecece7; --fg2:#a9a9a1; --fg3:#77776f; --chip:rgba(255,255,240,.06); --code:#1a1a18;
  --shadow:0 1px 2px rgba(0,0,0,.3); --shadow2:0 10px 30px -10px rgba(0,0,0,.6);
  --s-open:#8f8f88; --s-prog:oklch(.72 .13 245); --s-block:oklch(.68 .16 27);
  --s-rev:oklch(.8 .13 80); --s-done:oklch(.73 .12 152); --s-mute:#5f5f59;
  --acc:oklch(.74 .12 268); --acc-ink:#151514; --sel-pct:16%;
  color-scheme: dark;
}
/* Follow the OS unless the user picked a theme. Repeat the dark block here,
   or set data-theme from matchMedia in 10 lines of JS. */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* same as the dark block */ } }

@theme inline {
  --color-bg: var(--bg);     --color-side: var(--side);  --color-card: var(--card);
  --color-colbg: var(--colbg); --color-hover: var(--hover);
  --color-line: var(--line); --color-line2: var(--line2);
  --color-fg: var(--fg);     --color-fg2: var(--fg2);    --color-fg3: var(--fg3);
  --color-chip: var(--chip); --color-code: var(--code);  --color-sel: var(--sel);
  --color-acc: var(--acc);   --color-acc-ink: var(--acc-ink);
  --color-s-open: var(--s-open); --color-s-prog: var(--s-prog); --color-s-block: var(--s-block);
  --color-s-rev: var(--s-rev);   --color-s-done: var(--s-done); --color-s-mute: var(--s-mute);
  --shadow-hair: var(--shadow); --shadow-lift: var(--shadow2);
}
@theme {
  --font-sans: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, Menlo, monospace;
  --text-2xs: 10.5px; --text-xs: 11.5px; --text-sm: 12.5px; --text-base: 13px;
  --text-md: 14.5px; --text-lg: 16px; --text-xl: 23px; --text-2xl: 28px;
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 7px; --radius-lg: 10px; --radius-xl: 12px;
  --spacing: 1px; /* the mockup uses odd pixel sizes (26, 22, 9), so p-[9px] reads as p-9 */
  /* motion tokens: see 6.2 */
}
```

`--spacing: 1px` is **[R]**: it lets `h-26` and `gap-9` match the mockup exactly. If the team prefers Tailwind's 4px grid, use arbitrary values (`h-[26px]`) instead.

### 1.6 Other themes and switchers

- **Accent themes in the mockup:** Indigo, Teal and Tangerine (hues 268, 195 and 48). **[R] Drop the accent switcher.** Indigo is fixed, so it is one token.
- **Light/dark:** the mockup has a Light/Dark toggle in the top bar. **[R] Keep it.** It costs one `data-theme` attribute, about 15 lines, and one persisted config value. The default follows `prefers-color-scheme`, and the button overrides it.
- **Motion prop:** the mockup has a `motion` boolean that sets every animation to `none` and `--dur` to 0s. **[R]** Replace it with `prefers-reduced-motion`, and add no in-app toggle (see 6.4).

---

## 2. Screen inventory

The mockup has six screens, switched by a demo pill bar (keys 1–6). The views are `doc`, `map` (modes `table`, `board`, `graph`), `waiting`, `questions` and `first`.

| # | Mockup screen | What it shows | Handoff §7 requirement | Coverage |
|---|---|---|---|---|
| — | **Shell** (all screens) | 44px top bar (sidebar toggle, ◆ Folio, root path, crumb, `READ-ONLY` tag, Light/Dark). Left tree 280. Middle. Right panel 360. | three panes | **covered** |
| — | Left tree | search (`/` to focus), 3 pinned views with counts, `modules/` (≈35), `handoffs/`, `patterns/`; per-module `map.md` and `issues/`; status dots, status word on hover, open-count badges, `legacy` tag, footer "Watching N files · Change folder" | tree, status dot, `_templates/` hidden | **covered** (hiding `_templates/` is the parser's job) |
| 1 | **Document** (`one-cash-mover 05`) | mono path, header card, rendered body: H2, paragraph with internal link, mermaid flowchart, GFM table, AC checklist, code block with copy, missing-image placeholder, Q, D and R items with ID tags and markers. Right panel open on `map.md#q3`. | header card; render GFM, task lists, mermaid, images with placeholder; items with tags and markers | **covered**, except the broken link (below) |
| 1b | Document, short ticket | `Summary` and an `Acceptance criteria` list (non-`full` tickets) | — | covered (demo variant) |
| 1c | Legacy file (`cutover-notes-2024.md`) | `LEGACY` tag (dashed, tooltip "No frontmatter. Fields inferred.") and an italic "inferred" next to the pill | legacy badge | **covered** |
| — | Raw-status ticket (`dh-03`, `waiting-dba`) | unknown-status pill with raw text, dashed outline dot | unknown status | **covered** |
| — | **Right panel** | `← Back` (`⌥←`, dim when the stack is 1), centered mono file name, `Open in middle`, `×` (Esc). Trail breadcrumb (`Q3 › 07 › …`). Source path. "Showing one item from this file." for fragments. Highlighted item block (tag, title, pill or marker). Paragraphs. LINKS list (`blocked by`, `related`, `raised in`, `used by`, child Qs). | side panel, fragment-only view, back stack, open in middle | **covered** |
| 2 | **Board** (map, Board mode) | map header (path, name, description, Table/Board/Graph segmented toggle), status-segment progress bar with "N tickets · N open · N blocked", 5 kanban columns, collapsed "Dropped & superseded" strip | Board per map; Table/Board toggle | **covered** |
| 2b | Map, Table mode | table of `# · Title · Type · Status · Blocked by · Waiting on` | Table/Board toggle | **covered**, but no PR column (§6 has one); see 4 |
| 3 | **Waiting on** | groups Owner (accent avatar) → Client → DBA → Infra → Ops; each row has key, title and age bar; oldest first | Waiting on, Owner first | **covered**; the age has no data source (see 4) |
| 4 | **Open questions** | every unanswered Q: tag, text, where (ticket key or `space · map.md`), ticket title, age; oldest first | Open questions | **covered**; age has no source; no J5 toggle |
| 5 | **Graph** (map, Graph mode) | layered left-to-right DAG by `blocked_by`, nodes coloured by status, dashed animated edges for live blockers, solid for resolved, dashed accent stubs for other modules, legend, "N dropped or superseded hidden" | Dependency graph, cross-space stubs | **covered** |
| 6 | **First run** | "Pick your docs folder", `Choose folder…` and `Try the sample docs`, three reassurance rows, "expects modules/ · handoffs/ · patterns/" | first-run state | **covered**, but the copy is wrong for Wails (see 4) |
| — | Open in VS Code | header-card button. The mockup only toasts `vscode://file/...`. | Open in VS Code | **covered** (UI only) |
| — | **Broken link** | **not drawn.** Only the missing *image* placeholder exists. The prompt asked for this state. | broken-link state | **missing** (spec in 4.1) |
| — | Dark mode | the theme toggle works on every screen | light and dark | covered |
| — | Diagnostics (`Index.diagnostics`) | none | not in §7 | not covered (see 4) |

---

## 3. Svelte components

These are Svelte 5 components (runes). State lives in a small set of `$state` stores (`index`, `view`, `panelStack`, `theme`). Props are typed from the contract. There are 17 components; nothing extra.

| Component | Purpose | Props (from `DocRecord` / `Index`) | States |
|---|---|---|---|
| `App` | the three-pane shell; owns `view`, `selectedPath`, `panelStack`, `sideOpen`; keyboard shortcuts | `index: Index` | first-run vs loaded; tree auto-hidden under 1200px when the panel is open |
| `TopBar` | sidebar toggle, brand, root path, crumb, `READ-ONLY`, theme toggle | `rootPath`, `crumb`, `theme` | light / dark |
| `Tree` | search, pinned views, folder rows, footer | `files: Record<path,DocRecord>`, `spaces`, `selectedPath`, `query`, `watchedCount` | browsing vs searching (flat results, "N matches"); folders open or closed |
| `TreeRow` | one row | `rec: DocRecord` (`path`, `kind`, `legacy`, `meta.status`), `depth`, `selected`, `openCount?` | folder / ticket / doc (`#` glyph); selected; hover shows the status word; struck through for dropped and superseded; `legacy` tag |
| `StatusDot` | dot plus an accessible label | `status: Status`, `raw?: string`, `size` 5/6/7 | 8 statuses; unknown = dashed outline; in-progress pulse |
| `StatusPill` | pill | `status`, `statusNote`, `size: 'md'\|'sm'` | 8 statuses; struck-through text for dropped and superseded; unknown shows the raw `status_note` |
| `RefChip` | blocker or related chip, links to the panel | `edge: Edge` (`to.path`, `crossSpace`), `target?: DocRecord` (title, status), `fromSpace` | same space shows `05`, other space shows `space 05`; done target at `.55`; broken (`to.ok=false`) |
| `HeaderCard` | frontmatter card | `rec: DocRecord` (`key`, `title`, `legacy`, `legacyRule`, `meta`: TicketMeta), `edges` from this path, `files`, config `adoWorkItemUrl`/`adoPrUrl` | migrated / legacy (`LEGACY` + "inferred"); AFK; empty fields show "none", "nothing" or "—"; status note (gap 4) |
| `DocView` | middle-pane document: path, `HeaderCard` (tickets only), `Markdown` | `rec: DocRecord`, `text: string` (fetched from Go) | ticket / map / doc; loading; file gone |
| `Markdown` | renders the body: GFM, task lists, sanitised HTML (`<a id>` only), code with copy, lazy mermaid, images, item decoration, link interception, auto-links | `text`, `rec` (`bodyLine`, `items`, `links[].resolved`, `hasMermaid`), `onLink(path, fragment)` | ok link / broken link (4.1) / external; image present / missing placeholder; mermaid loading / error (show source) |
| `MapView` | map header, progress bar, mode toggle, body by mode | `rec` (kind `map`, `meta`: MapMeta, `map.issuesDir`), `tickets: DocRecord[]`, `edges` | mode `table \| board \| graph` (Table only when `map.kanban`; see 4) |
| `Board` | 5 columns plus the dropped and superseded strip | `tickets: DocRecord[]`, `files` (to know if a blocker is done) | strip collapsed or open; empty column |
| `BoardCard` | card | `rec` (`num`, `title`, `meta.type[0]`, `meta.afk`, `meta.blocked_by`, `meta.waiting_on`) | hover lift; AFK; blockers (only unresolved ones); waiting line |
| `DepGraph` | layered SVG plus HTML nodes; longest-path layering, no library | `tickets`, `edges` (field `blocked_by`, filtered by space), `files` | live / resolved / stub edges; N hidden note |
| `WaitingOn` | grouped list | `files` where `kind==='ticket' && meta.waiting_on` (filter on open statuses per A9) | group per person, Owner first; empty state (not drawn) |
| `OpenQuestions` | list | `files[*].items` where `kind==='Q' && state==='open'` plus the owning record | J5 filter (gap 4); empty state |
| `SidePanel` | back stack of `{path, fragment}` | `stack`, `resolve` (`resolveHref`), `extractFragment`, `onBack`, `onPromote`, `onClose` | whole file / fragment ("Showing one item…") / not found; back disabled at depth 1 |
| `FirstRun` | folder picker | `onPick` (Go native dialog), `recent?` | idle / picking / error (folder has no `modules/`) |

Small parts that are not separate files: `IdTag` (the `Q3` chip), `AgeBar`, `Avatar` (person initial), `SegToggle`, `Toast`.

**Panel content [R]:** when the panel opens a whole ticket, the mockup shows only a summary paragraph and a LINKS list. Real tickets have no summary field. Render the target with the same `Markdown` component (or a compact `HeaderCard` plus the body), and keep the LINKS block built from `edges`.

---

## 4. Gaps and conflicts

### 4.1 §7 requirements the mockup lacks or gets wrong

| # | Gap | Proposal | |
|---|---|---|---|
| G1 | **No broken-link state** (asked for in the prompt). The contract gives `Resolved.ok=false` and `problem` `no-file`, `no-anchor` or `bad-ref`. | Inline: link in `--s-block` with a dashed underline, tooltip "Not found: `<path>`" or "No item #q3 in `<file>`". Click on `no-file`: the panel shows a not-found card (mono href, problem, "from line N"). Click on `no-anchor`: open the whole file with a banner "Item #q3 not found". The same style applies to `RefChip` (dashed red border). | [R] |
| G2 | **First-run copy assumes a browser:** "Needs Chrome or Edge", "in this tab", `showDirectoryPicker()`. | Wails uses a native dialog. Change row 3 to "Remembers the folder" (or drop it); "in this tab" becomes "on this PC". | [R] |
| G3 | **"Try the sample docs"** needs a bundled sample corpus. | Drop it, or ship `fixtures/docs` (about 64 files) in the binary. | **[O]** |
| G4 | **Age** ("6d") in Waiting on and Open questions has no source. `created`/`updated` come from git, which the parser does not read, and `mtime` is the last edit, not "waiting since". | (a) drop age; (b) show `mtime` as "edited Nd ago" with the same bar (recommended, zero cost); (c) Go reads `git log` per file (slow on that VM). | **[O]** (recommend b) |
| G5 | The header card has **no `status_note`, `blocked_note` or `superseded_by`**, all in `TicketMeta`. Legacy tickets rely on `status_note`. | Show `status_note` in `--fg3` after the pill (`In review — merged to dev in PR 208`). Show `blocked_note` as a text line under the Blocked by chips. Show `superseded_by` as a "Superseded by" row with a chip. | [R] |
| G6 | `pr[]` and `ado[]` are **arrays of numbers**; the mockup shows one of each and `ADO AB#4471`. | Render each as `PR #208 ↗` and `ADO 72633 ↗`, with URLs from config templates. | [R] |
| G7 | **Map Table mode** is a synthetic table without a PR column. The mockup never renders the map's own prose (Destination, Risks, Open questions); only the description line. | Make the modes **Doc · Board · Graph**. "Doc" renders `map.md` as Markdown, which already contains the generated §6 table (with PR). This cuts a table component. The map header shows `MapMeta.status`, and the description is the first paragraph. Show Board only when `map.kanban`. | **[O]** (recommend) |
| G8 | **Open questions J5:** no filter for Qs in closed tickets. | A "Hide closed tickets" toggle, on by default, in the view header. | [R] (J5 is the owner's in 04) |
| G9 | **Items in rendered Markdown:** the mockup draws Q, D and R as compact rows, but real files have `### <a id="q3"></a>Q3 — …` headings with a bold marker line. | Decorate in the renderer: an item heading gets an `IdTag` and a 14px/500 title; the `**Answered …:**` line becomes a marker row with a coloured dot (from `Item.state`). No layout beyond that. | [R] |
| G10 | **Empty states** are not drawn: no waiting tickets, no open questions, an empty column, a search with no matches, a folder with no `modules/`. | One line of `--fg3` text each. | [R] |
| G11 | **Diagnostics** (`FM_REF`, `LINK`, `DUP_NUM`, …) are not shown anywhere. | v1: a count in the tree footer ("3 warnings") that opens a plain list in the middle pane. Or skip in v1. | **[O]** |
| G12 | **Selectable text:** the mockup puts no `user-select` rules. | Per map.md: `select-none` on the top bar, tree, buttons, toggles and board chrome; IDs, paths, PR numbers and the body stay selectable. | [R] |
| G13 | **Product name and brand:** the mockup calls the app "Folio", with a ◆ mark. | Keep "Folio" as the window title and brand, or name it "Ticket viewer". | **[O]** |
| G14 | **Auto-linked text** (`cloud-migration 07`, `card 84997`) is not drawn. | Same style as a normal internal link; ADO links get `↗`. | [R] |
| G15 | **Mermaid** is a static mock. A real Mermaid build is about 1 MB+ of JS. | Load it lazily only when `rec.hasMermaid`; the size budget is ticket 06's call. | (ticket 06) |
| G16 | **Live refresh:** "Watching 412 files" is implied, but there is no "file changed" cue. | Re-render silently. Keep the scroll position. | [R] |

### 4.2 Mockup features that add weight or go beyond scope

| Feature | Verdict |
|---|---|
| React 18 UMD + bundler runtime (about 210 KB) | demo only, not carried over; Svelte 5 replaces it |
| Bottom **screen-switcher pill** (`--glass`, `backdrop-filter: blur(12px)`), keys 1–6 | **cut** (demo navigation; the blur is a GPU cost). Navigation is the pinned views and the tree. |
| Accent switcher (Indigo/Teal/Tangerine) | **cut** (1.6) |
| Motion toggle prop | replaced by `prefers-reduced-motion` (6.4) |
| Continuous animations: `pulse` on every in-progress dot (animates `box-shadow`, so it repaints every frame), `march` on live graph edges (`stroke-dashoffset`, repaints), `breathe` on the first-run folder | **kept** (owner instruction), but flagged as the only motion with a CPU cost; see 6.5 |
| Shadows and the first-run radial gradient | the prompt said "no gradients or shadows beyond a hairline"; the mockup has `--shadow2` on hover and one radial glow. Keep them: they are the chosen design, and they are cheap. |
| `copy` on code blocks, toast | fine (read-only safe). The toast is also used for "Opened in VS Code". |
| **Editing affordances** | **none found.** The AC checkboxes are display-only (render `Item.state` and GFM `[x]`, never clickable); the `READ-ONLY` tag is in the top bar. Keep the checkbox `pointer-events:none`. |
| Keyboard: `[` tree, `]` panel, `Esc` close, `⌥←` back, `/` search | keep (cheap); drop keys 1–6 |

### 4.3 Owner calls (summary)

1. **G3:** keep "Try the sample docs" (ship the fixtures) or drop it.
2. **G4:** the age source for Waiting on and Open questions: drop it, use `mtime` (recommended), or read git.
3. **G7:** map modes Doc/Board/Graph with the map rendered as Markdown (recommended), or the mockup's synthetic Table.
4. **G11:** show diagnostics in v1 or not.
5. **G13:** the app name "Folio" or something else.
6. **Fonts (5):** bundle Geist and Geist Mono latin (about 52 KB, recommended for fidelity), or use the system fonts Segoe UI Variable and Cascadia Mono (0 KB, visibly different).
7. **Continuous motion (6.5):** keep the infinite `pulse` on every in-progress dot, or limit it to the header pill and board column headers (recommended).
8. **Light/dark toggle:** keep it in the top bar (recommended) or follow the OS only.

---

## 5. Assets to bundle

### Fonts

The mockup embeds **Geist** and **Geist Mono**, variable woff2 (one file per subset covers weights 400–600), Google Fonts subsets. Sizes are measured from the decoded bundle:

| Subset | Geist | Geist Mono |
|---|---|---|
| latin | 29,400 B | 23,128 B |
| latin-ext | 16,512 B | 14,696 B |
| vietnamese | 8,004 B | 7,696 B |
| cyrillic | 15,084 B | 12,940 B |
| cyrillic-ext | 7,420 B | 6,176 B |
| symbols (box drawing) | — | 5,812 B |
| **Total** | 76,420 B | 70,448 B (all: about 147 KB) |

**[R]** Bundle the **latin** subset of each (about **52 KB**), and latin-ext (+31 KB) only if names need it. Use `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (OFL-1.1) or the files from the `geist` npm package, with `font-display: swap`. Load them from the embedded Wails assets, never from Google Fonts (offline app). **Fallback:** `system-ui` (Segoe UI Variable on Windows 11) and `ui-monospace` (Cascadia Mono). **[O]** picks bundled or system (4.3 item 6).

The latin subset does **not** contain the arrows and shapes the mockup uses as icons (`→` U+2192, `↗`, `⟵`, `◔`, `▥`, `▶`, `✓`). They fall back to whatever system font has them, so they render inconsistently. That is one more reason for SVG icons.

### Icons

The mockup uses **no icon library**: CSS-drawn shapes plus Unicode glyphs. **[R]** Use **inline SVG Svelte components** copied from **Lucide** (ISC), 1.5px stroke, `currentColor`, 12–16px. That gives about 15 icons at roughly 250–400 B each, **about 5 KB in total**, with no runtime dependency (`lucide-svelte` is fine too if it tree-shakes, but copied SVGs are simpler).

| Mockup | Lucide | Where |
|---|---|---|
| sidebar box | `panel-left` | top bar |
| circle (search) | `search` | tree search |
| half-filled circle | `sun-moon` (or `contrast`) | theme toggle |
| `▶` | `chevron-right` (rotated 90° when open) | tree folders, strip |
| `#` glyph | `file-text` (or keep a mono `#`) | non-ticket docs |
| `◔` | `clock` | Waiting on |
| `?` | `circle-help` | Open questions |
| `▥` | `columns-3` (or `kanban`) | Board |
| square | `square-code` (or `external-link`) | Open in VS Code |
| `↗` | `arrow-up-right` | PR, ADO and graph stubs |
| `⟵` | `arrow-left` (small) | board blocker chip |
| `→` | `arrow-right` | panel links |
| `← Back` | `arrow-left` | panel |
| `×` | `x` | panel close |
| `✓` | `check` | checked AC |
| `›` | `chevron-right` (10px) | panel trail |
| broken link | `link-2-off` | G1 |

The first-run folder illustration and the ◆ brand mark stay CSS shapes (0 KB).

---

## 6. Motion (owner: keep it, extracted exactly)

The mockup uses **plain CSS** only: seven `@keyframes` plus inline `animation` and `transition` strings, with the stagger delays computed in JS. There is no motion library, no JS tweening, no `requestAnimationFrame` and no FLIP. One `motion` prop switches everything off (every animation becomes `none` and `--dur` becomes `0s`, so transitions also become instant). The mockup has **no `prefers-reduced-motion`** handling. It is added in 6.4.

### 6.1 Keyframes (exact)

```css
@keyframes rise    { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
@keyframes pulse   { 0% { box-shadow:0 0 0 0 color-mix(in oklab, currentColor 60%, transparent) }
                     70%,100% { box-shadow:0 0 0 6px transparent } }
@keyframes draw    { from { stroke-dashoffset:1 } to { stroke-dashoffset:0 } }   /* path has pathLength=1, stroke-dasharray:1 */
@keyframes march   { to { stroke-dashoffset:-18 } }                             /* stroke-dasharray: 5 4 */
@keyframes grow    { from { transform:scaleX(0) } to { transform:scaleX(1) } }  /* transform-origin:left */
@keyframes breathe { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-5px) } }
@keyframes toast   { from { opacity:0; transform:translate(-50%,8px) } to { opacity:1; transform:translate(-50%,0) } }
```

`pulse` takes its colour from `currentColor`, so the dot sets `color:<status>` and `background:currentColor`.

### 6.2 Animations (enter and continuous)

All enter animations use `animation-fill-mode: backwards`, so an element is hidden during its delay.

| What moves | Trigger | Keyframe | Duration | Easing | Delay / stagger | Properties |
|---|---|---|---|---|---|---|
| View container: Document, Map, Waiting on, Open questions, First-run card | the view mounts (view switch) | `rise` | .35s | `cubic-bezier(.2,.7,.2,1)` | 0 | opacity, transform |
| Board card (columns) | the board mounts | `rise` | .4s | `cubic-bezier(.2,.7,.2,1)` | `(colIndex*2 + cardIndex) × 45ms` | opacity, transform |
| Board strip card (dropped and superseded) | the strip opens | `rise` | .4s | `cubic-bezier(.2,.7,.2,1)` | `index × 45ms` | opacity, transform |
| Graph node | the graph mounts | `rise` | .45s | `cubic-bezier(.2,.7,.2,1)` | `level × 90ms` | opacity, transform |
| Graph cross-module stub | the graph mounts | `rise` | .45s | `ease` | `level(target) × 90ms + 150ms` | opacity, transform |
| Graph resolved edge (solid, `--line2`) | the graph mounts | `draw` | .7s | `ease` | `level(source) × 90ms + 200ms` | stroke-dashoffset |
| Graph live blocker edge (dashed `5 4`, `--fg2`) | always | `march` | 1.1s | `linear` | 0, **infinite** | stroke-dashoffset |
| Graph stub edge (dashed, `--acc`, .7 opacity) | — | none | — | — | — | — |
| Map progress bar (status segments) | the map mounts | `grow` | .7s | `cubic-bezier(.2,.7,.2,1)` | 0 | transform (scaleX) |
| Age bar fill (Waiting on, Open questions) | the row mounts | `grow` | .7s | `cubic-bezier(.2,.7,.2,1)` | 0 | transform (scaleX) |
| Waiting on row | the view mounts | `rise` | .35s | `ease` | running index **across all groups** × 35ms | opacity, transform |
| Open question row | the view mounts | `rise` | .35s | `ease` | `index × 35ms` | opacity, transform |
| In-progress status dot (tree, pill, table, board column header, graph node, waiting row) | always | `pulse` | 2.2s | `ease-out` | 0, **infinite** | box-shadow |
| First-run folder mark | always | `breathe` | 3.2s | `ease-in-out` | 0, **infinite** | transform |
| Toast | it appears (auto-hides after **2200ms**, no exit animation) | `toast` | .2s | `ease` | 0 | opacity, transform |

### 6.3 Transitions (state and hover)

| What | Trigger | Property | Duration | Easing |
|---|---|---|---|---|
| Left tree width 280 ↔ 0 (inner content fixed at 280, clipped) | `[` key or toggle; auto-hide under 1200px | `width` | `var(--dur)` = .26s | `cubic-bezier(.3,.7,.2,1)` |
| Right panel width 360 ↔ 0 (inner fixed at 360; border becomes transparent when closed, not animated) | link click, Esc, `]`, × | `width` | .26s | `cubic-bezier(.3,.7,.2,1)` |
| Folder chevron 0° ↔ 90° (tree and strip) | expand or collapse | `transform` | .26s | `ease` (default) |
| Segmented toggle (Table/Board/Graph) button | mode change | `background`, `color` | .26s | `ease` |
| App background and text on theme switch | theme toggle | `background-color`, `color` | .3s | `ease` |
| Board card hover | hover | `transform` (translateY −2px), `box-shadow` (→ `--shadow2`), `border-color` (→ `--line2`) | .16s | `ease` |
| Graph node hover | hover | `transform` (−2px), `box-shadow` (→ `--shadow2`) | .16s | `ease` |
| Blocker chip hover | hover | `border-color`, `color` (→ `--acc`) | .15s | `ease` |
| First-run primary button hover | hover | `transform` (translateY −1px) | .15s | `ease` |
| Row, button and link hovers, search focus border | hover, focus | background, border | **instant** (no transition) | — |

The demo screen switcher's `background`/`color` .26s transition is cut together with the switcher.

### 6.4 Motion tokens

```css
:root {
  --dur: .26s;            /* panes, chevrons, toggles */
  --dur-hover: .16s;      /* card and node lift */
  --dur-press: .15s;      /* chips, primary button */
  --dur-theme: .3s;
  --ease-enter: cubic-bezier(.2,.7,.2,1);   /* rise, grow */
  --ease-pane:  cubic-bezier(.3,.7,.2,1);   /* tree and panel width */
  --stagger-card: 45ms; --stagger-row: 35ms; --stagger-level: 90ms;
}

@theme {
  --ease-enter: cubic-bezier(.2,.7,.2,1);
  --ease-pane: cubic-bezier(.3,.7,.2,1);
  --animate-rise: rise .35s var(--ease-enter) backwards;
  --animate-rise-card: rise .4s var(--ease-enter) backwards;
  --animate-rise-node: rise .45s var(--ease-enter) backwards;
  --animate-rise-row: rise .35s ease backwards;
  --animate-grow: grow .7s var(--ease-enter) backwards;
  --animate-draw: draw .7s ease backwards;
  --animate-march: march 1.1s linear infinite;
  --animate-pulse-dot: pulse 2.2s ease-out infinite;
  --animate-breathe: breathe 3.2s ease-in-out infinite;
  --animate-toast: toast .2s ease backwards;
  /* the @keyframes from 6.1 go inside this @theme block so Tailwind emits them */
}
```

Delays are per element: `style="animation-delay: calc(var(--i) * var(--stagger-card))"` with `style:--i={i}` in Svelte.

**`prefers-reduced-motion` (added; the mockup lacks it).** This replaces the mockup's `motion` prop:

```css
@media (prefers-reduced-motion: reduce) {
  :root { --dur: 0s; --dur-hover: 0s; --dur-press: 0s; }
  *, *::before, *::after { animation: none !important; }
  /* keep the theme colour fade: it is not movement */
}
```

### 6.5 Svelte 5 mapping (CSS first, no extra library)

| Mockup motion | Svelte 5 implementation |
|---|---|
| View `rise` on view switch | CSS class `animate-rise` on the view root, inside `{#key view}` (and `{#key rec.path}` for the document if it should replay on every document change; the mockup replays only on a view switch) |
| Staggered card, row and node `rise` | CSS `animate-rise-*` plus `style:--i`; they replay because `{#each}` items mount with the view. Do **not** use `in:fly`: CSS keeps it off the JS thread, and the result is identical. |
| `grow` bars, `draw` edges | CSS on the elements (`pathLength="1"` on the SVG path) |
| `march`, `pulse`, `breathe` | CSS classes |
| Pane width, chevrons, hovers, theme fade | CSS `transition` (Tailwind `transition-[width] duration-(--dur) ease-(--ease-pane)` and so on) |
| Toast | CSS `animate-toast` inside `{#if toast}`; to match the mockup's instant hide, add no `out:` transition. `in:fly={{ y: 8, duration: 200 }}` is an equivalent built-in option. |
| Board cards moving between columns on a file change | **not in the mockup.** `animate:flip` (built in, about 1 KB) is optional; the mockup re-mounts the board instead. [R] leave it out in v1. |
| `svelte/motion` (`Spring`, `Tween`) | not needed: the mockup has no physics or tweened values |

**Cost notes (continuous animations only).** These are the only motion with a running cost:
- `pulse` animates `box-shadow`, so every in-progress dot repaints every frame. In the tree, many dots can be visible at once.
- `march` animates `stroke-dashoffset` on each live edge, so the graph repaints every frame.
- `breathe` uses `transform`, which runs on the compositor. It is cheap and appears on one screen only.

**[R]** Keep all three. Measure CPU on the RAM-test VM in ticket 01. If the idle CPU is noticeable, the cheapest fixes that keep the look are:
1. Limit `pulse` to the header-card pill, board column headers and graph nodes, and drop it from tree rows.
2. Rewrite `pulse` as a `::after` ring that animates `transform: scale()` plus `opacity`. That runs on the compositor and looks identical.

**[O]** decides (4.3 item 7). WebView2 pauses CSS animations when the window is minimised or hidden.
