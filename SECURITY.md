# Security policy

## Reporting a problem

Please report a vulnerability **privately**, through GitHub private vulnerability reporting: open the
repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue for it.
Include the version (`folio-viewer --version`), your OS and Node version, and the steps to reproduce.

This is a one-person project, so replies are best effort.

## What is covered

- The npm package `folio-viewer`, and its web mode: the local server (127.0.0.1 only, one-time link token,
  host check, read-only access to your docs) and the browser page it serves. Only the latest published version
  gets fixes.

## What is not covered

- The Go/Wails desktop app is **retired and unsupported** (see [RETIRED.md](RETIRED.md)). It gets no fixes.
- Problems that need an attacker who already controls your machine or your user account.
