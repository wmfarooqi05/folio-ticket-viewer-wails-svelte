---
type: build
status: in-progress
status_note: null
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
  - pin `wails3` to v3.1.0 (`task tools:install`; the bindings step refuses another version).
- [x] A GitHub Actions workflow on `windows-latest`, every action pinned by commit SHA:
  - jobs: go test, go vet, govulncheck, svelte-check, vitest, contract tests, size check, `npm audit`;
  - `folio.exe` built with production tags, plus `SHA256SUMS`;
  - the npm package: `task build:web`, `npm pack`, plus its SHA-256;
  - artifacts on every run, and a GitHub Release (exe, tarball, both checksum files) on a `v*` tag;
  - `actions/attest-build-provenance` for the exe and the tarball, only when the repo is public (see Q1).
- [x] An opt-in `publish-npm` job (`npm publish --provenance`) that runs only on a `v*` tag, only if the repo is public and an `NPM_TOKEN` secret exists. Publishing by hand stays the default.
- [x] README: how to verify a release hash and the npm package.
- Signing is out of scope (ticket 21 is dropped).

## Done when

- <a id="ac1"></a>**AC1** — Two builds of the same commit produce the same `folio.exe` SHA-256 and the same npm tarball SHA-256, or the differences are explained and recorded.
- <a id="ac2"></a>**AC2** — A tagged release has `folio.exe`, `SHA256SUMS`, the `folio-viewer` tarball and its checksum attached, and `go version -m folio.exe` shows `-tags=production`, `-trimpath` and the five expected modules.
- <a id="ac3"></a>**AC3** — The local `task build` also uses `npm ci` and read-only modules.

## Open questions

### <a id="q1"></a>Q1 — What do attestations and npm provenance need, and what happens on a private repo?

Answered from the GitHub and npm docs (Nov 20, 2026):

- **Artifact attestations** (`actions/attest-build-provenance`, now a wrapper over `actions/attest`): the job needs `id-token: write`, `attestations: write` and `contents: read`. "To use artifact attestations in private or internal repositories, you must be on a GitHub Enterprise Cloud plan"; on GitHub Free, Pro or Team they are available for public repositories only (the action's README). Public repos sign through the Sigstore public-good instance and are logged in a public transparency log; private repos use GitHub's own Sigstore instance, which has no transparency log.
- **npm provenance** (`npm publish --provenance`): npm CLI 9.5.0 or newer; a supported cloud CI (GitHub Actions or GitLab) on a GitHub-hosted runner; `id-token: write`; and the `repository` field in package.json must be a public repository matching where it is built. The npm page does not describe private repos, so the workflow refuses to publish with provenance unless the repo is public.
- **On a private repo:** the attestation steps are skipped (guarded by `!github.event.repository.private`), the `publish-npm` job publishes nothing, and the SHA-256 files in the run or release are the only provenance. Everything else (tests, builds, artifacts, the release) works on a private repo.
- **If the owner makes the repo public:** attestations and `--provenance` start working with no workflow change. Add an `NPM_TOKEN` repository secret (an npm automation or granular token) to turn the publish job on, or leave it off and publish by hand.

## Outcome

Built Nov 20, 2026 on branch `worktree-agent-a8a22d9164d4a33b7`. Nothing has run on GitHub yet: the workflow is checked with actionlint v1.7.12 (clean) and every command in it was run locally in the workflow's order.

- **Build path:** `npm ci --ignore-scripts` (works: rolldown, Tailwind oxide and the rest still install; only `fsevents` has a script), `GOFLAGS=-mod=readonly` set in the root Taskfile, `go mod verify` replaces `go mod tidy` (`go:mod:tidy` is now `go:mod:verify`), `task tools:install` for wails3 v3.1.0, and the bindings step refuses any other wails3 version (`wails3 version` prints to stderr, hence `2>&1`).
- **Workflow** `.github/workflows/ci.yml`: jobs `checks`, `audit`, `exe`, `npm-package`, `release` (v* tag), `publish-npm` (opt-in). Actions pinned by SHA: checkout v7.0.1, setup-go v7.1.0, setup-node v7.1.0, upload-artifact v7.0.2, download-artifact v8.0.2, attest-build-provenance v4.2.2. Go 1.27.4, Node 26.7.0, task v3.54.0, govulncheck v1.10.0 pinned. `npm audit`: production deps fail at high; the all-deps run is report-only (both 0 findings today).
- **AC1 (local):** two `task build` runs from a clean state (bin, frontend/dist, node_modules, bindings removed) gave the same SHA-256, `a7f6d0b6c05ed96f90a8d0022c39817841e3a4d60503615537f0bc409b13f822`. Two `task build:web` + `npm pack` runs gave the same tarball hash, `23cbb3737626c09bda1befb6fe0d960a729c088acfc39d368d63d3d25dbd71e8` (127 files; npm fixes tar mtimes at 1985-10-26). Both runs were on the same machine and path. `-trimpath`, `-buildvcs=false` and the stripped binary keep paths, VCS state and build IDs out of the exe. A CI run on a different machine is still to be compared (the hash can differ only if the toolchain differs; Go and Node are pinned to exact versions for that reason).
- **AC2:** `go version -m bin/folio.exe` shows `-tags=production`, `-trimpath=true` and four dependency modules plus Folio itself (fsnotify v1.10.1, go-ole v1.3.0, wails v3.1.0, x/sys v0.48.0): the five expected. The workflow fails if the first two are missing. The tagged release itself is untested until a tag exists.
- **AC3:** done; `task build` uses `npm ci` and read-only modules.
- **Left for the owner:** make the repo public if attestations and provenance are wanted (Q1); add an `NPM_TOKEN` secret only if the opt-in publish job should run, otherwise `npm publish` the tarball by hand; push, tag `v0.1.0` (must match `packages/folio-viewer/package.json`) and check the first real run, then compare its exe hash with the local one above.
