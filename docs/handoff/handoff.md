# Local tickets: conventions, templates and the ticket viewer — handoff

Written Nov 17, 2026. **Status: nothing built.** This doc holds the conventions, the template
drafts, the specification for one small script in this repo, and the specification for the
ticket-viewer UI that the owner will build in a separate project.

Two readers:

- **The next session in this repo.** It writes the templates, `docs/modules/CONVENTIONS.md` and the
  `tickets` script, then migrates one sample module. Sections 1 to 6 and the first half of the
  skeleton.
- **The agent building the viewer.** It never edits this repo. Sections 1 to 3 (what it parses) and 7
  (what it shows), plus the second half of the skeleton.

The ticket system stays a set of folders and markdown files. The viewer is a reading aid only: no
GitHub Issues, no Azure DevOps boards and no database.

## What was decided (owner, Nov 17, 2026)

The owner agreed with the advice given in the session. Seven questions had no answer, so these
defaults hold. **Change them here before building if any is wrong.**

| # | Question | Default taken |
|---|---|---|
| 1 | Code now, or documents only? | Documents only in this pass. The `tickets` script is specified here and built in the next session, once the owner approves. |
| 2 | Global `T-005` IDs? | **No.** The ID is the number space plus the ticket number: `one-cash-mover 05`. |
| 3 | Dotted sub-items (`9.1`, `14.10`)? | They are not anchored or linkable. A follow-up that will be worked gets its own ticket number. Existing dotted text stays as it is. |
| 4 | "Built on a branch, not merged"? | It is `in-review`. A decided decision ticket is `done`. |
| 5 | Migration scope? | Active modules only. The sample is `remove-service-account`. Closed modules are never migrated, and the viewer reads them through the legacy fallback. |
| 6 | Where does this handoff live? | Here. The viewer's repo is the owner's choice and is not named here. |
| 7 | Which agent instruction files link `CONVENTIONS.md`? | A row in `CLAUDE.md`'s docs map and a line in `.github/copilot-instructions.md`. `AGENTS.md` is left alone: it is untracked and holds only the block `next dev` writes. *Superseded Nov 17, 2026 (verification-pipeline 14.11): the rules and the docs map moved into a committed `AGENTS.md`, which `CLAUDE.md` imports. The row is there now.* |

## What exists today (survey, Nov 17)

- **About 35 modules** under `docs/modules/`. Tickets are `docs/modules/<module>/issues/NN-slug.md`.
  Modules can nest: `cash-handling-workflow/step2b-payment-identification/issues/` and
  `monitoring-alerting/wayfinder/issues/`.
- **The number space is the top-level module folder.** `cash-handling-workflow` numbers 01 to 100
  across its own `issues/` and the five step folders, with no duplicates. No module has a duplicate
  number. Ticket 100 exists, so a number has **two or more digits**, not exactly two.
- **No file has YAML frontmatter.** Metadata is body lines: `Type:` 425 times, `Blocked by:` 377
  times, `Label:` 23 times.
- **`Status:` is free text with 30+ shapes**: `resolved`, `open`, `decided Nov 17, 2026`,
  `built Nov 16, 2026 on claude/ocm…`, `✅ resolved`, `done — merged to dev in PR 208`,
  `open — charted Oct 6, 2026; no…`.
- **`Type:` values:** `build` 131, `grilling` 53, `decision` 24, `decision + build` 23, `task` 20,
  `bug` 10, `task (AFK)` 8, `spike` 6, `fix` 3, `verify` 2, and a few combinations.
- **Maps are full documents**: Destination, What is already true, Order, Tickets, Risks, Open
  questions (owner), Notes. The Tickets table has about 15 column layouts. The most common is
  `| # | Ticket | Type | Blocked by | Status |`. Others use `Resolved`, `Recommend`, `Size`, `Built`
  or no status at all.
