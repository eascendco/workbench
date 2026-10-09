import type { DevEntry, WorkItem } from '../types'

export const STAGES = ['spec', 'design', 'build', 'track', 'test', 'ship']

export const counts = (items: WorkItem[]) => {
  const real = items.filter(i => i.status !== 'draft')
  return { done: real.filter(i => i.status === 'done').length, total: real.length, drafts: items.length - real.length }
}

export const nextStatus = (s: WorkItem['status']): WorkItem['status'] =>
  ({ draft: 'todo', todo: 'doing', doing: 'done', done: 'todo' } as const)[s]

export const newId = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Keeps stages in canonical order and adds any the items use. */
export function withStages(entry: DevEntry, extra: string[] = []): DevEntry {
  const want = new Set([...entry.stages, ...extra, ...entry.items.map(i => i.stage)])
  return { ...entry, stages: STAGES.filter(s => want.has(s)) }
}

/** `/task add build: Create monorepo -- pnpm workspaces` gives stage, title and optional details. */
export function parseAdd(text: string, fallback: string): { stage: string; title: string; details?: string } {
  const m = text.match(/^\s*(\w+)\s*:\s*(.+)$/)
  const st = m?.[1]?.toLowerCase()
  const isStage = !!(m && st && STAGES.includes(st))
  const stage = isStage ? st! : fallback
  const body = (isStage ? m![2] ?? '' : text).trim()
  const [title = '', ...rest] = body.split(/\s+(?:—|--)\s+/)
  const details = rest.join(' -- ').trim()
  return details ? { stage, title: title.trim(), details } : { stage, title: title.trim() }
}

/** Titles are labels, not sentences: the tool refuses longer ones. */
export const TITLE_MAX = 40

/** The item the pane details and the band names: the one picked, else in progress, else the next to do. */
export function activeItem(items: WorkItem[], selected?: string): WorkItem | undefined {
  return (
    items.find(i => i.id === selected) ??
    items.find(i => i.status === 'doing') ??
    items.find(i => i.status === 'todo') ??
    items.find(i => i.status === 'draft')
  )
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd() + '…' : s)

export const byStatus = (items: WorkItem[]) => {
  const n = { draft: 0, todo: 0, doing: 0, done: 0 }
  for (const i of items) n[i.status]++
  return n
}

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// macOS writes AppleInterfaceStyle = Dark in dark mode and removes the key in light mode.
// A themed variant keeps its suffix: dark-daltonized becomes light-daltonized.
export function themeFor(current: unknown, stdout: string): string {
  const want = stdout.includes('Dark') ? 'dark' : 'light'
  const variant = typeof current === 'string' ? /^(?:light|dark)(-.+)$/.exec(current)?.[1] : undefined

  return want + (variant ?? '')
}
