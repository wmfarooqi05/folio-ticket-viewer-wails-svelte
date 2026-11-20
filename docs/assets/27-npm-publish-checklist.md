# npm publish checklist: folio-viewer 0.1.0

Checked on Nov 20, 2026, against `packages/folio-viewer/` at commit `f9c98a4`, the current npm and GitHub docs, and read-only commands (`npm view`, `npm pack --dry-run`, `npm publish --dry-run`, `npm audit`, `npm ls`). Nothing was published, built, tagged or pushed.

## Summary

The package itself is in good shape. It has no dependencies and no scripts. It ships 127 files (1.2 MB packed, 4.2 MB unpacked), with no source maps, no local paths and no secrets. `--help`, `--version`, a bad flag and a busy port all behave well.

Three things block the first publish:

1. **Third-party license notices are missing.** `dist/` bundles mermaid, markdown-it, highlight.js, KaTeX, cytoscape, DOMPurify and d3. Their licenses (MIT, BSD-3, ISC, Apache-2.0/MPL-2.0) require that their copyright notices ship with the code. The minifier removed every `@license` and `Copyright` comment, and `dist/licenses/` only holds the Geist font license.
2. **The documented setup order cannot work.** The README and `publish-npm.yml` tell the owner to add a trusted publisher on the `folio-viewer` package settings page first. That page only exists once the package exists: "The package you're configuring must already exist on the npm registry" ([npm trust][trust-cli]). So 0.1.0 has to be published by hand, and trusted publishing can only start with the next version.
3. **New trusted publishers only allow `npm stage publish` by default.** "Configurations created after Sep 03, 2026 are automatically set to allow `npm stage publish`" ([trusted publishers][tp]). The workflow runs `npm publish`, so it fails unless the owner also ticks "allow npm publish", or the workflow switches to `npm stage publish`.

The repo is still private (`gh repo view`: `PRIVATE`). Provenance, attestations and required reviewers all need it to be public.

## Status table

