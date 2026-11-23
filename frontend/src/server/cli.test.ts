import { describe, expect, it } from 'vitest'
import { edgePaths, isSafeUrl, openApp, parseArgs, repairArgv, type AppDeps } from './cli'

describe('repairArgv (ticket 48: a quoted folder that ends in a backslash)', () => {
  const dir = String.raw`C:\Users\me\Lockbox and Cash Payment`
  it('drops the stray quote Windows leaves after "C:\\my folder\\"', () => {
    expect(repairArgv(['--docs', dir + '"'], 'win32')).toEqual(['--docs', dir])
    expect(repairArgv([dir + '"'], 'win32')).toEqual([dir])
  })
  it('gives back the arguments the escaped quote swallowed', () => {
    expect(repairArgv(['--docs', dir + '" --no-open --port 7463'], 'win32')).toEqual(['--docs', dir, '--no-open', '--port', '7463'])
    expect(parseArgs(repairArgv(['--docs', dir + '" --no-open --port 7463'], 'win32'))).toMatchObject({ docs: dir, open: false, port: 7463 })
  })
  it('leaves normal arguments alone', () => {
    const argv = ['--docs', String.raw`C:\a b\c`, '--port', '0', '.']
    expect(repairArgv(argv, 'win32')).toEqual(argv)
  })
  it('keeps argv as it is on other systems, where " is a legal file name character', () => {
    expect(repairArgv(['/tmp/odd"', '--app'], 'linux')).toEqual(['/tmp/odd"', '--app'])
    expect(repairArgv(['/tmp/odd"'], 'darwin')).toEqual(['/tmp/odd"'])
  })
})

describe('isSafeUrl (the only thing that reaches the OS launcher)', () => {
  it('accepts the printed link, with or without a token', () => {
    expect(isSafeUrl('http://127.0.0.1:5747/?token=pls_GANt4qzHhaX-Ys1lK3bs1cxpG0kk')).toBe(true)
    expect(isSafeUrl('http://127.0.0.1:80/')).toBe(true)
  })
  it.each(['http://127.0.0.1:5/?token=a&calc', 'http://127.0.0.1:5/?token=a^&calc', 'http://127.0.0.1:5/?token=a b', 'http://127.0.0.1:5/x', 'https://127.0.0.1:5/', 'http://localhost:5/', 'http://127.0.0.1:5/?token=a"', 'http://127.0.0.1/', 'http://127.0.0.1:5/?token=%0Ax', 'http://127.0.0.1:5@evil.com/', 'file:///c:/x'])('refuses %j', (u) => {
    expect(isSafeUrl(u)).toBe(false)
  })
})

describe('parseArgs', () => {
  it('has defaults: a random port, open the browser', () => {
    expect(parseArgs([])).toEqual({ port: 0, open: true, app: false, help: false, version: false })
  })

  it('reads --docs, --port and --no-open, with a space or =', () => {
    expect(parseArgs(['--docs', 'C:\\repo', '--port', '4100', '--no-open'])).toMatchObject({ docs: 'C:\\repo', port: 4100, open: false })
    expect(parseArgs(['--docs=C:\\my repo', '--port=0'])).toMatchObject({ docs: 'C:\\my repo', port: 0 })
    expect(parseArgs(['--help']).help).toBe(true)
  })

  it.each([['--port', 'abc'], ['--port', '70000'], ['--port', '-1'], ['--docs'], ['--docs', '--no-open'], ['--bogus'], ['-x']])('rejects %j', (...argv) => {
    expect(() => parseArgs(argv)).toThrow()
  })

  it('ticket 44: a bare folder is the docs folder, so `folio .` is `folio --docs .`', () => {
    expect(parseArgs(['.'])).toMatchObject({ docs: '.' })
    expect(parseArgs(['C:\\my repo', '--app'])).toMatchObject({ docs: 'C:\\my repo', app: true })
    expect(parseArgs(['--no-open', 'docs'])).toMatchObject({ docs: 'docs', open: false })
    expect(parseArgs(['.'])).toEqual(parseArgs(['--docs', '.']))
  })

  it.each([['.', 'other'], ['.', '--docs', 'x'], ['--docs', 'x', '.'], ['--docs=x', '--docs=y']])('ticket 44: the folder is given once, %j is refused', (...argv) => {
    expect(() => parseArgs(argv)).toThrow(/once/)
  })
})

