import { describe, expect, it } from 'vitest'
import { MEMORY_TIP, formatMemory } from './memory'

const MB = 1024 * 1024

describe('formatMemory', () => {
  it('shows whole megabytes', () => {
    expect(formatMemory(165 * MB)).toBe('165 MB')
    expect(formatMemory(165.4 * MB)).toBe('165 MB')
    expect(formatMemory(165.6 * MB)).toBe('166 MB')
    expect(formatMemory(0)).toBe('0 MB')
  })
  it('switches to gigabytes at 1 GB', () => {
    expect(formatMemory(1023 * MB)).toBe('1023 MB')
    expect(formatMemory(1024 * MB)).toBe('1.0 GB')
    expect(formatMemory(1536 * MB)).toBe('1.5 GB')
  })
  it('shows nothing for a bad number', () => {
    expect(formatMemory(-1)).toBe('')
    expect(formatMemory(Number.NaN)).toBe('')
  })
  it('explains itself', () => {
    expect(MEMORY_TIP).toContain('private bytes')
    expect(MEMORY_TIP).toContain('Task Manager')
  })
})
