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
/** `sections`: which of the pane's three cards are open (kept across sessions in the store). */
export type WorkbenchUi = { itemsOpen: boolean; adding?: boolean; sections?: { tasks: boolean; files: boolean; deck: boolean } }

/* The Flightdeck card (adapted from claude-flightdeck, MIT, Stephen Casella) */
export type DeckMoment = 'before a plan' | 'error repeats' | 'before done'
export type DeckBucket = 'file' | 'shell' | 'other'
/** rule: settings allowed it. ask: put to the decider, outcome pending. cleared: asked, then ran. deny: refused. */
export type DeckVerdict = 'rule' | 'ask' | 'cleared' | 'deny'
export type DeckMain = { model: string; effort: string; mode: string; steps: number; isRunning: boolean }
export type DeckUsage = {
  pct: number | null
  tokens: number | null
  window: number
  costUsd: number | null
  limits: { kind: string; pct: number }[]
  compactions: number
  lastCompactAt: number | null
}
export type DeckConsult = { id: string; at: number; endAt: number | null; moment: DeckMoment; via: string }
export type DeckArchitect = { consults: DeckConsult[]; ids: string[]; seen: string[]; lastAdvice: string }
export type DeckCheck = { id: string; tool: string; bucket: DeckBucket; verdict: DeckVerdict; inSubagent: boolean; detail: string; at: number }
export type DeckTally = { rule: number; ask: number; cleared: number; deny: number }
export type DeckGate = { recent: DeckCheck[]; totals: Record<DeckBucket, DeckTally> }
export type DeckToolNote = { tool: string; text: string; isError: boolean }
export type DeckAgent = {
  id: string
  type: string
  model: string
  description: string
  status: string
  spawnedAt: number
  endedAt: number | null
  /** The agent's context now: input + cache read + cache write of its latest step. */
  ctx: number
  /** Output tokens summed over its steps. */
  out: number
  steps: number
  lastStop: string | null
  tools: DeckToolNote[]
  answer: string
}
/** A model loop whose id matches no card: a workflow agent, a compaction or a memory fork. */
export type DeckLoop = { id: string; steps: number; firstAt: number; lastAt: number; isDone: boolean }
export type DeckLogLine = { at: number; who: string; text: string; agentId: string | null; kind: 'info' | 'error' | 'consult' | 'done' }
export type DeckTurn = { edits: number; errorStreak: number; errors: number; isReviewing: boolean; startedAt: number; costAtStart: number | null }
export type DeckReceipt = { durationMs: number; agents: number; edits: number; errors: number; costDelta: number | null; reason: string }
export type DeckView = { expanded: string | null; gateOpen: DeckBucket | null }
export type DeckRoster = { architectTypes: string[] }

declare module 'claude-code' {
  interface PluginState {
    workbench: {
      snap: Snap
      ui: PaneUi
      files: Files
      git: Git
      touched: Touch[]
      activity: Activity
      bench: WorkbenchUi
      deckMain: DeckMain
      deckUsage: DeckUsage
      deckArchitect: DeckArchitect
      deckGate: DeckGate
      deckAgents: DeckAgent[]
      deckLoops: DeckLoop[]
      deckLog: DeckLogLine[]
      deckTurn: DeckTurn
      deckReceipt: DeckReceipt | null
      deckView: DeckView
      deckRoster: DeckRoster
    }
  }
}
