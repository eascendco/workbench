export type ItemStatus = 'draft' | 'todo' | 'doing' | 'done'
/** `title` is a short label (a few words); anything longer goes in `details`. */
export type WorkItem = { id: string; title: string; stage: string; status: ItemStatus; details?: string }
export type DevEntry = { stages: string[]; items: WorkItem[] }
export type Part = { id: string; date: string; status: string }
export type Group = {
  key: string
  title: string
  project: string
  short: string
  size?: string
  start: string
  end: string
  open: boolean
  parts: Part[]
  stages: string[]
  items: WorkItem[]
  /** The plan file this task's work items live in. */
  file?: string
}
export type Snap = {
  status: 'idle' | 'loading' | 'ready' | 'none' | 'error'
  message?: string
  folder?: string
  shorts: string[]
  cur?: Group
  prev: Group[]
  next: Group[]
  version?: number
}
export type PaneUi = { showPrev: boolean; stage?: string; paneOpen?: boolean; selected?: string }

/* The Workbench pane */
/** One file Claude read or edited this session; `active` while the tool runs. */
export type Touch = { path: string; kind: 'read' | 'edited'; active: boolean; at: number }
/** What Claude did last in the turn under way: `busy` from the prompt to the end of the turn; `kind` the last file read or edit, command or search. */
export type Activity = { busy: boolean; kind?: 'read' | 'edited' | 'run' | 'search'; label?: string; path?: string }
/** One directory entry as the tree shows it. */
export type Entry = { name: string; dir: boolean; size: number }
export type Files = {
  /** The folder the tree shows, absolute. */
  root: string
  /** The session's folder, where "Back to project" returns. */
  project: string
  expanded: string[]
  dirs: Record<string, Entry[]>
  showSizes: boolean
  showHidden: boolean
  query: string
  /** Every file under root, relative, read once a search starts. */
  all: string[]
}
export type Git = { isRepo: boolean; branch: string; top: string; dirty: string[] }
export type WorkbenchUi = { itemsOpen: boolean; adding?: boolean }

declare module 'claude-code' {
  interface PluginState {
    workbench: { snap: Snap; ui: PaneUi; files: Files; git: Git; touched: Touch[]; activity: Activity; bench: WorkbenchUi }
  }
}
