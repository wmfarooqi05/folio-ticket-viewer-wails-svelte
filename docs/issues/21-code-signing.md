---
type: decision
status: dropped
status_note: "Nov 20, 2026 (owner): no exe goes to the company VM; the desktop exe runs only on the owner's PC"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["22", "24"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 21 — Code signing: whether and how

## Outcome

Dropped. Signing would only matter for an exe going to a managed machine. The company VM runs Folio as an npm package (24), and the desktop exe stays on the owner's own PC. Reopen if the exe is ever shared with others.