describe('--app', () => {
  it('is read by parseArgs, and is off by default', () => {
    expect(parseArgs(['--app', '--docs', 'C:\\repo']).app).toBe(true)
    expect(parseArgs([]).app).toBe(false)
  })
})

describe('edgePaths', () => {
  it('lists Program Files (x86), Program Files, then the per-user install', () => {
    expect(edgePaths({ 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF', LOCALAPPDATA: 'C:\\L' })).toEqual([
      'C:\\PF86\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\L\\Microsoft\\Edge\\Application\\msedge.exe',
    ])
  })
  it('ignores bases that are not absolute paths', () => {
    expect(edgePaths({ 'ProgramFiles(x86)': 'PF86', ProgramFiles: '..\\x', LOCALAPPDATA: '\\rooted' })).toEqual([])
  })
  it('skips variables that are not set', () => {
    expect(edgePaths({})).toEqual([])
  })
})

describe('openApp (--app)', () => {
  const URL = 'http://127.0.0.1:5747/?token=abc_DEF-123'
  const PER_USER = 'C:\\L\\Microsoft\\Edge\\Application\\msedge.exe'
  function fake(over: Partial<AppDeps> = {}, failStart = false) {
    const spawned: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = []
    const opened: string[] = []
    const notes: string[] = []
    let unrefs = 0
    const deps: AppDeps = {
      platform: 'win32',
      env: { 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF', LOCALAPPDATA: 'C:\\L' },
      exists: (f) => f === PER_USER,
      spawn: (cmd, args, opts) => {
        spawned.push({ cmd, args, opts: opts as Record<string, unknown> })
        return {
          on: (_ev, cb) => {
            if (failStart) cb()
          },
          unref: () => void unrefs++,
        }
      },
      openBrowser: (u) => void opened.push(u),
      note: (l) => void notes.push(l),
      ...over,
    }
    return { deps, spawned, opened, notes, unrefs: () => unrefs }
  }

  it('starts Edge with the single --app=<url> argument, no shell, detached, and lets go of it', () => {
    const f = fake()
    expect(openApp(URL, f.deps)).toBe('edge')
    expect(f.spawned).toEqual([{ cmd: PER_USER, args: ['--app=' + URL], opts: expect.objectContaining({ detached: true, stdio: 'ignore', shell: false }) }])
    expect(f.unrefs()).toBe(1)
    expect(f.opened).toEqual([])
    expect(f.notes).toEqual([])
  })

  it('takes the first install path that exists', () => {
    const f = fake({ exists: () => true })
    openApp(URL, f.deps)
    expect(f.spawned[0].cmd).toBe('C:\\PF86\\Microsoft\\Edge\\Application\\msedge.exe')
  })

  it('falls back to the browser, with one note, when Edge is not installed', () => {
    const f = fake({ exists: () => false })
    expect(openApp(URL, f.deps)).toBe('browser')
    expect(f.spawned).toEqual([])
    expect(f.opened).toEqual([URL])
    expect(f.notes).toHaveLength(1)
  })

  it.each(['darwin', 'linux'] as const)('falls back to the browser on %s', (platform) => {
    const f = fake({ platform })
    expect(openApp(URL, f.deps)).toBe('browser')
    expect(f.spawned).toEqual([])
    expect(f.opened).toEqual([URL])
    expect(f.notes).toHaveLength(1)
  })

  it('falls back when Edge fails to start (error event)', () => {
    const f = fake({}, true)
    openApp(URL, f.deps)
    expect(f.opened).toEqual([URL])
    expect(f.notes).toHaveLength(1)
  })

  it('falls back when spawn throws', () => {
    const f = fake({
      spawn: () => {
        throw new Error('EPERM')
      },
    })
    expect(openApp(URL, f.deps)).toBe('browser')
    expect(f.opened).toEqual([URL])
  })

  it('never passes anything but the loopback URL shape to Edge', () => {
    for (const bad of ['http://127.0.0.1:5/?token=a --remote-debugging-port=1', 'http://evil.example/', 'file:///c:/x', '" --foo']) {
      const f = fake()
      expect(openApp(bad, f.deps)).toBe('browser')
      expect(f.spawned).toEqual([])
    }
  })
})