- **Questions:** `### Q35 — title (answered 2026-10-14)` headings exist, and so do follow-up
  headings `### Q35 answered — 2026-10-14`, which create duplicate anchors. A map's open questions
  are a plain numbered list. Client questions live in their own files (`client-questions.md`,
  `client-answers-2026-10-13.md`, `answers.md` with J2, K5…). **No link anywhere points at a
  question anchor.**
- **Links:** about 160 relative links between modules already exist. Prose also says
  "cloud-migration 07", "cash-movement-engine ticket 08", "with ticket 77" without a link.
- **Ticket sections:** Why / To do / Done when / Outcome. Decision tickets add *Amended after client
  answers*.
- **PR template:** [.azuredevops/pull_request_template.md](../../.azuredevops/pull_request_template.md)
  and [pull-request-guide.md](../patterns/pull-request-guide.md): work item id first, *Please read
  before approving*, *Verified* with real counts, a 3,800-character budget (Azure DevOps caps a PR
  description at 4,000).
- **Two docs use Mermaid.**

---

## 1. Identity

**A number space** is a folder directly under `docs/modules/`. Every `issues/` folder anywhere
below it shares its numbers. Nested maps (`step2b-…`, `wayfinder/`) are views inside the space,
not spaces of their own.

**A ticket's ID** is `<space> <number>`, for example `one-cash-mover 05` or
`cash-handling-workflow 86`. It is read from the path:
`docs/modules/<space>/**/issues/<number>-<slug>.md`. The filename's number is the only place the
ID is stored, so there is no `id:` field to drift.

Rules:
- The number is never changed and never reused. The next ticket takes the space's highest number
  plus 1, counting dropped and superseded tickets.
- Two digits minimum (`05`, `86`, `100`). In references, `5`, `05` and `005` are the same ticket.
- The slug after the number may be renamed. Links break when it is, and the `tickets check` script
  reports them.
- The H1 is `# NN — Title`. Some old tickets have no number in the H1, and they are left as they
  are.
- A space name is unique by construction, because it is a folder name.

**An item** is something inside a file that someone can point at: Q (question), D (decision),
AC (acceptance criterion), R (risk). Its ID is the file's ID plus the item: `one-cash-mover 05 Q3`,
or `remove-service-account Q3` for an item in a map. Item numbers are per file, never reused and
never renumbered. Older series such as J2, K5, S1 and Z8 (`answers.md`, the security review) stay
as they are. They are not part of this convention.

## 2. Frontmatter

### Ticket

~~~yaml
---
type: build              # build | decision | grilling | task | bug | spike | verify — or a list: [decision, build]
status: open             # open | in-progress | blocked | in-review | done | dropped | superseded
status_note: null        # one line: the date and the why, e.g. "merged to dev in PR 208, Nov 16"
waiting_on: null         # owner | client | dba | infra | ops — a person, not a ticket
blocked_by: []           # refs, see "References"
blocked_note: null       # one line when a blocker needs words: "04 on each environment"
related: []
superseded_by: null      # a ref
pr: []                   # Azure DevOps PR numbers
ado: []                  # client Azure DevOps work items this ticket implements (72633…)
afk: false               # true: an agent can finish it without a person (was "task (AFK)")
---
~~~

Fields left out on purpose, because the viewer can work them out and a stored copy would drift:
- `id`: the path.
- `module`: the path.
- `title`: the H1.
- `created` and `updated`: git.
- `depends_on`: the same thing as `blocked_by`. The project has only ever written "Blocked by".

Once a field is in frontmatter, **its body line is deleted.** Keeping both brings the drift back.

`waiting_on` exists because many tickets here wait on a person, not on another ticket: a client
answer, a DBA applying DDL, Rico's network, a person deleting a Key Vault secret. `infra` means
Rico's side (VNet, DNS, private link, firewall). `ops` means a person with access to a host,
Key Vault or a Library variable group. Old `Type: task + ops` becomes `type: task`,
`waiting_on: ops` while the ops step is open.

### Map

~~~yaml
---
status: active           # charted | active | closed | superseded
ado: 84997               # the module's dev-only card
superseded_by: null      # a space name: one-cash-mover
---
~~~

