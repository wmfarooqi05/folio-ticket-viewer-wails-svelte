# Ticket conventions

How local tickets, module maps and the items inside them are named, linked and marked, so that a
person, an agent and the ticket viewer read them the same way. The reasoning behind these rules is in
[the handoff](../handoffs/ticket-viewer-and-conventions.md). This file holds only the rules.

**Scope.** These rules apply to every new ticket and map, and to a module once it is migrated. A
migrated module is one whose files start with frontmatter. Older modules are never rewritten to fit:
they stay as records, and the viewer reads their `Status:` / `Type:` / `Blocked by:` lines through
the legacy fallback in the handoff.

Templates: [_templates/ticket.md](_templates/ticket.md), [_templates/map.md](_templates/map.md).

## 1. IDs

- A **number space** is a folder directly under `docs/modules/`, for example `one-cash-mover` or
  `cash-handling-workflow`. Every `issues/` folder below it shares one sequence of numbers. A nested
  map (`step2b-…/map.md`, `wayfinder/map.md`) is a view inside its parent's space.
- A **ticket ID** is `<space> <number>`, for example `one-cash-mover 05`. It is read from the path
  `docs/modules/<space>/**/issues/<number>-<slug>.md`. There is no `id:` field.
- A new ticket takes the space's **highest number plus 1**, counting dropped and superseded tickets.
  Use two digits minimum (`05`, `86`, `100`).
- **A number is never changed or reused.** The slug may be renamed, but then fix the links to it.
- The H1 is `# NN — Title`.

## 2. Items

An **item** is something in a ticket or map that can be pointed at:

| Kind | Is | Form |
|---|---|---|
| Q | a question | heading |
| D | a decision | heading |
| R | a risk | heading |
| AC | an acceptance criterion | bullet under `## Done when` |

An item's ID is its file's ID plus the item: `one-cash-mover 05 Q3`, or `remove-service-account Q3`
for an item in a map.

**The anchor goes inside the heading, on the same line:**

```markdown
### <a id="q3"></a>Q3 — Who moves the cash in Step 4
```

```markdown
## Done when

- <a id="ac1"></a>**AC1** — No scheduled task calls the app.
```

Never put the anchor on a line of its own above the heading. A closed `<a id="q3"></a>` there
renders, but as an empty paragraph, and a reader has to look ahead to find which heading it belongs
to. An unclosed `<a id="q3">` there is worse: Markdown starts an HTML block, and the heading below
shows as literal `### Q3 …`. One line, anchor inside, avoids both.

- The id is lowercase kind plus number: `q3`, `d2`, `r4`, `ac1`. It is unique within the file.
- Item numbers are per file, **never renumbered and never reused**. A new item takes the file's
  highest number of that kind plus 1.
- **An item is never deleted and never gets a second heading.** Its state is a marker line at the
  start of its body. With no marker, the item is open.

| Kind | Marker |
|---|---|
| Q | `**Answered 2026-10-14 (client):** …` (who: owner, client, DBA…) |
| D | `**Superseded by [D4](#d4):** …` |
| R | `**Closed 2026-11-20:** …` |
| any | `**Dropped 2026-11-20:** why` |

Older series such as J2, K5, S1 and Z8 (in `answers.md` and the security review) keep their own
form. Dotted sub-items (`9.1`, `14.10`) are not linkable. A follow-up that will be worked gets its
own ticket number.

## 3. Frontmatter

Ticket:

```yaml
---
type: build              # build | decision | grilling | task | bug | spike | verify, or a list: [decision, build]
status: open             # see section 4
status_note: null        # one line: the date and why, e.g. "merged to dev in PR 208, Nov 16"
waiting_on: null         # owner | client | dba | infra | ops (a person, not a ticket)
blocked_by: []           # refs, see below
blocked_note: null       # one line when a blocker needs words: "04 on each environment"
related: []
superseded_by: null      # a ref
pr: []                   # Azure DevOps PR numbers
ado: []                  # client Azure DevOps work items this ticket implements
afk: false               # true: an agent can finish it without a person
---
```

Map:

```yaml
---
status: active           # charted | active | closed | superseded
ado: 84997               # the module's dev-only card, or null
superseded_by: null      # a space name
---
```

- **Once a field is in frontmatter, its body line is deleted.** Never keep `Status:` in the body as
  well.
