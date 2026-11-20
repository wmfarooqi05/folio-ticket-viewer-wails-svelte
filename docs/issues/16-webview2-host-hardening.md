---
type: build
status: in-progress
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

**Answered (Nov 20, 2026): Origin yes, Sec-Fetch-Site no.** I logged the request headers inside the outermost middleware of the real production exe (temporary logging, since removed). Every `POST /wails/runtime` from the page arrived with `Origin: http://wails.localhost` and an empty `Sec-Fetch-Site`, `Sec-Fetch-Mode` and `Sec-Fetch-Dest`. WebView2 hands the asset handler the request at its WebResourceRequested stage, before Chromium adds the `Sec-Fetch-*` headers, so they can never be used here. The guard therefore checks `Origin` alone. That is still sound for the runtime endpoint: the endpoint only accepts POST, a page cannot forge or drop `Origin` on a POST (browsers set it, and cross-origin script cannot override it), and a foreign page's POST carries its own origin. A same-origin GET carries no Origin, which is why GET is refused on `/wails/runtime` and why the stream and event-payload paths (GET, no runtime object) accept an absent Origin but not a foreign one. No per-launch secret was needed.

## Outcome

### What was built

- **Runtime guard (H1, H2)**: `internal/shell/hostguard.go`, `RuntimeGuard`, outermost in the middleware chain (`main.go`, via `shell.Chain`, ahead of `DocAssets` and of Wails' own transport). A `/wails/runtime` request passes only if it is a POST from `http://wails.localhost` (plus the Vite origin when `FRONTEND_DEVSERVER_URL` is set, so `wails3 dev` still works), is not a chunked upload, and its JSON body names runtime object Call (0), Events (3) or CancelCall (10). The ids come from `messageprocessor.go` in Wails v3.1.0. I allowlisted only what Folio uses: the frontend imports only `Events` from `@wailsio/runtime`, and every other call goes through the generated bindings, which are Call. In the running app I saw only objects 0 and 3 on a normal start. Window (6), Browser (9), Clipboard (1), Application (2), Dialog (5), System (8) and the rest are refused. The body is read once (16 MiB cap) and put back before Wails reads it. Refusals are 403 and log `shell: blocked runtime request`.
- **Navigation watchdog (H1)**: `internal/shell/hostperms.go`, `WatchNavigation`. A `WebViewNavigationCompleted` hook runs `if (location.origin !== 'http://wails.localhost') location.replace('http://wails.localhost/')` in whatever page loaded. Off in `wails3 dev`. Wails v3.1.0 gives no way to see the URL from Go or to cancel the navigation, so this runs in the page that loaded.
- **Permissions (H3)**: `DeniedPermissions` (cross-platform map, five kinds) and `DeniedWebView2Permissions` (WebView2 kinds 1 to 12) set in `WebviewWindowOptions.Permissions` and `Windows.Permissions`. Wails only names kinds 0 to 6, and any kind left out falls back to WebView2's own prompt once a policy exists, so 7 to 12 (automatic downloads, file read/write, autoplay, local fonts, MIDI sysex, window management) are listed by number.
- **Context menu (M1)**: `DefaultContextMenuDisabled: true`.
- **Profile (M2)**: `WebviewUserDataPath` = `%LOCALAPPDATA%\Folio\WebView2`, from the new `internal/paths` package (`paths.WebView2Dir()`, `paths.LocalDir()`). Ticket 18's "Clear data" should call `paths.WebView2Dir()` rather than rebuild the path. `internal/docs/cache.go` still computes `%LOCALAPPDATA%\Folio\cache` itself (left alone to avoid a merge clash with ticket 18); `paths.LocalDir()` is the same base. `/doc/` now sends `Cache-Control: no-store`. The NSIS uninstaller removes `%LOCALAPPDATA%\Folio\WebView2` and, for older builds, `%APPDATA%\folio.exe`. README paths updated (the profile line and the uninstall line).
- **CSP**: added `frame-src 'none'; worker-src 'none'` to `frontend/index.html` and to the web server's copy in `frontend/src/server/security.ts` (the CSP test compares the two). Nothing in `frontend/src` uses an iframe or a worker.

### Tests

- Go (`internal/shell/hostguard_test.go`): AC1 and the rest of the guard, 29 cases (foreign, missing, null and lookalike origins refused; `Browser.OpenURL` object 9 refused from the right origin; Clipboard, Dialog, Window, System, unknown, negative, string, duplicate-key, query-only and chunked requests refused; GET refused; Call, Events and CancelCall allowed with the body intact for the next handler), the dev origin, middleware order, the permission maps, and `no-store` on `/doc/`. `internal/paths` has a test for the profile path.

### Checked in the real exe (production build, throw-away `%APPDATA%` and `%LOCALAPPDATA%`)

I drove the page over the WebView2 DevTools protocol, using a temporary `--remote-debugging-port` argument that is not in the shipped code.

- AC1 in the app: the app starts, scans and shows its documents with the guard on. From the page, `Browser.OpenURL` (9), Window (6) and Clipboard (1) returned 403, and Events (3) passed the guard.
- AC2 (partly): `navigator.clipboard.writeText` from a user gesture succeeded (the clipboard held the text), so the copy button keeps working. `navigator.clipboard.readText()` was refused (`NotAllowedError`). `Notification.requestPermission()` returned denied, `getCurrentPosition` failed with code 1 (denied), `getUserMedia({audio:true})` failed `NotAllowedError`, and the clipboard-read and notifications permission states were `denied`.
- AC3: the WebView2 process ran with `--user-data-dir=...\Local\Folio\WebView2\EBWebView`, and the throw-away `%APPDATA%` had no `folio.exe` folder. The `no-store` header is covered by the Go test.
- AC4: forcing `location.href` to `http://127.0.0.1:...`, `about:blank` and `https://example.com/` returned to `http://wails.localhost/` in 48 ms, 113 ms and 160 ms (frame events measured from the navigation request), well under a second.

### The owner must check

- **AC2, by eye**: in the packaged or built exe, right-click shows no menu (including on an image and on selected text), F12 and Ctrl+Shift+I do nothing, Ctrl+C still copies selected text, and the copy button on a code block still shows "copied". I could not watch a native menu or a key press from the tooling (the DevTools protocol cannot show the native menu), so only the settings were verified, not the pixels.
- **AC3, on the installed copy**: after installing with `task package` and uninstalling, `%LOCALAPPDATA%\Folio\WebView2` is gone and `%LOCALAPPDATA%\Folio\cache` and `%APPDATA%\Folio\settings.json` remain. `makensis` is not installed here, so I did not compile the NSIS script; the change is two `RMDir` lines.
- **`wails3 dev`**: not run. The guard also accepts `FRONTEND_DEVSERVER_URL`'s origin and the watchdog is off there, but this is untested.
- **Existing profile**: users of an older build keep an orphaned `%APPDATA%\folio.exe` until the uninstaller (or hand deletion) removes it; the app does not migrate or delete it.

### Upstream Wails issue (for the owner to file)

> **Title:** [v3] Windows: let the application cancel NavigationStarting, NewWindowRequested and DownloadStarting, and validate the origin of `/wails/runtime` on desktop
>
> **Version:** v3.1.0, Windows, WebView2.
>
> **Problem.** `windowsWebviewWindow.navigationStarting` ignores its arguments and never cancels, so an application cannot stop the webview from navigating to a foreign page. NavigationCompleted then injects the Wails runtime into whatever page loaded. New-window requests and downloads are likewise not exposed or cancellable. For an app that renders untrusted content (a Markdown viewer, say), a single link or script bug becomes "a foreign page with the full runtime".
>
> **Related.** In non-server builds `checkRuntimeRequest` returns true, so `/wails/runtime` has no origin check on the desktop. Any page that loads in the webview can post `{"object":9,...}` (`Browser.OpenURL`, which blocks only a few schemes and then shells out, so `search-ms:` and `vscode://` reach the OS), Clipboard, Dialog and Window calls.
>
> **Request.** (1) Expose cancellable NavigationStarting, NewWindowRequested and DownloadStarting hooks (or an `AllowedOrigins` option that cancels the rest). (2) Apply an Origin check to `/wails/runtime` on the desktop, as server mode already does, or make the allowlisted runtime objects configurable. (3) Note in the docs that WebView2's WebResourceRequested handler does not see `Sec-Fetch-*` headers, so a check there must use `Origin`.
>
> **Workaround used.** An outermost asset middleware that requires `Origin: http://wails.localhost` and allowlists runtime objects Call, Events and CancelCall, and a NavigationCompleted hook that runs `location.replace` back to the app.
