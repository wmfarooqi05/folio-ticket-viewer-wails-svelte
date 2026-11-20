# Folio security assessment and safe path to the company VM

Written Nov 20, 2026 by a senior-security-expert review agent (read-only: no code changed). Source for tickets 16–23. Wails findings are against the v3.1.0 source in the Go module cache.

## Executive summary

- **The design is sound; the WebView host around it is not hardened yet.** The per-ticket fixes held (allowlist sanitiser, CSP with no network origins, SafeJoin, http(s)-only `OpenExternal`). The real gaps are one layer down, in how Wails v3.1.0 configures WebView2: native navigation is never cancelled, the runtime IPC endpoint has no origin check in desktop builds, every WebView2 permission is auto-allowed, and the built-in runtime `Browser.OpenURL` lets any page script bypass Folio's http(s) allowlist.
- **None is exploitable today without a first bug** (a sanitiser or Mermaid bypass, a compromised dependency, or a forced navigation). They decide how bad that first bug would be: today, display spoofing; with these gaps, "launch any protocol handler, silently read the clipboard, read any .md file". About one day to close before install.
- **Do a focused full review**, about 4–6 person-days: IPC and host hardening, a malicious-docs corpus, fuzzing, SAST and the build pipeline. Not a line-by-line re-audit of the sanitiser.
- **winget adds no trust here.** With a local manifest it checks only the SHA-256 you wrote into it, and enabling local manifests needs admin. What matters: a reproducible CI build, Authenticode signing if obtainable, a SHA-256 verified over a separate channel, and IT approval (allowlist entry or Intune package).
- **The biggest practical blocker is corporate policy, not attackers.** A new unsigned exe in `%LOCALAPPDATA%\Programs` is what default AppLocker rules, WDAC and the Defender ASR prevalence rule exist to stop. Talk to IT first.

## Threat model

Assets: company docs content (rendered text, the index cache with titles/headings/item titles/ADO and PR ids, cached images); the VM and the user's session (processes the app can launch, the clipboard, the user's NTLM identity); the user's trust in what Folio displays.

Trust boundaries: docs/ files are untrusted. Go services and the JS bundle are trusted, but any JS running in the page can call every bound Go method and every Wails runtime method. The OS shell (`rundll32 url.dll,FileProtocolHandler`) is a high-privilege sink that dispatches to any registered protocol handler.

