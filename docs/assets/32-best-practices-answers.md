# Ticket 32: answers for the OpenSSF Best Practices "passing" form

Drafted Nov 21, 2026, against the [67 passing criteria](https://www.bestpractices.dev/en/criteria/0). Paste them in at bestpractices.dev: for each criterion, pick the **Answer**, then paste the **Justification** text, which includes the URL where one is needed.

**Before you paste anything, do the two owner steps below.** All but 2 MUSTs are met by the repo or by this ticket's PR. Those 2 are **know_secure_design** and **know_common_errors**: they are statements about you. Read the drafted text, and change it until it is true for you.

Links point at `main`, so they work once this ticket's PR is merged (it adds `CONTRIBUTING.md` and `CHANGELOG.md`).

## Owner steps first

1. **Merge this ticket's PR.** It adds the contribution guide and the test policy, which were the unmet MUSTs `contribution`, `contribution_requirements` and `test_policy`. It also adds human-written release notes, which were the unmet MUSTs `release_notes` and `release_notes_vulns`.
2. **Put the 0.1.0 notes on the GitHub Release.** Its notes are only GitHub's generated list of PR titles, which the badge doesn't accept as release notes. Paste the `0.1.0` entry from `CHANGELOG.md` at the top: Releases › v0.1.0 › Edit. The answer below links to `CHANGELOG.md`, which is enough for the form, but the Release should say the same.
3. **Dismiss the 15 open CodeQL alerts**, in Security › Code scanning. `static_analysis_fixed` says medium and higher findings get handled. I checked each one, and none is a real problem:

   | Alerts | Rule | Where | Why it is not a problem | Dismiss as |
   |---|---|---|---|---|
   | 14 | path-injection | `server.ts:147` | The path is checked before use. `..`, `\`, `:` and NUL are rejected, then `realpath`, then `within(distRoot, …)`. The fuzz tests in `server/fuzz.test.ts` try to escape it. | False positive |
   | 1 | unvalidated redirect | `server.ts:184` | `Location` is the request's own path. It must start with `/`, not `//`, and contain no `\` (ticket 19), so it always stays on the same origin. | False positive |
   | 15 | stack-trace exposure | `server.ts:113` | Only `e.message`, never the stack, goes back. Only the signed-in local user gets it, on 127.0.0.1, and the UI shows it on purpose (settings validation messages). | Won't fix |
   | 2, 3 | incomplete sanitization | `parser/index.ts:393, 402` | Those strings are for slugs, labels and matching. They are never put into HTML: rendered Markdown goes through the allowlist in `render/sanitize.ts`, and Svelte escapes text. | False positive |
   | 4–13 | cross-window leak, XSS through DOM | `docs/assets/*-mockup.html` | Design mockups from tickets 3 and 13. They are not in the npm package or the app. | Used in tests (the closest reason: "not production code") |

4. **Optional, but it makes `no_leaked_credentials` stronger:** turn on secret scanning and push protection in Settings › Code security. They are free for public repos. It's off today. I scanned the whole git history (159 commits) for npm, GitHub, AWS, Slack, Google and private-key patterns, and found none.

Then sign in at https://www.bestpractices.dev with GitHub. Choose "Add project", enter the repo URL, and paste the answers. Most of Basics fills itself from the repo.

R = `https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte`

## Basics

| Criterion | Level | Answer | Justification (paste) |
|---|---|---|---|
| description_good | MUST | Met | The README's first paragraph says it: a read-only viewer for Markdown tickets in a repo, which shows the tree, each ticket's status and a kanban board. R#readme |
| interact | MUST | Met | Get it: `npx folio-issues-kanban-viewer` (README, "Run it"). Feedback: GitHub issues. Contribute: CONTRIBUTING.md. R/blob/main/CONTRIBUTING.md |
| contribution | MUST | Met | Contributions come as GitHub pull requests against main, after an issue for anything non-trivial. R/blob/main/CONTRIBUTING.md |
| contribution_requirements | SHOULD | Met | CONTRIBUTING.md, "What a change needs": tests for new behaviour, 0 warnings from `task check`, no new runtime dependencies, the code style, read-only stays read-only. R/blob/main/CONTRIBUTING.md#what-a-change-needs |
| floss_license | MUST | Met | MIT. R/blob/main/LICENSE |
| floss_license_osi | SUGGESTED | Met | MIT is OSI-approved. |
| license_location | MUST | Met | `LICENSE` at the repo root. GitHub detects it as MIT. R/blob/main/LICENSE |
| documentation_basics | MUST | Met | The README covers install, first run, the docs layouts, settings, where it writes files, and development. The package README is the short user guide. R#readme |
| documentation_interface | MUST | Met | The interface is the CLI. Each option (`--docs`, `--port`, `--app`, `--no-open`, `--version`, `--help`) is in the package README's table, with the files it reads and writes. R/blob/main/packages/folio-issues-kanban-viewer/README.md |
| sites_https | MUST | Met | The repo (github.com), the package (npmjs.com) and the downloads (GitHub Releases, the npm registry) are all HTTPS only. |
| discussion | MUST | Met | GitHub issues: searchable, a URL per issue and comment, open to anyone with a GitHub account, and no special client needed. R/issues |
| english | SHOULD | Met | All docs are in English, and CONTRIBUTING.md says issues, PRs and comments are in English. |
| maintained | MUST | Met | Active: releases and PRs in Nov 2026, Dependabot on, CI on every PR. R/commits/main |

## Change Control

| Criterion | Level | Answer | Justification (paste) |
|---|---|---|---|
| repo_public | MUST | Met | R |
| repo_track | MUST | Met | git: each commit records the author, the date and the change. |
| repo_interim | MUST | Met | Every commit between releases is public on main and in the PR branches. |
| repo_distributed | SUGGESTED | Met | git, on GitHub. |
| version_unique | MUST | Met | Each release has a unique version in `package.json`, and the release workflow refuses a tag that doesn't match it. |
| version_semver | SUGGESTED | Met | SemVer, as CHANGELOG.md says. R/blob/main/CHANGELOG.md |
| version_tags | SUGGESTED | Met | Each release is a git tag `vX.Y.Z`, and its GitHub Release is built from the tag. R/tags |
| release_notes | MUST | Met | CHANGELOG.md has a human-written entry for each release, saying what changed for users and what breaks. R/blob/main/CHANGELOG.md |
| release_notes_vulns | MUST | Met | Each CHANGELOG entry has a Security line, which names every publicly known vulnerability fixed, with its CVE or advisory. So far there were none. R/blob/main/CHANGELOG.md |

## Reporting

| Criterion | Level | Answer | Justification (paste) |
|---|---|---|---|
| report_process | MUST | Met | Bugs are reported as GitHub issues, as CONTRIBUTING.md describes. R/issues |
| report_tracker | SHOULD | Met | GitHub issues. |
| report_responses | MUST | Met | No bug reports from outside yet. The maintainer replies to each one (CONTRIBUTING.md: usually within a week). |
| enhancement_responses | SHOULD | Met | No enhancement requests from outside yet. The same reply commitment applies. |
| report_archive | MUST | Met | GitHub issues, open and closed, are public and searchable. R/issues?q=is%3Aissue |
| vulnerability_report_process | MUST | Met | SECURITY.md: report through GitHub's private vulnerability reporting. R/blob/main/SECURITY.md |
| vulnerability_report_private | MUST | Met | Private vulnerability reporting is on. SECURITY.md links straight to the private form. R/security/advisories/new |
| vulnerability_report_response | MUST | Met | No vulnerability reports so far. SECURITY.md commits to a first reply within 7 days, a fix within 30, and disclosure at 90. |

## Quality

| Criterion | Level | Answer | Justification (paste) |
|---|---|---|---|
| build | MUST | Met | `task build` (or `npm run build:web` in `frontend/`) rebuilds the package from source. It is reproducible: pinned Node and `npm ci`, and the README explains how to check the bytes. |
| build_common_tools | SUGGESTED | Met | npm, Vite, and Task (taskfile.dev). |
| build_floss_tools | SHOULD | Met | Every build tool is FLOSS: Node, npm, Vite, TypeScript, Svelte, Task. |
| test | MUST | Met | Vitest suites under `frontend/src/**/*.test.ts`, plus a contract suite and fuzz tests. Run them with `task test` (README, "Develop"). CI runs them on every PR. |
| test_invocation | SHOULD | Met | `npm test` in `frontend/` (vitest), or `task test` for everything. |
| test_most | SUGGESTED | Met | 29 test files cover the parser, the renderer and sanitizer, the server's routes, auth, paths and settings, a hostile-input corpus, and fuzz tests. |
| test_continuous_integration | SUGGESTED | Met | GitHub Actions runs the tests and checks on every PR and push, and main requires them to pass. R/actions |
| test_policy | MUST | Met | CONTRIBUTING.md: new behaviour comes with automated tests, and a bug fix with a test that fails without it. R/blob/main/CONTRIBUTING.md#what-a-change-needs |
| tests_are_added | MUST | Met | The recent changes added tests with them: the security binding test, the watcher rename test, the fuzz and hostile corpus tests (ticket 19). R/commits/main |
| tests_documented_added | SUGGESTED | Met | CONTRIBUTING.md asks for tests in every change proposal. |
| warnings | MUST | Met | TypeScript in strict mode, svelte-check, and actionlint on the workflows, all run in CI. |
| warnings_fixed | MUST | Met | `svelte-check` reports 0 errors and 0 warnings, and `tsc --noEmit` passes. CI fails on errors. |
| warnings_strict | SUGGESTED | Met | `strict: true` in tsconfig, and checks with both TypeScript 6 (svelte-check) and TypeScript 7 (tsc). |

## Security

| Criterion | Level | Answer | Justification (paste) |
|---|---|---|---|
| know_secure_design | MUST | Met (**owner: confirm**) | The maintainer designed the threat model: the server listens on 127.0.0.1 only and checks the Host and Origin headers; a single-use token becomes an HttpOnly SameSite=Strict cookie; the API is read-only; paths are confined and realpath-checked; Markdown HTML goes through an allowlist sanitizer; there is a strict CSP; and the package has no runtime dependencies. |
| know_common_errors | MUST | Met (**owner: confirm**) | The maintainer knows the common web and CLI errors and their mitigations, and they are tested: path traversal (realpath confinement, fuzz tests), XSS (sanitizer, hostile corpus), DNS rebinding and CSRF (Host and Origin checks, SameSite cookie), open redirect (path rules), timing attacks (timingSafeEqual), and supply chain (pinned actions, npm audit, signatures). |
| crypto_published | MUST | Met | Folio uses only Node's built-in `node:crypto`, with SHA-256 and a CSPRNG. No custom cryptography. |
| crypto_call | SHOULD | Met | All cryptography goes through `node:crypto`, which wraps OpenSSL. |
| crypto_floss | MUST | Met | Node and OpenSSL are FLOSS. |
| crypto_keylength | MUST | N/A | Folio has no keys. The only secret is a random 192-bit session token. |
| crypto_working | MUST | Met | It uses SHA-256 and `timingSafeEqual` to compare tokens. No MD5, DES or RC4. |
| crypto_weaknesses | SHOULD | Met | SHA-1 appears once, to name a cache folder after the docs path, which has nothing to do with security. Every security use is SHA-256. |
| crypto_pfs | SHOULD | N/A | There is no key agreement. The server is plain HTTP on 127.0.0.1, so traffic never leaves the machine. |
| crypto_password_storage | MUST | N/A | Folio stores no passwords. |
| crypto_random | MUST | Met | Tokens come from `crypto.randomBytes(24)`, a CSPRNG. |
| delivery_mitm | MUST | Met | It is delivered from the npm registry and GitHub Releases, both HTTPS only, and the tarball carries a Sigstore build-provenance attestation. |
| delivery_unsigned | MUST | Met | No hash is fetched over HTTP. `SHA256SUMS-npm` is on the HTTPS GitHub Release, and the tarball can be checked with `gh attestation verify` (README, "Verify a downloaded package"). |
| vulnerabilities_fixed_60_days | MUST | Met | No known vulnerabilities: 0 Dependabot alerts, `npm audit` passes at moderate in CI, and CodeQL's findings were checked and are false positives. |
| vulnerabilities_critical_fixed | SHOULD | Met | SECURITY.md commits to a fix within 30 days, faster for critical ones. |
| no_leaked_credentials | MUST | Met | No credentials in the repo. Publishing uses npm trusted publishing (OIDC), so there is no npm token. A scan of the whole history found no secrets. |

## Analysis

| Criterion | Level | Answer | Justification (paste) |
|---|---|---|---|
| static_analysis | MUST | Met | On every PR and push: semgrep (`p/typescript`, `p/javascript`), CodeQL, TypeScript strict, svelte-check, actionlint, and OpenSSF Scorecard. R/actions |
| static_analysis_common_vulnerabilities | SUGGESTED | Met | semgrep's security rule packs and CodeQL's security queries look for common vulnerabilities. |
| static_analysis_fixed | MUST | Met | Every CodeQL and semgrep finding was triaged. semgrep fails CI on findings, and the open CodeQL alerts were false positives, dismissed with reasons. |
| static_analysis_often | SUGGESTED | Met | They run on every PR and every push to main. |
| dynamic_analysis | SUGGESTED | Met | Seeded property and fuzz tests for paths, settings and the renderer, and a hostile-input corpus, run in CI (the `security` workflow). |
| dynamic_analysis_unsafe | SUGGESTED | N/A | TypeScript and JavaScript are memory-safe. |
| dynamic_analysis_enable_assertions | SUGGESTED | Met | The fuzz and property tests assert the invariants on every generated input, for example that no path may resolve outside the docs root. |
| dynamic_analysis_fixed | MUST | Met | No open findings from the fuzz and hostile-corpus tests: they pass in CI, and main requires them. |

## After it shows "passing"

The project page gives a badge snippet. Add it to the badge line of both READMEs, then mark this ticket done (AC1 and AC2).
