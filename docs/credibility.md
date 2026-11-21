# Badges and trust signals for the npm package

How to make `folio-issues-kanban-viewer` look trustworthy, and actually be trustworthy, to someone who finds it on npm or GitHub. Written for a first package: each section says what the signal is, what it proves, where it stands for this package, and the steps to get it.

Checked on Nov 21, 2026. Every badge URL below was requested against the live 0.1.0 package, and the result is noted.

---

## First, what a badge is

A badge is a small image, usually in the README, such as ![npm](https://img.shields.io/badge/npm-v0.1.0-blue). There are two kinds:

- **Earned badges.** A third party checks something about your project and issues the badge. They can't be faked, because the service draws the image from its own data. Examples: npm provenance, OpenSSF Scorecard, the OpenSSF Best Practices badge, and the Socket score.
- **Information badges.** These show plain facts, such as the version, licence, Node version, CI status or download count. Most come from [shields.io](https://shields.io), which reads them from npm or GitHub. They don't prove quality, but a reader sees them at a glance, and a red "CI: failing" badge is a real warning.

People who check packages carefully look at the earned signals. Most other people skim the information badges. This doc covers both.

**Where badges show up:**
- On **GitHub**, the README shows them as soon as you push.
- On **npm**, the package page shows the README *from the published tarball*. So any badge added to `packages/folio-issues-kanban-viewer/README.md` appears on npmjs.com only with the next published version.
- The **npm provenance badge** is different: npm draws it itself on the version page, not in the README.

---

## The summary

| Signal | What it proves | Status now | Effort | Worth it? |
|---|---|---|---|---|
| [npm provenance](#1-npm-provenance-the-green-checkmark-on-npm) | This exact version was built by GitHub Actions from this commit of this public repo | Not yet: 0.1.0 was published by hand | One-time setup, then automatic from 0.1.1 | **Yes, the most important one** |
| [GitHub release attestation](#2-github-release-attestation) | The Release tarball was built and signed by `ci.yml` | **Done** for v0.1.0 | None | Already have it |
| [OpenSSF Scorecard](#3-openssf-scorecard) | A 0–10 score from about 18 automated security checks on the repo | Not set up | One workflow file, plus a few repo settings | **Yes** |
| [Socket score](#4-socket-score) | Supply-chain risk, quality, maintenance, vulnerabilities and licence of the package | **Already 80/100**, automatically | Only the badge | Yes, it's free |
| [OpenSSF Best Practices badge](#5-openssf-best-practices-badge) | You answered a checklist of good project practices ("passing" level) | Not started | About an hour of questions on a website | Nice to have, later |
| [Information badges](#6-information-badges-shieldsio) | Version, licence, Node version, CI status, size, downloads | Not in the READMEs yet | Copy and paste | Yes, cheap |
| [Bundlephobia](#7-bundlephobia-no) | Size inside a browser bundle | **Does not apply**: it rejects CLI packages | — | **No** |
| [Snyk Advisor](#8-snyk-advisor-gone) | Package health score | Service retired in January 2026 | — | No action |
| [Repo basics](#9-repo-basics-people-notice) | That the project is cared for: licence, description, topics, protected main | Partly done: SECURITY.md, Dependabot and CodeQL are in; the licence isn't recognised | Small fixes | **Yes** |

The [order to do it in](#the-order-to-do-it-in) is at the end.

---

## 1. npm provenance: the green checkmark on npm

**What it is.** On a version's npm page, a section that says **"Built and signed on GitHub Actions"**, with links to the exact source commit and the workflow run that built it. Anyone can check it from their own project with `npm audit signatures`. It is the strongest signal npm offers: it proves the code on npm came from your public repo and was built by CI, not uploaded from someone's laptop.

**Why 0.1.0 doesn't have it.** 0.1.0 was published by hand from your PC with `npm publish`, so npm has no proof of where it was built. Provenance only exists for versions published from CI. A version can't get it afterwards, so 0.1.0 never will, and that's normal for a first version.

**What it needs** ([npm: trusted publishers](https://docs.npmjs.com/trusted-publishers), [npm: generating provenance](https://docs.npmjs.com/generating-provenance-statements)):
- **A public repo.** Done. npm stopped supporting provenance from private repos in [July 2023](https://github.blog/changelog/2023-07-26-publishing-with-npm-provenance-from-private-source-repositories-is-no-longer-supported/).
- **The `repository` field in `package.json` must match the repo the workflow runs in.** Done: `wmfarooqi05/folio-ticket-viewer-wails-svelte`.
- **Publishing from GitHub Actions with trusted publishing (OIDC).** Then npm adds provenance automatically, with no flag needed. The workflow is `publish-npm.yml`, which is done.
- **The `npm-publish` GitHub environment.** Done on Nov 21, 2026, with you as the required reviewer and only `v*` tags allowed.
- **A trusted publisher on npmjs.com.** **Not done.** Only you can add it (npm login with 2FA), and it expires if nothing is published within 2 days. So add it on the day you release 0.1.1.

**Steps to get it** (the full release steps are in [releasing.md](releasing.md)):
1. Have something to release as 0.1.1: a real fix, or a small change.
2. On the release day, on npmjs.com, go to `folio-issues-kanban-viewer` › Settings › Trusted publisher › GitHub Actions, and enter:
   - repository `wmfarooqi05/folio-ticket-viewer-wails-svelte`;
   - workflow `publish-npm.yml`;
   - environment `npm-publish`;
   - **tick "npm publish"**.
3. Follow [releasing.md](releasing.md): the version-bump PR, merge, tag `v0.1.1`, then run the `publish-npm` workflow on the tag and approve it.
4. Check it:
   - the 0.1.1 page on npmjs.com shows the provenance section;
   - in a scratch project, `npm install folio-issues-kanban-viewer@0.1.1` then `npm audit signatures` reports a verified attestation.
5. Then, in the package settings on npmjs.com, choose **"Require two-factor authentication and disallow tokens"**. From then on, nobody can publish with a stolen token; only the workflow, approved by you, can publish.

---

## 2. GitHub release attestation

**What it is.** A signature, made by GitHub, saying "this file was built by this workflow from this commit". `ci.yml`'s `attest build provenance` job makes one for the tarball on every `v*` tag. Anyone can check it:

```powershell
gh attestation verify folio-issues-kanban-viewer-0.1.0.tgz --repo wmfarooqi05/folio-ticket-viewer-wails-svelte
```

**Status: done.** The v0.1.0 tarball is attested, and the one on npm is byte-for-byte the same file (SHA-256 `3a7a9007…150ee2`). This is how 0.1.0 can still be traced back to CI, without npm provenance. The README already explains how to verify it.

There's no badge for this one. It's a check people can run.

---

## 3. OpenSSF Scorecard

**What it is.** [OpenSSF](https://openssf.org) (the Open Source Security Foundation, part of the Linux Foundation) runs [Scorecard](https://github.com/ossf/scorecard), a tool that checks a repo against about 18 security practices and gives a score from 0 to 10. Its badge is the most recognised security badge on GitHub. Security-minded users and companies look for it.

**Status: not set up.** The badge URL currently says "invalid repo path", because the repo has never been scanned.

**Steps to get it** ([scorecard-action](https://github.com/marketplace/actions/ossf-scorecard-action)):
1. Add a workflow, `.github/workflows/scorecard.yml`, that runs `ossf/scorecard-action`:
   - set `publish_results: true`;
   - give the job `id-token: write`, so it can publish the result;
   - give it `security-events: write`, so the findings show in the repo's Security tab;
   - run it weekly and on pushes to main.

   Like the other workflows, every action should be pinned by commit SHA.
2. Let it run once on main.
3. Add the badge to the root README:
   ```markdown
   [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/badge)](https://scorecard.dev/viewer/?uri=github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte)
   ```

**What the score will look like.** A good part is already in place from tickets 17 and 19. These are likely to score well:
- actions pinned by SHA (Pinned-Dependencies);
- read-only default permissions in workflows (Token-Permissions);
- no dangerous workflow patterns;
- CodeQL and semgrep (SAST);
- Dependabot (Dependency-Update-Tool);
- SECURITY.md (Security-Policy);
- a licence file;
- CI runs on PRs (CI-Tests);
- publishing from a workflow (Packaging);
- no committed binaries;
- no open vulnerabilities.

These will score low at first, and that's expected for a new one-person project:
- **Maintained.** The repo is under 90 days old, which scores 0 until it's older. Nothing to do but wait.
- **Code-Review.** It wants PRs approved by a second person. A solo maintainer can't fully satisfy this. Merging through PRs rather than pushing to main helps a little.
- **Branch-Protection.** main isn't protected yet. See [Repo basics](#9-repo-basics-people-notice).
- **Signed-Releases.** It looks for signature files attached to Releases. It may not count GitHub's attestation, which is stored separately. Check after the first scan.
- **Fuzzing.** The fuzz tests (`fuzz.test.ts`) use vitest, which Scorecard may not recognise as a fuzzing tool. Check after the first scan.
- **Contributors.** It counts organisations among recent contributors. A solo project scores low here.
- **CII-Best-Practices.** This goes up once you have the [Best Practices badge](#5-openssf-best-practices-badge).

A score around 6–7 is a realistic start for this repo. Each check on the [Scorecard viewer](https://scorecard.dev) explains what would raise it. Improve it over time: you don't need a 10.

---

## 4. Socket score

**What it is.** [Socket](https://socket.dev) scans every npm package for supply-chain risk, such as install scripts, network access, obfuscated code and typo-squatting. It also scores quality, maintenance, vulnerabilities and licence ([how Socket scores](https://docs.socket.dev/docs/package-scores)). Many companies use it to decide whether a package is allowed in.

**Status: already 80/100**, with nothing done: Socket scanned 0.1.0 on its own. Zero dependencies, no install scripts and an MIT licence all help. The badge works today:

```markdown
[![Socket](https://socket.dev/api/badge/npm/package/folio-issues-kanban-viewer)](https://socket.dev/npm/package/folio-issues-kanban-viewer)
```

**To raise it:** keep zero dependencies and no install scripts, publish with provenance (0.1.1), and keep releasing now and then. Socket's page for the package lists any alerts. Look at it once after 0.1.1.

---

## 5. OpenSSF Best Practices badge

**What it is.** A badge from OpenSSF at [bestpractices.dev](https://www.bestpractices.dev). You fill in a questionnaire about how the project is run: licence, how to report bugs, tests, how releases are made, how security issues are handled. The **passing** level is the first of three, and only about 10% of projects that start it reach it ([Linux Foundation](https://www.linuxfoundation.org/blog/how-to-get-an-open-source-security-badge-from-cii)). It is self-certified, but answers are public and many can be checked automatically. It also raises Scorecard's CII-Best-Practices check.

**Status: not started.** Most answers are already true for this project:
- MIT licence;
- public repo and issue tracker;
- SECURITY.md with private reporting;
- tests in CI;
- a documented release process;
- signed releases;
- static analysis (CodeQL, semgrep);
- fuzzing;
- Dependabot.

**Steps:**
1. Sign in at bestpractices.dev with GitHub, and add the project by its repo URL.
2. Answer the passing criteria ([the list](https://bestpractices.dev/criteria/0)). It takes about an hour, and the site fills in some answers automatically. Each MUST has to be met, and each SHOULD has to be met or explained.
3. Add the badge it gives you (`https://www.bestpractices.dev/projects/<id>/badge`) to the README.

Worth doing after the Scorecard and provenance steps, when you have an hour.

---

## 6. Information badges (shields.io)

These are cheap and expected on a package README. All of these work today for this package:

| Badge | Shows now | Markdown |
|---|---|---|
| npm version | v0.1.0 | `[![npm](https://img.shields.io/npm/v/folio-issues-kanban-viewer)](https://www.npmjs.com/package/folio-issues-kanban-viewer)` |
| Licence | MIT | `![license](https://img.shields.io/npm/l/folio-issues-kanban-viewer)` |
| Node version | >=22 | `![node](https://img.shields.io/node/v/folio-issues-kanban-viewer)` |
| CI status | passing | `[![ci](https://img.shields.io/github/actions/workflow/status/wmfarooqi05/folio-ticket-viewer-wails-svelte/ci.yml?branch=main&label=ci)](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/actions/workflows/ci.yml)` |
| Dependencies | 0 | `![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)` |
| Size | 4.4 MB unpacked | `![size](https://img.shields.io/npm/unpacked-size/folio-issues-kanban-viewer)` |
| Downloads per month | "package not found or too new" | `![downloads](https://img.shields.io/npm/dm/folio-issues-kanban-viewer)` |

Notes:
- **Dependencies** is a static badge, so it's true only while the package has none. `scripts/size-check.mjs` and `noThirdPartyInServer` already guard that.
- **Downloads** starts working a few days after publishing. A low number is normal and not a bad signal, but you can leave this badge out until there are downloads.
- **Size:** 4.4 MB is mostly Mermaid, KaTeX and highlight.js for diagrams, maths and code, all loaded only when a document needs them. One line in the README saying so stops readers wondering.

Put the badges on one line, under the title, in **both** READMEs:
- the root README, for GitHub;
- `packages/folio-issues-kanban-viewer/README.md`, which npm shows from the next version.

---

## 7. Bundlephobia: no

[Bundlephobia](https://bundlephobia.com) measures how much a **library** adds to a website's JavaScript bundle when you `import` it. This package isn't imported by anyone's code: it's a command you run. Bundlephobia says so itself. Asked about this package, it answers *"This package appears to be a command-line tool (CLI) executable rather than a library intended to be bundled in frontend applications"*. So there's no Bundlephobia badge to get.

The size that matters for a CLI is **install size**, which is what `npx` downloads. That's the "unpacked size" badge in [section 6](#6-information-badges-shieldsio). [Packagephobia](https://packagephobia.com) measures the same thing (its badge is `https://packagephobia.com/badge?p=folio-issues-kanban-viewer`). Its site blocked automated requests during this check, so this doc prefers the shields.io badge, which reads the size from npm directly.

---

## 8. Snyk Advisor: gone

Snyk Advisor used to give npm packages a "package health score" with a badge. Snyk [retired it in January 2026](https://snyk.io/blog/snyk-advisor-security-database/). Its data now appears on [security.snyk.io](https://security.snyk.io), and old Advisor links redirect there. There's nothing to set up, and it's not worth adding an old Advisor badge.

---

## 9. Repo basics people notice

These aren't badges, but reviewers and Scorecard look at them, and some are visibly missing today:

- [ ] **Make GitHub recognise the licence.** GitHub currently reports the licence as **"NOASSERTION"**, so the repo page shows no "MIT" label. The cause: `LICENSE` ends with two extra lines about the Geist fonts, and GitHub's detector then can't match it to MIT.
  - Fix: keep `LICENSE` as the exact MIT text, and move the font note into the README and `dist/licenses/` (where `OFL-Geist.txt` already is). Do the same in the package's `LICENSE`.
  - The npm side is fine (`"license": "MIT"`), but Scorecard and readers use GitHub's label.
- [ ] **Fill in the repo's About box.** It's empty today. Add:
  - a description, e.g. "Read-only viewer for Markdown tickets and issues, with a kanban board. `npx folio-issues-kanban-viewer`";
  - the website, the npm package link;
  - topics, e.g. `markdown`, `kanban`, `issue-tracker`, `tickets`, `viewer`, `cli`, `npm-package`.

  Topics make the repo findable in GitHub search.
- [ ] **Protect main** (Settings › Rules › Rulesets, targeting the default branch):
  - require a pull request before merging;
  - require the `ci` and `security` checks to pass;
  - block force pushes and deletion.

  As the only maintainer, allow yourself to bypass it for emergencies, or set the required approvals to 0 so your own PRs can merge. This raises Scorecard's Branch-Protection check. It also stops an accidental push to main, like the TypeScript 7 merge that broke CI on Nov 20.
- [ ] **Turn on npm 2FA for "authorization and writes"** on your npm account, if it isn't already. It isn't public, but it's the main thing that protects the package between now and disallowing tokens.
- [ ] **Write real Release notes.** For each GitHub Release, write a few lines in plain words: what changed, and what to do if something breaks. A project with readable release notes looks maintained, and the npm page links to GitHub.
- Already in place:
  - SECURITY.md with private vulnerability reporting;
  - Dependabot;
  - CodeQL;
  - a published release process (`docs/releasing.md`);
  - pinned actions;
  - zero runtime dependencies.

---

## The order to do it in

**Now, with no release needed.** I (Claude) can do the file changes in a PR. The settings are yours, or mine with your OK:
1. Fix the licence file so GitHub shows MIT, and fill in the About box (description, website, topics).
2. Add `scorecard.yml` and let it run once.
3. Add the badges to the root README:
   - Scorecard;
   - Socket;
   - npm version;
   - licence;
   - Node;
   - CI;
   - dependencies;
   - size.
4. Add the same badges to the package README. They show on npm from 0.1.1.
5. Add a ruleset that protects main.

**With 0.1.1:**

6. On release day, add the npm trusted publisher (yours: it needs your npm login).
7. Release 0.1.1 through `publish-npm`, following [releasing.md](releasing.md). This brings provenance on npm, and the new README with its badges.
8. Turn on "disallow tokens" on the package.

**Later:**

9. Fill in the OpenSSF Best Practices questionnaire (about an hour).
10. Look at the Scorecard results and fix what's cheap. Maintained goes up by itself after 90 days.
11. Add the downloads badge once there are downloads.