| Attacker | Path | Current state |
|---|---|---|
| Malicious .md / Mermaid in the repo | Sanitiser or Mermaid bypass → script; deceptive links; DoS with huge files | Strong (escaped HTML, Mermaid strict + DOMPurify, `script-src 'self'`). Impact if bypassed is high (H1–H3). DoS unbounded: no file-size cap. |
| Malicious link | User clicks an http(s) link | OK: opened externally, validated. |
| Confused deputy (vscode://, shell) | Abuse Folio to launch handlers | `OpenInVSCode` and `OpenExternal` are safe. The Wails runtime's own `Browser.OpenURL` is not (H2). |
| Supply chain | Compromised dependency or build tool | Exact pins, lockfiles committed. But builds run `npm install` and `go mod tidy`, and there is no CI or provenance (M3). |
| Installer tampering in transit | Swapped exe | Nothing yet: unsigned, no checksums, no attestation. |
| Local privilege | Another local user | Low: per-user install, `asInvoker`, no listeners, pipes or services. |
| Network exfiltration | Does it call out? | Folio code makes no calls; CSP blocks all but self; fonts bundled; WebView2 background networking, component update, sync, pings, Translate and Autofill disabled. Residual: Evergreen runtime updates (system-level), WebView2 diagnostic data (IT policy), the NSIS bootstrapper (only if the runtime is missing), and, if script runs, `OpenExternal`/`OpenURL` with data in the URL. |

## Findings

"Chain" means a prior script-execution or navigation bug is needed.

- **H1 – Medium-High (chain): native navigation is never blocked, and the runtime IPC has no origin check.** Wails' `navigationStarting` ignores its args; `navigationCompleted` injects the runtime into whatever page loaded; in non-server builds `checkRuntimeRequest` returns true; the `*` WebResourceRequested filter routes any `/wails/runtime` request into the dispatcher. A foreign page could call `ReadBatch`, `SetConfig` (any repoRoot) and `Browser.OpenURL`. Folio's only guard is JS (`frontend/src/lib/render/dom.ts` `installNavGuard`). Fix in Folio's outermost middleware: reject `/wails/runtime*` unless `Origin` is `http://wails.localhost` and `Sec-Fetch-Site` is `same-origin` (test that these headers are actually sent). Add a NavigationCompleted watchdog that reloads `/` if the URL leaves `wails.localhost`. File an upstream issue for cancellable NavigationStarting, NewWindowRequested and DownloadStarting.
- **H2 – Medium-High (chain): runtime `Browser.OpenURL` bypasses `ValidateExternalURL`.** Wails only blocks `javascript`, `data`, `file`, `ftp` and empty schemes, then shells out. `search-ms:`, `ms-officecmd:`, `vscode://vscode.git/clone?…` are reachable from any page script. Fix: in the same middleware, allowlist runtime objects Call (0), Events (3) and CancelCall (10) only (plus Window (6) if used).
- **H3 – Medium (chain): every WebView2 permission is auto-granted** (Wails sets a global Allow when no policy is set). Microphone, camera, geolocation, notifications, sensors and clipboard *read*. Fix: deny all in `WebviewWindowOptions.Permissions` and `Windows.Permissions`. Clipboard write (the copy button) is unaffected.
- **M1 – Medium: the default context menu is on in production** (Save image as, Save as, Print). Set `DefaultContextMenuDisabled: true`. DevTools are correctly off in production builds.
- **M2 – Medium (privacy): the WebView2 profile is in Roaming AppData** (`%APPDATA%\folio.exe`), which syncs on roaming profiles, and `/doc/` images use `no-cache`, so company diagrams land in the HTTP cache. Fix: `WebviewUserDataPath` = `%LOCALAPPDATA%\Folio\WebView2`, `no-store` for `/doc/`, update the uninstaller.
- **M3 – Medium: the build is not reproducible.** `common:go:mod:tidy` can rewrite go.mod/go.sum; the frontend runs `npm install`; no CI; the wails3 CLI is unpinned. Fix: `npm ci`, `GOFLAGS=-mod=readonly`, `go mod verify`, pinned `wails3@v3.1.0`, build in CI.
- **L1 – Low: the RAM monitor enumerates processes** (once a minute, re-reading only Folio's tree between). Process discovery can trip EDR heuristics. Default it off for the company build, or use WebView2 `GetProcessInfos`.
- **L2 – Low: settings.json is not validated on load.** A hand edit could set an `http:` ADO template or `..` in `docsDir`. A UNC repo root makes Folio do SMB with the user's NTLM credentials. Fix: validate on load; reject UNC and `\\?\` / `\\.\` roots unless picked in the dialog.
- **L3 – Low: the bench hook ships in the production exe.** Env-gated, no listener; negligible. Optionally move it behind a build tag.
- **L4 – Low: logging** writes paths and counts, never contents. Acceptable.
- **L5 – Low: the cache holds derived company content in plaintext** and the uninstaller leaves it. Document it for IT; add a "clear data" option.
- **L6 – Low: no per-file size cap** in `ReadBatch`. Cap at about 5 MB per .md.
- **Crash dumps (unverified):** `--disable-breakpad` is passed but WebView2 uses Crashpad. Check `EBWebView\Crashpad` after a forced renderer crash; ask IT about diagnostic level and WER LocalDumps.
- **Dependencies (checked):** `npm audit` 0 findings; five Go modules linked into the exe (wails v3.1.0, fsnotify 1.10.1, go-ole 1.3.0, x/sys, Folio); lockfiles committed. govulncheck, gosec and semgrep not yet run. Optionally add `frame-src 'none'; worker-src 'none'` to the CSP.

## Full review: scope (about 4–6 person-days)

1. IPC and host review (1.5 d): every bound Go method treated as attacker-callable; Wails runtime objects; navigation, new windows, downloads; permissions; profile. Re-test after H1–H3 and M1.
2. Malicious-docs corpus (1 d): `fixtures/hostile/` with HTML/SVG payloads, Mermaid `click`/`%%{init}%%`/`htmlLabels` tricks, huge and deeply nested files, RTL and homoglyph labels, every URI scheme, UNC image paths, junctions, ADS, `CON.png`, 8.3 names, frontmatter bombs. Run in the real exe with a network monitor.
3. Fuzzing (1 d): Go `go test -fuzz` for `SafeJoin`, `ValidateExternalURL`, `VSCodeURL`, `settings.Load`, `TakeBenchCommands`; JS property tests that render output has nothing outside the allowlist.
4. SAST and dependencies (0.5 d): govulncheck, gosec, semgrep (`p/golang`, `p/typescript`), npm audit, Dependabot or Renovate.
5. Build and release review (0.5–1 d): CI workflow, pinned actions, provenance, signing, NSIS script once it compiles.

## Getting it onto the company VM

Corporate realities: default AppLocker rules allow only `%WINDIR%` and `%ProgramFiles%`; WDAC needs a signer or hash rule or a managed installer (Intune); the Defender ASR rule "block executable files unless they meet a prevalence, age, or trusted list criterion" blocks a freshly built exe even when signed; SmartScreen warns on files with Mark-of-the-Web and no reputation, for weeks even when signed; WebView2 is usually present on Windows 11 (offline or Server VMs need IT's Evergreen Standalone installer); most companies require a software request.

| Option | Protects against | Doesn't | Verdict |
|---|---|---|---|
| Build on the VM from source | Transit tampering | Needs Go, Node, wails3 on the VM; pulls hundreds of npm packages onto the company machine; still an unsigned, zero-prevalence exe | Only on a sanctioned dev box |
| Release artifact + SHA-256 | Corruption, transit tampering (hash via a separate channel) | A compromised build machine | Minimum baseline |
| GitHub Actions + artifact attestations | Proves the exe came from this repo, workflow and commit | Malicious source; private-repo attestations may need GitHub Enterprise Cloud (check) | Good if the plan allows |
| Authenticode (OV, Azure Artifact Signing, EV) | Tampering after signing; enables AppLocker/WDAC publisher rules | Instant SmartScreen/ASR trust; Artifact Signing public trust is US/CA/EU/UK orgs and US/CA individuals only | Worth it for repeated use |
| Self-signed / company CA | Tamper evidence where the cert is trusted | Needs IT to trust the cert | Fine if IT runs a CA |
| winget public repo | Hash check; Microsoft scanning | Requires a public binary; the repo is private | Not appropriate |
| winget private source / local manifest | SHA-256 against your own manifest | Local manifests need admin, often disabled by policy, and are a detection signature; no help with AppLocker/WDAC/ASR | Adds nothing over `Get-FileHash` |
| Chocolatey / Scoop internal feed | Central distribution | Same trust as what you upload | Only if the company runs one |
| Intune / Company Portal | IT-reviewed managed install; clears WDAC/AppLocker/ASR by policy | Needs IT to own it | Best for strict IT |
| MSIX vs NSIS | MSIX: signed, clean uninstall, Intune-native | Needs a trusted cert | MSIX later, via Intune |

Recommended path: (1) ask IT about execution policy, ASR mode, allowlisting or Intune, WebView2 and diagnostics, giving them what Folio is and writes; (2) fix the before-install items; (3) build in GitHub Actions with pinned actions and tools, produce `folio.exe` + `SHA256SUMS`, attest and sign if possible; ship the bare exe first; (4) transfer via a company-approved channel, with the hash obtained separately; (5) on the VM check `Get-FileHash`, `Get-AuthenticodeSignature`, and the Zone.Identifier stream; on your own machine check `go version -m folio.exe` for `-tags=production` and the expected modules; (6) place it where IT allows; (7) first run against a fixtures copy, watching for outbound connections and checking that DevTools and the context menu are off. Fallback for strict IT: hand over source tag, CI exe, hash, provenance and a one-page data note; IT packages it for Intune or as a company-signed MSIX.

## Uncertainties

Private-repo attestation depends on the GitHub plan. Artifact Signing eligibility depends on country. Crashpad behaviour under `--disable-breakpad` is unverified. The runtime guard assumes same-origin runtime fetches carry `Origin` and `Sec-Fetch-Site`; test before relying on it. gosec, govulncheck and semgrep were not run.
