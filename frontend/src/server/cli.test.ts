import { describe, expect, it } from 'vitest'
import { isSafeUrl, parseArgs } from './cli'

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
    expect(parseArgs([])).toEqual({ port: 0, open: true, help: false, version: false })
  })

  it('reads --docs, --port and --no-open, with a space or =', () => {
    expect(parseArgs(['--docs', 'C:\\repo', '--port', '4100', '--no-open'])).toMatchObject({ docs: 'C:\\repo', port: 4100, open: false })
    expect(parseArgs(['--docs=C:\\my repo', '--port=0'])).toMatchObject({ docs: 'C:\\my repo', port: 0 })
    expect(parseArgs(['--help']).help).toBe(true)
  })

  it.each([['--port', 'abc'], ['--port', '70000'], ['--port', '-1'], ['--docs'], ['--docs', '--no-open'], ['--bogus'], ['stray']])('rejects %j', (...argv) => {
    expect(() => parseArgs(argv)).toThrow()
  })
})
