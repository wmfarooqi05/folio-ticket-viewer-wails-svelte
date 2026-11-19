import { describe, expect, it } from 'vitest'
import {
  draftFrom,
  type Draft,
  expandTemplate,
  needsRescan,
  patchFrom,
  saveDisabled,
  templateExample,
  toggleRoot,
  validateDocsDir,
  validateTemplate,
} from './settings'

const ADO = 'https://dev.azure.com/acme/payments/_workitems/edit/{id}'
const PR = 'https://dev.azure.com/acme/payments/_git/ledger/pullrequest/{id}'

const saved = () =>
  draftFrom({ repoRoot: 'C:\\repo', docsDir: 'docs', docsRoots: ['modules', 'handoffs', 'patterns'], adoWorkItemUrl: ADO, adoPrUrl: PR, theme: 'light' })

describe('validateTemplate', () => {
  it('accepts an https URL containing {id}', () => {
    expect(validateTemplate(ADO)).toBeNull()
    expect(validateTemplate('https://example.com/{id}')).toBeNull()
  })
  it('accepts empty (link off)', () => {
    expect(validateTemplate('')).toBeNull()
  })
  it('rejects a missing {id}', () => {
    expect(validateTemplate('https://dev.azure.com/acme/payments/_workitems/edit/')).toBe('Must contain {id}')
  })
  it('rejects anything that is not https://', () => {
    expect(validateTemplate('http://dev.azure.com/x/{id}')).toBe('Must start with https://')
    expect(validateTemplate('javascript:alert({id})')).toBe('Must start with https://')
    expect(validateTemplate('dev.azure.com/x/{id}')).toBe('Must start with https://')
  })
  it('rejects a template with no host', () => {
    expect(validateTemplate('https://{id}')).toBeNull() // host comes from the id; Go accepts it too
    expect(validateTemplate('https:///{id}')).not.toBeNull()
  })
})

describe('validateDocsDir', () => {
  it('accepts relative folders', () => {
    expect(validateDocsDir('docs')).toBeNull()
    expect(validateDocsDir('docs/tickets')).toBeNull()
  })
  it('rejects empty, absolute and escaping paths', () => {
    expect(validateDocsDir('')).not.toBeNull()
    expect(validateDocsDir('C:\\x')).not.toBeNull()
    expect(validateDocsDir('/etc')).not.toBeNull()
    expect(validateDocsDir('../x')).not.toBeNull()
  })
})

describe('saveDisabled', () => {
  it('is disabled while nothing changed', () => {
    expect(saveDisabled(saved(), saved())).toBe(true)
  })
  it('is enabled after a valid change', () => {
    const d = { ...saved(), theme: 'dark' as Draft['theme'] }
    expect(saveDisabled(d, saved())).toBe(false)
  })
  it('is disabled when a template is invalid, even though something changed', () => {
    const d = { ...saved(), adoWorkItemUrl: 'https://dev.azure.com/acme/edit/' }
    expect(saveDisabled(d, saved())).toBe(true)
    expect(saveDisabled({ ...saved(), adoPrUrl: 'http://x/{id}' }, saved())).toBe(true)
  })
  it('is disabled when the change is reverted', () => {
    const d = { ...saved(), theme: 'dark' as Draft['theme'] }
    d.theme = 'light'
    expect(saveDisabled(d, saved())).toBe(true)
  })
  it('is disabled when no docs root is selected', () => {
    expect(saveDisabled({ ...saved(), docsRoots: [] }, saved())).toBe(true)
  })
  it('notices a changed root selection', () => {
    expect(saveDisabled({ ...saved(), docsRoots: ['modules'] }, saved())).toBe(false)
  })
})

describe('patch and rescan', () => {
  it('sends only what changed', () => {
    const d = { ...saved(), theme: 'dark' as Draft['theme'] }
    expect(patchFrom(d, saved())).toEqual({ theme: 'dark' })
    expect(needsRescan(patchFrom(d, saved()))).toBe(false)
  })
  it('flags a new root, docs folder or roots set for a rescan', () => {
    expect(needsRescan(patchFrom({ ...saved(), repoRoot: 'D:\\other' }, saved()))).toBe(true)
    expect(needsRescan(patchFrom({ ...saved(), docsDir: 'tickets' }, saved()))).toBe(true)
    expect(needsRescan(patchFrom({ ...saved(), docsRoots: ['modules'] }, saved()))).toBe(true)
  })
  it('a template change does not rescan', () => {
    expect(needsRescan(patchFrom({ ...saved(), adoPrUrl: 'https://x.test/{id}' }, saved()))).toBe(false)
  })
})

describe('roots and previews', () => {
  it('toggles a root and keeps the candidate order', () => {
    expect(toggleRoot(['modules', 'handoffs', 'patterns'], 'handoffs')).toEqual(['modules', 'patterns'])
    expect(toggleRoot(['modules', 'patterns'], 'handoffs')).toEqual(['modules', 'handoffs', 'patterns'])
  })
  it('previews the last two path segments', () => {
    expect(templateExample(ADO, '72633')).toBe('…/edit/72633')
    expect(templateExample(PR, '208')).toBe('…/pullrequest/208')
  })
  it('expands a template for a chip, and is empty when the template is off or bad', () => {
    expect(expandTemplate(ADO, 72633)).toBe('https://dev.azure.com/acme/payments/_workitems/edit/72633')
    expect(expandTemplate('', 1)).toBe('')
    expect(expandTemplate('http://x/{id}', 1)).toBe('')
  })
})
