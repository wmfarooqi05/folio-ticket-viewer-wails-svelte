---
type: build
status: open
status_note: null
waiting_on: null
blocked_by: []
blocked_note: null
related: ["05"]
superseded_by: null
pr: []
ado: []
afk: true
---

# 13 — Settings dialog and first-run flow

## Why

05 D4: an in-app Settings dialog behind the gear button, designed in [05-settings-dialog.png](../assets/05-settings-dialog.png). The gear does nothing today. The first-run "Choose folder…" path exists, but nobody has tested it through the UI.

## To do

- [x] A modal dialog opened from the gear and Ctrl+, with sections Docs folder, Links and Appearance, driven by one schema so later fields are added in one place.
- [x] **Docs folder:** the repo root with the native picker, the docs folder name, root chips showing found or missing, and "Watching N files · last scan X ms".
- [x] **Links:** the ADO work-item and PR URL templates, with live previews. Validate `https://` and `{id}` inline.
- [x] **Appearance:** System, Light and Dark.
- [x] **Footer:** "Open settings file" (through OpenInVSCode on `settings.json`), Cancel, and Save, disabled until something changes.
- [x] **States from the mockup:** Default, Link error, No roots, Saved (a toast) and Dark. Esc closes, Enter saves, with an Indigo focus ring.
- [x] **Saving:** a new root triggers a rescan. A changed URL template updates the chips live.
- [x] Implement `ShellService.OpenExternal` (http and https only) for the ADO, PR and external links.
- [x] Test the first run end to end: no settings, then the picker, then CheckRoot, then SetConfig, then the scan.

## Done when

- <a id="ac1"></a>**AC1** — All five mockup states can be reached and match the design.
- <a id="ac2"></a>**AC2** — First run from a clean `%APPDATA%\Folio` works through the UI.
- <a id="ac3"></a>**AC3** — No ticket file is ever written. Only `settings.json` changes.

## Outcome

Built. Code: `frontend/src/components/SettingsDialog.svelte`, the schema and pure logic in `frontend/src/lib/settings.ts`, and `internal/shell` (`OpenExternal`, `OpenSettingsFile`, `CheckDocs`).

- **Schema:** `SECTIONS` in `settings.ts` drives the sections and fields. A new field is one entry there, plus a `kind` the dialog already renders.
- **States:** Default is the dialog on Docs folder. Link error: clear or break a `{id}` template. No roots: Choose folder on a folder with none of the roots. Saved: change something and press Save (toast "Settings saved"). Dark: choose Dark under Appearance and Save.
- **Save rules:** disabled until something changes and while a template or the docs folder name is invalid. Enter saves (except on a button), Esc closes.
- **Rescan:** a changed repo root, docs folder or roots set triggers `load()` in `App.svelte`.
- **Live chips:** there are no link chips yet (ticket 11). `expandTemplate` in `settings.ts` is the one function they should use. `App.svelte` holds the saved config, so a saved template reaches them at once.
- **AC3:** `TestFirstRunFlowAgainstFixtures` snapshots `fixtures/` before and after and checks that only `settings.json` is written.
- **AC2:** the Go path (no settings, CheckRoot, SetConfig, scan) is tested. The native picker click still needs a human.

Deviations from the mockup:
- An empty template is valid (the link is off), because the default settings are empty and Go accepts it. The mockup would block Save.
- Templates also need an `https://` prefix (the mockup checked `{id}` only), as ticket D4 says.
- Save stays enabled in the No roots state, as in the mockup. The backend then rejects it and the error shows inline.
- The dialog has no closing animation, only the opening one.
- Template inputs update the preview on every keystroke, not on change.
- The visual match to the PNG was not checked by eye (see the manual checks).
