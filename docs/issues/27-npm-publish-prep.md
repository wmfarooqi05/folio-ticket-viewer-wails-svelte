---
type: build
status: blocked
status_note: "renamed to folio-issues-kanban-viewer and v0.1.0 re-tagged (Nov 21, 2026); waiting on the owner: npm login and the real publish (step 5)"
waiting_on: owner
blocked_by: []
blocked_note: null
related: ["17", "19", "22", "23", "24", "26"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 27 — Get the npm package ready for its first publish

## Why

A first-publish check ([27-npm-publish-checklist.md](../assets/27-npm-publish-checklist.md), Nov 20, 2026) found the package itself is sound:
- the name is free;
- there are no leaked paths or secrets, no install scripts and zero dependencies;
- the CLI behaves well.

But three things block the first publish:

1. **Third-party license notices don't ship.** `dist/` bundles mermaid, markdown-it, highlight.js, KaTeX, cytoscape, DOMPurify and d3. The minifier strips their license comments, and `dist/licenses/` holds only the Geist font licence. Their licences require the notices to ship with the code.
2. **The documented setup order can't work.** npm lets you add a trusted publisher only once the package exists. So 0.1.0 has to be published by hand, and OIDC can start from 0.1.1.
3. **New trusted publishers allow only `npm stage publish` by default.** `publish-npm.yml` runs `npm publish`, so the owner must also tick "npm publish" when adding the publisher.

## To do

- [ ] **Third-party notices.** The web build writes `dist/licenses/THIRD-PARTY-NOTICES.txt`: each bundled package's name, version, licence and licence text, taken from its `node_modules` folder.
  - Use a small script with no new dependency, or a Vite option if one fits.
  - Make the size check or a test fail when a bundled package has no entry.
  - Mention the file in the package README.
- [ ] **Publishing docs** (`publish-npm.yml` header, README):
  - publish 0.1.0 by hand, then set up trusted publishing before 0.1.1;
  - tick "npm publish" on the trusted publisher;
  - publish within 2 days of adding it.
- [ ] **Publish command.** Use `npm publish ./folio-viewer-*.tgz` in `publish-npm.yml` and in the README; a relative path needs the `./`.
- [ ] **package.json:** add `homepage`, `bugs` and a few `keywords`.
- [ ] **Package README:**
  - `--version` in the options table;
  - the settings and cache paths on macOS and Linux, and "tested on Windows";
  - how to uninstall;
  - links to SECURITY.md and GitHub Releases;
  - no desktop-app wording (after 26).
- [ ] **SECURITY.md** at the root: how to report a problem privately, with GitHub private vulnerability reporting.
- [ ] **Optional:**
  - a second bin `folio-viewer`, because the existing npm package `folio` also has a bin `folio`, so global installs clash (npx is not affected);
  - show `process.version` in the "needs Node 22" message.

## Done when

- <a id="ac1"></a>**AC1** — `npm pack --dry-run` lists `dist/licenses/THIRD-PARTY-NOTICES.txt`, which covers every bundled package, and a test fails if one is missing.
- <a id="ac2"></a>**AC2** — The README and `publish-npm.yml` describe the order that works: 0.1.0 by hand, trusted publishing from 0.1.1.
- <a id="ac3"></a>**AC3** — `npm publish ./folio-viewer-0.1.0.tgz --dry-run` succeeds.

## Owner steps for the first publish (after this lands)

1. Turn on npm 2FA (auth-and-writes) and save the recovery codes.
2. Make the repo public and turn on private vulnerability reporting.
3. Push main, tag and push `v0.1.0`, and wait for CI.
4. Download the CI tarball, then check its hash and run `gh attestation verify`.
5. Run `npm login`, then `npm publish ./folio-viewer-0.1.0.tgz --dry-run`, then the real publish, then `npm logout`.
6. From a clean folder, check `npx folio-viewer@0.1.0 --version`, `--help` and a real run.
7. Only before 0.1.1:
   - add the `npm-publish` environment with a required reviewer;
   - add the trusted publisher with "npm publish" ticked;
   - set "disallow tokens" on the package.

A wrong 0.1.0 can be unpublished within 72 hours, but the version number can never be reused. Deprecating a version is the preferred fix.

## Outcome

All three blockers and the optional items are done. Nothing was published, tagged or pushed.

- **Third-party notices (AC1).** `frontend/vite.shared.ts` has a `thirdPartyNotices` plugin. At `generateBundle` it maps every module the web build rendered (renderedLength > 0) to its `node_modules` package folder, then writes `dist/licenses/THIRD-PARTY-NOTICES.txt` (name, version, licence from package.json, full LICENSE/LICENCE/COPYING/NOTICE text) and `bundled-packages.json` (moved to `frontend/.vite-web/` with the manifest). It covers 53 packages; the file is 142 KB. khroma has no `license` field, so its entry says MIT from its licence file. No new dependency. `scripts/size-check.mjs` has a "third-party notices" row that fails when a listed package has no block or an empty one; `scripts/size-check.test.mjs` tests it (pure function and `run`). The server bundle `folio-web.mjs` holds no third-party code: a `noThirdPartyInServer` plugin fails the server build if it ever does. `OFL-Geist.txt` is kept.
- **Publishing docs (AC2).** `publish-npm.yml` header and the README "Publishing the npm package" paragraph: 0.1.0 by hand, trusted publishing from 0.1.1, tick "npm publish", publish within 2 days. Rules re-checked on docs.npmjs.com (npm-trust: package must exist; trusted-publishers: stage-only default after Sep 03, 2026, 2-day expiry; npm-publish: relative path needs `./`) and cited in comments. The workflow runs `npm publish ./folio-viewer-*.tgz`.
- **AC3.** `npm publish <packed 0.1.0 tgz> --dry-run` succeeds: `+ folio-viewer@0.1.0`, 128 files, 1.3 MB packed, 4.4 MB unpacked, THIRD-PARTY-NOTICES.txt listed.
- **package.json:** `homepage`, `bugs`, six keywords, and a second bin `folio-viewer` (same file). In a scratch install, `npx folio-viewer --version` and `npx folio --version` both print 0.1.0.
- **Node message:** now "folio needs Node 22 or newer (this is v...)".
- **Package README:** `--version`, `folio-viewer` command, settings and cache paths for Windows, macOS and Linux, "tested on Windows", uninstall, links to SECURITY.md and Releases (absolute URLs), notices mention, no desktop-app wording.
- **SECURITY.md:** GitHub private vulnerability reporting, scope (npm package and web mode), desktop app retired and unsupported, no email.
- **Owner:** turn on private vulnerability reporting before making the repo public.

**Renamed (owner, Nov 21, 2026).** Before anything was published, the npm package became `folio-issues-kanban-viewer` (was `folio-viewer`). The folder is now `packages/folio-issues-kanban-viewer`, and the second command takes the same name; `folio` stays. The README, SECURITY.md, docs/releasing.md, the workflows and the build scripts use the new name. This ticket's earlier text and older tickets keep the old one as history. The first `v0.1.0` tag and Release, built as `folio-viewer`, were deleted and made again from the renamed commit.
