import type { Theme } from '../api'

/** Sets data-theme on <html>. "system" removes it so the OS preference applies. */
export function applyTheme(theme: Theme | string | undefined): void {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme
  else delete root.dataset.theme
}

/** The theme actually showing, resolving "system" through the OS preference. */
export function resolvedTheme(theme: Theme | string | undefined): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