| # | Item | Status | Evidence (file:line or command) |
|---|---|---|---|
| **1. Account and access** | | | |
| 1.1 | 2FA on the npm account, "auth-and-writes" | Owner action | Set it up on npmjs.com (security key or Windows Hello) or with `npm profile enable-2fa auth-and-writes`. Save the recovery codes somewhere else. A recovery-code login starts a 72-hour hold on publishing. Linking GitHub works as a backup recovery option. ([2FA][2fa]) |
| 1.2 | Token vs trusted publishing | OK (no token) | Legacy tokens are gone. Granular tokens can no longer publish directly from January 2027 ([access tokens][tokens]). Do not create a token. Publish 0.1.0 with an interactive `npm login` session, then use OIDC. |
| 1.3 | Trusted publisher can only be set up after the package exists | Needs a change (docs) | `.github/workflows/publish-npm.yml:5-10`, `README.md:161`. "Package must already exist" ([npm trust][trust-cli]). |
| 1.4 | Trusted publisher defaults to stage-only | Needs a change or owner action | `publish-npm.yml:83` runs `npm publish`. A new config allows only `npm stage publish` unless you also tick "npm publish" ([trusted publishers][tp]). |
| 1.5 | The trusted publisher expires if unused | Owner action | "must complete its first successful publish within 2 days" ([trusted publishers][tp]). Create it right before the 0.1.1 release, not earlier. `README.md:161` already says this. |
| 1.6 | GitHub environment `npm-publish` with a required reviewer | Owner action | `publish-npm.yml:26`. Required reviewers on a Free plan work only on public repos ([environments][env]). Limit it to tags matching `v*`. Leave "prevent self-review" off: you are the only reviewer. |
| 1.7 | After OIDC works, turn tokens off | Owner action | Package Settings > Publishing access > "Require two-factor authentication and disallow tokens". OIDC keeps working ([trusted publishers][tp]). |
| **2. package.json** | | | |
| 2.1 | Name `folio-viewer` is free | OK | `npm view folio-viewer` gives E404. `folioviewer`, `folio_viewer`, `folio.viewer` and `folio-view` are also free. npm can still refuse a real publish with 403 "too similar" when a dry run passed ([moniker rules][moniker]). This can only be checked by publishing. |
| 2.2 | Version 0.1.0 | OK | `package.json:3`. npm suggests starting at 1.0.0 ([semver][semver]). A 0.x version is fine for a tool run with `npx`, and ticket 17 already plans the tag `v0.1.0`. The version is baked into the bundle at build time (`frontend/vite.server.config.ts:7,11`), so a version change needs a rebuild. |
| 2.3 | description, keywords, license, author | OK, small additions | `package.json:4-7`. Add a few keywords (`cli`, `npx`, `markdown-viewer`, `tickets-viewer`). |
| 2.4 | `repository` (needed for provenance) | OK | `package.json:8-12` matches `git remote -v` exactly. The match is case-sensitive ([provenance][prov]). |
| 2.5 | `homepage`, `bugs` | Needs a change | Missing. Add both so the npm page links to the README and the issues. |
| 2.6 | `engines` | OK | `package.json:23-25`: `>=22`. It only warns unless `engine-strict` is set ([package.json][pj]), so the runtime check (4.2) matters more. |
| 2.7 | `os` | OK, leave it unset | The code has macOS and Linux paths (`folio-web.mjs:47-49, 579-582`) and uses `open` or `xdg-open` (`folio-web.mjs:1803`). CI only runs on Windows. Say "tested on Windows" in the README instead of blocking other systems. |
| 2.8 | `bin` and its shebang | OK | `package.json:14-16`. The first line of `folio-web.mjs:1` is `#!/usr/bin/env node`, which bin files need ([package.json][pj]). The tarball stores it as `-rwxr-xr-x`. npx runs the only bin entry even though its name differs from the package name ([npm exec][exec]). |
| 2.9 | `bin` name `folio` clashes | Needs a decision | The npm package `folio` (0.3.18) also has a bin `folio`. `npm install -g` of both clashes. npx is not affected. Optional: add a second bin `folio-viewer`. With two bins, npx picks the one named like the package, so `npx folio-viewer` keeps working ([npm exec][exec]). |
| 2.10 | `files` vs `.npmignore` | OK | `package.json:17-22` is an allow-list and there is no `.npmignore`. A stale `folio-viewer-0.1.0.tgz` sits in the folder. It is not shipped. |
| 2.11 | `type` and `exports` | OK | `"type": "module"` (`package.json:13`) matches the `.mjs` ESM bundle. It is a CLI and has no library API, so it needs no `exports` or `main`. |
| 2.12 | `private`, `publishConfig` | OK, leave unset | Unscoped packages are public by default and cannot be restricted ([npm publish][pub]). `private: true` would block the publish. |
| **3. Tarball** | | | |
| 3.1 | Built files exist | OK | `folio-web.mjs` (61 KB) and `dist/` are present. The dry-run shasum `0d234fc6…` equals the local `folio-viewer-0.1.0.tgz`. |
| 3.2 | What ships | OK | `npm pack --dry-run`: 127 files, 1.2 MB packed, 4.2 MB unpacked. That is LICENSE, README.md, package.json, folio-web.mjs, and dist/ (index.html, 2 favicons, 120 JS/CSS assets, OFL-Geist.txt). The largest file is a 629 KB mermaid chunk. |
| 3.3 | Source maps, local paths, user names, secrets | OK | No `.map` files and no `sourceMappingURL`. `grep` finds no `E:\\`, `C:\\Users`, `C:/Users`, `waleed`, `/Users/`, `/home/`, `npm_…`, `ghp_`, `AKIA` or private keys. The `E:/` and `.internal`/`.local` hits are regex text and property names inside mermaid and highlight.js. `localhost` is the host check only. No `.env` files and no fixtures ship. |
| 3.4 | Third-party license notices | **Needs a change (blocker)** | `grep` finds no `@license` or `Copyright` in `dist/assets/*.js`, and only `dist/licenses/OFL-Geist.txt` exists. |
| 3.5 | Publish dry run | OK | `npm publish --dry-run` prints no metadata warnings. It says "requires you to be logged in", which is expected. |
| **4. Runtime safety** | | | |
| 4.1 | No install scripts | OK | `package.json` has no `scripts`. |
| 4.2 | Node version check | OK | `folio-web.mjs:1824-1827` prints "folio needs Node 22 or newer." All imports are old core APIs (`folio-web.mjs:2-10`), so older Node still reaches the check. Optional: print the current `process.version` too. |
| 4.3 | Port busy | OK | Tested: `--port 47123` while the port was busy prints "folio: port 47123 is already in use" and exits 1 (`folio-web.mjs:1843`). The default port is 0, a random free one. |
| 4.4 | No browser | OK | `openBrowser` swallows spawn errors (`folio-web.mjs:1804-1812`). The URL is always printed first (`:1848`). `--no-open` is there. |
| 4.5 | Ctrl+C | OK | SIGINT and SIGTERM close the server, with a forced exit after 2 s (`folio-web.mjs:1850-1855`). The README mentions the Windows "Terminate batch job" prompt (`README.md:28`). |
| 4.6 | `--help`, `--version` | OK | Tested: `--version` prints `0.1.0`, `--help` prints usage, both exit 0. An unknown flag prints usage and exits 2. |
| 4.7 | What it writes | OK, needs docs | Only settings (`folio-web.mjs:45-49, 254-259`) and the cache (`:577-582, 1009-1013`). Never the docs. |
| **5. Supply chain** | | | |
| 5.1 | Provenance | Owner action | Provenance needs a cloud CI runner and a public repo ([provenance][prov]). OIDC adds it automatically ([trusted publishers][tp]). 0.1.0, published by hand, will have no npm provenance. The GitHub attestation of the CI tarball (`ci.yml` `attest` job) covers it instead. |
| 5.2 | `npm audit` of what ships | OK | `npm ls --omit=dev` in the package is empty. `npm audit --omit=dev` in `frontend/` (what is bundled into `dist/`) finds 0 vulnerabilities. CI fails at high (`ci.yml:93-97`). |
| 5.3 | Lockfile not shipped | OK | There is no lockfile in the package. npm never packs `package-lock.json` ([package.json][pj]). |
| 5.4 | Typosquatting and reserving names | OK, optional | npm blocks new names that only differ by punctuation ([moniker rules][moniker]), so `folioviewer` and `folio_viewer` are protected. Reserving more names means publishing empty packages. That is more to maintain and not worth it for a small tool. Tell VM users to type the exact name, or pin it: `npx folio-viewer@0.1.0`. |
| 5.5 | Unpublish and deprecate rules | Know before publishing | Within 72 hours you can unpublish if no public package depends on it. After that, all three must hold: no dependents, under 300 downloads last week, one maintainer. A version number can never be reused. Unpublishing every version blocks new publishes for 24 hours ([unpublish][unpub]). npm prefers `npm deprecate folio-viewer@0.1.0 "<message>"` ([deprecate][depr]). |
| **6. Docs for users** | | | |
| 6.1 | README on the npm page | Needs a change | `packages/folio-viewer/README.md`. It covers install and usage, the security model and the settings and cache paths. Missing: `--version` in the table, the macOS and Linux paths, how to uninstall, "tested on Windows", a link to SECURITY.md and to the release notes. `README.md:30,33` refer to the desktop app, which ticket 26 retires. |
| 6.2 | CHANGELOG or release notes | Needs a change (small) | No CHANGELOG. `ci.yml` already creates a GitHub Release with generated notes. Link the Releases page from the package README rather than keeping a second file. |
| 6.3 | SECURITY.md | Needs a change + owner action | There is none. Add a short root `SECURITY.md`. After the repo is public, turn on private vulnerability reporting: Settings > Advanced Security > Private vulnerability reporting ([private reporting][pvr]). |
| **7. Release mechanics** | | | |
| 7.1 | `npm version` and the tag `v0.1.0` | OK for 0.1.0 | `package.json` already says 0.1.0, so just tag `v0.1.0`. For later versions, see the steps below. The default tag prefix is `v` ([config][cfg]). |
| 7.2 | CI checks the tag matches package.json | OK | `ci.yml:232-236` (release job) and `publish-npm.yml:50-52`. A hand publish has no such check. Publish the CI tarball to get it. |
| 7.3 | Tarball path in `npm publish` | Needs a change (small) | `publish-npm.yml:83` and `README.md:161` use `npm publish folio-viewer-*.tgz`. The docs say "Relative paths need an explicit `./`" ([npm publish][pub]). Use `./folio-viewer-*.tgz`. |
| 7.4 | Dry run first | OK | `npm publish ./folio-viewer-0.1.0.tgz --dry-run` |
| 7.5 | Check from a clean folder | Owner action | See step 9 below. |
| 7.6 | If something goes wrong | Know before publishing | See "If something goes wrong" below. |

