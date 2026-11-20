---
type: verify
status: blocked
status_note: "merged Nov 21, 2026; 3 fixed (1 medium, 2 low) plus 2 low hardening fixes; waiting on the owner to accept the residual risks in the Outcome"
waiting_on: owner
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

- [ ] ~~**IPC and host review (about 1.5 days).**~~ Out of scope since 26 (the desktop app is retired). Treat every bound Go method (`ShellService`, `DocsService`, `MemoryService`) as attacker-callable. Check the Wails runtime objects, navigation, new windows, downloads, permissions and the profile. Re-test the fixes from 16.
- [x] **Web-mode server review.** The Node server from 24 is a localhost service any page in the browser can reach. Check `Host` and token enforcement, cross-site requests, DNS rebinding, every endpoint, the `/doc/` path rules ported from Go, and that it binds to `127.0.0.1` only.
- [x] **Malicious-docs corpus (about 1 day).** Build a `fixtures/hostile/` tree containing:
  - HTML and SVG payloads;
  - Mermaid `click`, `%%{init}%%` and `htmlLabels` tricks;
  - huge and deeply nested files;
  - RTL and homoglyph link labels;
  - every URI scheme;
  - UNC image paths, junctions, ADS, `CON.png` and 8.3 names;
  - frontmatter bombs.

  Run the corpus in the real exe with a network monitor watching. (Since 26: in the web build, in Chromium.)
- [x] **Fuzzing (about 1 day).** JS only since 26.
  - ~~Go: `go test -fuzz` for `SafeJoin`, `ValidateExternalURL`, `VSCodeURL`, `settings.Load` and the bench command parser.~~ Out of scope since 26.
  - JS: property tests asserting that rendered output has no element or attribute outside the allowlist.
- [x] **SAST and dependencies (about 0.5 day).** Run ~~govulncheck, gosec,~~ semgrep (~~`p/golang`~~, `p/typescript`, `p/javascript`) and `npm audit`. Add them to CI, along with Dependabot or Renovate.
- [x] **Build and release review (0.5–1 day).** Review the CI workflow from 17 ~~, the signing from 21, and the NSIS script once it compiles~~ and the npm publish path (report only; ticket 27 owns the prep).
- [ ] ~~**Crash dumps.**~~ Out of scope since 26 (no WebView2). Force a renderer crash and check whether `EBWebView\Crashpad` holds a dump with document text, given that `--disable-breakpad` is set.
- [x] **Network silence.** Over a full session, confirm Folio ~~and its WebView2 processes open~~ (the Node server and the page) opens no outbound connections.

## Done when

- <a id="ac1"></a>**AC1** — The hostile corpus renders in the real exe with no script running, no navigation away, no external process launched and no network traffic.
- <a id="ac2"></a>**AC2** — The fuzz targets and the SAST tools run in CI, and every finding is fixed or accepted in writing.
- <a id="ac3"></a>**AC3** — A short written report in the Outcome lists what was tested, what was found, and the residual risks the owner accepts.

## Outcome

Re-scoped by the owner on Nov 20, 2026 to what ships since 26: the Node web mode (`npx folio-viewer`), the Svelte frontend in the browser and the parser. Built on `aa8ab19`. Threat model: the person running Folio is trusted; the docs repo may be hostile (a cloned repo with crafted Markdown, Mermaid, frontmatter, links, images or links on disk); any other web page in the same browser is hostile; other local users are out of scope unless something is world-readable.

**Verdict.** The layering held: no hostile doc and no hostile page ran script in Folio's origin, read a file outside the docs root, wrote anything, reached the network or took over the server. One hostile file could empty the whole viewer (fixed), and two paths reached the browser's network stack before Folio's own checks, where only the CSP stopped them (fixed). Everything else is low or informational.

### Findings

