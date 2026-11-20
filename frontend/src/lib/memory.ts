// The RAM readout in the sidebar footer. Go measures; this only formats the number.
// No imports from the Wails bindings: unit-tested in plain node.

/** What the readout's tooltip says. */
export const MEMORY_TIP =
  "Memory used by Folio and its WebView2 processes (private bytes). Task Manager's Memory column shows a different measure."

const MB = 1024 * 1024

/** "165 MB" up to 1023 MB, then "1.2 GB". Whole megabytes, no unit churn at small sizes. */
export function formatMemory(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  const mb = Math.round(bytes / MB)
  if (mb < 1024) return `${mb} MB`
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`
}
