import { describe, expect, it } from 'vitest'
import { parseArgs } from './cli'

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
