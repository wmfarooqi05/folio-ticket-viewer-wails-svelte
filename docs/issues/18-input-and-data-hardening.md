---
type: build
status: open
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["13", "16", "19"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 18 — Input and data hardening

## Why

The low-severity findings in [16-security-assessment.md](../assets/16-security-assessment.md). Each is small, but together they close the ways a hand-edited settings file, a huge file or a network path could make Folio misbehave, and they make Folio's local data easy to explain to IT and easy to remove.

## To do

- [ ] **Validate settings on load (L2).** Run the same validation as `SetConfig` when `settings.json` is read; fall back to defaults field by field, and log what was rejected.
- [ ] **Reject network and device paths as the repo root (L2):** UNC (`\\host\share`), `\\?\` and `\\.\`. A UNC root makes Folio do SMB with the user's NTLM credentials. Allow it only if the user picks it explicitly in the folder dialog, with a warning.
- [ ] **Per-file size cap (L6):** skip `.md` files over about 5 MB in `ReadBatch`, and show them in the tree as too large.
- [ ] **Clear data (L5):** a Settings action that deletes the index cache and the WebView2 profile, and an uninstaller option to do the same. Document every location Folio writes in the README.
- [ ] **RAM readout off by default (L1)** for the company build, since process enumeration can trip endpoint-security heuristics. It stays available in Settings.
- [ ] **Bench hook behind a build tag (L3, optional).** Build a separate bench exe for `scripts/ram-check.ps1`, so the shipped exe has no bench code at all.

## Done when

- <a id="ac1"></a>**AC1** — Go tests show a hand-edited `settings.json` with an `http:` template, `..` in `docsDir` or a UNC root is corrected or rejected on load.
- <a id="ac2"></a>**AC2** — A 10 MB `.md` file is skipped without a stall, and the tree says why.
- <a id="ac3"></a>**AC3** — After "Clear data", the cache and profile folders are gone, and the README lists every place Folio writes.

## Outcome

*(empty)*
