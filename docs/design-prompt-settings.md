# Claude Design prompt: Folio settings dialog

Paste everything below the line into the same Claude Design project as the Folio mockup.

---

Add a **Settings dialog** to the existing **Folio** ticket viewer design. Keep the **Indigo** theme and everything already established: Geist and Geist Mono, a 13px base, hairline borders, no shadows beyond a hairline, the same radii and chips, and the same motion language (the entrance easing `cubic-bezier(.2,.7,.2,1)`, about .26s). It must feel like part of the app, not a new style.

## Entry point

- A **gear icon button** at the right end of the 44px top bar, next to the light/dark toggle, with a tooltip "Settings" and the shortcut **Ctrl+,**.
- Clicking it opens a **modal dialog** centred over the app, about 640px wide and at most 80% of the viewport high, with a dimmed backdrop. Esc or a click on the backdrop closes it.
- Show the open and close motion: fade and scale from 0.98, with a reduced-motion variant that is a plain fade.

## Layout

- **Left:** a narrow section list, about 160px. **Right:** the section's fields. Design it so new sections can be added later without a redesign.
- v1 sections:
  1. **Docs folder**
     - Repo root: a read-only path field in mono, with a "Choose folder…" button that opens the native picker.
     - Docs folder name (default `docs`).
     - Docs roots: three toggle chips, `modules`, `handoffs` and `patterns`, each with a found or missing indicator.
     - A small line: "Watching 428 files · last scan 6 ms".
  2. **Links**
     - Azure DevOps work-item URL template, and pull-request URL template. These are long mono inputs that must contain `{id}`.
     - Under each, a live preview: "Example: …/edit/72633", showing the template filled with a sample id.
  3. **Appearance**
     - Theme: a segmented control, System, Light and Dark.
- **Footer:** "Open settings file" as a quiet text link on the left; Cancel and **Save** (primary, Indigo) on the right. Save is disabled until something changes.

## States to show

1. The default dialog on the Docs folder section.
2. The Links section with a **validation error**: a URL without `{id}`. Show an inline message under the field ("Must contain {id}") and the field border in the blocked/red status colour. Save is disabled.
3. The Docs folder section after choosing a folder that has no `modules/`, `handoffs/` or `patterns/`: an inline warning, "This folder has none of modules/ · handoffs/ · patterns/", with "Choose again".
4. A saved confirmation: a brief toast, "Settings saved", in the app's existing toast style.
5. The dialog in **dark mode**.

## Constraints

- This is the only place the app writes anything, and it writes only its own config, never tickets. No other editing affordances appear.
- Desktop app (Wails): no browser chrome, and no URL or page language.
- Keyboard: tab order, a visible focus ring in Indigo, Enter to save and Esc to cancel.
- Keep it light: no illustrations, and no heavy components.
