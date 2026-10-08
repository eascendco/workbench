import type { DevEntry, Group, Snap, WorkItem } from '../types'
import { STAGES, withStages } from './logic'

/* Plan files: one markdown file per task, in `plans/` at the project's root (the folder name is a setting).
 * The file is the only home of a task and its work items: edit it by hand, with /task, or let Claude use the tool. */

export const PLANS_DIR = 'plans'

/** A folder name for `plans_dir`: one plain segment, else the default. */
export const plansDirName = (v: unknown) => (typeof v === 'string' && /^[\w.-]+$/.test(v.trim()) && !/^\.+$/.test(v.trim()) ? v.trim() : PLANS_DIR)

export type PlanFront = {
  task: string
  project: string
  short: string
  title: string
  date: string
  end: string
  size?: string
  status: 'open' | 'done'
}
export type Plan = PlanFront & { file: string; items: WorkItem[]; text: string }

const MARK: Record<WorkItem['status'], string> = { todo: ' ', doing: '~', done: 'x', draft: '?' }
const FROM_MARK: Record<string, WorkItem['status']> = { ' ': 'todo', '~': 'doing', x: 'done', X: 'done', '?': 'draft' }
const ITEMS_HEAD = '## Work items'

const yamlValue = (v: string) => (/^[\w./-]+$/.test(v) ? v : JSON.stringify(v))

function readFront(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  const out: Record<string, string> = {}
  if (!m) return out
  for (const line of m[1]!.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (!kv) continue
    const raw = kv[2]!.trim()
    try {
      out[kv[1]!] = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw
    } catch {
      out[kv[1]!] = raw
    }
  }
  return out
}

function writeFront(f: PlanFront) {
  const keys: (keyof PlanFront)[] = ['task', 'project', 'short', 'title', 'date', 'end', 'size', 'status']
  return ['---', ...keys.filter(k => f[k] !== undefined && f[k] !== '').map(k => `${k}: ${yamlValue(String(f[k]))}`), '---'].join('\n')
}

/** The work items under `## Work items`: `- [ ] Title \`stage\`` with indented detail lines. */
export function parseItems(text: string, key: string): WorkItem[] {
  const start = text.indexOf(ITEMS_HEAD)
  if (start < 0) return []
  const rest = text.slice(start + ITEMS_HEAD.length)
  const stop = rest.search(/\n## /)
  const block = stop < 0 ? rest : rest.slice(0, stop)
  const items: WorkItem[] = []
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*[-*] \[( |x|X|~|\?)\]\s+(.+?)\s*$/)
    if (m) {
      let title = m[2]!
      let stage = 'build'
      const st = title.match(/\s*`(\w+)`\s*$/)
      if (st && STAGES.includes(st[1]!.toLowerCase())) {
        stage = st[1]!.toLowerCase()
        title = title.slice(0, st.index).trim()
      }
      items.push({ id: `${key}-${items.length + 1}`, title, stage, status: FROM_MARK[m[1]!] ?? 'todo' })
      continue
    }
    const last = items[items.length - 1]
    const detail = line.match(/^\s{2,}(\S.*)$/)
    if (last && detail) last.details = last.details ? `${last.details} ${detail[1]!.trim()}` : detail[1]!.trim()
  }
  return items
}

export function renderItems(items: WorkItem[]) {
  return items.map(i => `- [${MARK[i.status]}] ${i.title} \`${i.stage}\`${i.details ? `\n  ${i.details}` : ''}`).join('\n')
}

/** Replaces the work items block, keeping everything else in the file as written. */
export function setItems(text: string, items: WorkItem[]) {
  const body = renderItems(items)
  const start = text.indexOf(ITEMS_HEAD)
  if (start < 0) return text.replace(/\s*$/, '') + `\n\n${ITEMS_HEAD}\n\n${body}\n`
  const after = start + ITEMS_HEAD.length
  const rest = text.slice(after)
  const stop = rest.search(/\n## /)
  return text.slice(0, after) + '\n\n' + (body ? body + '\n' : '') + (stop < 0 ? '' : rest.slice(stop))
}

/** Rewrites the header fields, keeping the body. */
export function setFront(text: string, f: PlanFront) {
  const m = text.match(/^---\n[\s\S]*?\n---\n?/)
  return writeFront(f) + '\n' + (m ? text.slice(m[0].length) : '\n' + text)
}

export function parsePlan(text: string, file: string): Plan | undefined {
  const f = readFront(text)
  if (!f.task || !f.title || !f.date) return undefined
  return {
    file,
    text,
    task: f.task,
    project: f.project ?? '',
    short: f.short ?? f.project ?? '',
    title: f.title,
    date: f.date,
    end: f.end || f.date,
    size: f.size || undefined,
    status: f.status === 'done' ? 'done' : 'open',
    items: parseItems(text, f.task),
  }
}

/** Lowercase words joined by hyphens, whole words only, up to 40 characters. */
function slug(s: string) {
  let out = ''
  for (const w of s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (out && out.length + 1 + w.length > 40) break
    out = out ? `${out}-${w}` : w.slice(0, 40)
  }
  return out
}
/** A key for a new task: its title's slug, cut short, made unique among `taken`. */
export function newTaskKey(title: string, taken: readonly string[]) {
  const base = slug(title).split('-').slice(0, 4).join('-') || 'task'
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`
  return key
}

export function newPlanText(f: PlanFront, items: WorkItem[], notes?: string) {
  return [
    writeFront(f),
    '',
    `# ${f.title}`,
    '',
    `${ITEMS_HEAD}`,
    '',
    ...(items.length ? [renderItems(items)] : []),
    ...(notes?.trim() ? ['', '## Notes', '', notes.trim()] : []),
    '',
  ].join('\n')
}

/** A plan's work items with the stages they use. */
export const devEntryOf = (p: Plan): DevEntry => withStages({ stages: [], items: p.items })

/** Every item approved and done: the task counts as finished. */
export const allDone = (items: WorkItem[]) => items.length > 0 && items.every(i => i.status === 'done')

/** A plan as the band and pane draw a task. */
export function groupOf(p: Plan): Group & { file: string } {
  const entry = devEntryOf(p)
  return {
    key: p.task,
    title: p.title,
    project: p.project,
    short: p.short,
    size: p.size,
    start: p.date,
    end: p.end,
    open: p.status !== 'done',
    parts: [],
    stages: entry.stages,
    items: p.items,
    file: p.file,
  }
}

/** Current task: the earliest open plan by date; then Up next and recently done. */
export function snapshotOfPlans(plans: Plan[], folder: string): Snap {
  if (!plans.length) return { status: 'none', shorts: [], prev: [], next: [], folder }
  const byDate = [...plans].sort((a, b) => a.date.localeCompare(b.date) || a.task.localeCompare(b.task))
  const open = byDate.filter(p => p.status !== 'done').map(groupOf)
  const done = byDate.filter(p => p.status === 'done').sort((a, b) => a.end.localeCompare(b.end)).map(groupOf)
  const shorts = [...new Set(plans.map(p => p.short).filter(Boolean))]
  return { status: 'ready', folder, shorts, cur: open[0], next: open.slice(1, 5), prev: done.slice(-3) }
}