## Before the first publish (owner, in order)

1. **npm account.** Turn on 2FA "auth-and-writes" with a security key or Windows Hello. Store the recovery codes away from that device. Link your GitHub account for recovery.
2. **Land the code changes below**, mainly the license notices.
3. **Make the repo public.** Turn on private vulnerability reporting. Optionally, turn on immutable releases (README line 159).
4. **Push `main`, then tag and push `v0.1.0`.** Wait for `ci.yml` to finish: tests, the tarball, the attestation and the GitHub Release.
5. **Download `folio-viewer-0.1.0.tgz` and `SHA256SUMS-npm` from that run.** Compare the hash with the run page. Run `gh attestation verify folio-viewer-0.1.0.tgz --repo wmfarooqi05/folio-ticket-viewer-wails-svelte`.
6. **Log in and dry-run.** In an empty folder, put the tarball there and run `npm login` (browser login with 2FA). Then run `npm whoami` and `npm publish ./folio-viewer-0.1.0.tgz --dry-run`. Check that it lists 127 files and the name and version.
7. **Publish.** Run `npm publish ./folio-viewer-0.1.0.tgz`, without `--provenance` (it needs a CI runner). Enter the 2FA prompt. Then run `npm logout`.
8. **Check the registry.** Run `npm view folio-viewer`. The version should be 0.1.0, the `bin` should be `folio`, and there should be no dependencies.
9. **Check from a clean folder** on the VM or a fresh folder: `npx folio-viewer@0.1.0 --version`, then `--help`, then `npx folio-viewer@0.1.0 --docs <path>`.
10. **Only when you release 0.1.1**, set up OIDC, in this order:
    - GitHub: Settings > Environments > `npm-publish`. Add yourself as a required reviewer and allow only tags `v*`.
    - npmjs.com: folio-viewer > Settings > Trusted publisher > GitHub Actions. Enter the repo, `publish-npm.yml` and the environment `npm-publish`, and **tick "npm publish"**.
    - Run the workflow from the `v0.1.1` tag within 2 days.
    - Then set Publishing access to "Require two-factor authentication and disallow tokens".

