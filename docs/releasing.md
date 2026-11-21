# Releasing a new version to npm

How to ship an update of `folio-issues-kanban-viewer` (0.1.1 and later). It starts from a fix in a pull request and ends with the new version on npm.

There are four stages:
1. **In the PR, before you merge:** bump the version and check what will ship.
2. **After the merge:** tag the release.
3. **Publish:** run the publish workflow and approve it.
4. **After publishing:** check the published package.

A version number can be used only once. npm never accepts the same number twice, even after an unpublish. So do stage 1 carefully, and don't publish a tag you haven't checked.

0.1.0 is the exception: it is published by hand. See ticket 27 and the README's "Publishing the npm package".

---

## Once, before the first workflow publish (0.1.1)

Do these right before releasing 0.1.1, not earlier. A trusted publisher that hasn't published within 2 days expires.

- [ ] **Create the `npm-publish` environment.** In the repo, go to Settings › Environments › New environment `npm-publish`:
  - add yourself as a required reviewer;
  - under Deployment branches and tags, allow only the tag pattern `v*`.
- [ ] **Add the trusted publisher.** On npmjs.com, go to `folio-issues-kanban-viewer` › Settings › Trusted publisher › GitHub Actions and enter:
  - this repo;
  - workflow `publish-npm.yml`;
  - environment `npm-publish`;
  - **tick "npm publish"**. Without it, the publisher allows only `npm stage publish`, and the workflow fails.
- [ ] **Turn off token publishing.** In the same settings, choose "Require two-factor authentication and disallow tokens", once the first workflow publish has worked.

After this, publishing needs no npm token anywhere, and every version gets npm's provenance badge. For the other badges and trust signals, see [credibility.md](credibility.md).

---

## 1. In the PR, before you merge

### Decide the version

The package is still 0.x, so:

| What changed | Bump | Example |
|---|---|---|
| Bug fixes only, nothing new for the user | patch | 0.1.0 → 0.1.1 |
| A new feature or option | minor | 0.1.1 → 0.2.0 |
| Something that breaks users: a removed or renamed option, a different settings format, a higher minimum Node | minor, and say so in the release notes | 0.2.0 → 0.3.0 |

Not every PR needs a release. You can merge several PRs and release them together. Only the PR that bumps the version starts a release.

### The checklist

- [ ] **Bump the version** in `packages/folio-issues-kanban-viewer/package.json`. That file is the only source:
  - the build bakes it into `folio-web.mjs`, which is what `--version` prints;
  - the CI release job and the publish workflow both refuse a tag that doesn't match it.

  ```powershell
  npm version patch --no-git-tag-version --prefix packages/folio-issues-kanban-viewer
  ```
  Use `minor` instead of `patch` when that fits. `--no-git-tag-version` stops npm from making its own commit and tag: the tag comes later, from main.
- [ ] **Write the release notes in [CHANGELOG.md](../CHANGELOG.md).** Rename `## Unreleased` to `## 0.1.1 — <date>` and make sure it says, in a few lines, what changed for the user and anything that breaks. Keep its **Security** line: name each publicly known vulnerability this release fixes, with its advisory or CVE, or write "no vulnerabilities fixed". A list of PR titles is not enough: the OpenSSF Best Practices badge (ticket 32) requires human-written notes.
- [ ] **Update the package README** (`packages/folio-issues-kanban-viewer/README.md`) if an option, a default or a path changed. npm shows this README on the package page.
- [ ] **Pass the local checks** from the repo root (`task check` covers both type checks):
  ```powershell
  task check
  ```
  ```powershell
  task test
  ```
  ```powershell
  task build
  ```
  `task build` ends with the size budgets, which also check the third-party licence notices.
- [ ] **Look at exactly what would ship:**
  ```powershell
  cd packages/folio-issues-kanban-viewer; npm pack --dry-run; cd ../..
  ```
  Check:
  - the version line is the new one;
  - the files are `folio-web.mjs`, `dist/…`, `LICENSE`, `README.md` and `package.json`, and nothing else: no `.env`, no `.tgz`, no source maps you didn't mean to ship;
  - `dist/licenses/THIRD-PARTY-NOTICES.txt` is listed;
  - the size is close to the last release (about 1.3 MB packed for 0.1.0). A big jump means something new got bundled.
- [ ] **Try the tarball as a user would**, from a folder outside the repo, with your real docs:
  ```powershell
  cd packages/folio-issues-kanban-viewer; npm pack; cd ../..
  ```
  ```powershell
  npm install -g .\packages\folio-issues-kanban-viewer\folio-issues-kanban-viewer-0.1.1.tgz
  ```
  ```powershell
  folio-issues-kanban-viewer --version
  ```
  ```powershell
  folio-issues-kanban-viewer --docs E:\projects\ticket_ui
  ```
  Open a few tickets, then click through what the PR changed. If it touches the window mode, also run `folio-issues-kanban-viewer --app`. Uninstall afterwards:
  ```powershell
  npm uninstall -g folio-issues-kanban-viewer
  ```
