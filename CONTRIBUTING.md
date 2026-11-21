# Contributing to Folio

Thanks for helping. Folio has one maintainer, so small, focused changes are the easiest to take.

## Report a bug or ask for something

- **Bugs and feature requests:** [open an issue](https://github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/issues/new). For a bug, say what you ran (the command, your OS and Node version), what you expected, and what happened. A small docs folder that shows the problem helps most.
- **Security problems:** never in a public issue. Follow [SECURITY.md](SECURITY.md): it is a private report, answered within 7 days.
- Issues, pull requests and code comments are in English.

Every issue gets a reply, usually within a week.

## Change the code

1. **For anything bigger than a small fix, open an issue first**, so we agree on the approach before you write it.
2. Fork the repo and branch from `main`.
3. Make the change, with tests (see the next section).
4. Run the checks locally (see [Develop](README.md#develop) for setup):
   ```
   task check
   task test
   ```
5. Open a pull request against `main`. Say what changed for the user and why, and link the issue.

`main` is protected: every change comes in through a pull request, and the required CI checks must pass before it can merge: tests, type checks, `npm audit`, semgrep, the hostile-input and fuzz tests, and the package contents check.

## What a change needs

- **Tests for new behaviour.** New functionality comes with automated tests (vitest, under `frontend/src/**/*.test.ts`). A bug fix comes with a test that fails without the fix. A pull request that adds behaviour without tests will be asked for them.
- **No new warnings.** `task check` runs svelte-check and the TypeScript compiler in strict mode, and must report 0 errors and 0 warnings.
- **No new runtime dependencies** in the published package without discussing it first. The package ships with none, and that is on purpose.
- **Read-only stays read-only.** Folio never writes to the user's docs. A change that would is not accepted.
- **Style:** follow the code around you. TypeScript, 2-space indent, no semicolons, single quotes. Keep comments for the *why*, not the *what*.
- **The Go code is frozen** (see [RETIRED.md](RETIRED.md)). Do not change it, except to keep the contract tests passing.

## Licence

Folio is MIT licensed ([LICENSE](LICENSE)). By sending a pull request, you agree that your contribution is released under the same licence.
