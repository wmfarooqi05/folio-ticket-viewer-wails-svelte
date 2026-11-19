# 04 — Parser contract: draft for the decision session

Drafted Nov 19, 2026 as input to [04-parser-contract](../issues/04-parser-contract.md). It recommends; the owner decides. Sources: [handoff](../handoff/handoff.md) §1–5, §7, Part A data flow; [conventions.md](../handoff/conventions.md); [fixtures/expected.json](../../fixtures/expected.json).

**Owner-judgement questions (the only ones that need a debate):** J1 (A1), J2 (A6/A7), J3 (A5/A9), J4 (fallback-extension policy: A3, A7, A12), J5 (legacy questions in the Open questions view). Everything else in section 3 has an obvious answer that can be accepted as a block.

---

## 1. Proposed contract

### 1.1 Shape

One module, `src/lib/tickets/lib.ts`, compiled to `lib.mjs`. It has no imports: no DOM, no `fs`, no Svelte. All input is in memory and all output is plain JSON, with no `Map`, `Set`, class or `Date`. That makes the index cacheable as `index.json`, cloneable to a worker, and comparable in tests with `deepEqual`.

Paths are POSIX and **relative to the docs root** (the folder holding `modules/`, `handoffs/`, `patterns/`): `modules/one-cash-mover/issues/05-build-movecash.md`. Go sends paths in that form, and converts `\` to `/`.

The body text is **not kept** in the index (low RAM). Items and headings carry line numbers. The viewer fetches a file's text again, from Go, when it renders that file or extracts a fragment.

### 1.2 Exports

```ts
// ---- input ---------------------------------------------------------------
export interface SourceFile { path: string; text: string; mtime: number }

// ---- the deep interface the viewer uses (5 functions) --------------------
export function buildIndex(files: Iterable<SourceFile>): Index;
export function updateIndex(index: Index, changed: SourceFile[], removed: string[]): Index;
export function resolveHref(href: string, fromPath: string, index: Index): Resolved;
export function extractFragment(text: string, rec: DocRecord, fragment: string): LineRange | null;
export function scanText(text: string, fromPath: string, index: Index): TextRef[];

// ---- the pieces (handoff names; used by the CLI, the tests, and the above) ----
export function parseFile(file: SourceFile): DocRecord;   // per file, no cross-file work
export function parseFrontmatter(text: string): Frontmatter | null;  // null = no leading '---'
export function parseLegacy(body: string): LegacyMeta;
export function parseItems(body: string, lineOffset: number, legacy: boolean): Item[];
export function parseLinks(body: string, lineOffset: number): Link[];
export function resolveRef(ref: string, fromPath: string, index: Index): Resolved;
```

- `buildIndex(files)` is `updateIndex(emptyIndex, files, [])`. `updateIndex` re-parses only `changed` (`parseFile`), drops `removed`, then reruns the cross-file pass (ticket keys, edges, `ok` flags on links and refs). The cross-file pass is O(links + refs) and takes milliseconds, so it always reruns in full and never needs incremental logic.
- Mtime reuse (skip a file whose `path` and `mtime` match the cached record) belongs to the caller, ticket 05. The parser only promises that records are pure functions of `{path, text}`.
- `renderMapTable` stays CLI-only (Part A) and is not needed by the viewer.

**Node adapter (the other repo's `cli.mjs`)**, about 15 lines and not part of `lib.mjs`:

```js
// scripts/tickets/fs.mjs
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { buildIndex } from './lib.mjs';
export async function buildIndexFromDisk(docsRoot, roots = ['modules', 'handoffs', 'patterns']) {
  const files = [];
  for (const r of roots) for await (const abs of walkMd(join(docsRoot, r)))   // recursive readdir, *.md only
    files.push({ path: relative(docsRoot, abs).split(sep).join('/'),
                 text: await readFile(abs, 'utf8'), mtime: (await stat(abs)).mtimeMs });
  return buildIndex(files);
}
```

The handoff's `buildIndex(root)` and `parseFile(path)` become `buildIndexFromDisk(root)` in the adapter. This is the one place the handoff's Part A text needs a one-line update.

### 1.3 Records

```ts
type Status = 'open'|'in-progress'|'blocked'|'in-review'|'done'|'dropped'|'superseded'|'unknown';
type Person = 'owner'|'client'|'dba'|'infra'|'ops';

