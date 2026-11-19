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

- [ ] A modal dialog opened from the gear and Ctrl+, with sections Docs folder, Links and Appearance, driven by one schema so later fields are added in one place.
- [ ] **Docs folder:** the repo root with the native picker, the docs folder name, root chips showing found or missing, and "Watching N files · last scan X ms".
- [ ] **Links:** the ADO work-item and PR URL templates, with live previews. Validate `https://` and `{id}` inline.
- [ ] **Appearance:** System, Light and Dark.
- [ ] **Footer:** "Open settings file" (through OpenInVSCode on `settings.json`), Cancel, and Save, disabled until something changes.
- [ ] **States from the mockup:** Default, Link error, No roots, Saved (a toast) and Dark. Esc closes, Enter saves, with an Indigo focus ring.
- [ ] **Saving:** a new root triggers a rescan. A changed URL template updates the chips live.
- [ ] Implement `ShellService.OpenExternal` (http and https only) for the ADO, PR and external links.
- [ ] Test the first run end to end: no settings, then the picker, then CheckRoot, then SetConfig, then the scan.

## Done when

- <a id="ac1"></a>**AC1** — All five mockup states can be reached and match the design.
- <a id="ac2"></a>**AC2** — First run from a clean `%APPDATA%\Folio` works through the UI.
- <a id="ac3"></a>**AC3** — No ticket file is ever written. Only `settings.json` changes.

## Outcome

*(empty)*