| # | Severity | Where | What | Status |
|---|---|---|---|---|
| 1 | Medium | `lib/parser/index.ts` (`resolveInFile`), and the record lookups in `refs.ts`, `views.ts`, `graph/model.ts`, `DocView`, `SidePanel`, `App` | `index.files` is a plain object, so a link `[x](/__proto__#a)` or `[x](/constructor#q1)` in **any one file** found `Object.prototype` and `buildIndex` threw (`rec.items is not iterable`): the whole index failed and the viewer showed nothing. A link to `/__proto__` without a fragment resolved as a working link. | **Fixed**: `fileAt()` (own keys only) at every lookup a document can steer; it also covers an index that came back from the JSON cache. Test: `parser/index.test.ts` (5 hrefs, cold and after a JSON round trip). |
| 2 | Low | `lib/render/markdown.ts` (`resolveImagePath`) | An encoded slash was decoded into the segment, then re-split when the `/doc/` URL was built: `![x](..%2f..%2f..%2f..%2fapi%2fevents)` became `/doc/modules/x/../../../../api/events`, which the browser normalises to `/api/events`. A document could make the page GET any path on Folio's own origin: four such images take all four event streams (the app's live refresh), or any static file. No data leaves (same origin; every `/api/` call but events is POST + JSON). | **Fixed**: a decoded segment holding `/` or `\` is refused (the placeholder shows). Tests: `markdown.test.ts`, the corpus (`04-paths.md`) and the image-path fuzz property (the URL stays under `/doc/` after browser normalisation). |
| 3 | Low | `lib/render/mermaid.ts` | Mermaid draws HTML labels in a scratch element **in the live page** to measure them, before `sanitizeSvg` runs. A label `<img src="https://evil.example/label.png">` was requested from there; only the CSP (`img-src 'self'`) stopped it (seen as a `securitypolicyviolation` in Chromium), and `<img src=x>` made a real same-origin `GET /x`. | **Fixed**: `dompurifyConfig: LABEL_PURIFY` (forbids img, image, svg, iframe, a, style and other loading or linking tags, and src/href-like attributes; the text is kept). The key is in `SECURE_KEYS`, so a directive cannot replace it. Verified in Chromium: no img-src violation and no `/x` request after the fix. Test: `enhance.test.ts` (config shape; happy-dom does not run DOMPurify faithfully). |
| 4 | Low | Mermaid (sequence diagrams) | `link` / `links` make Mermaid generate inline `onclick` popups and anchors to the document's hosts in the same scratch element. The CSP blocks the handlers (`script-src-attr` violations, no script ran) and `sanitizeSvg` strips them from what is shown. | **Accepted**: Mermaid's own code; the CSP holds and nothing reaches the shown SVG. Follow-up if wanted: strip `link`/`links` lines from sequence sources before rendering. |
| 5 | Low | `server/server.ts` (token exchange) | The 302 `Location` is the raw request path, so `/\evil.com/?token=<t>` gave `Location: /\evil.com/`, which browsers read as `//evil.com` (an open redirect). It needs the one-time token, which only the person running Folio has. | **Fixed**: a raw backslash in the path is a 400 (browsers never send one), before the exchange. Test: `security.test.ts`. |
| 6 | Low | `server/settings.ts` (`templateError`) | The Node server accepted ADO templates that Go and the UI refuse: `https:///{id}`, `https:\\host\{id}`, a leading space, tabs and newlines (WHATWG `URL` forgives them). Not exploitable (a click still goes through `validateExternalUrl`), but a parity gap in the validator. Found by the settings fuzz test. | **Fixed**: the raw text must start `https://<host>` with no control characters. Tests: `settings.test.ts` (9 cases). |
| 7 | Info | `server/settings.ts` (`validate`) | `setConfig` accepts `docsRoots: []` while `repoRoot` is empty (first run, or only `--docs`); load then rejects it and logs. Go's `Validate` is the same. Functional, not security. | **Follow-up** (would change both backends' contract; Go is frozen). |
| 8 | Info | `server/server.ts` (`api`) | Error messages carry absolute paths (`ENOENT ... stat 'E:\...\x.md'`). Only the authenticated same-origin app sees them, and it already knows the docs path. | Accepted. |
| 9 | Info | `server/security.ts` | Cookies ignore ports, so `folio_session_<port>` is also sent to any other server on 127.0.0.1. A web page cannot read it (HttpOnly) or use it (Folio refuses `Sec-Fetch-Site: same-site`); only another local process could, which is out of scope. | Accepted. |
| 10 | Info | `lib/render/dom.ts`, `backend-http.ts` | An http(s) link opens in a new tab on one click; its label can lie (RTL override, homoglyphs, a label that is another URL, zero-width characters). The tooltip shows the real URL and the browser shows punycode hosts. This is the designed behaviour. | Accepted. Follow-up option: show the host in the tooltip, or ask once when a label looks like a different URL. |
| 11 | Info | Node `http` | Two `Host` headers: Node keeps the first, which is the one checked. A browser cannot send two. | Accepted. |
| 12 | Info | `server/server.ts` | No cap on unauthenticated connections; Node's defaults apply (`headersTimeout` 60 s, `requestTimeout` 300 s). 300 half-sent requests did not slow the app. Only local processes can connect. | Accepted. |
| 13 | Info | semgrep | It cannot parse `lib/parser/index.ts` (fails at line 1) and only partly parses two test files; `.svelte` files are not scanned at all. 0 findings in what it did scan. | **Follow-up**: the parser is covered by the fuzz tests instead. |
| 14 | Info | `server/docs.test.ts` | Pre-existing flaky test: "reports a renamed folder as removed plus changed" failed once under full-suite load (a watcher overflow turned into a full rescan); it passed 3 of 3 alone and in the rerun of `task test`. Not touched here. | **Follow-up**. |

