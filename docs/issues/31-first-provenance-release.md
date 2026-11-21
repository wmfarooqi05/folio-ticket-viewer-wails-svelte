---
type: build
status: blocked
status_note: "paused by the owner Nov 21, 2026: 0.1.1 published with provenance; only AC3 (disallow tokens) is left"
waiting_on: owner
blocked_by: []
blocked_note: "the owner sets \"Require two-factor authentication and disallow tokens\" on npmjs.com"
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

- [x] **Something to release.** A real fix, or the README badges from ticket 28, which only reach the npm page with a new version.
- [x] **On the release day (owner):** on npmjs.com, go to `folio-issues-kanban-viewer` › Settings › Trusted publisher › GitHub Actions and enter:
  - repository `wmfarooqi05/folio-ticket-viewer-wails-svelte`;
  - workflow `publish-npm.yml`;
  - environment `npm-publish`;
  - **tick "npm publish"**.
- [x] **Follow [releasing.md](../releasing.md):**
  1. the version-bump PR;
  2. merge, then tag `v0.1.1`;
  3. run `publish-npm` on the tag, and the owner approves it.
- [ ] **Owner:** set "Require two-factor authentication and disallow tokens" on the package.

## Done when

- <a id="ac1"></a>**AC1** — The 0.1.1 page on npmjs.com shows "Built and signed on GitHub Actions", linking to the `publish-npm` run and the tagged commit.
- <a id="ac2"></a>**AC2** — In a scratch project, `npm install folio-issues-kanban-viewer@0.1.1` then `npm audit signatures` reports a verified attestation.
- <a id="ac3"></a>**AC3** — The package disallows token publishing.

## Progress

Nov 21, 2026:
- **0.1.1 was released through the workflow.** PR 8 bumped the version, and `v0.1.1` was tagged on `83594d1`. The tag's CI run built, signed and released it, and `publish-npm` published it through the trusted publisher (OIDC, no token). The provenance was logged to Sigstore's transparency log.
- **AC1.** The 0.1.1 page on npm has SLSA v1 provenance ("Built and signed on GitHub Actions").
- **AC2.** In a scratch project, `npm audit signatures` reported "1 package has a verified attestation". The npm tarball's SHA-256 (`6242faf5…`) matches the tarball in the GitHub Release, and `npx` ran it as expected.
- **AC3.** Paused by the owner: they set "disallow tokens" later.
