// Thin wrapper over the backend. Components import from here, never from a backend or the
// generated bindings, so the rest of the app can be tested with a fake. The backend itself
// (the Wails exe, or the Node server in web mode) is picked in one place: lib/backend.ts.
import { backend, isWeb } from './backend'
import type { ClearDataResult, EvidenceList, EvidenceRoot, TooLargeFile } from './backend-types'
import type {
  ChangeSet,
  ScanResult,
  SourceFile,
} from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs'
import type {
  ConfigPatch,
  RootCheck,
} from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell'
import type { Settings } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings'

export type { ChangeSet, ClearDataResult, ConfigPatch, RootCheck, ScanResult, SourceFile, TooLargeFile }
export type Config = Settings
export type Theme = 'system' | 'light' | 'dark'

/** True in the browser build (web mode): no native dialogs, no window, no RAM readout. */
export { isWeb }

/** Files per ReadBatch call: one IPC round trip per chunk. */
const BATCH_SIZE = 100

// ---- shell ----------------------------------------------------------------

export const getConfig = (): Promise<Config> => backend.getConfig()
export const setConfig = (patch: ConfigPatch): Promise<Config> => backend.setConfig(patch)
/** UI state, saved once when a resize ends. Returns the width Go stored (clamped). */
export const setSidebarWidth = (width: number): Promise<number> => backend.setSidebarWidth(width)
/** UI state, saved once when a panel resize ends. Returns the width Go stored (clamped). */
export const setPanelWidth = (width: number): Promise<number> => backend.setPanelWidth(width)
/** UI state, saved when the tree is hidden or shown. */
export const setSidebarCollapsed = (collapsed: boolean): Promise<boolean> => backend.setSidebarCollapsed(collapsed)
export const pickFolder = (): Promise<string> => backend.pickFolder()
export const checkRoot = (abs: string): Promise<RootCheck> => backend.checkRoot(abs)
export const checkDocs = (repoRoot: string, docsDir: string, roots: string[]): Promise<RootCheck> =>
  backend.checkDocs(repoRoot, docsDir, roots)
export const openExternal = (url: string): Promise<void> => backend.openExternal(url)
export const openSettingsFile = (): Promise<void> => backend.openSettingsFile()
export const openInVSCode = (path: string, line = 0): Promise<void> => backend.openInVSCode(path, line)

// ---- docs -----------------------------------------------------------------

export const scan = (): Promise<ScanResult> => backend.scan()
/** Forgets what was delivered and lists every file as changed (after a root change). */
export const rescan = (): Promise<ScanResult> => backend.rescan()
export const readFile = (path: string): Promise<string> => backend.readFile(path)
/** The cached index (parsed JSON), or null on a cold start. Also loads Go's stamps. */
export const loadCache = (parserVersion: string): Promise<unknown> => backend.loadCache(parserVersion)
/** Writes the index through Go, which adds its stamps and saves atomically. */
export const saveCache = (parserVersion: string, index: unknown): Promise<void> => backend.saveCache(parserVersion, index)
/** Writes a timing line to the Go log. */
export const logTimings = (line: string): Promise<void> => backend.logTimings(line)
/** One ReadBatch call. The caller keeps batches to BATCH_SIZE paths. */
export const readBatch = async (
  paths: string[],
): Promise<{ files: SourceFile[]; missing: string[]; failed: string[]; tooLarge: TooLargeFile[] }> => {
  const res = await backend.readBatch(paths)
  return { files: res.files ?? [], missing: res.missing ?? [], failed: res.failed ?? [], tooLarge: res.tooLarge ?? [] }
}

/** Reads the paths in chunks. Files deleted since the scan come back in `missing`. */
export async function readAll(paths: string[]): Promise<{ files: SourceFile[]; missing: string[] }> {
  const files: SourceFile[] = []
  const missing: string[] = []
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const res = await backend.readBatch(paths.slice(i, i + BATCH_SIZE))
    files.push(...(res.files ?? []))
    missing.push(...(res.missing ?? []))
  }
  return { files, missing }
}

/** Web mode: the folder from --docs, which wins over the saved one for this session; null otherwise. */
export const docsFromCommandLine = (): Promise<string | null> => backend.docsFromCommandLine()

/** The evidence root in effect (ticket 39). */
export const getEvidence = (): Promise<EvidenceRoot> => backend.getEvidence()
/** Saves the evidence root ("" clears it); --evidence still wins for this run. */
export const setEvidence = (path: string): Promise<EvidenceRoot> => backend.setEvidence(path)
/** A ticket's evidence files and whether each is served. */
export const evidenceFiles = (ticketPath: string): Promise<EvidenceList> => backend.evidenceFiles(ticketPath)
/** The file names that can be a folder's map, in order of precedence (ticket 47). */
export const getMapFiles = (): Promise<string[]> => backend.getMapFiles()
/** Saves the map file names; resolves to the list now in effect. */
export const setMapFiles = (names: string[]): Promise<string[]> => backend.setMapFiles(names)
/** The URL the browser loads an evidence file from: by ticket and index, never by path. */
export const evidenceUrl = (ticketPath: string, index: number): string =>
  `/evidence/${ticketPath.split('/').map(encodeURIComponent).join('/')}/${index}`

/** Subscribes to the debounced `docs:changed` event. Returns an unsubscribe function. */
export const onDocsChanged = (handler: (cs: ChangeSet) => void, onState?: (connected: boolean) => void): (() => void) =>
  backend.onDocsChanged(handler, onState)

/**
 * "Clear data" (ticket 18): deletes the index cache now. On the desktop it also schedules the WebView2
 * profile for deletion at the next start (a running WebView2 locks it). settings.json stays.
 */
export const clearData = (): Promise<ClearDataResult> => backend.clearData()

// ---- memory readout (Go measures, see internal/mem; desktop only) ------------

/** Switches Go's polling on or off (the showMemory setting). On, Go emits the current total at once. */
export const setMemoryEnabled = (on: boolean): Promise<void> => backend.setMemoryEnabled(on)

/** Subscribes to `mem:changed`: the total private bytes, emitted only when it moved by 1 MB or more. */
export const onMemory = (handler: (bytes: number) => void): (() => void) => backend.onMemory(handler)

/**
 * The bench hook (ticket 15, internal/shell/bench.go): Go emits these only when the exe was started
 * with FOLIO_BENCH=1. The handler gets a docs-relative path and decides whether to use it.
 */
export const onBench = (handler: (kind: 'open' | 'panel', path: string) => void): (() => void) => backend.onBench(handler)