### What was tested, and how

- **Server, against a real running build** (`node packages/folio-viewer/folio-web.mjs`, `APPDATA` and `LOCALAPPDATA` pointed at a scratch folder; a Node attack script of 143 checks, run before and after the fixes):
  - *Bind*: `netstat` shows `127.0.0.1:<port> LISTENING` only.
  - *Host / DNS rebinding*: `evil.com`, `evil.com:<port>`, `127.0.0.1.nip.io:<port>`, `localhost.:<port>`, `[::1]:<port>`, another port, no port, `127.1`, `0x7f000001`, empty, missing (HTTP/1.0), absolute-form request target: all 403/400.
  - *Token and cookie*: no cookie gives 401 on `/`, `/index.html`, `/api/*`, `/api/events`, `/doc/*`, `/assets/*`; wrong token 401; the token exchange refused with `Sec-Fetch-Site: cross-site` or `same-site` or a foreign `Origin` (403, link not spent); token on a POST does nothing; the link works once; the URL token is not the cookie; `HttpOnly; SameSite=Strict`.
  - *Cross-site with the cookie*: `Sec-Fetch-Site` cross-site/same-site, `Origin: null`, `Origin: http://localhost:<port>` against a 127.0.0.1 Host, a cross-site preflight: all 403. A `text/plain` POST (a CORS "simple request") is 415.
  - *Every `/api/` name* with wrong types (number for a path, object, string for a list, `"300"` for a width, `1e400`, a string line number), a non-list body, bad JSON, 2,000,000-deep nesting (answered, server alive), a 64 MB + 10 byte body (400, server alive), `__proto__`/`constructor`/`toString`/`hasOwnProperty`/`valueOf`/empty/encoded names (404).
  - *Paths* for `readFile`, `readBatch` and `vscodeUrl`: `..` (both slashes, nested), drive letters (`C:/`, `C:x`), rooted, UNC both ways, `\\?\`, `\\.\pipe`, ADS (`::$DATA`, `:evil`), `CON`/`NUL`/`COM1` with and without extensions, NUL byte, non-`.md`. `/doc/` and static: the same plus `%2e%2e`, `%2f`, `%5c`, `%3a`, `%00`, `%ff`, a non-image extension, POST/PUT (405), `/.vite/manifest.json`. All 400/404.
  - *`setConfig` / `checkRoot`*: UNC, `//`, `\\?\UNC\`, `\??\UNC\`, relative, `C:`, `..` docsDir, absolute docsDir, `..` root, `http:` and `javascript:` templates, a bad theme: all refused before any file-system call.
  - *Resources*: six event streams leave four open; 300 half-sent unauthenticated requests, then a real call answers at once. A WebSocket upgrade gets an ordinary SSE answer (no upgrade handler).
  - *Opener / `--app` / `setConfig`*: read, not run: `openBrowser` and `openApp` pass only `^http://127.0.0.1:\d+/(\?token=[\w-]+)?$`, as an argument array, `shell: false` for Edge, Edge found only under absolute `ProgramFiles`/`LOCALAPPDATA` bases (existing `cli.test.ts` cases).
  - *Where it writes*: after a full session the scratch folders held only `Folio\settings.json` and `Folio\cache\<hash>.json`.
- **Ticket 18 and 25 re-tests**: the network-link rules by the `pathReachesNetwork` fuzz property and the UNC cases above; the `.` root by the contract suite (`task test`, 37 passed, 18 Go-only skipped).
- **The hostile corpus in the real web build in Chromium** (the Claude Browser pane, `--docs fixtures/hostile`): every file opened, every link clicked by script, the theme toggled to re-render the diagrams, with `window.open` and `alert` replaced by recorders, a `securitypolicyviolation` listener and a MutationObserver on the whole document. Result: no script ran (no alert; the only CSP reports are the blocked handlers of findings 3 and 4), no element with an event handler or a script, frame, object, embed, meta, base, link or form in the shown document; the tab never left `http://127.0.0.1:<port>/`; `window.open` was called only with http(s) URLs on a click (the designed behaviour), never for `javascript:`, `file:`, UNC, `vscode:`, `ms-*`, `search-ms:` or credentials. 12 of 13 diagrams drew, one (the `classDef`/`style` with `url()` block) failed to parse and kept its source with the error line. `performance.getEntriesByType('resource')` and the network log held no request to any host but `127.0.0.1:<port>`.
- **Network silence of the server**: the Node process's TCP and UDP endpoints were polled every 200 ms for 45 s while every hostile document was opened, every link clicked and a rescan run: no endpoint other than loopback (no SMB to `\\evil`, nothing to `evil.example`), and no UDP endpoint at all.

