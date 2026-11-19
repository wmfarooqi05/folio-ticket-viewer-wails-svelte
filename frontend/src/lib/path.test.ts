import { describe, expect, it } from 'vitest'
import { docsRootPath, splitPath } from './path'

describe('docsRootPath', () => {
  it('joins repoRoot and docsDir with the separator repoRoot uses', () => {
    expect(docsRootPath('E:\\projects\\ticket_ui', 'docs')).toBe('E:\\projects\\ticket_ui\\docs')
    expect(docsRootPath('/home/me/repo', 'docs')).toBe('/home/me/repo/docs')
  })
  it('normalises a nested docsDir and stray separators', () => {
    expect(docsRootPath('E:\\repo\\', 'a/b')).toBe('E:\\repo\\a\\b')
  })
  it('is empty with no repo', () => expect(docsRootPath('', 'docs')).toBe(''))
  it('is the repo alone with no docsDir', () => expect(docsRootPath('/r', '')).toBe('/r'))
})

describe('splitPath', () => {
  it('keeps the last two segments in the tail', () => {
    expect(splitPath('E:\\projects\\ticket_ui\\docs')).toEqual({ head: 'E:\\projects', tail: '\\ticket_ui\\docs' })
    expect(splitPath('/home/me/repo/docs')).toEqual({ head: '/home/me', tail: '/repo/docs' })
  })
  it('does not split a short path', () => {
    expect(splitPath('E:\\docs')).toEqual({ head: 'E:\\docs', tail: '' })
    expect(splitPath('/docs')).toEqual({ head: '/docs', tail: '' })
  })
  it('head and tail always rebuild the path', () => {
    const p = 'C:\\Users\\me\\work\\acme\\docs'
    const { head, tail } = splitPath(p)
    expect(head + tail).toBe(p)
  })
})
