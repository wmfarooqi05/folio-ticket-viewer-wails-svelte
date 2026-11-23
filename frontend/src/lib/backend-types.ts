// What a backend offers. Two implementations: backend-wails.ts (the desktop exe) and
// backend-http.ts (web mode, a Node server). api.ts picks one in a single place.
import type { ChangeSet, ScanResult, SourceFile } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs'
import type { ConfigPatch, RootCheck } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell'
import type { Settings } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings'

/** A .md that ReadBatch skipped because it is over the per-file cap (ticket 18, L6). */
export interface TooLargeFile {
  path: string
  /** bytes */
  size: number
}

/** The evidence root (ticket 39): --evidence for this run, else the one saved in Settings, else "". */
export interface EvidenceRoot {
  root: string
  fromCommandLine: boolean
  /** a folder that exists now */
  reachable: boolean
}

export type EvidenceRefusal = 'root not set' | 'not reachable' | 'type not served' | 'outside the root' | 'missing' | 'no such file'

/** One file a ticket's board block lists, and whether Folio serves it (and why not). */
export interface EvidenceEntry {
  index: number
  name: string
  kind: 'image' | 'video' | 'scenarios' | 'write-up' | 'file'
  served: boolean
  reason?: EvidenceRefusal
  size?: number
}

export interface EvidenceList {
  root: string
  folder: string | null
  reachable: boolean
  files: EvidenceEntry[]
}

export interface BatchResult {
  files?: SourceFile[] | null
  missing?: string[] | null
  failed?: string[] | null
  tooLarge?: TooLargeFile[] | null
}

/** What "Clear data" did (ticket 18, L5). */
export interface ClearDataResult {
  cacheDir: string
  cacheDeleted: boolean
  /** desktop: the WebView2 profile is deleted at the next start, because a running WebView2 locks it */
  profileScheduled: boolean
  profileDirs: string[]
}

export interface Backend {
  getConfig(): Promise<Settings>
  setConfig(patch: ConfigPatch): Promise<Settings>
  setSidebarWidth(width: number): Promise<number>
  setPanelWidth(width: number): Promise<number>
  setSidebarCollapsed(collapsed: boolean): Promise<boolean>
  pickFolder(): Promise<string>
  checkRoot(abs: string): Promise<RootCheck>
  checkDocs(repoRoot: string, docsDir: string, roots: string[]): Promise<RootCheck>
  openExternal(url: string): Promise<void>
  openSettingsFile(): Promise<void>
  openInVSCode(path: string, line: number): Promise<void>

  scan(): Promise<ScanResult>
  rescan(): Promise<ScanResult>
  readFile(path: string): Promise<string>
  loadCache(parserVersion: string): Promise<unknown>
  saveCache(parserVersion: string, index: unknown): Promise<void>
  logTimings(line: string): Promise<void>
  readBatch(paths: string[]): Promise<BatchResult>
  /** Web mode: the folder given with --docs (it wins over the saved one this session), or null. */
  docsFromCommandLine(): Promise<string | null>
  /** Web mode only (ticket 39). The desktop app has no evidence support: its stubs say "not set". */
  getEvidence(): Promise<EvidenceRoot>
  setEvidence(path: string): Promise<EvidenceRoot>
  evidenceFiles(ticketPath: string): Promise<EvidenceList>
  /** Web mode only (ticket 47): the file names that can be a folder's map, in order. The desktop app keeps the default. */
  getMapFiles(): Promise<string[]>
  setMapFiles(names: string[]): Promise<string[]>
  /** `onState`: web mode reports whether the event stream is connected (ticket 41's "Mirror live") */
  onDocsChanged(handler: (cs: ChangeSet) => void, onState?: (connected: boolean) => void): () => void

  /** Deletes the index cache now; on the desktop also schedules the WebView2 profile for the next start. */
  clearData(): Promise<ClearDataResult>

  setMemoryEnabled(on: boolean): Promise<void>
  onMemory(handler: (bytes: number) => void): () => void
  onBench(handler: (kind: 'open' | 'panel', path: string) => void): () => void
}