### Corpus and fuzz coverage

- **`fixtures/hostile/`** (Markdown only; README there lists what each file tries): raw HTML and inline SVG with handlers, `<meta refresh>`, `<base>`, `<link>`, forms, media, `<details ontoggle>`, three mXSS shapes, entity-encoded and tab-split `javascript:`, reference links, title and alt injection, fence info-string injection; Mermaid `click` (callback, href, `javascript:`, `_blank`), `%%{init}%%` (securityLevel, startOnLoad, secure, themeCSS, themeVariables, fontFamily, htmlLabels, dompurifyConfig, maxTextSize), frontmatter `config:` (securityLevel, themeCSS, layout elk), HTML and mXSS in labels, `classDef`/`style`/`linkStyle` with `url()`, sequence `link`/`links`, class-diagram `link`/`click`/`callback`, gantt `click`, mindmap markdown strings, `flowchart-elk`; 43 schemes (javascript, data, vbscript, file local and UNC, `\\host`, `//host`, device paths, smb, vscode and vscode.git/clone, vscode-insiders, ms-officecmd, ms-msdt, search-ms, ms-settings, ms-word/excel, ms-appinstaller, mailto, tel, ftp, ldap, jar, view-source, blob, intent, chrome, edge, about, ws, credentials, no host, metadata IP, localhost) as links, autolinks and bare text; image and link targets (UNC, encoded UNC, `file:`, devices, drive letters, drive-relative, `..` in every encoding, encoded slash and backslash, rooted, `/doc/` prefix, ADS, `CON`/`aux`/`COM1`/`NUL.tar`, 8.3 `PROGRA~1`, trailing dot and space, NUL, query and fragment tricks); RTL override, homoglyph, punycode, zero-width, bidi isolate, combining, fullwidth labels; a frontmatter bomb (prototype keys as maps and lists, 3000 extra keys, a 2000-entry list, a 100 KB value, unclosed quotes and brackets, YAML anchors and block scalars); 3000-deep blockquotes, emphasis, brackets and divs, 300-deep lists, a 50 KB line; links and refs to `__proto__`, `constructor`, `toString`, `hasOwnProperty`, and out of the root.
- **`lib/render/hostile.test.ts`** (happy-dom): every corpus file, whole and per item fragment, with and without the title, through parser + markdown-it + sanitiser; an explicit allowlist (`lib/render/allowlist.ts`: element to attributes, `href` only `#`, `src` only `/doc/...` that stays under `/doc/` after URL normalisation, `data-ext` only http(s), `style` only table alignment) must hold, and the normal fixtures must also pass it (so the list is not too tight). Plus 8 hostile SVG strings through `sanitizeSvg`.
- **Fuzz/property tests** (plain vitest, seeded mulberry32 in `lib/fuzz.ts`; no new dependency, fast-check is not a devDependency; `FOLIO_FUZZ_SEED` and `FOLIO_FUZZ_N` set the seed and the run count, a failure prints both):
  - `lib/render/fuzz.test.ts`: random hostile Markdown (HTML tags and attributes, links, images, autolinks, reference definitions, fences, headings, task and AC items, tables, entities, refs) rendered inside the allowlist; `sanitizeSvg` output free of scripts, handlers and outside URLs; image paths never contain `..` and stay under `/doc/`; `validateExternalUrl` returns only http(s) with a host and no credentials or control characters, or throws (4000 runs); `vscodeUrl` always starts `vscode://file/` and holds no space, quote, angle bracket, backslash, `#`, `?` or control character (2000 runs); the parser never throws or pollutes `Object.prototype` on hostile frontmatter and refs, cold and after a JSON round trip.
  - `server/fuzz.test.ts`: `safeJoin` on a real temp disk with a junction that leads out and one that stays in (nothing returned resolves, by path or by `realpath`, outside the root); `isRelativeInside`/`isRootInside` (accepted means inside, on win32 and posix); `rootShapeError` (nothing network or device, only full drive paths on Windows); `pathReachesNetwork` on random link chains (finds a network target at the end, never asks the disk about one); `settings.json` load on random and broken JSON (never throws, every surviving field obeys `validate()`, no pollution).
  - `task test` runs them at 400 runs per property; `.github/workflows/security.yml` at 4000 with a new seed per run. A campaign of 10,000 runs per property for seeds 1, 2 and 3 (both fuzz files, 12 properties) passed here, about 98 s per seed.

