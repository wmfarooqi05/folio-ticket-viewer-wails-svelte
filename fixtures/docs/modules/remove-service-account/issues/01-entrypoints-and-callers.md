---
type: task
status: done
status_note: "merged to dev in PR 201, Nov 12"
waiting_on: null
blocked_by: []
blocked_note: null
related: []
superseded_by: null
pr: [201]
ado: [72633]
afk: true
---

# 01 — Every scheduled job has a direct entrypoint

## Why

Scheduled tasks call the app through HTTP with a service account key. Each job needs a direct entrypoint first.

## To do

- [x] List every scheduled caller
- [x] Add a direct entrypoint per job
- [ ] Delete the old route (moved to [02](02-cutover.md))

## Done when

- <a id="ac1"></a>**AC1** — Every scheduled job has an entrypoint.
- <a id="ac2"></a>**AC2** — No job needs an API key. **Closed 2026-11-12:** verified on dev.
- <a id="ac3"></a>**AC3** — ~~Remove the job from UAT.~~ **Dropped 2026-11-10:** UAT has no schedules.

## Outcome

Merged in PR 201. Card 72633 is the client work item.