- [ ] **Check the dependencies:**
  - CI's `npm audit` and `npm audit signatures` must pass;
  - no Dependabot alert is open for something that ships in the bundle.
- [ ] **Wait for all PR checks to pass.** Don't re-run a failing check until it passes: find out why it failed first.
- [ ] **Merge.**

---

## 2. After the merge: tag it

- [ ] **Wait for main to pass.** Both `ci` and `security` must be green on the merge commit:
  ```powershell
  gh run list --branch main --limit 4
  ```
- [ ] **Tag the merge commit and push the tag.** The tag must be `v` followed by the exact version in `package.json`:
  ```powershell
  git checkout main; git pull
  ```
  ```powershell
  git tag v0.1.1
  ```
  ```powershell
  git push origin v0.1.1
  ```
- [ ] **Wait for the tag's `ci` run to finish green.** It does four things:
  1. rebuilds the package from the tag;
  2. writes `SHA256SUMS-npm`;
  3. signs the tarball (the `attest build provenance` job);
  4. creates the GitHub Release with the tarball attached.
- [ ] **Check the release:** open it on GitHub › Releases and make sure the version and the files are right. Then paste this version's CHANGELOG entry at the top of the notes, above the generated list:
  ```powershell
  gh release edit v0.1.1 --notes-file <file with the entry, then the existing notes>
  ```
  Or edit it on the release page.

If something is wrong at this point, nothing is on npm yet:
1. Delete the release and the tag:
   ```powershell
   gh release delete v0.1.1 --cleanup-tag
   ```
2. Fix it in a new PR, then tag again.

---

## 3. Publish

- [ ] **Run the workflow:** go to Actions › `publish-npm` › Run workflow, and **pick the tag** (`v0.1.1`) in "Use workflow from", not `main`.
- [ ] **Approve it.** The run waits for you as the `npm-publish` environment's reviewer. Approve it from the run page.

The workflow checks these before publishing, and stops if any fails:
- the ref is a `v*` tag, and its commit is on `main`;
- the tag matches `package.json`;
- a successful `ci` run exists for that tag;
- the tarball it downloads matches its checksum and its signature.

It then publishes that exact tarball. Nothing is rebuilt.

If it fails, read the step that failed. Before the publish step nothing has reached npm, so you can fix the problem and run it again on the same tag.

---

## 4. After publishing

- [ ] **Check the published package from a clean folder:**
  ```powershell
  npm view folio-issues-kanban-viewer version
  ```
  ```powershell
  npx folio-issues-kanban-viewer@0.1.1 --version
  ```
  ```powershell
  npx folio-issues-kanban-viewer@0.1.1 --docs E:\projects\ticket_ui
  ```
- [ ] **Check the provenance.** The npm page for the version should show "Built and signed on GitHub Actions" with a link to the run. From any project that installs it:
  ```powershell
  npm audit signatures
  ```
- [ ] **Update your own install**, if you use a global one:
  ```powershell
  npm install -g folio-issues-kanban-viewer@latest
  ```

---

## If a bad version gets out

| Situation | What to do |
|---|---|
| It's broken, but not dangerous | Release a fixed patch the normal way. Optionally deprecate the bad version so `npm install` warns about it: `npm deprecate folio-issues-kanban-viewer@0.1.1 "Broken, use 0.1.2"` |
| It's dangerous: leaked data, or a security bug | Deprecate it right away, ship the fix as a new version, and publish a GitHub security advisory. |
| It was published by mistake, and it's under 72 hours old | `npm unpublish folio-issues-kanban-viewer@0.1.1` is allowed. The number 0.1.1 can still never be used again, so the next release is 0.1.2. Prefer deprecating. |

Never move or reuse a tag that has been published. Tags, releases and npm versions should always match.

---

## Quick version

1. **PR:**
   - bump with `npm version patch --no-git-tag-version --prefix packages/folio-issues-kanban-viewer`;
   - write the CHANGELOG entry;
   - update the README if needed;
   - pass `task check`, `task test` and `task build`;
   - check `npm pack --dry-run`;
   - try the tarball;
   - get the checks green, then merge.
2. **Main green:** `git tag vX.Y.Z`, then `git push origin vX.Y.Z`. Wait for the tag's CI and check the Release.
3. **Publish:** Actions › `publish-npm` › Run workflow on the tag, then approve it.
4. **After:** check with `npx folio-issues-kanban-viewer@X.Y.Z --version` and a real run, and look for the provenance on npm.
