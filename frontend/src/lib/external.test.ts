// Ported from internal/shell/external_test.go and vscode_test.go: the same cases.
import { describe, expect, it } from 'vitest'
import { validateExternalUrl, vscodeUrl } from './external'

describe('validateExternalUrl', () => {
  it.each(['https://dev.azure.com/acme/p/_workitems/edit/72633', 'http://example.com/a?b=c#d', '  HTTPS://Example.com/x  '])('accepts %j', (input) => {
    expect(() => validateExternalUrl(input)).not.toThrow()
  })

  it.each([
    '',
    '   ',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'vscode://file/C:/x',
    'data:text/html,<b>x</b>',
    'ftp://example.com/x',
    'mailto:a@b.c',
    '//example.com/x',
    'example.com/x',
    'C:\\Windows\\notepad.exe',
    'https://',
    'https:///path',
    'https://user:pw@example.com/',
    'https://example.com/\nfile:///x',
    'http//example.com',
    'https://example.com/?a=b c',
    'https://example.com/?a="x"',
    'https://example.com/?a=<b>',
    'https://example.com/?a=b\\c',
    'https://example.com/?a=b^c',
    'https://example.com/?a=`x`',
    'https://example.com/?a={b}|c',
  ])('rejects %j', (input) => {
    expect(() => validateExternalUrl(input)).toThrow()
  })
})

describe('vscodeUrl', () => {
  it.each([
    ['E:\\src\\Lockbox and Cash Payment\\docs\\modules\\x\\issues\\05-a.md', 12, 'vscode://file/E:/src/Lockbox%20and%20Cash%20Payment/docs/modules/x/issues/05-a.md:12'],
    ['E:\\a\\b.md', 0, 'vscode://file/E:/a/b.md'],
    ['E:\\a\\b.md', -3, 'vscode://file/E:/a/b.md'],
    ['/home/u/a b/c.md', 1, 'vscode://file/home/u/a%20b/c.md:1'],
    ['E:\\a\\50% done #1.md', 7, 'vscode://file/E:/a/50%25%20done%20%231.md:7'],
  ])('%s at %i', (abs, line, want) => {
    expect(vscodeUrl(abs, line)).toBe(want)
  })
})
