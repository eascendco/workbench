import type { Entry, Touch } from '../types'

/* ── colors from the active /skin ── */

export type Slot = 'read' | 'write' | 'run' | 'search' | 'user' | 'fg' | 'muted' | 'surface' | 'ok' | 'err' | 'warn'
export type Palette = Record<Slot, string>

// The built-in skins' dark palettes, as the skins mod ships them (hooks/themes).
const SKINS: Record<string, Palette> = {
  noir: { read: '#ededed', write: '#ededed', run: '#ededed', search: '#ededed', user: '#f5f5f5', fg: '#ededed', muted: '#8c8c8c', surface: '#151515', ok: '#ededed', err: '#f87171', warn: '#a3a3a3' },
  'tokyo-night': { read: '#7dcfff', write: '#ff9e64', run: '#e0af68', search: '#bb9af7', user: '#7aa2f7', fg: '#c0caf5', muted: '#737aa2', surface: '#1f2335', ok: '#9ece6a', err: '#f7768e', warn: '#e0af68' },
  dracula: { read: '#8be9fd', write: '#ffb86c', run: '#f1fa8c', search: '#bd93f9', user: '#bd93f9', fg: '#f8f8f2', muted: '#6272a4', surface: '#2b2d3a', ok: '#50fa7b', err: '#ff5555', warn: '#f1fa8c' },
  nord: { read: '#8fbcbb', write: '#d08770', run: '#ebcb8b', search: '#b48ead', user: '#88c0d0', fg: '#e5e9f0', muted: '#7b88a1', surface: '#3b4252', ok: '#a3be8c', err: '#bf616a', warn: '#ebcb8b' },
  gruvbox: { read: '#83a598', write: '#fe8019', run: '#b8bb26', search: '#d3869b', user: '#fabd2f', fg: '#ebdbb2', muted: '#928374', surface: '#32302f', ok: '#b8bb26', err: '#fb4934', warn: '#fe8019' },
  catppuccin: { read: '#89dceb', write: '#fab387', run: '#f9e2af', search: '#cba6f7', user: '#cba6f7', fg: '#cdd6f4', muted: '#7f849c', surface: '#252536', ok: '#a6e3a1', err: '#f38ba8', warn: '#f9e2af' },
  mono: { read: '#9e9e9e', write: '#e0e0e0', run: '#bdbdbd', search: '#9e9e9e', user: '#e0e0e0', fg: '#e0e0e0', muted: '#7a7a7a', surface: '#262626', ok: '#e0e0e0', err: '#ffffff', warn: '#bdbdbd' },
}
const NOIR_LIGHT: Palette = { read: '#111111', write: '#111111', run: '#111111', search: '#111111', user: '#111111', fg: '#151515', muted: '#6b6b6b', surface: '#ffffff', ok: '#151515', err: '#c42b2b', warn: '#6b6b6b' }

/** No skin on: the screenshot's colors, text left to the theme. */
export const PLAIN: Palette & { themed: false } = { read: '#c084fc', write: '#fb923c', run: '#e9c46a', search: '#c084fc', user: '#c084fc', fg: '', muted: '', surface: '', ok: '#4ade80', err: '#f87171', warn: '#e9c46a', themed: false }

const deepen = (hex: string, amount: number) =>
  '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)).toString(16).padStart(2, '0')).join('')

/** The skins mod's own light derivation (hooks/light.ts). */
function toLight(p: Palette): Palette {
  const d = (h: string) => deepen(h, 0.45)
  return { read: d(p.read), write: d(p.write), run: d(p.run), search: d(p.search), user: d(p.user), fg: '#1f1f1f', muted: '#6b6b6b', surface: '#ffffff', ok: deepen(p.ok, 0.5), err: deepen(p.err, 0.25), warn: deepen(p.warn, 0.5) }
}

export type SkinPrefs = { skin?: string } | undefined
export type SkinCustom = Record<string, { base?: string; palette?: Partial<Record<string, string>> }> | undefined

/** The palette of the skin /skin has on, light or dark; PLAIN when skins is off or absent. */
export function paletteOf(prefs: SkinPrefs, custom: SkinCustom, isLight: boolean | undefined): Palette & { themed: boolean } {
  const name = prefs?.skin
  if (!name || name === 'off') return PLAIN
  const made = custom?.[name]
  const baseName = made ? (made.base ?? 'noir') : name
  const base = SKINS[baseName]
  if (!base) return PLAIN
  const dark = { ...base, ...(made?.palette as Partial<Palette> | undefined) }
  const p = isLight ? (baseName === 'noir' && !made ? NOIR_LIGHT : toLight(dark)) : dark
  return { ...p, themed: true }
}