### References (in `blocked_by`, `related`, `superseded_by`)

| Form | Means |
|---|---|
| `"05"` | ticket 05 in this file's own number space |
| `"05#q3"` | Q3 in that ticket |
| `"one-cash-mover 05"` | a ticket in another space |
| `"one-cash-mover 05#q3"` | an item in it |
| `"one-cash-mover#q3"` | an item in that space's top `map.md` |

**Always quote references.** YAML 1.1 reads a bare `010` as octal 8 and rejects `08`.

### The YAML subset

Frontmatter uses only `key: scalar`, `key: [a, "b c"]`, `null`, `true`/`false` and `#` comments:
one line per key, nothing nested, no multi-line values. The `tickets` script parses exactly this
subset itself. This repo has no direct YAML dependency (`yaml` and `js-yaml` are only transitive),
and adding one means regenerating `package-lock.json` on Linux (CLAUDE.md). A subset small enough
to parse in about 40 lines avoids that.

Preview: VS Code hides frontmatter by default (`markdown.previewFrontMatter`). GitHub shows it as
a small table. The Azure DevOps file view has not been checked: check it in the sample migration
(Risks).

## 3. Status

One enum for every ticket. It shows the state in one word, and the date and reason go in
`status_note`.

| Status | Means | Set by |
|---|---|---|
| `open` | not started | whoever writes the ticket |
| `in-progress` | someone is working on it now | the agent, when it starts |
| `blocked` | cannot move. Needs `blocked_by` or `waiting_on` | whoever finds the block |
| `in-review` | built and not merged: a PR is open, or the work is on a branch | the agent, with `pr:` |
| `done` | merged, or decided (a decision ticket is done when its *Outcome* is written) | the agent, in the commit that finishes it |
| `dropped` | will not be done. `status_note` says why | owner |
| `superseded` | replaced. Needs `superseded_by` | whoever replaces it |

Kanban column order: open, in-progress, blocked, in-review, done. Dropped and superseded are
collapsed.

### Reading old files (legacy fallback)

