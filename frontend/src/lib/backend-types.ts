// What a backend offers. Two implementations: backend-wails.ts (the desktop exe) and
// backend-http.ts (web mode, a Node server). api.ts picks one in a single place.
import type { ChangeSet, ScanResult, SourceFile } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/docs'
import type { ConfigPatch, RootCheck } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/shell'
import type { Settings } from '../../bindings/github.com/wmfarooqi05/folio-ticket-viewer-wails-svelte/internal/settings'

export interface BatchResult {
  files?: SourceFile[] | null
  missing?: string[] | null
  failed?: string[] | null
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
  onDocsChanged(handler: (cs: ChangeSet) => void): () => void

  setMemoryEnabled(on: boolean): Promise<void>
  onMemory(handler: (bytes: number) => void): () => void
  onBench(handler: (kind: 'open' | 'panel', path: string) => void): () => void
}
