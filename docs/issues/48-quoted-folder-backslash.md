---
type: bug
status: in-review
status_note: "Nov 23, 2026: fixed"
waiting_on: null
blocked_by: []
blocked_note: null
related: ["44"]
superseded_by: null
pr: []
ado: []
afk: false
---

# 48 — A quoted folder that ends in a backslash

## Why

The owner, Nov 23, 2026: "can we resolve this issue? a folder with spaces in windows?"

```
npm run web -- --docs 'C:\Users\…\projects\Lockbox and Cash Payment\'
folio: --docs C:\Users\…\projects\Lockbox and Cash Payment": that is not a folder
```

The spaces were not the problem. On Windows, a quoted argument that ends in `\` reaches Node with the closing quote escaped: `\"` means a literal `"`. So Folio got `…Cash Payment"`. Any argument typed after it is swallowed into the same one (`…Cash Payment" --no-open --port 7463`).

## To do

- [x] On Windows, an argument with a `"` in it is cut there. The part before is the value, and the rest is split on spaces into the arguments that were typed. No Windows path or folio option can hold a `"`.
- [x] Other systems keep their arguments as they are: there `"` is a legal file name character.
- [x] Tests in `server/cli.test.ts`: the stray quote, swallowed options, normal arguments untouched, and Linux and macOS untouched.

## Not here

- An argument after the broken one that itself held spaces cannot be put back exactly: Windows has already merged it. That needs two mistakes in one command, and Folio then says which folder it could not open.

## Done when

- <a id="ac1"></a>**AC1** — `npm run web -- --docs 'C:\a folder with spaces\'` opens that folder, with or without options after it.

## Outcome

Fixed Nov 23, 2026, in `repairArgv` (`server/cli.ts`), which runs before `parseArgs`.

- **AC1, from PowerShell** with scratch settings, on a folder named `Lockbox and Cash Payment`:
  - `npm run web -- --docs '<folder>\' --no-open --port 7463` started Folio on it;
  - `npm run web -- '<folder>\'` started Folio on it too.
- Before the fix, the first form printed "that is not a folder", with the options swallowed into the path.