The script's `index` command and the viewer both map an old `Status:` line like this. Rules are
tried in order, case-insensitive, against the text after `Status:` with `*`, `` ` `` and `✅`
stripped. The original text becomes `status_note`.

| # | Pattern | Status |
|---|---|---|
| 1 | `superseded` anywhere | `superseded` |
| 2 | `^(dropped\|won't\|wontfix\|cancel)` | `dropped` |
| 3 | `^blocked` | `blocked` |
| 4 | `^built` and any of `on branch`, `on claude/`, `not merged`, `not yet run`, `on the provisional` | `in-review` |
| 5 | `^(in progress\|building)` | `in-progress` |
| 6 | `^(resolved\|decided\|settled\|done\|built\|merged\|answered)` | `done` |
| 7 | `^(open\|not started\|charted)` | `open` |
| 8 | anything else | `unknown` (shown as raw text, never guessed) |

`Type:` maps the same way: `fix` becomes `bug`, `task (AFK)` becomes `task` with `afk: true`, and
`a + b` becomes `[a, b]`. `Blocked by:` is kept as `blocked_note`. Refs are pulled out only when it
is bare numbers (`01`, `03–07`, `04, 05`).

## 4. Items and anchors

**The anchor goes inside the heading, on the same line:**

```markdown
### <a id="q3"></a>Q3 — Who moves the cash in Step 4
```

Never on the line above. Checked with micromark (CommonMark) on Nov 17: a closed `<a id="q3"></a>`
on its own line renders as an empty `<p>` before the heading, which costs spacing and makes the
item's start ambiguous. An **unclosed** `<a id="q3">` on its own line starts an HTML block, and the
heading below renders as literal `### Q3 …`. Inside the heading, the anchor gives
`<h3><a id="q3"></a>Q3 — …</h3>`, survives a title change, and GitHub's own heading slug ignores
it.

The id is lowercase: `q3`, `d2`, `ac1`, `r4`. It is unique within the file.

**Q, D and R are headings** (they have a body). **AC are list items**, with the anchor at the start:

```markdown
## Done when

- <a id="ac1"></a>**AC1** — No scheduled task calls the app.
- <a id="ac2"></a>**AC2** — `ApiKey.LastUsedAt` does not move after the merge on any environment.
```

*Done when* stays the section name. Its bullets become numbered ACs.

**State lives in a marker line at the start of the item's body.** No marker means the item is open.

| Item | Marker |
|---|---|
| Q | `**Answered 2026-10-14 (client):** …` |
| D | `**Superseded by [D4](#d4):** …` |
| R | `**Closed 2026-11-20:** …` |
| any | `**Dropped 2026-11-20:** why` |

An item is never deleted and never gets a second heading. The old `### Q35 answered — 2026-10-14`
style becomes a marker under `### Q35`.

A map's *Open questions (owner)* list becomes Q headings, so `remove-service-account Q3` has
somewhere to point.

**Extracting an item** (the viewer's right panel and the script's anchor check): the item runs from
its anchor to the next anchor of the same kind, or to the next heading at the same or higher level,
whichever comes first. For an AC it is that list item.

## 5. Links

**In prose, use a real relative link.** It works in VS Code, on GitHub and in the viewer.

| Where | Write |
|---|---|
| same file | `[Q3](#q3)` |
| same number space | `[05 Q3](05-build-movecash.md#q3)` or `[05](../issues/05-build-movecash.md)` |
| another space | `[one-cash-mover 05 Q3](../../one-cash-mover/issues/05-build-movecash.md#q3)` |
| a map item | `[remove-service-account Q3](../remove-service-account/map.md#q3)` |

Link text follows one of these shapes, matched by:

```
^(?:(?<space>[a-z0-9-]+) )?(?<num>\d{2,})(?: (?<kind>Q|D|AC|R)(?<n>\d+))?$
^(?:(?<space>[a-z0-9-]+) )?(?<kind>Q|D|AC|R)(?<n>\d+)$
```

The viewer follows the **href**, never the text. The text pattern only marks a link as a ticket
reference. Plain text that is not a link ("cloud-migration 07") is auto-linked by the viewer only
when `<space>` is a known space name, so ordinary numbers are not turned into links (section 7).

The frontmatter refs (section 2) carry the same relationships for the graph. Prose links say why;
frontmatter says that. When they disagree, frontmatter wins and the check script warns.

## 6. Module map table

The table is **generated from frontmatter**, between two markers. Everything else in the map is
written by hand and never touched.

```markdown
## Tickets

<!-- tickets:begin view=kanban -->
| # | Ticket | Type | Blocked by | Waiting on | Status | PR |
|---|---|---|---|---|---|---|
| 01 | [Every scheduled job has a direct entrypoint…](issues/01-entrypoints-and-callers.md) | task | — | — | open | — |
| 02 | [Cut over: nothing scheduled calls a route](issues/02-cutover.md) | task | [01](issues/01-entrypoints-and-callers.md) | ops | blocked | — |
<!-- tickets:end -->
```

- A map lists the tickets in its own sibling `issues/` folder. A nested map lists its own folder.
  Tickets from elsewhere stay as prose links.
- Columns are fixed: the common layout today, plus Waiting on and PR. Status is the enum, and
  `status_note` goes after it as `done — merged in PR 208`.
- Never hand-edit between the markers. The next run overwrites the edit.
- Modules that need extra columns (Recommend, Size) keep a separate hand-written table under
  another heading.
- `view=kanban` is the viewer's hint and is invisible in preview. The viewer groups by the
  frontmatter `status`, never by the table cell.

**Why a generator and not only a validator:** agents already forget CLAUDE.md's "keep the sub-ticket
list in sync". A generator cannot forget. `tickets check` runs the generator in memory and fails if
the block differs, so the generator is also the validator.

## 7. The viewer (separate project)

**It is read-only.** It never writes a ticket file. Files are edited by the owner and the agents in
VS Code, and a second writer would become a second source of truth. Each document gets an "Open in
VS Code" action (`vscode://file/<absolute path>`, URL-encoded: the repo root contains spaces,
`Lockbox and Cash Payment`).

