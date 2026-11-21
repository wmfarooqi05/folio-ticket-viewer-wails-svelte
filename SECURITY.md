# Security policy

## Reporting a problem

Please report a vulnerability **privately**, through GitHub private vulnerability reporting:
<https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/security/advisories/new> (or the repository's
**Security** tab › **Report a vulnerability**). Please do not open a public issue for it.
Include the version (`folio-issues-kanban-viewer --version`), your OS and Node version, and the steps to reproduce.

## What happens after you report

This is a one-person project, so these are targets, not promises:

1. **Within 7 days:** a reply that the report arrived, and whether it reproduces.
2. **Within 30 days** for a confirmed vulnerability: a fixed version on npm. If it takes longer, the advisory
   says why and what to do meanwhile.
3. **Disclosure:** once the fix is published, a GitHub security advisory describes the vulnerability, the affected
   and fixed versions, and credits you unless you ask not to be named. Affected versions are deprecated on npm.
   Please keep the report private until then, or until 90 days have passed, whichever comes first.

## What is covered

- The npm package `folio-issues-kanban-viewer`, and its web mode: the local server (127.0.0.1 only, one-time link token,
  host check, read-only access to your docs) and the browser page it serves. Only the latest published version
  gets fixes.

## What is not covered

- The Go/Wails desktop app is **retired and unsupported** (see [RETIRED.md](RETIRED.md)). It gets no fixes.
- Problems that need an attacker who already controls your machine or your user account.
