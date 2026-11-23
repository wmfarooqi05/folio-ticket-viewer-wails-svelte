// Ticket 47: the map file names are an extra key in settings.json, written only when not the default.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mapFilesError, normaliseMapFiles, ShellService } from './shell'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'folio-maps-'))
  file = path.join(dir, 'settings.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const onDisk = () => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>

describe('map file names (ticket 47)', () => {
  it('a missing key reads as the defaults', () => {
    expect(new ShellService(file).getMapFiles()).toEqual(['map.md', 'README.md'])
  })

  it('saving writes the key, and getConfig does not carry it', () => {
    const s = new ShellService(file)
    expect(s.setMapFiles(['map.md', 'index.md'])).toEqual(['map.md', 'index.md'])
    expect(onDisk().mapFiles).toEqual(['map.md', 'index.md'])
    expect(s.getConfig()).not.toHaveProperty('mapFiles')
    expect(new ShellService(file).getMapFiles()).toEqual(['map.md', 'index.md'])
  })

  it('saving the defaults again removes the key, so the file is what Go writes', () => {
    const s = new ShellService(file)
    s.setMapFiles(['index.md'])
    expect(onDisk()).toHaveProperty('mapFiles')
    expect(s.setMapFiles(['map.md', 'README.md'])).toEqual(['map.md', 'README.md'])
    expect(onDisk()).not.toHaveProperty('mapFiles')
  })

  it('trims and drops a repeat in any case, keeping the first', () => {
    expect(normaliseMapFiles([' map.md ', 'MAP.MD', 'Readme.md', ''])).toEqual(['map.md', 'Readme.md'])
    const s = new ShellService(file)
    expect(s.setMapFiles([' index.md ', 'INDEX.md'])).toEqual(['index.md'])
  })

  it.each([
    [[], 'list at least one file name'],
    [Array.from({ length: 11 }, (_, i) => `a${i}.md`), 'at most 10 names'],
    [['a/b.md'], '"a/b.md" must be a file name, not a path'],
    [['a\\b.md'], '"a\\b.md" must be a file name, not a path'],
    [['a\nb.md'], '"a\nb.md" must be a file name, not a path'],
    [['..md'], '"..md" must not start with a dot'],
    [['.md'], '".md" must not start with a dot'],
    [['x.txt'], '"x.txt" must end in .md'],
    [['a,b.md'], `"a,b.md" has a character a file name can't have`],
    [['a:b.md'], `"a:b.md" has a character a file name can't have`],
    [['a*.md'], `"a*.md" has a character a file name can't have`],
    [['a'.repeat(98) + '.md'], `"${'a'.repeat(98)}.md" is too long`],
    [[1], 'must be a list of file names'],
    ['map.md', 'must be a list of file names'],
    [null, 'must be a list of file names'],
  ])('rejects %j and writes nothing', (names, why) => {
    expect(mapFilesError(names)).toBe(why)
    const s = new ShellService(file)
    expect(() => s.setMapFiles(names)).toThrow(`map files: ${why}`)
    expect(existsSync(file)).toBe(false)
    expect(s.getMapFiles()).toEqual(['map.md', 'README.md'])
  })

  it('an invalid saved value reads as the defaults and is reported', () => {
    writeFileSync(file, JSON.stringify({ v: 1, mapFiles: ['x.txt'] }))
    const s = new ShellService(file)
    expect(s.getMapFiles()).toEqual(['map.md', 'README.md'])
    expect(s.loadWarnings.some((w) => w.includes('mapFiles') && w.includes('must end in .md'))).toBe(true)
    expect(onDisk().mapFiles).toEqual(['x.txt']) // the file is left alone
  })

  it('setConfig keeps the key', () => {
    const s = new ShellService(file)
    s.setMapFiles(['index.md'])
    s.setConfig({ theme: 'dark' })
    expect(onDisk().mapFiles).toEqual(['index.md'])
    expect(s.getMapFiles()).toEqual(['index.md'])
  })
})