- No `id`, `module`, `title`, `created` or `updated`. The path, the H1 and git already hold them.
- `waiting_on`: `owner` is the project owner, `client` the business, `dba` whoever applies SQL,
  `infra` Rico's side (VNet, DNS, private link, firewall), `ops` a person with access to a host,
  Key Vault or a Library variable group.
- **The YAML subset:** `key: value`, `key: [a, "b c"]`, `null`, `true` / `false`, and `#` comments.
  One line per key, nothing nested, nothing multi-line. Quote any value that contains `#`, `:` or a
  comma.

**References** (in `blocked_by`, `related`, `superseded_by`) are always quoted. YAML reads a bare
`010` as the number 8 and rejects `08`.

| Ref | Means |
|---|---|
| `"05"` | ticket 05 in this file's space |
| `"05#q3"` | Q3 in that ticket |
| `"one-cash-mover 05"` | a ticket in another space |
| `"one-cash-mover 05#q3"` | an item in it |
| `"one-cash-mover#q3"` | an item in that space's top `map.md` |

## 4. Status

| Status | Means | Required with it |
|---|---|---|
| `open` | not started | |
| `in-progress` | being worked on now | |
| `blocked` | cannot move | `blocked_by` or `waiting_on` |
| `needs-verification` | built, with evidence staged; waiting for the owner to check it (added Nov 21, 2026, for the factory board) | `waiting_on: owner`, and an evidence folder |
| `in-review` | built and not merged: a PR is open, or the work sits on a branch | `pr`, or the branch in `status_note` |
| `done` | merged, or (for a decision ticket) its *Outcome* is written | |
| `dropped` | will not be done | the reason in `status_note` |
| `superseded` | replaced | `superseded_by` |

- The agent sets the status **in the same commit** as the work that changes it: `in-progress` when
  it starts, `in-review` with `pr:` when the PR opens, `done` when it merges.
- The status is one word. The date and the reason go in `status_note`, never in `status`.
- Within a module, **ticket frontmatter is the source of truth for status.** The map's table follows
  it. AGENTS.md's "the map wins over the Azure DevOps card" still holds.

## 5. Links

In prose, always write a real relative link:

| Target | Write |
|---|---|
| an item in the same file | `[Q3](#q3)` |
| a ticket or item in the same space | `[05 Q3](05-build-movecash.md#q3)` |
| a ticket or item in another space | `[one-cash-mover 05 Q3](../../one-cash-mover/issues/05-build-movecash.md#q3)` |
| an item in a map | `[remove-service-account Q3](../remove-service-account/map.md#q3)` |

- Link text is `<space> NN`, `<space> NN Q3`, `NN`, `NN Q3` or `Q3`. Nothing else goes in the
  brackets. Put the explanation outside the link: `blocked on [05 Q3](…#q3), the account question`.
- A blocker goes in frontmatter **and** may be explained in prose. Frontmatter says that it blocks;
  prose says why. If they disagree, frontmatter wins.

## 6. Module map

The Tickets table sits between two markers:

```markdown
<!-- tickets:begin view=kanban -->
| # | Ticket | Type | Blocked by | Waiting on | Status | PR |
|---|---|---|---|---|---|---|
| 01 | [Title](issues/01-slug.md) | task | — | — | open | — |
<!-- tickets:end -->
```

- It lists the tickets in the map's own sibling `issues/` folder, in number order. Tickets from other
  folders stay as prose links.
- Columns are fixed. *Status* is the frontmatter status, then ` — ` and `status_note` when there is
  one. Empty cells are `—`.
- `view=kanban` tells the viewer to offer a board grouped by status. It is invisible in preview.
- **The block will be generated** from frontmatter by `npm run tickets` (specified in the handoff,
  not built yet). After that, never edit between the markers. Until then, keep it by hand, and update
  it in the same commit as any ticket's frontmatter.
- A module that wants extra columns (Recommend, Size) keeps a separate hand-written table under
  another heading.
- A map's *Open questions (owner)* are Q headings (section 2), not a numbered list.

## 7. Pull requests

The PR template's `## Tickets` and `## Acceptance` sections link tickets and ACs in the section 5 form.
See [pull-request-guide](../patterns/pull-request-guide.md) §5.

## 8. Checking

`npm run tickets:check` is planned, not built. It will report broken links and anchors, unknown refs,
values outside the enums, duplicate numbers and anchors, a stale map table and deleted items (spec in
the handoff). Until it exists, check these by hand on every ticket you write or change.
