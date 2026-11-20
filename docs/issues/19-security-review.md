---
type: verify
status: open
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: []
superseded_by: null
pr: []
ado: []
afk: true
---

# 19 — Focused security review

## Why

The owner's biggest concern is running Folio on a company VM. Per-ticket reviews covered the sanitiser, the CSP, Mermaid, the asset handler and the external-link allowlist, but nobody has looked at the system as a whole with hostile input. This is a focused review of about 4–6 person-days, scoped in [16-security-assessment.md](../assets/16-security-assessment.md). It runs after 16–18, so it tests the hardened build.

## To do

- [ ] **IPC and host review (about 1.5 days).** Treat every bound Go method (`ShellService`, `DocsService`, `MemoryService`) as attacker-callable. Check the Wails runtime objects, navigation, new windows, downloads, permissions and the profile. Re-test the fixes from 16.
- [ ] **Web-mode server review.** The Node server from 24 is a localhost service any page in the browser can reach. Check `Host` and token enforcement, cross-site requests, DNS rebinding, every endpoint, the `/doc/` path rules ported from Go, and that it binds to `127.0.0.1` only.
- [ ] **Malicious-docs corpus (about 1 day).** Build a `fixtures/hostile/` tree containing:
  - HTML and SVG payloads;
  - Mermaid `click`, `%%{init}%%` and `htmlLabels` tricks;
  - huge and deeply nested files;
  - RTL and homoglyph link labels;
  - every URI scheme;
  - UNC image paths, junctions, ADS, `CON.png` and 8.3 names;
  - frontmatter bombs.

  Run the corpus in the real exe with a network monitor watching.
- [ ] **Fuzzing (about 1 day).**
  - Go: `go test -fuzz` for `SafeJoin`, `ValidateExternalURL`, `VSCodeURL`, `settings.Load` and the bench command parser.
  - JS: property tests asserting that rendered output has no element or attribute outside the allowlist.
- [ ] **SAST and dependencies (about 0.5 day).** Run govulncheck, gosec, semgrep (`p/golang`, `p/typescript`) and `npm audit`. Add them to CI, along with Dependabot or Renovate.
- [ ] **Build and release review (0.5–1 day).** Review the CI workflow from 17, the signing from 21, and the NSIS script once it compiles.
- [ ] **Crash dumps.** Force a renderer crash and check whether `EBWebView\Crashpad` holds a dump with document text, given that `--disable-breakpad` is set.
- [ ] **Network silence.** Over a full session, confirm Folio and its WebView2 processes open no outbound connections.

## Done when

- <a id="ac1"></a>**AC1** — The hostile corpus renders in the real exe with no script running, no navigation away, no external process launched and no network traffic.
- <a id="ac2"></a>**AC2** — The fuzz targets and the SAST tools run in CI, and every finding is fixed or accepted in writing.
- <a id="ac3"></a>**AC3** — A short written report in the Outcome lists what was tested, what was found, and the residual risks the owner accepts.

## Outcome

*(empty)*