If you would rather keep it simple, skip step 10 and repeat steps 5 to 9 for every release. The cost is that npm shows no provenance badge.

**Later versions:** In `packages/folio-viewer`, run `npm version 0.1.1 --no-git-tag-version`, or edit the version by hand. Run `task build:web` (the version is baked into the bundle) and commit. Then `git tag v0.1.1` and push `main` and the tag. Docs do not say whether `npm version` commits and tags when `package.json` is in a subfolder of the repo, so tag by hand.

## If something goes wrong

- **Bad file in 0.1.0, found within 72 hours:** run `npm unpublish folio-viewer@0.1.0`. The number 0.1.0 is gone for good, so the fix ships as 0.1.1. If you unpublish every version, you cannot publish again for 24 hours.
- **Bad version, found later:** run `npm deprecate folio-viewer@0.1.0 "Broken, use 0.1.1"` and publish 0.1.1.
- **A secret got published:** rotate the secret first, then unpublish. The copy is public from the first second.
- **403 "too similar" on the real publish:** the name is blocked. Use a scoped name such as `@<your-npm-user>/folio-viewer` and update `package.json`, the README and `publish-npm.yml`.
- **OIDC publish fails with 404 or 403:** check the trusted-publisher fields (repo, filename, environment). npm does not validate them when you save ([trusted publishers][tp]). Check that "npm publish" is ticked, and that the config has not expired after 2 days.

## Code changes needed (each small)

