---
type: build
status: in-progress
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["15", "21", "22", "23"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 17 — Reproducible build and CI release

## Why

Today a release is built on the owner's PC with `npm install` and `go mod tidy`, which can drift from the lockfiles and run arbitrary install scripts, and the `wails3` CLI is unpinned. Nothing proves that an exe came from this repo at a given commit. For a company VM, the binary needs to come from a clean, pinned, repeatable build, with a checksum that can be checked on the other side (finding M3 in [16-security-assessment.md](../assets/16-security-assessment.md)).

## To do

- [ ] Make the production build reproducible:
  - `npm ci` instead of `npm install` (try `--ignore-scripts`; check that the native optional dependencies of Vite, rolldown and Tailwind still install);
  - `GOFLAGS=-mod=readonly` and `go mod verify`; no `go mod tidy` in the production build path;
  - pin `wails3` to v3.1.0 (`go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0`).
- [ ] A GitHub Actions workflow on `windows-latest`, every action pinned by commit SHA:
  - build with production tags, run `go test`, `go vet`, vitest, the size check, `govulncheck ./...` and `npm audit`;
  - publish `folio.exe` and `SHA256SUMS` as artifacts (and as a GitHub Release on a tag);
  - add `actions/attest-build-provenance` if the GitHub plan supports attestations on a private repo (check first; see Q1).
- [ ] Leave a slot for signing (ticket 21) without blocking on it.
- [ ] README: how to download a release and verify its hash.

## Done when

- <a id="ac1"></a>**AC1** — Two CI runs of the same commit produce the same `folio.exe` SHA-256, or the differences are explained and recorded.
- <a id="ac2"></a>**AC2** — A tagged release has `folio.exe` and `SHA256SUMS` attached, and `go version -m folio.exe` shows `-tags=production`, `-trimpath` and the five expected modules.
- <a id="ac3"></a>**AC3** — The local `task build` also uses `npm ci` and read-only modules.

## Open questions

### <a id="q1"></a>Q1 — Does the owner's GitHub plan support artifact attestations on a private repo?

As far as the assessment knows, private repos need GitHub Enterprise Cloud. If not, the checksum from the Actions run page is the provenance.

## Outcome

*(empty)*
