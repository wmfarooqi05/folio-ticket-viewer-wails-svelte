// The web-mode backend: plain JSON over HTTP to the Node server (src/server), and
// Server-Sent Events for docs:changed. It needs no Wails runtime.
import type { ChangeSet } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs'
import type { Backend } from './backend-types'
import { validateExternalUrl } from './external'

export const isWeb = true

/** POST /api/<name> with the arguments as a JSON list. A failed call throws the server's message. */
async function call<T>(name: string, ...args: unknown[]): Promise<T> {
  const res = await fetch('/api/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* not JSON: the status below says what happened */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error
    throw new Error(msg ?? (res.status === 401 ? 'Not signed in: open the link that folio printed.' : `${name} failed (${res.status})`))
  }
  return body as T
}

export const backend: Backend = {
  getConfig: () => call('getConfig'),
  setConfig: (patch) => call('setConfig', patch),
  setSidebarWidth: (width) => call('setSidebarWidth', width),
  setPanelWidth: (width) => call('setPanelWidth', width),
  setSidebarCollapsed: (collapsed) => call('setSidebarCollapsed', collapsed),
  // A browser cannot show a native folder dialog: the UI has a path box instead (lib/folder.ts).
  pickFolder: async () => '',
  checkRoot: (abs) => call('checkRoot', abs),
  checkDocs: (repoRoot, docsDir, roots) => call('checkDocs', repoRoot, docsDir, roots),
  // The same rule as the desktop app (http and https only), opened in a new tab with no opener.
  openExternal: async (url) => {
    const clean = validateExternalUrl(url)
    window.open(clean, '_blank', 'noopener,noreferrer')
  },
  openSettingsFile: async () => {
    throw new Error('Not available in the browser')
  },
  // The server builds the vscode:// URL (it knows the absolute path); the browser opens it.
  openInVSCode: async (path, line) => {
    const url = await call<string>('vscodeUrl', path, line)
    window.location.href = url
  },

  scan: () => call('scan'),
  rescan: () => call('rescan'),
  readFile: (path) => call('readFile', path),
  loadCache: (parserVersion) => call('loadCache', parserVersion),
  saveCache: (parserVersion, index) => call('saveCache', parserVersion, index),
  logTimings: async () => {}, // the desktop app logs these for the benchmarks; the browser has the console
  readBatch: (paths) => call('readBatch', paths),
  docsFromCommandLine: () => call('docsFromCommandLine'),
  onDocsChanged: (handler) => {
    const es = new EventSource('/api/events')
    let opened = false
    es.addEventListener('docs:changed', (e) => handler(JSON.parse((e as MessageEvent<string>).data) as ChangeSet))
    // EventSource reconnects by itself. Anything that changed in the gap was never sent, so diff
    // against the server's stamps (a scan) and deliver that as one change set.
    es.addEventListener('open', () => {
      if (opened) {
        void call<{ changed: string[]; removed: string[] }>('scan')
          .then((r) => handler({ changed: r.changed, removed: r.removed, rescan: true }))
          .catch(() => {})
      }
      opened = true
    })
    return () => es.close()
  },

  // The RAM readout measures the desktop process; it is not shown in the browser.
  setMemoryEnabled: async () => {},
  onMemory: () => () => {},
  onBench: () => () => {},
}
