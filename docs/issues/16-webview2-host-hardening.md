---
type: build
status: blocked
status_note: "merged Nov 20, 2026; waiting on the owner: AC2 by eye (right-click, F12, copy button), NSIS install/uninstall, file the upstream Wails issue"
waiting_on: owner
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

- **Runtime guard (H1, H2)**: `internal/shell/hostguard.go`, `RuntimeGuard`, outermost in the middleware chain (`main.go`, via `shell.Chain`, ahead of `DocAssets` and of Wails' own transport). A `/wails/runtime` request passes only if it is a POST from the one trusted origin (`http://wails.localhost`; in `wails3 dev` it is `http://wails.localhost:<vite port>`, see below) and its JSON body names runtime object Call (0), Events (3) or CancelCall (10). The ids come from `messageprocessor.go` in Wails v3.1.0. I allowlisted only what Folio uses: the frontend imports only `Events` from `@wailsio/runtime`, and every other call goes through the generated bindings, which are Call. In the running app I saw only objects 0 and 3 on a normal start. Window (6), Browser (9), Clipboard (1), Application (2), Dialog (5), System (8) and the rest are refused. The body is read once (64 MiB cap) and put back before Wails reads it. A key in another case (`Object`) is read the way Wails reads it, because both use `encoding/json`. Refusals are 403 and log `shell: blocked runtime request`. On `/wails/stream/` and `/wails/eventpayload/` a GET or HEAD may carry no Origin (a same-origin GET has none) but never a foreign one, and any other method needs the exact origin.
- **Chunked calls**: Wails' `runtime.js` splits a call whose JSON is over 524288 characters into chunks (`x-wails-chunk-id`, `-index`, `-total`); `SaveCache` sends the whole index, so cache saves need this from about 290 documents. The guard reassembles the chunks itself with Wails' own limits (checked in `transport_http.go`: at most 1024 chunks, 1 MiB per chunk, 64 MiB assembled, 30 s TTL), checks the object in the *assembled* JSON (a duplicate `object` key in a later chunk would win, so chunk 0 alone is not enough), and forwards one ordinary request with the chunk headers removed. Middle chunks are answered 200 by the guard and never reach Wails. At most 64 uploads are held at once, all pending uploads together are capped at 128 MiB (Wails' streams use the same figure), and an abandoned upload frees its memory on a timer (TTL plus one second) without waiting for another request.
- **Navigation watchdog (H1)**: `internal/shell/hostperms.go`, `Watchdog`, wired in `main.go`. A reset run inside the foreign page (`location.replace`) can be cancelled by that page, so Go resets from outside. Go also cannot wait on a liveness answer from Folio's own page: that ping queues behind any long main-thread task (a big Mermaid diagram, a cold index build), and a 600 ms wait reset a merely busy Folio, and at start-up, mid-load. So Go now learns where the window really is from the browser. It runs `chrome.webview.postMessage('folio:where:<n>')` in the current page; Wails passes the message to `Options.RawMessageHandler` with `OriginInfo.TopOrigin`, which is WebView2's own `ICoreWebView2.get_Source` (`processMessage` in `webview_window_windows.go`, `sender.GetSource()`; I read it in the Wails v3.1.0 source). A page cannot choose or fake that value. If `TopOrigin` is not Folio's origin, Go resets at once with `win.SetURL("/")`. With no message at all (a page that deleted `chrome.webview`, or a Folio too busy to run the ping), Go resets after 5 s of silence once Folio has answered before. Before the first answer the limit is 15 s counted from the first NavigationCompleted, because a slow first load on a fresh profile needs that long. The periodic ping starts at the first NavigationCompleted, not at the first answer, so a page that hijacks the very first load cannot silence the watchdog for good (an earlier version only armed after Folio's first answer, which a hijacked first load never gives). A first navigation that never completes fires no NavigationCompleted, so a backstop from window creation resets every 30 s until Folio has answered once. After a NavigationCompleted Go pings every 250 ms until the browser answers. The number `n` orders the replies. TopOrigin is read when WebView2 delivers the message, but the message then waits in Wails' `windowMessageBuffer`, and `Where` runs later on another goroutine with no ordering against the NavigationCompleted hook. So a reply to an older ping, read before a foreign page committed, could be processed after the new check started and mark the foreign page as answered. (My earlier argument that no counter was needed was wrong.) Each check now accepts only replies to pings it sent itself and ignores older ones, both "Folio" and "foreign" (the new check pings again and gets a fresh one); the origin itself still comes from the browser. Resets that never get an answer back off to one per 30 s (after 5 quick ones) instead of stopping for good, so a "Leave site?" dialog answered with Stay cannot disable the watchdog. The ping interval is 10 s, from the measurement below. Wails v3.1.0 has no NavigationStarting event, so a streaming page that never finishes loading can run until the next 10 s tick.
- **Permissions (H3)**: `DeniedPermissions` (cross-platform map, five kinds) and `DeniedWebView2Permissions` (WebView2 kinds 0 to 12) set in `WebviewWindowOptions.Permissions` and `Windows.Permissions`. Wails only names kinds 0 to 6, and any kind left out falls back to WebView2's own prompt once a policy exists, so 7 to 12 (automatic downloads, file read/write, autoplay, local fonts, MIDI sysex, window management) are listed by number. `shell.Harden` applies all of it, plus the context-menu flag, to the window options in `main.go`, so the test checks what the window really gets.
- **Context menu (M1)**: `DefaultContextMenuDisabled: true`.
- **Profile (M2)**: `WebviewUserDataPath` = `%LOCALAPPDATA%\Folio\WebView2`, from the new `internal/paths` package (`paths.WebView2Dir()`, `paths.LocalDir()`). Ticket 18's "Clear data" should call `paths.WebView2Dir()` rather than rebuild the path. `internal/docs/cache.go` still computes `%LOCALAPPDATA%\Folio\cache` itself (left alone to avoid a merge clash with ticket 18); `paths.LocalDir()` is the same base. `/doc/` now sends `Cache-Control: no-store`. The NSIS uninstaller removes `%LOCALAPPDATA%\Folio\WebView2` and, for older builds, `%APPDATA%\folio.exe`. README paths updated (the profile line and the uninstall line).
- **CSP**: added `frame-src 'none'; worker-src 'none'` to `frontend/index.html` and to the web server's copy in `frontend/src/server/security.ts` (the CSP test compares the two). Nothing in `frontend/src` uses an iframe or a worker.
- **Frame guard**: `shell.FrameGuard` sends `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` on every response from the Go asset middleware (a meta CSP cannot carry `frame-ancestors`), so a foreign page cannot frame Folio for phishing. The web server already did this. Checked in the exe: `fetch('/')` returns both headers and Folio loads and renders normally.

### Tests

- Go (`internal/shell/hostguard_test.go`, `hostguard_chunks_test.go`, `watchdog_test.go`): AC1 and the rest of the guard (foreign, missing, null and lookalike origins refused; `Browser.OpenURL` object 9 refused from the right origin; Clipboard, Dialog, Window, System, unknown, negative, string, duplicate-key, differently cased key, query-only requests refused; GET, HEAD, PUT, OPTIONS and DELETE refused; Call, Events and CancelCall allowed with the body intact for the next handler; stream and event-payload rules); chunked calls (a Call over 600 KiB reassembled and forwarded whole with no chunk headers, out-of-order chunks, a duplicate `object` key in a later chunk refused, bad totals and indexes, the 1 MiB and 64 MiB limits, a foreign origin); the dev origin; that the guard runs ahead of the handlers behind it; `Harden`; the watchdog (resets at once on a foreign or empty top-level origin; leaves Folio alone; does not reset a Folio that is busy for 2 s; gives a slow first load its full first-answer period but resets a hijacked first load, also when the periodic check keeps replacing the running one; starts the periodic ping at the first check; resets after a long silence; ignores replies to older pings; backs off after 5 quick resets instead of stopping; and the raw-message handler reads `TopOrigin`, not the sender, and ignores a bad ping number), the chunk store (128 MiB global cap, abandoned uploads freed), and the frame headers.

### Checked in the real exe (production build, throw-away `%APPDATA%` and `%LOCALAPPDATA%`)

I drove the page over the WebView2 DevTools protocol, using a temporary `--remote-debugging-port` argument that is not in the shipped code.

- AC1 in the app: the app starts, scans and shows its documents with the guard on. From the page, `Browser.OpenURL` (9), Window (6) and Clipboard (1) returned 403, and Events (3) passed the guard.
- AC2 (partly): `navigator.clipboard.writeText` from a user gesture succeeded (the clipboard held the text), so the copy button keeps working. `navigator.clipboard.readText()` was refused (`NotAllowedError`). `Notification.requestPermission()` returned denied, `getCurrentPosition` failed with code 1 (denied), `getUserMedia({audio:true})` failed `NotAllowedError`, and the clipboard-read and notifications permission states were `denied`.
- AC3: the WebView2 process ran with `--user-data-dir=...\Local\Folio\WebView2\EBWebView`, and the throw-away `%APPDATA%` had no `folio.exe` folder. The `no-store` header is covered by the Go test.
- AC4 (with the Go-side watchdog, see the hostile pages below): forced navigation to a local page, `about:blank` and a page that cancels navigations returned to `http://wails.localhost/` in 14 to 97 ms. A page that never finishes loading, or that silences `chrome.webview`, returned in about 5 s, and 10 s is the worst case for the first. **AC4 says within a second: that holds for every page that completes its load, not for a load that never completes.** Wails offers no event for the start of a navigation.

### Hostile pages in the real exe (watchdog)

A local Node server (a scratch script, not in the repo) served three hostile pages: one that cancels navigations and calls `stop()` in a zero-delay timer; one that sends a script and then holds the connection open forever; and one that overwrites and deletes `chrome.webview.postMessage`, cancels navigations and calls `stop()`. I loaded each into the running exe over the DevTools protocol and watched `Page.frameNavigated` events (times are from the navigation request). Build: the final constants (5 s silence, 15 s first-answer period, 30 s backstop, 10 s tick), a 796-document root.

- Cancelling page: back at `http://wails.localhost/` after 97 ms.
- `about:blank`: 14 ms.
- Streaming page that never finishes loading (no NavigationCompleted): 5.5 s, which is where the 10 s tick happened to land. The worst case is about 10 s.
- Page that silenced `chrome.webview`: 5.1 s (the silence rule).
- Busy Folio: I blocked the real page's main thread for 3 s from DevTools. No reset, no `watchdog` log line. The Go test `TestWatchdogDoesNotResetABusyFolio` does the same for 2 s with the real 5 s silence period.
- Idle start-up with 796 documents: no `watchdog` or `blocked` line.

#### First load hijacked

To test a hijack of the very first load I built two temporary exes (not committed) whose window starts at a hostile page instead of `/`.

- First page is the silenced-`chrome.webview` page (it completes its load): Go reset it 15.37 s after window creation (the 15 s first-answer period), Folio loaded and answered at once. Before the fix nothing would ever have reset it.
- First page is the never-finishing streaming page (no NavigationCompleted ever fires): the creation backstop reset it at 30.07 s, and Folio loaded.

#### Cold first start on a fresh profile

I measured the time from window creation to Folio's first answer (a permanent log line, `shell: watchdog: Folio answered <t> after the window was created`), each with a fresh `%LOCALAPPDATA%` and `%APPDATA%` (so a new WebView2 profile): 299 ms, 300 ms and 346 ms on the 76-document fixtures; 300 ms on a 796-document root (the 1.7 s index build runs after the answer); 418 ms on the fixtures with 16 busy CPU loops running beside it. The 15 s and 30 s limits are 35 to 100 times the measured start. A very first launch on a machine that has never run WebView2 may be slower than my runs, which used a warm runtime; I could not measure that case.


#### Idle cost of the periodic ping

A ping runs script in the renderer, which wakes it. I measured CPU seconds of the whole process tree (folio.exe plus its 6 WebView2 processes) over 90 s idle, after 25 s warm-up, on the fixtures, two runs per build:

| Build | Run 1 | Run 2 |
|---|---|---|
| No periodic ping | 0.139 % of one core | 0.156 % |
| Ping every 2 s | 0.729 % | 0.226 % |
| Ping every 10 s (shipped) | 0.122 % | 0.347 % |

The runs are noisy (the same build differs by up to 0.5 points), but 2 s clearly cost more than none (about 0.5 % against 0.15 % on average), so I lengthened it to 10 s, which sits at the noise floor. I did not run the 25-minute `task ram` benchmark; this is CPU only, and memory is unaffected (no new allocation per ping beyond a short-lived goroutine).


### Large cache save in the real exe

The first version refused chunked runtime calls, so `SaveCache` failed silently from about 290 documents. With a 796-document copy of the fixtures (cache file 1.5 MB, well over the 512 KiB chunk threshold) the exe started, scanned, saved the cache (`Folio\cache\*.json` written, 1,506,762 bytes) and logged no blocked request.

### `wails3 dev`

The page origin in dev is `http://wails.localhost:<vite port>`: `assetserver.GetStartURL` keeps the `wails.localhost` host and swaps in the port of `FRONTEND_DEVSERVER_URL`. My first version trusted `http://localhost:<port>`, which broke dev. `shell.DevOrigin` builds the right one, and only `origin_dev.go` (`//go:build !production`) reads `FRONTEND_DEVSERVER_URL`; the production exe has `origin_production.go` and never reads the variable. The watchdog stays on in dev, pointed at the dev origin. Checked by hand: Vite on 9245, the non-production exe with `FRONTEND_DEVSERVER_URL=http://localhost:9245`: the app scanned its 76 documents (so Call passed the guard) and logged no blocked request and no watchdog reset. `task dev` itself stops earlier, on a size-check failure of the unminified dev build (see below).

### Known gaps

- **Popups and downloads (not fixed).** Wails v3.1.0 does not handle NewWindowRequested or DownloadStarting, so `window.open` and `target=_blank` open an unguarded WebView2 popup, and navigation downloads go through. The underlying `ICoreWebView2` lives in an unexported field of the Windows window implementation (`windowsWebviewWindow.chromium`, in a Wails `internal` package), which Folio cannot import. Reaching it would need a fork, reflection on unexported fields or COM calls on the raw window handle, so I did not do it. Folio's page-side link guard (`lib/render/dom.ts`) cancels every anchor click, and a popup is a separate webview that has no Wails runtime and no `/wails/runtime` route, so it is not a route to Folio's bound methods. It is still an unguarded browsing surface. Added to the upstream issue below.
- **Script inside Folio's own page can still call every bound method through Call.** The guard cannot tell the app's own script from injected script on the same origin. That belongs to the ticket 19 review.
- **The `chrome.webview.postMessage` channel is unguarded.** It only accepts drag, resize, non-client-region and runtime-ready messages, so it is not a route to the runtime objects.
- **`task dev`** fails on a size-check failure in the dev build, unrelated to this ticket.
- **Order of work**: I killed `folio.exe` processes by image name while testing, which could also have stopped another session's copy running at the same time (ticket 18 is built in parallel).


### The owner must check

- **AC2, by eye**: in the packaged or built exe, right-click shows no menu (including on an image and on selected text), F12 and Ctrl+Shift+I do nothing, Ctrl+C still copies selected text, and the copy button on a code block still shows "copied". I could not watch a native menu or a key press from the tooling (the DevTools protocol cannot show the native menu), so only the settings were verified, not the pixels.
- **AC3, on the installed copy**: after installing with `task package` and uninstalling, `%LOCALAPPDATA%\Folio\WebView2` is gone and `%LOCALAPPDATA%\Folio\cache` and `%APPDATA%\Folio\settings.json` remain. `makensis` is not installed here, so I did not compile the NSIS script; the change is two `RMDir` lines.
- **`wails3 dev`**: `task dev` itself fails on this branch's base for a reason that is not part of this ticket: the dev build runs `task build`, whose `size-check` step fails on an unminified build (exe 23 MiB against an 18 MiB cap), so the dev loop never reaches the app. I reproduced what `wails3 dev` does by hand (Vite on 9245, the non-production exe run with `FRONTEND_DEVSERVER_URL=http://localhost:9245`), see the dev section above. Please check whether `task dev` works for you.
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
> **Also.** There is no handling of NewWindowRequested (`window.open`, `target=_blank` open an unguarded popup) or DownloadStarting, and the application cannot reach `ICoreWebView2` to add them; please expose both, or a `Handled`/`Cancel` option for each.
>
> **Workaround used.** An outermost asset middleware that requires `Origin: http://wails.localhost` and allowlists runtime objects Call, Events and CancelCall (reassembling Wails' chunked uploads to check the object), and a liveness handshake: Go pings the page after each navigation and calls `SetURL("/")` unless the page answers through a bound method.