**It does not parse the conventions itself.** It imports the parser from this repo's
`scripts/tickets/lib.mjs` (`buildIndex(root)`, `parseFile(path)`). Two parsers of one convention
will drift. With one parser, a convention change and its parser change land in the same commit
here, and the viewer picks them up.

Layout:
- **Left:** the folder tree of `docs/modules/`, `docs/handoffs/` and `docs/patterns/`. Tickets show
  a status dot. `_templates/` is hidden.
- **Middle:** the rendered document. Frontmatter is a header card (status, waiting on, blocked by as
  chips, PR and ADO as links). A map with `view=kanban` gets a Table / Board toggle.
- **Right panel:** clicking any internal `.md` link opens its target there. With a fragment, only the
  item is shown (extraction rule in section 4). It has its own back stack, and "open in middle"
  promotes it.

Views beyond a single file, in order of value:
1. **Waiting on**, across every space: tickets with `waiting_on` set, grouped by person.
   *Owner* first. This is the one view no file gives today.
2. **Board per map:** kanban by status, cards show number, title, type and blocker chips.
3. **Open questions:** every Q item with no *Answered* marker, across all files.
4. **Dependency graph** from `blocked_by`, per space, with cross-space edges shown as stubs. Later;
   the board covers most of it.

Rendering:
- GFM tables and task lists.
- Raw HTML limited to `<a id>`; sanitise the rest.
- Mermaid (two docs use it).
- Relative images: screenshots under `evidence/` are gitignored, so render them when present and
  show a placeholder when not.

Auto-linking plain text, as a render plugin:
- `\b(<known space names>)(?: ticket)? (\d{2,})(?: (Q|D|AC|R)(\d+))?\b` links to the resolved ticket
  or item.
- `\bticket (\d{2,})\b` links within the current file's space.
- Azure DevOps work items: only from `ado:` / `pr:` fields, or a 5-digit number right after "card",
  "ADO" or "work item". Never every 5-digit number. The URL template is configuration, for example
  `https://dev.azure.com/skywardins/Lockbox%20and%20Cash%20Payment/_workitems/edit/{id}`. The PR URL
  needs the repo name, which is configuration too.

Legacy files show a small "legacy" badge, with status taken from the fallback in section 3, so
closed modules read correctly without migration.

**Performance:** this VM's disk is slow (a `find` over `docs/modules` from Git Bash took more than
120 seconds; the VM has 16 GB RAM and 2 CPUs). Build the index once at start, cache it to a JSON
file keyed by path and mtime, and then re-parse only the files a watcher reports. Never rescan on a
click.

---

## Implementation skeleton

### Part A — this repo (next session)

Files to create:

    docs/modules/CONVENTIONS.md            ← sections 1–6 of this doc, rules only (~150 lines); the source of truth once written
    docs/modules/_templates/ticket.md      ← frontmatter block + H1 + Why / To do / Done when (AC list) / Outcome
    docs/modules/_templates/map.md         ← frontmatter + Destination / Order / Tickets (markers) / Risks / Open questions (Q headings) / Notes
    scripts/tickets/lib.mjs                ← zero-dependency: parseFrontmatter (the subset), parseLegacy, parseItems, parseLinks, resolveRef, buildIndex, renderMapTable
    scripts/tickets/cli.mjs                ← `check [--space <name>] [--all]`, `map [--space <name>] [--write]`, `index --json`, `migrate <space>`