1. **Ship third-party notices (blocker).** In the web build, write `dist/licenses/THIRD-PARTY-NOTICES.txt` with the license text of every bundled production dependency: mermaid and its chunks, markdown-it, highlight.js, KaTeX, cytoscape, DOMPurify, d3 and the rest. A Rollup/Vite license plugin or a short script over `npm ls --omit=dev --all` both work. Mention the file in the package README.
2. **Fix the setup order in the docs.** Update `publish-npm.yml:5-10` and `README.md:161`: 0.1.0 is published by hand, and the trusted publisher is added after the package exists, right before the next release. Also say to tick "npm publish", or switch line 83 to `npm stage publish` and approve on npmjs.com with 2FA. The second option needs npm 11.15.0 or newer ([staged publishing][stage]).
3. **Use `./` in the tarball path.** Change `publish-npm.yml:83` to `npm publish ./folio-viewer-*.tgz`, and update the hand command in `README.md:161` the same way.
4. **Add `homepage` and `bugs` to `package.json`.** Set `homepage` to `https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte#readme` and `bugs` to `https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/issues`. Add a few keywords.
5. **Package README additions.** Add `--version` to the options table. Add the macOS and Linux settings and cache paths. Add "tested on Windows; macOS and Linux should work". Add uninstall steps: `npm uninstall -g folio-viewer`, and delete `%APPDATA%\Folio` and `%LOCALAPPDATA%\Folio\cache`. npx copies sit in the npm cache, which `npm cache clean --force` removes. Add links to SECURITY.md and GitHub Releases. Remove the "desktop app" wording once ticket 26 lands.
6. **Add `SECURITY.md` at the repo root.** Say how to report a problem (GitHub private vulnerability reporting), which version is supported (the latest), and the security model in two lines: 127.0.0.1 only, a one-time token, and it never writes the docs.
7. *(Optional)* **Add a second bin `"folio-viewer": "folio-web.mjs"`** to avoid the global clash with the `folio` package.
8. *(Optional)* **Add the current version to the Node error:** `folio needs Node 22 or newer (this is ${process.version}).`
9. *(Housekeeping, not code)* Delete the stale `packages/folio-viewer/folio-viewer-0.1.0.tgz` before you publish by hand, so you do not publish a local build by mistake.

## Not verified

- Whether npm will accept the name on a real publish. Only a publish shows a "too similar" 403.
- That the package runs on macOS or Linux. CI and the tests here are Windows only.
- Which npm version Node 26.13.1 bundles. The workflow prints `npm --version` (`publish-npm.yml:82`). Local is npm 11.19.0 on Node 26.7.0.
- That OIDC provenance is attached when you publish a tarball file instead of a folder. The docs do not say.
- Whether `npm version` tags from a subfolder of the git repo. The docs do not say.
- That CI and local tarball hashes match (ticket 17 AC1, still open).
- End-of-life dates for Node 22. The Node release page lists 22, 24 and 26 as LTS but gives no dates.

## Sources

- tp: https://docs.npmjs.com/trusted-publishers
- trust-cli: https://docs.npmjs.com/cli/v11/commands/npm-trust
- stage: https://docs.npmjs.com/staged-publishing (and https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages)
- tokens: https://docs.npmjs.com/about-access-tokens
- 2fa: https://docs.npmjs.com/configuring-two-factor-authentication
- prov: https://docs.npmjs.com/generating-provenance-statements
- pj: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- pub: https://docs.npmjs.com/cli/v11/commands/npm-publish
- exec: https://docs.npmjs.com/cli/v11/commands/npm-exec
- cfg: https://docs.npmjs.com/cli/v11/using-npm/config
- semver: https://docs.npmjs.com/about-semantic-versioning
- unpub: https://docs.npmjs.com/policies/unpublish
- depr: https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions
- moniker: https://blog.npmjs.org/post/168978377570/new-package-moniker-rules and https://docs.npmjs.com/package-name-guidelines
- env: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- pvr: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configuring-private-vulnerability-reporting-for-a-repository
- Node releases: https://nodejs.org/en/about/previous-releases

[tp]: https://docs.npmjs.com/trusted-publishers
[trust-cli]: https://docs.npmjs.com/cli/v11/commands/npm-trust
[stage]: https://docs.npmjs.com/staged-publishing
[tokens]: https://docs.npmjs.com/about-access-tokens
[2fa]: https://docs.npmjs.com/configuring-two-factor-authentication
[prov]: https://docs.npmjs.com/generating-provenance-statements
[pj]: https://docs.npmjs.com/cli/v11/configuring-npm/package-json
[pub]: https://docs.npmjs.com/cli/v11/commands/npm-publish
[exec]: https://docs.npmjs.com/cli/v11/commands/npm-exec
[cfg]: https://docs.npmjs.com/cli/v11/using-npm/config
[semver]: https://docs.npmjs.com/about-semantic-versioning
[unpub]: https://docs.npmjs.com/policies/unpublish
[depr]: https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions
[moniker]: https://blog.npmjs.org/post/168978377570/new-package-moniker-rules
[env]: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
[pvr]: https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configuring-private-vulnerability-reporting-for-a-repository