interface Index {
  version: 1;
  files: Record<string, DocRecord>;        // by path; every indexed .md, not only tickets
  spaces: string[];                        // sorted; used by scanText and the tree
  tickets: Record<string, string>;         // "cash-handling-workflow 05" → path (key uses padded num)
  edges: Edge[];                           // graph + blocker chips, resolved
  diagnostics: Diagnostic[];               // cross-file: DUP_NUM, FM_REF, LINK
}

interface DocRecord {
  path: string; mtime: number;
  kind: 'ticket' | 'map' | 'doc';          // ticket: **/issues/NN-*.md under modules/<space>/; map: map.md; else doc
  space: string | null;                    // modules/<space>/…; null for handoffs/, patterns/
  num: string | null;                      // digits as written in the filename: "05", "100"
  key: string | null;                      // "<space> <num padded to ≥2>", the ticket ID
  title: string;                           // H1 with a leading "NN — " removed; filename slug if no H1
  legacy: boolean;                         // per file: no frontmatter
  meta: TicketMeta | MapMeta | null;       // null for kind 'doc'
  legacyRule: 1|2|3|4|5|6|7|8 | null;      // which §3 rule set meta.status (legacy tickets only)
  bodyLine: number;                        // first body line after frontmatter (renderer strips above)
  headings: Heading[];                     // for slugs, fragment lookup, and the TOC
  items: Item[];
  links: Link[];                           // ok/target filled by the cross-file pass
  map: { kanban: boolean; issuesDir: string | null } | null;   // kind 'map' only
  hasMermaid: boolean;                     // so the renderer loads mermaid lazily
  diagnostics: Diagnostic[];               // per file: FM_PARSE, FM_ENUM, ANCHOR_ABOVE, DUP_ANCHOR
}

interface TicketMeta {                     // identical shape for migrated and legacy tickets
  type: string[]; status: Status; status_note: string | null;
  waiting_on: Person | null; blocked_by: string[]; blocked_note: string | null;
  related: string[]; superseded_by: string | null;
  pr: number[]; ado: number[]; afk: boolean;
}
interface MapMeta { status: 'charted'|'active'|'closed'|'superseded'|null; ado: number|null; superseded_by: string|null }

interface Heading { level: number; text: string; slug: string; line: number; anchor: string | null }
interface Item {
  kind: 'Q'|'D'|'AC'|'R'; n: number; id: string;        // id "q3", lowercase
  title: string; line: number; endLine: number;          // range per the extraction rule (section 2)
  state: 'open'|'answered'|'superseded'|'closed'|'dropped';
  stateNote: string | null;                               // "2026-10-14 (client)", or "D4" for superseded
  anchor: 'inline' | 'above' | 'none';                    // 'none' = id synthesised from the label
}
interface Link { href: string; text: string; line: number; image: boolean;
                 ticketText: boolean;                     // text matches the §5 shape
                 resolved?: Resolved }
interface Resolved {
  kind: 'internal' | 'external' | 'outside';             // outside = climbs above the docs root
  path: string | null; fragment: string | null; itemId: string | null;
  ok: boolean; problem?: 'no-file' | 'no-anchor' | 'bad-ref';
}
interface Edge { from: string /*path*/; field: 'blocked_by'|'related'|'superseded_by';
                 ref: string; to: Resolved; crossSpace: boolean }
