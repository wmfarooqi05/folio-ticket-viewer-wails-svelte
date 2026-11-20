---
type: decision
status: done
status_note: "decided Nov 20, 2026 (owner): a public npm package, run with npx"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["17", "23", "24"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 22 — How Folio reaches the company VM

## Outcome

**A public npm package** (24). On the VM: `npx folio-viewer --docs <path>`, which opens Folio in Edge.

Why: the owner wants a simple utility, not a release process. Node and npm are already installed and used daily on the VM, the owner is happy for the repo and package to be public, and the package has no dependencies, so an install downloads only Folio itself. No exe, installer, signing, winget or Chocolatey is needed.
