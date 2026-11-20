// Settings dialog model (ticket 13, docs/issues/05 D4). Pure functions and the one
// schema that drives the dialog, so a later setting is added in one place.
// No imports from the Wails bindings: this file is unit-tested in plain node.

export type Theme = 'system' | 'light' | 'dark'

/** The editable part of settings.json. The window bounds are Go-only and not here. */
export interface Draft {
  repoRoot: string
  docsDir: string
  docsRoots: string[]
  adoWorkItemUrl: string
  adoPrUrl: string
  theme: Theme
  showMemory: boolean
}

/** The subset of the saved config the dialog needs (structurally what Config has). */
export type DraftSource = Partial<Omit<Draft, 'theme' | 'docsRoots'>> & {
  docsRoots?: string[] | null
  theme?: string
}

export const DEFAULT_ROOTS = ['modules', 'handoffs', 'patterns']

export type FieldKind = 'folder' | 'docsDir' | 'roots' | 'template' | 'theme' | 'toggle'

export interface Field {
  key: keyof Draft
  kind: FieldKind
  label: string
  hint?: string
  /** template fields: the sample id for the live preview */
  sampleId?: string
}

export interface Section {
  id: 'folder' | 'links' | 'appearance'
  label: string
  fields: Field[]
}

/** One schema: the dialog renders sections and fields from this and nothing else. */
export const SECTIONS: Section[] = [
  {
    id: 'folder',
    label: 'Docs folder',
    fields: [
      { key: 'repoRoot', kind: 'folder', label: 'Repo root' },
      {
        key: 'docsDir',
        kind: 'docsDir',
        label: 'Docs folder name',
        hint: 'Looked up inside the repo root. Default docs.',
      },
      { key: 'docsRoots', kind: 'roots', label: 'Docs roots' },
    ],
  },
  {
    id: 'links',
    label: 'Links',
    fields: [
      { key: 'adoWorkItemUrl', kind: 'template', label: 'Azure DevOps work item URL', sampleId: '72633' },
      { key: 'adoPrUrl', kind: 'template', label: 'Pull request URL', sampleId: '208' },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    fields: [
      { key: 'theme', kind: 'theme', label: 'Theme', hint: 'System follows your OS setting.' },
      {
        key: 'showMemory',
        kind: 'toggle',
        label: 'Show memory use',
        hint: 'A small RAM figure in the sidebar footer. Off stops the measuring.',
      },
    ],
  },
]

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function draftFrom(cfg: DraftSource): Draft {
  const theme = cfg.theme === 'light' || cfg.theme === 'dark' ? cfg.theme : 'system'
  return {
    repoRoot: cfg.repoRoot ?? '',
    docsDir: cfg.docsDir ?? 'docs',
    docsRoots: [...(cfg.docsRoots?.length ? cfg.docsRoots : DEFAULT_ROOTS)],
    adoWorkItemUrl: cfg.adoWorkItemUrl ?? '',
    adoPrUrl: cfg.adoPrUrl ?? '',
    theme,
    showMemory: cfg.showMemory !== false,
  }
}

/**
 * Validates a URL template. "" is valid (the link is switched off, which is the
 * default). Otherwise it must be https:// with a host and contain {id}. Mirrors
 * validateURLTemplate in internal/settings. Returns the inline message or null.
 */
export function validateTemplate(tpl: string): string | null {
  if (tpl === '') return null
  if (!/^https:\/\/[^/?#\s]/i.test(tpl)) return 'Must start with https://'
  if (!tpl.includes('{id}')) return 'Must contain {id}'
  try {
    const u = new URL(tpl.split('{id}').join('0'))
    if (u.protocol !== 'https:' || !u.hostname) return 'Must start with https://'
  } catch {
    return 'Not a valid URL'
  }
  return null
}

/** The docs folder is a relative folder inside the repo root. */
export function validateDocsDir(dir: string): string | null {
  const d = dir.trim().replaceAll('\\', '/')
  if (d === '') return 'Cannot be empty'
  if (/^([a-zA-Z]:|\/)/.test(d) || d.split('/').includes('..')) return 'Must be a folder inside the repo root'
  return null
}

/** The sample link shown under a template: …/<last two segments>, as in the mockup. */
export function templateExample(tpl: string, sampleId: string): string {
  const parts = tpl.split('{id}').join(sampleId).split('/')
  return '…/' + parts.slice(-2).join('/')
}

/** Expands a template for a ticket id. "" when the template is off or invalid. */
export function expandTemplate(tpl: string, id: string | number): string {
  if (validateTemplate(tpl) !== null || tpl === '') return ''
  return tpl.split('{id}').join(encodeURIComponent(String(id)))
}

/** Per-field errors for a draft. Empty object means valid. */
export function validateDraft(d: Draft): Partial<Record<keyof Draft, string>> {
  const errs: Partial<Record<keyof Draft, string>> = {}
  const a = validateTemplate(d.adoWorkItemUrl)
  if (a) errs.adoWorkItemUrl = a
  const p = validateTemplate(d.adoPrUrl)
  if (p) errs.adoPrUrl = p
  const dd = validateDocsDir(d.docsDir)
  if (dd) errs.docsDir = dd
  if (d.docsRoots.length === 0) errs.docsRoots = 'Select at least one folder'
  return errs
}

/** Every field key in the schema, so a new field is compared and patched with no other edit. */
const FIELD_KEYS: (keyof Draft)[] = SECTIONS.flatMap((s) => s.fields.map((f) => f.key))

const fieldEqual = (a: Draft[keyof Draft], b: Draft[keyof Draft]): boolean =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b

export const isDirty = (draft: Draft, saved: Draft): boolean =>
  FIELD_KEYS.some((k) => !fieldEqual(draft[k], saved[k]))

/** Save is disabled until something changed, and while any field is invalid (the mockup rule). */
export function saveDisabled(draft: Draft, saved: Draft): boolean {
  return !isDirty(draft, saved) || Object.keys(validateDraft(draft)).length > 0
}

/** Only what changed, so a patch cannot overwrite what the user did not touch. */
export function patchFrom(draft: Draft, saved: Draft): Partial<Draft> {
  const patch: Record<string, unknown> = {}
  for (const k of FIELD_KEYS) {
    if (fieldEqual(draft[k], saved[k])) continue
    const v = draft[k]
    patch[k] = Array.isArray(v) ? [...v] : typeof v === 'string' && k === 'docsDir' ? v.trim() : v
  }
  return patch as Partial<Draft>
}

/** A different repo, docs folder or set of roots means the index must be rebuilt. */
export function needsRescan(patch: Partial<Draft>): boolean {
  return patch.repoRoot !== undefined || patch.docsDir !== undefined || patch.docsRoots !== undefined
}

/** Roots to show as chips: the defaults plus any custom root already configured. */
export function rootCandidates(selected: string[]): string[] {
  return [...new Set([...DEFAULT_ROOTS, ...selected])]
}

/** Toggles a root, keeping the candidate order. */
export function toggleRoot(selected: string[], root: string): string[] {
  return rootCandidates(selected).filter((r) => (r === root ? !selected.includes(r) : selected.includes(r)))
}
