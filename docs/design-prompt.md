# Claude Design prompt: ticket viewer mockup

Paste everything below the line into Claude Design.

---

Design a desktop web app UI mockup for a **read-only viewer for file-based project tickets** (Markdown files in folders). The user is a solo developer and project owner who reads tickets all day. It is a reading tool, not an editor or a project-management suite. Priorities: **dense, calm, fast to scan, very light**. Think of a mix of a docs reader and a quiet kanban. It should look good in both **light and dark** themes. Use one neutral palette and a single accent colour. It ships as one static HTML file, so keep it to simple components with no heavy imagery.

## Layout: three panes

1. **Left, a folder tree (about 280px, collapsible).**
   - Roots: `modules/`, `handoffs/`, `patterns/`.
   - Under `modules/`, about 35 module folders. Each module has `map.md` and an `issues/` folder of tickets named like `05-build-movecash.md`.
   - Tickets show a small **status dot**. Use a dot, plus the status word on hover. Do not rely on colour alone.
   - Folders show an open-ticket count badge.
   - A search box at the top filters by title and path.
   - Above the tree, three pinned views: **Waiting on**, **Open questions** and **Board**.
2. **Middle: the rendered document.**
   - Top is a **header card** built from frontmatter: ticket ID (`one-cash-mover 05`), title, status pill, type chips, `waiting on` (a person), blocked-by chips that link to other tickets, related links, PR and ADO links, and an "AFK" tag. It also has an **Open in VS Code** button.
   - Below is the rendered Markdown: headings, GFM tables, task lists, code, a Mermaid diagram, and images with a placeholder state when the file is missing.
   - Items (Questions, Decisions, Acceptance criteria and Risks) carry small ID tags (`Q3`, `AC1`) and a state marker such as *Answered 2026-10-14 (client)*.
   - A **"legacy"** badge appears on older files, with the status inferred.
   - On a module `map.md`, a **Table / Board** toggle.
3. **Right: a side panel (about 360px, opens on demand).**
   - It opens when an internal link is clicked. If the link has a fragment, it shows only that item, for example one question and its answer.
   - It has a Back button with a history stack, a title, an **"Open in middle"** button and a close button.

## Views to design (each as its own screen)

1. **Document view** (default): ticket with header card in the middle and a side panel open on the right.
2. **Board for a module**: kanban columns *Open, In progress, Blocked, In review, Done*. Dropped and superseded sit in a collapsed strip. Cards show the ticket number, title, a type chip and blocker chips.
3. **Waiting on** (across all modules): tickets grouped by person: *Owner* (first), *Client*, *DBA*, *Infra*, *Ops*. Each row has the ticket ID, title, module and how long it has been waiting.
4. **Open questions** (across all modules): every unanswered Q, with its ticket, module and age.
5. **Dependency graph** for one module: nodes are tickets coloured by status, arrows are blocked-by edges, and cross-module edges are small stubs.
6. **First-run / empty state**: a "Pick your docs folder" screen that says nothing is uploaded, files are read locally, and it needs Chrome or Edge.

## Statuses (use consistently)

`open` grey, `in-progress` blue, `blocked` red, `in-review` amber, `done` green, `dropped` and `superseded` muted, struck through. Unknown legacy statuses show raw text in a neutral outline pill.

## Sample content for realism

Module `one-cash-mover`, ticket `05 — Build the cash mover` (type: build, status in-review, PR 208, waiting on: none, blocked by `04`). Another ticket, `remove-service-account 02 — Cut over: nothing scheduled calls a route` (type: task, blocked, waiting on: ops). Question `Q3 — Who moves the cash in Step 4`, answered 2026-10-14 by the client.

## Tone

Quiet, typographic, a reading font for body text and a mono font for IDs. No illustrations, gradients or shadows beyond a hairline. Show three states on the document screen: normal, a long ticket with a table, and a ticket with a broken link.

Deliver: the six screens above in light mode, and the document view and board in dark mode.