Files to change:

    .azuredevops/pull_request_template.md  ← add Tickets + Acceptance (below), stay inside the 3,800-character budget
    docs/patterns/pull-request-guide.md    ← one paragraph on the two new sections
    package.json                           ← "tickets": "node scripts/tickets/cli.mjs", "tickets:check": "node scripts/tickets/cli.mjs check"
    AGENTS.md                              ← one docs-map row (the rules file since 14.11; CLAUDE.md imports it): "Writing or changing a ticket, map or item | CONVENTIONS.md | run npm run tickets:check after"
    .github/copilot-instructions.md        ← one line pointing at CONVENTIONS.md
    docs/modules/remove-service-account/   ← the sample migration (map + 8 tickets)

`package.json` already has an uncommitted change in the working tree. Look at it before editing.

Data flow inside the script:

    cli → buildIndex(docs/modules)
            per file: frontmatter ? parseFrontmatter : parseLegacy  → { path, space, num, title, meta, legacy }
                      parseItems(body)  → [{ kind, n, id, line, state }]
                      parseLinks(body)  → [{ href, text, line }]
          → checks(index) → report
          → renderMapTable(map, tickets) → compare with / write between markers

`check` reports, as `path:line  CODE  message`, grouped by file, exit 1 on any error:

| Code | Check | Level |
|---|---|---|
| `FM_PARSE` | frontmatter is outside the subset | error |
| `FM_ENUM` | `status`, `type`, `waiting_on` not in the enum | error |
| `FM_REF` | a `blocked_by` / `related` / `superseded_by` ref resolves to no file or no anchor | error |
| `DUP_NUM` | two files share a number in one space | error |
| `DUP_ANCHOR` | two items share an id in one file | error |
| `LINK` | a relative link's file or fragment does not exist (fragment: an explicit id, or a GitHub-style heading slug for old files) | error in migrated files, warning in legacy |
| `MAP_STALE` | the generated block differs from frontmatter | error |
| `STATUS_SHAPE` | `blocked` with no `blocked_by` / `waiting_on`; `superseded` with no `superseded_by`; `in-review` with no `pr` and no `status_note` | warning |
| `ITEM_REMOVED` | an item id present on `dev` is gone (`git show dev:<path>`) — items are never deleted | error, only with `--since dev` |

By default `check` covers migrated spaces (any file with frontmatter) and only warns on legacy
files, so the backlog of old files does not bury new errors. `--all` shows everything.

`migrate <space>` rewrites the body lines into frontmatter using the fallback rules, keeps the
original status text as `status_note`, and adds the generator markers around the map's table. It
prints the diff for review. It never touches anything but those lines.

CI runs no lint or tests today (`RUN_TESTS=false`,
[verification-pipeline 13](../modules/verification-pipeline/issues/13-turn-tests-on-in-ci.md)), so
`tickets:check` is run by hand and by the agent, like the rest. Its output goes into the PR's
*Verified* section when tickets changed.

Proposed PR template (additions marked):

```markdown
#<work item id>

<!-- One paragraph: what this implements and which tickets it closes. Then the scale, honestly. -->

## Tickets                                   ← new

<!-- One line each: closes | touches, as a link. -->
- closes [remove-service-account 02](docs/modules/remove-service-account/issues/02-cutover.md)

## Acceptance                                ← new

<!-- One row per AC of every ticket this closes. Proof: a test name, a command with its count, an
evidence scenario, or "not run, because ..." (repeat that under Please read). -->
| AC | Proof |
|---|---|
| [02 AC1](docs/modules/remove-service-account/issues/02-cutover.md#ac1) | |

## What is here
## Reviewing this
## Please read before approving
## Verified                                  ← unchanged, plus "- [ ] `npm run tickets:check`:" when tickets changed
```

The proof column maps an AC to the **scenario or test** that proves it, not to one screenshot per
AC: [qa-evidence-capture](../modules/qa-evidence-capture/map.md) owes evidence per scenario.
Several ACs may cite one scenario.

### Part B — the viewer (its own repo)