interface LineRange { start: number; end: number }       // 1-based, inclusive, file lines
interface TextRef { start: number; end: number; kind: 'ticket'|'item'|'ado'; to: Resolved | null; ado?: number }
interface Diagnostic { path: string; line: number; code: string; level: 'error'|'warning'; message: string }
```

### 1.4 What each view reads (no extra parser calls)

| View | Reads |
|---|---|
| Tree + status dots | `files[*].path`, `kind`, `meta.status`, `legacy` |
| Header card | `meta` (chips from `edges` where `from` = this path) |
| Waiting on | `files` where `kind==='ticket'` and `meta.waiting_on`, grouped |
| Board per map | tickets whose path is directly in `map.issuesDir`, grouped by `meta.status` |
| Open questions | `items` where `kind==='Q'` and `state==='open'` (scope: J5) |
| Dependency graph | `edges`, filtered by space; `crossSpace` edges become stubs |
| Right panel | `resolveHref` on click, then `extractFragment(text, rec, fragment)` |
| Auto-link render plugin | `scanText` on text nodes (not in code, not inside links) |

The view filters are about five one-line functions in the viewer. They hold no parsing, so they do not belong in `lib.mjs`.

---

## 2. Item extraction and link resolution rules

### 2.1 Line scan (all of `parseItems`, `parseLinks` and the heading list)

- Work on lines. Track fenced code (```` ``` ```` or `~~~`, three or more, closing fence of the same character and at least the same length). Inside a fence, nothing is a heading, item, link or Status line. A ```` ```mermaid ```` fence sets `hasMermaid`.
- Headings are ATX only (`^#{1,6}\s`). Setext is not used in this corpus.
- **Frontmatter**: the file starts with `---\n`, and the block ends at the next line that is exactly `---`. Any other start means legacy. Parse the §2 subset only; a line outside the subset is `FM_PARSE` and that key is skipped, and the rest of the record still parses.

### 2.2 Items

| Step | Rule |
|---|---|
| Anchor, inline | heading text starts with `<a id="x"></a>` (or `<a id='x'>`, closed or not): id = `x` lowercased, `anchor: 'inline'`. |
| Anchor, above | a line that holds only `<a id="x"></a>` **or** only `<a id="x">` (unclosed), followed by optional blank lines and then a heading: the anchor belongs to that heading, `anchor: 'above'`, plus an `ANCHOR_ABOVE` warning. (rsa 05 Q1 closed, rsa 11 Q1 unclosed.) |
| Label | after removing the anchor, heading text matches `^(Q|D|R)(\d+)\b`. With no anchor, id = lowercase label (`q35`), `anchor: 'none'`. This is how legacy files get items. |
| Kind/n | from the label, not the id. An anchor with no label (`<a id="foo">` on a heading `Intro`) is a heading anchor only, not an item. |
| AC | a list item under a `## Done when` heading starting `<a id="acN"></a>**ACN**`. Plain legacy bullets without a label are not items. |
| Legacy follow-up heading | a heading matching `^Q(\d+) answered\b` (case-insensitive) whose Qn already exists **does not create an item**. It sets Qn `state: 'answered'`, `stateNote` from its date, and Qn's `endLine` extends to the end of the follow-up section. Its GitHub slug (`q35-answered--2026-10-14`) is still a valid fragment that resolves to Qn. |
| Legacy suffix | a legacy Q heading ending `(answered YYYY-MM-DD…)` is `answered`. |
| Duplicate id otherwise | the first wins, and `DUP_ANCHOR` is raised. |
| State marker (Q/D/R) | the first non-blank body line starts with `**Answered …:**`, `**Superseded by …:**`, `**Closed …:**`, or `**Dropped …:**`. No marker means `open`. |
| State marker (AC) | the marker may sit **anywhere in the list item** (rsa 01: `AC2 — … **Closed 2026-11-12:** …`, `AC3 — ~~…~~ **Dropped …**`). AC accepts Closed and Dropped. |
| Range (`line`..`endLine`) | from the heading (or the anchor-above line) to the line before the next item of the same kind, or the next heading at the same or a higher level, whichever comes first. An AC is its list item, including continuation lines. |

