// Ticket 47: the index cache is keyed by the parser version and the map file names.
import { describe, expect, it } from 'vitest'
import { cacheKey } from './index-store.svelte'

describe('cacheKey', () => {
  it('differs when the names differ, and when their order does', () => {
    const k = (names: string[]) => cacheKey('v1', names)
    expect(k(['map.md', 'README.md'])).not.toBe(k(['map.md', 'index.md']))
    expect(k(['map.md', 'README.md'])).not.toBe(k(['README.md', 'map.md']))
    expect(k(['map.md'])).toBe(k(['map.md']))
    expect(cacheKey('v1', ['map.md'])).not.toBe(cacheKey('v2', ['map.md']))
  })
})

describe('cacheKey collisions', () => {
  it('a name with a comma is not two names', () => {
    expect(cacheKey('v', ['a,b.md'])).not.toBe(cacheKey('v', ['a', 'b.md']))
  })
})