Shape: a local Node server plus a single-page React app (Vite). No Electron, no database.

    ticket-viewer/
      config.json              ← repoRoot, roots to show, adoWorkItemUrl, adoPrUrl
      server/
        index.ts               ← GET /api/index, GET /api/file?path=, GET /api/events (SSE)
        repo.ts                ← import { buildIndex, parseFile } from `${repoRoot}/scripts/tickets/lib.mjs`
        cache.ts               ← index.json keyed by path + mtime
        watch.ts               ← fs.watch / chokidar → parseFile → push "changed" over SSE
      web/
        App.tsx                ← three panes; owns selectedPath, panelStack
        Tree.tsx               ← index.files → folders, status dots
        DocView.tsx            ← header card + rendered body; Table/Board toggle for maps
        SidePanel.tsx          ← panelStack of {path, fragment}; back; "open in middle"
        Board.tsx              ← map's tickets grouped by meta.status
        WaitingOn.tsx          ← all tickets with meta.waiting_on, grouped
        OpenQuestions.tsx      ← all items kind Q, state open
        markdown/render.ts     ← remark-gfm, frontmatter strip, sanitize (allow <a id>), mermaid,
                                 autolink plugin (known spaces from the index), link interceptor

Props flow:

    App → Tree: index.files, selectedPath, onSelect
    App → DocView: file (from /api/file), meta, onLinkClick(path, fragment) → push panelStack
    App → SidePanel: panelStack, onBack, onPromote
    DocView → Board: tickets of this map's issues folder
    Any view → onLinkClick: internal .md links never navigate the browser

## Order

1. Owner reads this doc and corrects the defaults table.
2. Part A: `CONVENTIONS.md`, the two templates and the PR template change. Documents only.
   **Written Nov 17, 2026**, with the PR guide, the `CLAUDE.md` row and the Copilot line.
   [CONVENTIONS.md](../modules/CONVENTIONS.md) now wins over sections 1 to 6 of this doc.
3. Part A: the `tickets` script, `check` and `map` first.
4. Part A: `migrate remove-service-account`, then run `tickets check --space remove-service-account`
   and show the owner the output. **Stop for review.**
5. Part A: migrate the other active modules, one commit per space. The script can list spaces whose
   legacy status is anything but `done`.
6. Part B: the viewer, against the migrated sample first.

## Out of scope

- No GitHub Issues, Azure DevOps boards, database or hosted service.
- No migration of closed modules, the historical tickets, handoffs or `as-built/` pages. They stay as
  records. The legacy fallback reads them.
- No renumbering, no new global ID, no rewrite of old `Q35 answered` headings outside migrated spaces.
- The `dev-only` card rules in CLAUDE.md are unchanged. Tickets are not mirrored into Azure DevOps,
  and this work needs no card.
- `bankdocs/`, `evidence/` and everything outside `docs/`, `scripts/tickets/`, the PR template and
  the three instruction files.

## Risks

- **The anchor trap.** An unclosed `<a id>` on its own line above a heading breaks the heading, and
  a closed one leaves an empty paragraph (section 4). The template and `CONVENTIONS.md` show the
  inline form, and `check` should flag a line that holds only an anchor.
- **Azure DevOps rendering is unverified.** Whether its file view shows `<a id>` fragments and
  frontmatter cleanly, and whether repo-relative links in a PR description resolve, has not been
  checked. Check all three on the sample before step 5. If PR links do not resolve, the link text
  still reads correctly.
- **Leading-zero refs** in YAML (section 2). `check` rejects an unquoted number.
- **Agents ignore conventions they cannot see.** `CONVENTIONS.md` is linked from all three
  instruction files, and `tickets:check` is the backstop. The rules file (`AGENTS.md` since
  14.11) is near its size budget, so it gets one row and no rules.
- **The generated block overwrites hand edits** between the markers. That is intended, and the
  template says so above the markers.
- **Status drift moves rather than disappears** if agents set `status` but forget `status_note`, or
  the reverse. Only `status` is checked. The note is for people.
- **Two parsers.** If the viewer starts parsing on its own "just for this one case", the drift
  returns. Any parsing need goes into `lib.mjs` here.