### 2.3 Heading slugs (for fragments in legacy files)

The GitHub algorithm, so legacy links resolve the way GitHub and VS Code resolve them:
1. Strip inline HTML (`<a id…>`) and markdown emphasis or code markers from the heading text.
2. Lowercase it.
3. Remove every character that is not a letter, a digit, `-`, `_` or a space (`\p{L}\p{N}\p{M}\p{Pc}`, `-`, space). This removes `—`.
4. Each space becomes `-`. Runs are **not** collapsed: `Q35 answered — 2026-10-14` becomes `q35-answered--2026-10-14`.
5. A duplicate slug in the same file gets `-1`, `-2`, and so on.

### 2.4 Fragment lookup in a target file

Lowercase the fragment, then try in order: an item id; any explicit `<a id>` in the file; a heading slug. The first hit wins. If nothing matches, the result is `problem: 'no-anchor'`. For `answers.md`, the link `41-grill-payment-ids.md#q35` resolves to the synthesised `q35` item.

### 2.5 `resolveHref(href, fromPath)`

1. An `http(s):`, `mailto:` or `vscode:` scheme is `external`.
2. A bare `#frag` resolves against `fromPath`.
3. Otherwise split off `#frag`, percent-decode the rest, join it with `dirname(fromPath)`, and normalise `.` and `..`. A path that climbs above the docs root is `outside`, with `ok: false` and no warning.
4. If the path is not in `index.files`, the result is `no-file` (rsa 07 `../notes/gone.md`, 16 `15-gone-ticket.md`, the rsa map's `issues/01-x.md`). Otherwise look up the fragment (2.4).
5. Images (`![…](…)`) are parsed with `image: true` and resolved the same way. They are never in the index (it holds only `.md`), so the renderer asks Go whether the image exists. The parser does not report missing images.

### 2.6 `resolveRef(ref, fromPath)` (frontmatter and legacy refs)

| Ref | Grammar | Target |
|---|---|---|
| `"05"`, `"05#q3"` | `^(\d+)(?:#([a-z]+\d+))?$` | `tickets["<fromSpace> " + pad2(n)]` |
| `"one-cash-mover 05"`, `"… 05#q3"` | `^([a-z0-9-]+) (\d+)(?:#(…))?$` | `tickets["<space> " + pad2(n)]` |
| `"one-cash-mover#q3"` | `^([a-z0-9-]+)#(…)$` | `modules/<space>/map.md` |

`pad2(n)` is `String(parseInt(n,10)).padStart(2,'0')`, so `5`, `05` and `005` resolve to the same ticket and `100` stays `100`. A ref that does not parse is `bad-ref`. In the fixtures, `rsa 07 "one-cash-mover#q3"` (the map has no q3) and `rsa 10 "cloud-migration 07#q3"` (07 has only Q1) give `no-anchor`, and they become `FM_REF` diagnostics.

### 2.7 `scanText` (the §7 auto-link, kept in the parser so there is one copy)

- `\b(<spaces>)(?: ticket)? (\d{2,})(?: (Q|D|AC|R)(\d+))?\b` links only when the target resolves (`cloud-migration 07`, `cloud-migration 08`, `cash-movement-engine ticket 08`).
- `\bticket (\d{2,})\b` links within `fromPath`'s space, and only when it resolves. `with ticket 77` stays plain text. Recommended: do not link a ref that does not resolve, because a dead link teaches nothing.
- `\b(card|ADO|work item) (\d{5})\b` becomes `kind: 'ado'` (`card 84997`, `card 72633`). `order 51234` and `invoice 90817` stay plain.

### 2.8 Legacy meta (`parseLegacy`)

- Line regex, case-insensitive, on lines **before the first `## ` heading**, outside fences. The first match per label wins: `^\s*(?:\*\*)?(Status|Type|Blocked by)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*?)\s*$`. This accepts `**Status:**`, `**Status**:` and `Status:`.
- Status text: replace `’` and `‘` with `'`, strip `*`, `` ` `` and `✅`, trim. That gives `status_note` (`null` when empty). Match the rules on the lowercased text.
- Type: split on `+` and `,`. Per token, lowercase and trim, then: `fix` → `bug`; `task (afk)` → `task` plus `afk: true`; a waiting_on enum token sets `waiting_on` (J3); any other non-enum token is dropped with a warning.
- Blocked by: `none`, `—`, `-`, `n/a` and empty give `[]` and no note. If every comma-separated token is `\d{2,}` or a range `\d{2,}\s*[–-]\s*\d{2,}` (start ≤ end), the result is refs, padded and expanded. Anything else gives `[]` and `blocked_note` = raw text.
- Legacy maps get `MapMeta` with every field `null`.

### 2.9 Indexing scope

Index every `*.md` under the roots. Skip any path with a segment starting `_` (this hides `_templates/`), so the CLI's `check` skips templates too. A `modules/<space>/…/issues/` file whose name does not match `^\d{2,}-` is `kind: 'doc'`.

---

## 3. The 21 ambiguities

**J** = needs the owner. **ok** = an obvious answer: accept as a block.

| ID | Case | Options | Recommend | Why | |
|---|---|---|---|---|---|
| A1 | rule 1 `superseded` anywhere: 19 "Resolved (superseded by the D3 amendment)", 20 "Dropped — superseded by 30" | a) literal (both superseded) · b) `^superseded` only (19 done, 20 dropped) · c) `^superseded\b` or `\bsuperseded by (ticket )?\d{2,}` | **c**: 19 → done (rule 6), 20 and 12 stay superseded | "superseded by <a ticket>" means replaced; "superseded by a clause" does not. This changes the handoff's table, and real data has 30+ unseen shapes. | **J1** |
| A2 | legacy superseded has no `superseded_by` | a) none · b) extract from `superseded by (\d{2,})` | **b**: 12 → "45", 20 → "30" | Free graph edge and header-card link. STATUS_SHAPE skips legacy anyway. | ok |
| A3 | 11 `Won’t do` (curly apostrophe) | a) unknown · b) normalise `’`→`'` first | **b**: dropped, rule 2 | Smart quotes are an editor accident, not a meaning. | ok (sits under J4) |
| A4 | 21 "Blocked — built on branch…" | rule 3 vs 4 | blocked (as is) | Rule order reads right. | ok |
| A5 | 13 "blocked on DBA", cm 08 "blocked on infra": no waiting_on | a) none · b) when status is blocked, the first `\b(owner\|client\|dba\|infra\|ops)\b` in the status text sets waiting_on, unless Type already set it | **b**: cm 08 → infra, 21 → dba, 13 stays ops (Type wins) | Waiting on is the #1 view; legacy blocked tickets vanish from it otherwise. It is derived, so it needs a yes. | **J3** |
| A6 | 39 "Built on claude/x, merged to dev" | a) in-review (literal) · b) rule 4 skips when `\bmerged\b` appears without a `not ` before it, so rule 6 gives done | **b**: done | The branch name lingers after a merge; "merged" is the fact. Touches handoff default #4. | **J2** |
| A7 | 38 "Not merged — built on claude/x" | a) unknown · b) add `^not merged` to rule 4 | **b**: in-review | Same meaning as "built — not merged" (14). | **J2** (and J4) |
| A8 | 31 "Done (not merged to dev yet)" | done vs in-review | done (as is) | The first word wins; the raw text shows in status_note. Second-guessing "done" is a guess. | ok |
| A9 | `task + ops` | a) [task, ops] · b) drop non-enum, enum person sets waiting_on | **b**, but set waiting_on only when status is not done, dropped or superseded | The handoff says "while the ops step is open"; a done ticket must not appear in Waiting on. | ok (shares J3's rationale) |
| A10 | missing Type / unknown token | [] vs keep raw | `[]`, plus a warning naming the token; case-insensitive (25 `Build` → build) | Nothing to show; a warning keeps the token visible. | ok |
| A11 | 34 no Status, 35 `✅` only | unknown vs open | unknown, `status_note: null` (always present, also for 34) | Rule 8; never guessed. | ok |
| A12 | 36 "Unblocked — ready…", 37 "Open (dropped from sprint 4)" | 36: unknown or open · 37: open | 36 **unknown**, 37 open | 37 is anchored correctly. 36 needs a new pattern, which is the J4 policy, not a bug. | J4 |
| A13 | `**Status:**`, `` `open` `` | — | accept the bold label (either colon side) and strip backticks (regex in 2.8) | Shape, not meaning. | ok |
| A14 | ranges `03–07` and `03-07` | en dash only vs both | both, inclusive, start ≤ end, no existence check (resolution flags missing) | A hyphen between two bare numbers cannot be a slug. | ok |
| A15 | 100 `01, 03–05`; 26 `05 (only the ADO part)`; `none`/`—` | salvage the leading number or not | mixed list → refs; 26 → free text, no ref; none variants → `[]` and no note | "Bare numbers only" is the rule; salvaging is guessing, and blocked_note keeps the text. | ok |
| A16 | free text "waiting for the DBA…" | — | `[]`, blocked_note = raw | Per §3. | ok |
| A17 | num of 3 or 5+ digits | — | `num` as written; `key` and refs use `pad2(parseInt)` | §1. | ok |
| A18 | mixed space (ocm 01/06 legacy, 05 migrated) | per file vs per space | per file | A space can hold both. | ok |
| A19 | `Label:` line | map it or not | not in meta; stays body text | No consumer. | ok |
| A20 | H1 without a number (02, 26) | — | num from the filename; `title` = H1 minus an optional leading `\d{2,}\s*[—–-]\s*` | §1. | ok |
| A21 | status_note raw or stripped | raw · stripped | stripped (`*`, `` ` ``, `✅` removed, quotes normalised, trimmed) | It is displayed as `done — <note>`; the raw line is in the body. | ok |

**J4: fallback-extension policy.** Options: (a) keep §3's table literal, and let `unknown` show the raw text; (b) extend it now for the shapes seen (A3, A7, `unblocked`); (c) extend only for typography (A3) and word order (A7), never for new vocabulary (`unblocked`, `parked`, `pending`, `no longer needed` stay unknown). **Recommend (c).** It fixes shapes without guessing meanings. The table lives in `lib.mjs`, so a later extension is a one-commit change in the other repo.

**J5: legacy questions in the Open questions view.** Legacy files get Q items from heading labels (2.2), so every unanswered old `### Qn` heading counts as open, including those in closed modules. Legacy maps' numbered "Open questions (owner)" lists are not items, because they have no ID. Options: (a) show all; (b) hide Qs in tickets whose status is done, dropped or superseded; (c) migrated files only. **Recommend (b)**, with a toggle. The parser indexes everything either way, so this is a view default and does not change the contract.

---

## 4. Web Worker (ticket Q1)

**Recommend: no worker in v1.** Keep `lib.mjs` worker-ready (pure, JSON in and out) and add one only if a measurement says so.

| Factor | Reasoning |
|---|---|
| Where the time goes | The slow disk is on Go's side: a `find` took more than 120 s on that VM. Go's walk and reads run in Go goroutines, and the Wails binding call is an async promise. A slow disk never blocks the webview's thread, worker or not. |
| Parse cost | 1,000 files at about 5 KB each is about 5 MB. A line scan with regexes in V8 is about 50–150 ms in total on 2 CPUs. Startup uses the mtime-keyed cache (ticket 05), so a warm start re-parses only changed files: a handful, under 5 ms. |
| Cold start | Go streams files in batches (about 100 per event). JS calls `updateIndex` per batch and the tree fills progressively. Each batch is a task of about 10–15 ms, under the 50 ms long-task line, so input stays responsive without a worker. |
| Cost of a worker | It adds a second V8 isolate (a few MB, against the RAM priority). The index would live twice, because structured clone copies the worker's index to the main thread. There is also a message protocol and a second build entry. |
| Exit criterion | Run `buildIndex` on the fixtures copied 16 times (about 1,000 files) inside WebView2. If any single batch is longer than 50 ms, or a cold build is longer than 300 ms, move `updateIndex` into a worker. Only that file changes, because the contract is already message-shaped. |

---

## 5. Proposed changes to `fixtures/expected.json` (not applied)

Conditional rows apply only if the owner accepts that recommendation.

| File | Field | Now | Proposed | Depends on |
|---|---|---|---|---|
| cash-handling-workflow/issues/19 | status, rule | superseded, 1 | **done, 6** | J1 (A1) |
| cash-handling-workflow/issues/11 | status, rule | unknown, 8 | **dropped, 2** | A3 / J4 |
| cash-handling-workflow/issues/12 | superseded_by | absent | `"45"` | A2 |
| cash-handling-workflow/issues/20 | superseded_by | absent | `"30"` | A2 |
| cloud-migration/issues/08 | waiting_on | null | `"infra"` | J3 (A5) |
| cash-handling-workflow/issues/21 | waiting_on | null | `"dba"` | J3 (A5) |
| cash-handling-workflow/issues/39 | status, rule | in-review, 4 | **done, 6** | J2 (A6) |
| cash-handling-workflow/issues/38 | status, rule | unknown, 8 | **in-review, 4** | J2 (A7) |
| cash-handling-workflow/issues/34 | status_note | absent | `null` (every record carries every meta key) | A11 |
| every ticket | rule → `legacyRule`; add `key`, `title`, `superseded_by`, `related`, `pr`, `ado`, `status_note`, `blocked_note` | partial | the full `TicketMeta` | contract |
| A1, A3, A5, A6, A7, A9 entries | `chosen` | current | the decided answer | the session |

Add oracle sections for what is untested today:

- **`items`** for: step2b 41 (one Q35, `answered`, `anchor:'none'`, its range covering both headings); rsa 05 (q1 `above`, q2 `answered`, q3 `open`, ac1); rsa 11 (q1 `above`, unclosed); rsa 03 (q1 and q3 answered, q2 open, d2 superseded, r1 closed, r2 dropped, ac1); rsa 01 (ac2 `closed` and ac3 `dropped`, with the marker mid-item); cloud-migration 07 (q1 synthesised, open); rsa map (r1 closed, q1 and q3 open, q2 answered).
- **`links`**: answers.md → `41…#q35` ok; rsa 07 `../notes/gone.md` no-file; cash-handling-workflow 16 `15-gone-ticket.md` no-file; rsa map `issues/01-x.md`, `05-x.md`, `02-x.md` no-file. These look like accidental traps in the generated block, so confirm whether they are intended. Also rsa map `../cloud-migration/map.md#q1` ok; ocm-cutover-handoff `…05-build-movecash.md#q3` ok.
- **`refs`**: rsa 06 `"05#q3"` ok; rsa 04 `"03#q3"` ok; rsa 02 `"03#d1"` ok; rsa 07 `"one-cash-mover#q3"` no-anchor; rsa 10 `"cloud-migration 07#q3"` no-anchor (confirm both are intended, because they become FM_REF errors).
- **`textRefs`**: rsa 07 `cloud-migration 07` ticket; cash-handling-workflow 14 `cash-movement-engine ticket 08` ticket; migration-notes `cloud-migration 08` ticket; cash-handling-workflow 22 `ticket 77` none; ocm 06 `ticket 01` ticket; `card 84997` and `card 72633` ado; `order 51234` and `invoice 90817` none.
- **`hidden`**: `modules/_templates/*` is absent from `files`.
