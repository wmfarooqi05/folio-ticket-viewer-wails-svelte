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
  id: 'folder' | 'links' | 'appearance' | 'data'
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
        hint: 'A small RAM figure in the sidebar footer. Off by default: measuring it looks at other processes. Off stops the measuring.',
      },
    ],
  },
  // Not a settings.json field: the dialog draws the "Clear data" action for this one (ticket 18).
  { id: 'data', label: 'Data', fields: [] },
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
    docsRoots: [...new Set((cfg.docsRoots?.length ? cfg.docsRoots : DEFAULT_ROOTS).map(normalizeRoot))],
    adoWorkItemUrl: cfg.adoWorkItemUrl ?? '',
    adoPrUrl: cfg.adoPrUrl ?? '',
    theme,
    showMemory: cfg.showMemory === true, // off unless the config says so (ticket 18, L1)
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

/** The docs root that means the whole docs folder (ticket 25). The scope skips still apply under it. */
export const WHOLE_ROOT = '.'

/** A root as the chips and messages name it. */
export const rootLabel = (r: string): string => (r === WHOLE_ROOT ? 'Whole docs folder (.)' : r + '/')

/**
 * Roots to show as chips: the whole docs folder, the usual three, the folders found in the docs folder
 * that hold any .md, the ones typed in this session, and any root already selected.
 */
export function rootCandidates(selected: string[], folders: string[] = [], added: string[] = []): string[] {
  return [...new Set([WHOLE_ROOT, ...DEFAULT_ROOTS, ...folders, ...added, ...selected])]
}

/** Toggles a root, keeping the candidate order. */
export function toggleRoot(selected: string[], root: string, candidates: string[] = rootCandidates(selected)): string[] {
  const all = candidates.includes(root) ? candidates : [...candidates, root]
  return all.filter((r) => (r === root ? !selected.includes(r) : selected.includes(r)))
}

/**
 * A root typed in the Settings box: a relative folder inside the docs folder. Returns the cleaned root,
 * or the message to show. "." and "" are not typed (the whole folder has its own chip).
 */
export function parseTypedRoot(text: string): { root: string } | { error: string } {
  const t = text.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  if (t === '') return { error: 'Type a folder name' }
  if (/^([a-zA-Z]:|\/)/.test(t) || t.split('/').includes('..')) return { error: 'Must be a folder inside the docs folder' }
  const clean = t.split('/').filter((p) => p !== '' && p !== '.').join('/')
  if (clean === '') return { error: 'Use the "Whole docs folder" chip for that' }
  if (clean.split('/').some((p) => p === 'node_modules' || p.startsWith('_') || p.startsWith('.')))
    return { error: 'Folio skips node_modules and folders that start with _ or .' }
  return { root: clean }
}

/** "./" and "a/.." are the whole docs folder, "a/./b" is "a/b". A root that leaves the folder is left as written. */
export function normalizeRoot(r: string): string {
  const out: string[] = []
  for (const p of r.replaceAll('\\', '/').split('/')) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (out.length === 0) return r
      out.pop()
    } else out.push(p)
  }
  return out.length === 0 ? WHOLE_ROOT : out.join('/')
}
