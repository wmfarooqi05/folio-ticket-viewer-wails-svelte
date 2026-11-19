import { describe, expect, it } from 'vitest'
import { editedAgo, isOpenStatus, isStruck, statusVar } from './status'

describe('status helpers', () => {
  it('editedAgo counts whole days from mtime', () => {
    const now = Date.UTC(2026, 10, 20, 12)
    expect(editedAgo(now - 3_600_000, now)).toBe('edited today')
    expect(editedAgo(now - 86_400_000, now)).toBe('edited 1 day ago')
    expect(editedAgo(now - 12.5 * 86_400_000, now)).toBe('edited 12 days ago')
    expect(editedAgo(now + 5_000, now)).toBe('edited today') // a clock a little ahead never goes negative
  })

  it('unknown has no colour; dropped and superseded share the mute colour and are struck', () => {
    expect(statusVar('unknown')).toBeNull()
    expect(statusVar('dropped')).toBe(statusVar('superseded'))
    expect(isStruck('dropped') && isStruck('superseded') && !isStruck('done')).toBe(true)
  })

  it('open badges count the live statuses only', () => {
    expect(['open', 'in-progress', 'blocked', 'in-review'].every((s) => isOpenStatus(s as never))).toBe(true)
    expect(['done', 'dropped', 'superseded', 'unknown'].some((s) => isOpenStatus(s as never))).toBe(false)
  })
})
