---
type: build
status: blocked
status_note: "waiting for something worth releasing as 0.1.1"
waiting_on: owner
blocked_by: []
blocked_note: "the npm trusted publisher must be added on the release day: it expires if nothing is published within 2 days"
related: ["17", "27", "28"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 31 — Release 0.1.1 through the workflow, with npm provenance

## Why

npm's "Built and signed on GitHub Actions" provenance is the strongest trust signal on npm ([credibility.md](../credibility.md), section 1). 0.1.0 was published by hand and can never have it. The first version published by `publish-npm.yml` will.

Done so far:
- the repo is public;
- `package.json`'s `repository` matches the repo;
- the `npm-publish` environment exists (Nov 21, 2026): the owner is the required reviewer, and only `v*` tags may use it.

## To do

- [ ] **Something to release.** A real fix, or the README badges from ticket 28, which only reach the npm page with a new version.
- [ ] **On the release day (owner):** on npmjs.com, go to `folio-issues-kanban-viewer` › Settings › Trusted publisher › GitHub Actions and enter:
  - repository `wmfarooqi05/folio-ticket-viewer-wails-svelte`;
  - workflow `publish-npm.yml`;
  - environment `npm-publish`;
  - **tick "npm publish"**.
- [ ] **Follow [releasing.md](../releasing.md):**
  1. the version-bump PR;
  2. merge, then tag `v0.1.1`;
  3. run `publish-npm` on the tag, and the owner approves it.
- [ ] **Owner:** set "Require two-factor authentication and disallow tokens" on the package.

## Done when

- <a id="ac1"></a>**AC1** — The 0.1.1 page on npmjs.com shows "Built and signed on GitHub Actions", linking to the `publish-npm` run and the tagged commit.
- <a id="ac2"></a>**AC2** — In a scratch project, `npm install folio-issues-kanban-viewer@0.1.1` then `npm audit signatures` reports a verified attestation.
- <a id="ac3"></a>**AC3** — The package disallows token publishing.