### SAST, dependencies and CI

- `npm audit` (all dependencies): 0 vulnerabilities. `npm audit signatures`: 228 packages with verified registry signatures, 110 with verified attestations.
- semgrep 1.186.0 (via `uvx`, nothing installed system-wide) with `p/typescript` and `p/javascript`, 74 rules over `frontend/src` and `scripts` (80 files): 0 findings (parse gaps: finding 13).
- New `.github/workflows/security.yml` (push to main, pull requests, weekly, manual): `npm audit signatures` + `npm audit --audit-level=moderate`; semgrep in its container pinned by digest, `--error`; the corpus and fuzz tests on windows-2025 at 4000 runs with `FOLIO_FUZZ_SEED=${{ github.run_id }}`; the package-contents check (no source maps, no `sourceMappingURL`, no local paths, no install scripts); actionlint in its container pinned by digest. `permissions: {}` at the top and `contents: read` per job; every action pinned by commit SHA; `persist-credentials: false`. actionlint 1.7.12 passes on all three workflows.
- New `.github/dependabot.yml`: npm (`/frontend`, weekly, minor/patch grouped, `versioning-strategy: increase` to keep exact pins) and github-actions (weekly, grouped). The two container digests in security.yml are updated by hand.

### Build and release (report only; ticket 27 owns the prep)

- **Tarball** (`npm pack --dry-run`): 127 files, 1.24 MB packed, 4.2 MB unpacked: `folio-web.mjs`, `dist/`, `LICENSE`, `README.md` (the `files` allowlist). No source map, no `sourceMappingURL`, no local path (`E:\`, `C:\Users`, the user name), no token-shaped string, no lifecycle scripts, `engines.node >=22`. Vite's manifest is moved out of `dist/` before packing.
- **publish-npm.yml**: manual only, `npm-publish` environment (required reviewer and `v*`-only deployment are owner settings, not visible in the repo), the tag must be on `main` and match `package.json`, it publishes the exact tarball `ci.yml` built for that commit after `sha256sum -c` and `gh attestation verify --signer-workflow ci.yml --source-ref <tag>`, trusted publishing over OIDC (no token), job-scoped permissions. Sound.
- **Proposed changes** (not made: another agent is editing these files):
  - `publish-npm.yml`: `npm publish --provenance --ignore-scripts folio-viewer-*.tgz`. Trusted publishing adds provenance by itself, but the flag makes a missing provenance fail loudly, and `--ignore-scripts` keeps any future lifecycle script from running in the job that holds `id-token: write`.
  - `publish-npm.yml`: check that exactly one `folio-viewer-*.tgz` was downloaded before `npm publish` (the glob would pass two).
  - `ci.yml` `audit`: either move the gate to `--audit-level=moderate` like security.yml, or drop the job now that security.yml runs audit on the same triggers plus weekly.
  - `ci.yml` `npm-package`: add the package-contents check from security.yml (or have ticket 27 move it there) so the attested tarball itself is the one checked.

### Out of scope

Since 26: the IPC and Wails host review, Go fuzzing (`SafeJoin`, `ValidateExternalURL`, `VSCodeURL`, `settings.Load`, the bench parser), govulncheck and gosec, the NSIS script, code signing, WebView2 crash dumps and WebView2 network silence. The frozen Go code was not touched. Also out of scope: other local users on the VM (nothing Folio writes is shared: settings and cache live in the user's own AppData), the browser's own network activity (updates, sync, Safe Browsing: IT policy), and real NTFS alternate data streams, junction-to-UNC on a real share and files over 5 MB in the corpus (git cannot carry them; the tests generate or inject them).

**Residual risks the owner accepts** (to confirm): a link label can lie (finding 10); Mermaid's scratch rendering relies on the CSP for its own sequence-diagram handlers (finding 4); a local process can see the session cookie (finding 9); the CSP is the second line everywhere, so it must never gain `unsafe-inline` for scripts or a network origin in `img-src`/`connect-src`.
