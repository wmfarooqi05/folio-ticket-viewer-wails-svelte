---
type: build
status: open
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["10", "17", "19"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 16 — Harden the WebView2 host

## Why

The security assessment ([16-security-assessment.md](../assets/16-security-assessment.md)) found that Folio's own rendering is sound, but the WebView2 host that Wails v3.1.0 sets up is not. None of these is exploitable alone. Each one decides how bad a first bug (a sanitiser or Mermaid bypass, a compromised dependency) would be: with them open, page script could launch any protocol handler, read the clipboard silently, or point Folio at any folder.

Scope (Nov 20, 2026): this protects the **desktop exe** on the owner's PC. On the company VM Folio runs as an npm web app in Edge (24), where Edge's sandbox replaces this hardening, so this no longer blocks the VM.

## To do

- [ ] **Runtime-request guard (H1, H2).** In Folio's outermost asset middleware (`shell.DocAssets` chain), reject `/wails/runtime*` requests unless `Origin` is `http://wails.localhost` and `Sec-Fetch-Site` is `same-origin`. First prove that same-origin runtime calls actually send these headers; if not, find another reliable check. Allowlist runtime objects to Call (0), Events (3) and CancelCall (10), plus Window (6) only if something uses it. Restore the request body after reading it.
- [ ] **Navigation watchdog (H1).** A NavigationCompleted hook that reloads `/` whenever the URL leaves `wails.localhost`. File an upstream Wails issue asking for cancellable NavigationStarting, NewWindowRequested and DownloadStarting.
- [ ] **Deny every WebView2 permission (H3)** in `WebviewWindowOptions.Permissions` and `Windows.Permissions`. The copy button uses clipboard write, which must still work.
- [ ] **Disable the default context menu (M1):** `DefaultContextMenuDisabled: true`. Ctrl+C still works.
- [ ] **Move the WebView2 profile to Local AppData (M2):** `WebviewUserDataPath` = `%LOCALAPPDATA%\Folio\WebView2`. Serve `/doc/` with `Cache-Control: no-store`. Update the uninstaller and README paths.
- [ ] Add `frame-src 'none'; worker-src 'none'` to the CSP if nothing needs them.

## Done when

- <a id="ac1"></a>**AC1** — A Go test shows a `/wails/runtime` request with a foreign or missing Origin is rejected, and one calling `Browser.OpenURL` (object 9) is rejected even from the right origin. The app still works end to end.
- <a id="ac2"></a>**AC2** — In the production exe: right-click shows no menu, F12 and Ctrl+Shift+I do nothing, and a script calling `navigator.clipboard.readText()` is refused.
- <a id="ac3"></a>**AC3** — The WebView2 profile is under `%LOCALAPPDATA%\Folio\WebView2`, nothing is created under `%APPDATA%\folio.exe`, and a `/doc/` image is not in the HTTP cache.
- <a id="ac4"></a>**AC4** — If the page is forced to navigate to another origin, it returns to Folio within a second.

## Open questions

### <a id="q1"></a>Q1 — Do same-origin runtime fetches carry Origin and Sec-Fetch-Site in WebView2?

The guard depends on it. Test before building on it.

## Outcome

*(empty)*