/** Work item stages as skin slots. */
export const STAGE_SLOT: Record<string, Slot> = { spec: 'search', design: 'user', build: 'write', track: 'read', test: 'run', ship: 'ok' }

/* ── paths ── */

export const parentOf = (p: string) => (p.lastIndexOf('/') > 0 ? p.slice(0, p.lastIndexOf('/')) : '/')
export const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)
export const join = (a: string, b: string) => (a.endsWith('/') ? a + b : `${a}/${b}`)
export const absOf = (p: string, cwd: string) => (p.startsWith('/') ? p : join(cwd, p.replace(/^\.\//, '')))
/** `dir` relative to `root`, for "in tests"; the project name at the root itself. */
export function relDir(path: string, root: string) {
  const dir = parentOf(path)
  if (dir === root) return baseOf(root)
  return dir.startsWith(root + '/') ? dir.slice(root.length + 1) : dir
}
/* ── git ── */

/** Absolute paths of changed and untracked files, from `git status --porcelain=v1 -z`. */
export function parseStatus(out: string, top: string): string[] {
  const parts = out.split('\0')
  const dirty: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]
    if (!rec || rec.length < 4) continue
    dirty.push(join(top, rec.slice(3).replace(/\/$/, '')))
    if (rec[0] === 'R' || rec[0] === 'C') i++ // the old path follows a rename or copy
  }
  return dirty
}

export const isDirty = (path: string, dirty: readonly string[]) => dirty.some(d => d === path || d.startsWith(path + '/'))

/* ── tree ── */

export type Row = { path: string; name: string; depth: number; dir: boolean; size: number; open: boolean }

/** The visible rows: each loaded, expanded folder's entries below it, folders first. */
export function rowsOf(root: string, dirs: Record<string, Entry[]>, expanded: readonly string[], showHidden: boolean, max = 400): Row[] {
  const rows: Row[] = []
  const open = new Set(expanded)
  const walk = (dir: string, depth: number) => {
    for (const en of sortEntries(dirs[dir] ?? [], showHidden)) {
      if (rows.length >= max) return
      const path = join(dir, en.name)
      const isOpen = en.dir && open.has(path)
      rows.push({ path, name: en.name, depth, dir: en.dir, size: en.size, open: isOpen })
      if (isOpen) walk(path, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

export function sortEntries(list: readonly Entry[], showHidden: boolean): Entry[] {
  return list
    .filter(e => e.name !== '.DS_Store' && (showHidden || !e.name.startsWith('.')))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
}

/** Up to `max` relative paths whose name or path holds every word of `query`. */
export function search(all: readonly string[], query: string, showHidden: boolean, max = 30): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits: string[] = []
  for (const p of all) {
    if (!showHidden && p.split('/').some(s => s.startsWith('.'))) continue
    const l = p.toLowerCase()
    if (words.every(w => l.includes(w))) hits.push(p)
    if (hits.length >= max) break
  }
  return hits.sort((a, b) => a.length - b.length)
}

/** Every folder from `root` down to the one holding `path`, to reveal it. */
export function foldersTo(path: string, root: string): string[] {
  const out: string[] = []
  let d = parentOf(path)
  while (d.startsWith(root + '/')) {
    out.unshift(d)
    d = parentOf(d)
  }
  return out
}

export function humanSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/* ── Claude's activity ── */

/** Records a touch: the newest first, one row per file, an edit outranking a read. */
export function addTouch(list: readonly Touch[], t: Touch, max = 50): Touch[] {
  const old = list.find(x => x.path === t.path)
  const kind = old?.kind === 'edited' && t.kind === 'read' && !t.active ? 'edited' : t.kind
  return [{ ...t, kind }, ...list.filter(x => x.path !== t.path)].slice(0, max)
}

export const badge = (t: Touch) => (t.active ? (t.kind === 'read' ? 'Reading' : 'Editing') : t.kind === 'read' ? 'Read' : 'Edited')

/** Tools whose target is one file, and whether they write it. */
export const FILE_TOOLS: Record<string, 'read' | 'edited'> = { Read: 'read', Edit: 'edited', Write: 'edited', MultiEdit: 'edited', NotebookEdit: 'edited' }
/** "ts" for "a/b.test.ts"; "" for a name with no dot. */
export const extOf = (p: string) => {
  const name = baseOf(p)
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1) : ''
}
