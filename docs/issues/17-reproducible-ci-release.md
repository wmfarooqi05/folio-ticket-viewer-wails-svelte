---
type: build
status: done
status_note: "v0.1.0 tagged at 88f480e (Nov 21, 2026); CI and local builds give the same tarball hash"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["15", "21", "22", "23", "24"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 17 — Reproducible build and CI release

## Why

Today a release is built on the owner's PC with `npm install` and `go mod tidy`, which can drift from the lockfiles and run arbitrary install scripts, and the `wails3` CLI is unpinned. Nothing proves that a build came from this repo at a given commit (finding M3 in [16-security-assessment.md](../assets/16-security-assessment.md)).

Scope update (owner, Nov 20, 2026): the company VM gets the npm package `folio-viewer` (tickets [22](22-distribution-channel.md) and [24](24-node-web-mode.md)), not the exe, and code signing (ticket 21) is dropped. The exe is for the owner's own PC. So this ticket covers both outputs: a clean, pinned, repeatable build of the exe and of the npm tarball, each with a SHA-256 that can be checked on the other side.

## To do

- [x] Make the builds reproducible:
  - `npm ci --ignore-scripts` instead of `npm install` (checked: the native optional dependencies of Vite, rolldown and Tailwind are plain packages and still install; the only install script in the lockfile is `fsevents`, macOS only);
  - `GOFLAGS=-mod=readonly` and `go mod verify`; no `go mod tidy` in the build path;
  - pin `wails3` to exactly v3.1.0 (`task tools:install`; `task build` and `task check` refuse another version);
  - toolchain: `toolchain go1.27.4` in go.mod (a minimum), and `task build` and `task build:web` refuse a Node major other than 26 (CI uses 26.13.1; tests run on any supported Node).
- [x] A GitHub Actions workflow on `windows-2025`, every action pinned by commit SHA:
  - jobs: go test, go vet, govulncheck, svelte-check, vitest, contract tests, size check, `npm audit`;
  - `folio.exe` built with production tags, plus `SHA256SUMS`;
  - the npm package: `task build:web`, `npm pack`, plus its SHA-256;
  - artifacts on every run, and a GitHub Release (exe, tarball, both checksum files) on a `v*` tag;
  - a separate `attest` job (`actions/attest-build-provenance`) for the exe and the tarball, only for a `v*` tag on a public repo (see Q1). The build jobs hold no `id-token` or `attestations` permission.
- [x] A manual `publish-npm.yml` workflow (`workflow_dispatch` only) using npm trusted publishing (OIDC, no token): it refuses a ref that is not a `v*` tag on `main`, publishes the tarball CI built for that commit after checking its checksum and attestation, and runs in the `npm-publish` environment, where the owner must set a required reviewer. Publishing by hand stays the default.
- [x] README: how to verify a release hash, the attestation and the npm package; the toolchain a matching hash needs.
- Signing is out of scope (ticket 21 is dropped).

## Done when

- <a id="ac1"></a>**AC1** — Two CI runs of the same commit produce the same `folio.exe` SHA-256 and the same npm tarball SHA-256, and a CI build matches a local build of that commit, or the differences are explained and recorded.
- <a id="ac2"></a>**AC2** — A tagged release has `folio.exe`, `SHA256SUMS`, the `folio-viewer` tarball and its checksum attached, and `go version -m folio.exe` shows `-tags=production`, `-trimpath` and the five expected modules.
- <a id="ac3"></a>**AC3** — The local `task build` also uses `npm ci` and read-only modules.

## Open questions

### <a id="q1"></a>Q1 — What do attestations and npm provenance need, and what happens on a private repo?

Answered from the GitHub and npm docs (Nov 20, 2026):

- **Artifact attestations** (`actions/attest-build-provenance`, now a wrapper over `actions/attest`): the job needs `id-token: write`, `attestations: write` and `contents: read`. "To use artifact attestations in private or internal repositories, you must be on a GitHub Enterprise Cloud plan"; on GitHub Free, Pro or Team they are available for public repositories only (the action's README). Public repos sign through the Sigstore public-good instance and are logged in a public transparency log; private repos use GitHub's own Sigstore instance, which has no transparency log.
- **npm provenance:** needs a public repo, a GitHub-hosted runner and `id-token: write`; the `repository` field in package.json must match. With **trusted publishing** (npm CLI 11.5.1 or newer, Node 22.14 or newer) provenance is added automatically and no `--provenance` flag or token is needed. Setup on npmjs.com: a GitHub Actions trusted publisher with the owner, repo, workflow filename (`publish-npm.yml`) and, optionally but used here, the environment name `npm-publish`. npm does not check the entry when it is saved, and a new entry expires unless its first publish happens within 2 days.
- **npm tokens:** "As of November 2025, only Granular access tokens are supported. Legacy access tokens have been removed" (classic and automation tokens are gone), and direct publishing with granular tokens "will be removed in January 2027". So no token fallback is built: trusted publishing is the only automated route, and a manual `npm publish` from the owner's own login is the other.
- **On a private repo:** the `attest` job does not run, trusted-publishing provenance is not generated, and the SHA-256 files in the run are the only provenance. Tests, builds, artifacts and the release still work.
- **If the owner makes the repo public:** attestations start working on the next `v*` tag with no workflow change. To use the publish workflow, set up the trusted publisher and the `npm-publish` environment with a required reviewer (mandatory, see the README).

## Outcome

Built Nov 20, 2026 on branch `worktree-agent-a8a22d9164d4a33b7`, then revised after review. Nothing has run on GitHub yet: both workflows pass actionlint v1.7.12, and every command in `ci.yml` was run locally in its order.

- **Build path:** `npm ci --ignore-scripts` (works: rolldown, Tailwind oxide and the rest still install; only `fsevents` has a script), `GOFLAGS=-mod=readonly` in the root Taskfile (an OS-level `GOFLAGS` wins over it; documented in the README), `go mod verify` instead of `go mod tidy`, `task tools:install` for wails3, and an exact `v3.1.0` check in `task build` and `task check`. Toolchain: `toolchain go1.27.4` in go.mod, and `task build` refuses a Node major other than 26.
- **`ci.yml`:** jobs `checks`, `audit`, `exe`, `npm-package`, `attest`, `release`, all on `windows-2025`. Actions pinned by SHA (checkout v7.0.1, setup-go v7.1.0, setup-node v7.1.0, upload-artifact v7.0.2, download-artifact v8.0.2, attest-build-provenance v4.2.2); Go 1.27.4, Node 26.13.1 (current LTS), task v3.54.0, govulncheck v1.10.0. The build jobs have read-only permissions; only `attest` (a `v*` tag on a public repo, after re-checking the checksums) can sign, and only `release` can write contents. `npm audit`: production deps fail at high; the all-deps run is report-only.
- **`publish-npm.yml`:** `workflow_dispatch` only, in the `npm-publish` environment. It refuses anything but a `v*` tag whose commit is an ancestor of `origin/main`, finds the successful `ci.yml` run for that tag, downloads its tarball, checks the checksum and `gh attestation verify`, then runs `npm publish` with trusted publishing (no token, provenance automatic). There is no token fallback: npm removed classic tokens in Nov 2025 and ends direct publishing with granular tokens in Jan 2027 (Q1). Required owner setup is in the README: public repo, trusted publisher on npmjs.com (`publish-npm.yml`, environment `npm-publish`), a required reviewer on the environment.
- **README:** verification one-liners (PowerShell, case-insensitive, `hash *file` format), `gh attestation verify` with `--source-ref` and `--signer-workflow`, a plain statement that the checksum only proves integrity if fetched separately and that attestations are the provenance, immutable releases as an option, and the toolchain a matching hash needs.
- **AC1 stays open.** Local result: three `task build` runs from a clean state (bin, frontend/dist, node_modules, bindings removed; the third after the go.mod toolchain line) all gave `a7f6d0b6c05ed96f90a8d0022c39817841e3a4d60503615537f0bc409b13f822`; two `task build:web` + `npm pack` runs and one more after the changes gave `23cbb3737626c09bda1befb6fe0d960a729c088acfc39d368d63d3d25dbd71e8` (127 files; npm fixes tar mtimes). That is the same machine and path. AC1 needs two CI runs of one commit to match each other and a CI build to match a local build of that commit; compare after the first real CI run. The local hashes came from Go 1.27.4 and Node 26.7.0, while CI uses Go 1.27.4 and Node 26.13.1, so a difference is most likely the Node patch (the `toolchain` line is a minimum and the Node check is major-only); that is why CI uses exact Go and Node versions, which a local build only matches if it uses the same ones.
- **AC2:** `go version -m bin/folio.exe` shows `-tags=production`, `-trimpath=true` and four dependency modules plus Folio (fsnotify v1.10.1, go-ole v1.3.0, wails v3.1.0, x/sys v0.48.0); the workflow fails without the first two. The tagged release is untested until a tag exists. **AC3:** done.
- **Left for the owner:** push, tag `v0.1.0` (must match `packages/folio-viewer/package.json`), compare the CI exe and tarball hashes with the local ones above (closes AC1); make the repo public for attestations and trusted publishing, then do the setup in the README, or publish the tarball by hand.

**Release check (Nov 21, 2026).** Tag `v0.1.0` at `858dc7c`: the tag's `ci` run passed every job, including `attest build provenance` and `GitHub Release`. The Release tarball's SHA-256 is `1123a4158ed892f438004c4c57a289a28a6b0580eee8c872270524b4a6b88250`. It matches `SHA256SUMS-npm`, and `gh attestation verify` (signer workflow `ci.yml`, source ref `refs/tags/v0.1.0`) passes. A local rebuild from the tag (clean worktree, `npm ci`, `npm run build:web`, `npm pack`) gives the same hash, so the build is reproducible (AC1).

**Re-tagged after the rename (Nov 21, 2026).** The package became `folio-issues-kanban-viewer` before any publish, so the first `v0.1.0` tag and Release were deleted and `v0.1.0` now points at `88f480e`. Its `ci` run passed every job. The Release tarball `folio-issues-kanban-viewer-0.1.0.tgz` has SHA-256 `3a7a900788d899a94a56934c5d16bd31138c37e445a7ff4911a97b1b24150ee2`, it passes `gh attestation verify`, and the local build of the same commit gives the same hash.
