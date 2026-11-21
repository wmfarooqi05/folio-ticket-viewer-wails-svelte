import { describe, expect, it } from 'vitest'
import { allowChoices } from './evidence-root'

describe('allowChoices (ticket 45)', () => {
  it("the factory's layout: the evidence root first, then the project, then the ticket's own folder", () => {
    expect(allowChoices('U:/Evidence/app/pay-05-refund-screen/')).toEqual([
      { path: 'U:/Evidence', covers: 'every ticket' },
      { path: 'U:/Evidence/app', covers: 'this project' },
      { path: 'U:/Evidence/app/pay-05-refund-screen', covers: 'this ticket' },
    ])
  })

  it('never offers a drive or filesystem root', () => {
    expect(allowChoices('U:/Evidence/pay-05/')).toEqual([
      { path: 'U:/Evidence', covers: 'this project' },
      { path: 'U:/Evidence/pay-05', covers: 'this ticket' },
    ])
    expect(allowChoices('U:/pay-05')).toEqual([{ path: 'U:/pay-05', covers: 'this ticket' }])
    expect(allowChoices('U:/')).toEqual([])
    expect(allowChoices('/')).toEqual([])
    expect(allowChoices('/home/me/evidence/app/t1').map((c) => c.path)).toEqual(['/home/me/evidence', '/home/me/evidence/app', '/home/me/evidence/app/t1'])
  })

  it('backslashes are read as separators', () => {
    expect(allowChoices('U:\\Evidence\\app\\t1\\')[0]).toEqual({ path: 'U:/Evidence', covers: 'every ticket' })
  })

  it('offers nothing for a relative, network, dotted or empty folder', () => {
    for (const f of ['', 'Evidence/app/t1', 'U:Evidence/t1', '//server/share/ev/t1', '\\\\server\\share\\t1', 'U:/Evidence/../Windows/t1', 'U:/a/\0/b']) {
      expect(allowChoices(f)).toEqual([])
    }
  })
})
