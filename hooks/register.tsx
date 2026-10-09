import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, Register } from 'claude-code'

import type { DevEntry, Entry, Files, Git, Group, PaneUi, Snap, Touch, WorkbenchUi, WorkItem } from '../types'
import type { BarIn } from './draw'
import { ACCENT, bandBarSvg, bandTitleSvg, DOING, DONE, MUTED, STAGE_COLOR } from './draw'
import { activeItem, byStatus, clip, counts, localDate, newId, nextStatus, parseAdd, STAGES, TITLE_MAX, withStages } from './logic'
import type { Plan, PlanFront } from './plans'
import { allDone, devEntryOf, newPlanText, newTaskKey, parsePlan, plansDirName, setFront, setItems, snapshotOfPlans } from './plans'
import {
  absOf, addTouch, badge, baseOf, extOf, FILE_TOOLS, foldersTo, humanSize, isDirty, join,
  inkOf, paletteOf, parentOf, parseStatus, relDir, rowsOf, search, THEME_KEY,
} from './bench'
import type { SkinCustom, SkinPrefs, Slot } from './bench'
import { caps, fileTag, hero, icon, pill, rule } from './icons'
import type { IconName, Ink } from './icons'

const TOOL = 'work_items'
const TOOL_FULL = 'mcp__workbench__work_items'
/** Item and task titles in lists are cut here. */
const ROW_CHARS = 30

const snapAtom = atom({ plugin: 'workbench', key: 'snap' } as const, { status: 'idle', shorts: [], prev: [], next: [] } as Snap)
const uiAtom = atom({ plugin: 'workbench', key: 'ui' } as const, { showPrev: false } as PaneUi)

type $ = EngineInterface

/* ── the Workbench: the side pane (task box and file box) ── */

const PANE = 'workbench'
const TITLE = 'Workbench'

const filesAtom = atom({ plugin: 'workbench', key: 'files' } as const, {
  root: '', project: '', expanded: [], dirs: {}, showSizes: false, showHidden: false, query: '', all: [],
} as Files)
const gitAtom = atom({ plugin: 'workbench', key: 'git' } as const, { isRepo: false, branch: '', top: '', dirty: [] } as Git)
const touchedAtom = atom({ plugin: 'workbench', key: 'touched' } as const, [] as Touch[])
const benchAtom = atom({ plugin: 'workbench', key: 'bench' } as const, { itemsOpen: true } as WorkbenchUi)

// The skin /skin has on. Skins is optional (not a dependency): its refs are cast because its
// contract is not laid here, and with it off the pane uses its own colors.
const SKIN_PREFS = { plugin: 'skins', key: 'prefs' } as const
const SKIN_CUSTOM = { plugin: 'skins', key: 'custom' } as const
const SKIN_LIGHT = { plugin: 'skins', key: 'isLight' } as const

const quiet = <T,>(p: Promise<T>) => p.catch(() => undefined)

/* ── files ── */

async function listDir($: $, dir: string): Promise<Entry[]> {
  const list = await $.fs.list(dir)
  const out: Entry[] = []
  for (const x of list) {
    let isDir = x.kind === 'dir'
    if (x.isLink) isDir = (await quiet($.fs.stat(join(dir, x.name))))?.kind === 'dir'
    out.push({ name: x.name, dir: isDir, size: x.size })
  }
  return out
}

async function loadDirs($: $, dirs: readonly string[]) {
  const got: Record<string, Entry[]> = {}
  for (const d of dirs) got[d] = (await quiet(listDir($, d))) ?? []
  await update($, filesAtom, f => ({ ...f, dirs: { ...f.dirs, ...got } }))
}

async function setRoot($: $, root: string) {
  await update($, filesAtom, f => ({ ...f, root, expanded: [], dirs: {}, query: '', all: [] }))
  await loadDirs($, [root])
  await refreshGit($)
}

async function refreshFiles($: $) {
  const f = await read($, filesAtom)
  await update($, filesAtom, x => ({ ...x, dirs: {}, all: [] }))
  await loadDirs($, [f.root, ...f.expanded])
  if (f.query) await loadAll($)
  await refreshGit($)
}

async function toggleDir($: $, path: string) {
  const f = await read($, filesAtom)
  const isOpen = f.expanded.includes(path)
  await update($, filesAtom, x => ({ ...x, expanded: isOpen ? x.expanded.filter(p => p !== path) : [...x.expanded, path] }))
  if (!isOpen && !f.dirs[path]) await loadDirs($, [path])
}

/** Every file under root, for search: git's list in a repo, else a bounded walk. */
async function loadAll($: $) {
  const { root } = await read($, filesAtom)
  const r = await quiet($.process.run(['git', '-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], { timeoutMs: 10000 }))
  let all: string[] = []
  if (r && r.exitCode === 0) all = r.stdout.split('\0').filter(Boolean)
  else {
    const queue: [string, number][] = [[root, 0]]
    while (queue.length && all.length < 5000) {
      const [dir, depth] = queue.shift()!
      for (const en of (await quiet(listDir($, dir))) ?? []) {
        const p = join(dir, en.name)
        if (en.dir) depth < 5 && en.name !== '.git' && en.name !== 'node_modules' && queue.push([p, depth + 1])
        else all.push(p.slice(root.length + 1))
      }
    }
  }
  await update($, filesAtom, f => ({ ...f, all }))
}

async function reveal($: $, path: string) {
  const f = await read($, filesAtom)
  const folders = foldersTo(path, f.root)
  await update($, filesAtom, x => ({ ...x, query: '', expanded: [...new Set([...x.expanded, ...folders])] }))
  await loadDirs($, folders.filter(d => !f.dirs[d]))
}

async function refreshGit($: $) {
  const { root } = await read($, filesAtom)
  const head = await quiet($.process.run(['git', '-C', root, 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 }))
  if (!head || head.exitCode !== 0) return void (await update($, gitAtom, () => ({ isRepo: false, branch: '', top: '', dirty: [] })))
  const [top = root, branch = ''] = head.stdout.trim().split('\n')
  const st = await quiet($.process.run(['git', '-C', top, 'status', '--porcelain=v1', '-z', '-uall'], { timeoutMs: 10000 }))
  const dirty = st && st.exitCode === 0 ? parseStatus(st.stdout, top) : []
  await update($, gitAtom, () => ({ isRepo: true, branch, top, dirty }))
}

/* ── work items, written by the plan writer below ── */

async function save($: $, key: string, fn: (e: DevEntry) => DevEntry) {
  const msg = await writeEntry($, key, fn).catch((err: Error) => String(err.message ?? err))
  if (msg !== 'Saved') void $.ui.toast(msg)
}

const setStatus = ($: $, key: string, id: string, status: WorkItem['status']) =>
  save($, key, x => ({ ...x, items: x.items.map(i => (i.id === id ? { ...i, status } : i)) }))

/* ── drawing ── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1] ?? ''} ${Number(d.slice(8, 10))}`

async function paletteNow($: $) {
  const prefs = (await quiet($.state.get(SKIN_PREFS as never)))?.value as SkinPrefs
  const custom = (await quiet($.state.get(SKIN_CUSTOM as never)))?.value as SkinCustom
  const isLight = (await quiet($.state.get(SKIN_LIGHT as never)))?.value as boolean | undefined
  return paletteOf(prefs, custom, isLight)
}

async function openPane($: $) {
  await $.ui.open({ id: PANE, title: TITLE })
}

/** The band's chevron and `/task pane`. */
async function togglePane($: $) {
  const isUp = (await $.ui.panes()).some(p => p.id === PANE)
  if (isUp) await $.ui.close({ id: PANE })
  else await openPane($)
}

/** At session start: the tree on the session's folder, and the pane opens unless the setting says no. */
async function startWorkbench($: $) {
  const cwd = await $.session.cwd()
  await update($, filesAtom, f => ({ ...f, project: cwd }))
  void setRoot($, cwd)
  if (settings.openPane) void openPane($)
}

/** After each turn: commits and checkouts happen in Bash, so the branch line catches up. */
const afterTurnWorkbench = ($: $) => void quiet(refreshGit($))


/* ── Plan files: the source of truth, read from disk ── */

/** The plans folder this session works in, and the plans read from it last. */
let plansDir: string | undefined
let plans: Plan[] = []

/** The settings from /config (the manifest's userConfig), read when the module loads. */
const settings = { plansDir: 'plans', openPane: true, band: true }

/** The nearest plans folder at or above the session's folder, stopping at the home folder. */
async function findPlansDir($: $) {
  const home = ((await $.env.get('HOME')) ?? '').replace(/\/+$/, '')
  let dir = (await $.session.cwd()).replace(/\/+$/, '')
  while (dir && dir !== home && dir !== '/') {
    if (await $.fs.exists(`${dir}/${settings.plansDir}`)) return `${dir}/${settings.plansDir}`
    dir = dir.slice(0, dir.lastIndexOf('/'))
  }
  return undefined
}

async function loadPlans($: $) {
  plansDir = await findPlansDir($)
  return (plans = plansDir ? await loadPlansIn($, plansDir) : [])
}

async function refresh($: $) {
  try {
    await loadPlans($)
    const snap: Snap = plansDir
      ? snapshotOfPlans(plans, plansDir.slice(0, -settings.plansDir.length - 1))
      : { status: 'none', shorts: [], prev: [], next: [] }
    await update($, snapAtom, () => snap)
    return snap
  } catch (err) {
    const snap: Snap = { status: 'error', message: String((err as Error).message ?? err), shorts: [], prev: [], next: [] }
    await update($, snapAtom, () => snap)
    return snap
  }
}

/** Applies `fn` to one plan's work items and writes the file; a plan with every item done is marked done. */
async function writeEntry($: $, key: string, fn: (e: DevEntry) => DevEntry): Promise<string> {
  await loadPlans($)
  const plan = plans.find(p => p.task === key)
  if (!plan) return `Not saved: no plan file for ${key}`
  const entry = withStages(fn(devEntryOf(plan)))
  let text = setItems(plan.text, entry.items)
  if (allDone(entry.items) && plan.status !== 'done') text = setFront(text, { ...plan, status: 'done' })
  await $.fs.write(plan.file, text)
  await refresh($)
  return 'Saved'
}

/** `/task new <title>` and the tool's "create": a new plan file, today's date unless one is given. */
async function createTask($: $, title: string, date?: string): Promise<string> {
  const t = title.trim()
  if (!t) return 'Give the task a title: /task new <title>'
  await loadPlans($)
  const dir = plansDir ?? `${(await $.session.cwd()).replace(/\/+$/, '')}/${settings.plansDir}`
  const project = baseOf(dir.slice(0, -settings.plansDir.length - 1)) || 'project'
  const key = newTaskKey(t, plans.map(p => p.task))
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate()
  const front: PlanFront = { task: key, project, short: project, title: t, date: day, end: day, status: 'open' }
  const file = `${dir}/${key}.md`
  await $.fs.write(file, newPlanText(front, []))
  await refresh($)
  return `Created ${file} (task ${key})`
}

async function loadPlansIn($: $, dir: string) {
  const files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
  const read = await Promise.all(files.map(async f => parsePlan(await $.fs.read(`${dir}/${f.name}`), `${dir}/${f.name}`)))
  return read.filter((p): p is Plan => !!p)
}

/* ── shared view values ── */

const dateShort = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const md = (d: string) => d.slice(5).replace('-', '/')
const when = (g: Group) => (g.start === g.end ? md(g.start) : `${md(g.start)}→${md(g.end)}`)
const openDate = (g: Group) => g.parts.find(p => p.status !== 'done')?.date ?? g.start
const box = (s: WorkItem['status']) => ({ draft: '[?]', todo: '[ ]', doing: '[~]', done: '[x]' })[s]
const GLYPH: Record<WorkItem['status'], string> = { draft: '◌', todo: '□', doing: '◧', done: '■' }

function barIn(g: Group): BarIn {
  const c = counts(g.items)
  const n = byStatus(g.items)
  const now = activeItem(g.items.filter(i => i.status !== 'done'))
  const finished = c.total > 0 && c.done === c.total
  const pill = finished ? 'done' : !g.items.length ? 'break down' : !c.total ? `${n.draft} draft${n.draft === 1 ? '' : 's'}` : (now?.stage ?? 'build')
  // The bar takes the current stage's color, as the pane's stage tags do.
  return { done: c.done, doing: n.doing, total: c.total, pill, finished, color: now ? STAGE_COLOR[now.stage] : undefined }
}

/** The item the band names: in progress, else the next one to do. */
const inHand = (g: Group) => activeItem(g.items.filter(i => i.status === 'doing' || i.status === 'todo'))

function breakPrompt(g: Group) {
  return [
    `Break the current dev task into work items.`,
    `Task: "${g.title}" (${g.short}, ${when(g)}, key ${g.key}). Its plan file: ${g.file ?? 'none yet'}.`,
    g.items.length ? `Existing items: ${g.items.map(i => `${i.stage}: ${i.title}`).join('; ')}.` : '',
    `Read the project's docs and code as needed. Use only the stages that apply, from: ${STAGES.join(', ')} (track = analytics or monitoring for the feature).`,
    `Each item is one concrete, checkable step; 3 to 10 items. Titles are short labels of 2 to 5 words, at most ${ROW_CHARS} characters, no sentences and no trailing period (good: "Auth screen", "Seed demo data"). Put the what, why and done-when in "details", one or two sentences.`,
    `Then call the ${TOOL} tool with action "add", task "${g.key}" and draft true, and show me the list.`,
  ]
    .filter(Boolean)
    .join('\n')
}

const NONE = 'No tasks here yet. `/task new <title>` starts one: a plan file in `' + 'plans/` that you, /task and Claude all edit.'

const USAGE = [
  '`/task` the task, its work items and Up next',
  '`/task <n>` one item with its details',
  '`/task start <n>` · `/task done <n>` · `/task reopen <n>`',
  '`/task approve [n]` approve one draft, or all',
  '`/task add [stage:] title -- details`',
  '`/task break` ask Claude to draft the work items',
  '`/task pane` open the side pane',
  '`/task new <title>` start a task: a plan file in the plans folder',
  '`/task refresh` re-read the plan files',
  '`/task <anything else>` ask Claude, with the task and its items attached',
].join('\n')
const textBar = (b: BarIn, width = 20) => {
  const f = b.total ? Math.round((width * b.done) / b.total) : 0
  return '█'.repeat(f) + '░'.repeat(width - f)
}

/** What `/task` prints: the pane as markdown, for the terminal where the pane is out of sight. */
function textView(snap: Snap, selected?: string) {
  const cur = snap.cur!
  const bar = barIn(cur)
  const pct = bar.total ? Math.round((bar.done / bar.total) * 100) : 0
  const act = activeItem(cur.items, selected)
  const head = [
    `**${cur.title}**`,
    `${cur.short} · ${dateShort(openDate(cur))}${cur.size ? ' · ' + cur.size : ''}${cur.stages.length ? ' · ' + cur.stages.join(' → ') : ''}`,
    bar.total ? `\`${textBar(bar)}\` ${bar.pill} · ${pct}%` : '',
  ].filter(Boolean)
  const now = act ? ['', `**${act.status === 'doing' ? 'In progress' : act.status === 'draft' ? 'Draft' : act.status === 'done' ? 'Done' : 'Up first'}: ${act.title}** · ${act.stage}`, act.details ?? '_No details yet._'] : []
  const items = cur.items.length
    ? ['', '**Work items**', ...cur.items.map((i, k) => `${k + 1}. ${GLYPH[i.status]} ${clip(i.title, ROW_CHARS)} · ${i.stage}${i.status === 'draft' ? ' · draft' : ''}`)]
    : ['', '**Work items**', 'Not broken down yet: `/task break`']
  const next = snap.next.length ? ['', '**Up next**', ...snap.next.map(g => `- ${clip(g.title, ROW_CHARS)} · ${dateShort(openDate(g))}`)] : []
  return [...head, ...now, ...items, ...next].join('\n')
}

/** Sends a prompt once the command has finished: a command holds its turn, so submitting inside it is refused. */
function submitLater($: $, text: string) {
  $.clock.after(300, () => void $.prompt.submit({ text }))
}

/** `/task <words>`: the person's request, with the task and its plan file, for Claude to act on. */
function workPrompt(snap: Snap, request: string) {
  const g = snap.cur!
  const items = g.items.map((i, k) => `${k + 1}. [${i.status}] ${i.stage}: ${i.title}${i.details ? `: ${i.details}` : ''}`)
  return [
    request,
    '',
    `Current task: "${g.title}" (${g.short}, key ${g.key}). Its plan file: ${g.file ?? 'none yet'}.`,
    items.length ? `Work items:\n${items.join('\n')}` : 'It has no work items yet: break it down first with the work_items tool (action "add", draft true).',
    snap.next.length ? `Up next after it: ${snap.next.map(x => x.title).join('; ')}.` : '',
    `As you work, keep the plan file current: mark an item [~] when you start it and [x] when it is finished (or use the ${TOOL} tool). Add notes under the item or in the file's Notes section.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** What `/task <n>` prints: one item whole. */
function itemView(it: WorkItem, n: number) {
  const state = { draft: 'draft', todo: 'to do', doing: 'in progress', done: 'done' }[it.status]
  return [`**${n}. ${it.title}**`, `${it.stage} · ${state}`, '', it.details ?? '_No details yet._'].join('\n')
}

/** After each turn: Claude may have edited a plan file, so re-read it. */
const afterTurn: Hook<'turn.complete'> = async ($, e, next) => {
  const r = await next(e)
  afterTurnWorkbench($)
  if (plansDir) await refresh($)
  return r
}

/** `/task` and `/workbench:task`: the view, one item, or a change to an item. */
async function taskCommand($: $, e: { args?: string }) {
  const args = (e.args ?? '').trim()
  const [verb = '', ...rest] = args.split(/\s+/)
  if (verb === 'new') return { text: await createTask($, rest.join(' ')) }
  const fresh = !args || verb === 'refresh' || verb === 'pane'
  const snap = fresh || (await read($, snapAtom)).status !== 'ready' ? await refresh($) : await read($, snapAtom)
  if (verb === 'pane') await openPane($)
  if (snap.status === 'none') return { text: NONE }
  if (snap.status === 'error') return { text: 'Could not read the plans: ' + snap.message }
  const cur = snap.cur
  if (!cur) return { text: 'No open tasks here. `/task new <title>` starts one.' }
  const ui = await read($, uiAtom)
  if (fresh) return { text: textView(snap, ui.selected) }

  const nth = (v?: string) => cur.items[Number(v) - 1]
  const missing = (v?: string) => ({ text: `No item ${v ?? ''}. ${cur.items.map((i, k) => `${k + 1} ${i.title}`).join(' · ')}` })
  if (/^\d+$/.test(verb)) {
    const it = nth(verb)
    if (!it) return missing(verb)
    await update($, uiAtom, u => ({ ...u, selected: it.id }))
    return { text: itemView(it, Number(verb)) }
  }
  if (verb === 'break') {
    submitLater($, breakPrompt(cur))
    return { text: `Asking Claude to draft work items for "${cur.title}".` }
  }
  if (verb === 'add') {
    const { stage, title, details } = parseAdd(rest.join(' '), ui.stage ?? cur.stages[0] ?? 'build')
    if (!title) return { text: 'Usage: /task add [stage:] title -- details' }
    const msg = await writeEntry($, cur.key, x => ({ ...x, items: [...x.items, { id: newId(), title, stage, status: 'todo', ...(details ? { details } : {}) }] }))
    return { text: `${msg}: ${stage}: ${title}` }
  }
  if (verb === 'approve') {
    const it = rest[0] ? nth(rest[0]) : undefined
    if (rest[0] && !it) return missing(rest[0])
    const n = it ? 1 : cur.items.filter(i => i.status === 'draft').length
    if (!n) return { text: 'No drafts to approve.' }
    const msg = await writeEntry($, cur.key, x => ({ ...x, items: x.items.map(i => (i.status === 'draft' && (!it || i.id === it.id) ? { ...i, status: 'todo' } : i)) }))
    return { text: `${msg}: approved ${it ? it.title : `${n} draft${n === 1 ? '' : 's'}`}` }
  }
  const to = ({ start: 'doing', done: 'done', reopen: 'todo' } as const)[verb as 'start' | 'done' | 'reopen']
  if (to) {
    const it = nth(rest[0])
    if (!it) return missing(rest[0])
    const msg = await writeEntry($, cur.key, x => ({ ...x, items: x.items.map(i => (i.id === it.id ? { ...i, status: to } : i)) }))
    return { text: `${msg}: ${it.title} → ${to}` }
  }
  if (verb === 'help') return { text: USAGE }
  // Anything else is a request in words: hand it to Claude with the task and every item's details.
  submitLater($, workPrompt(snap, args))
  return { text: textView(snap, ui.selected) }
}

export const register: Register = (on, options) => {
  settings.plansDir = plansDirName(options.plans_dir)
  settings.openPane = options.open_pane !== 'off'
  settings.band = options.band !== 'off'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'task',
      description: 'The current task from the plans folder, its work items and details. /task new <title> starts one, /task <n> shows an item',
      argumentHint: '[new <title> | <n> | start|done|reopen <n> | approve [n] | add <stage>: <title> -- <details> | break | pane]',
    })
    await $.tool.register({
      name: TOOL,
      description:
        'Reads and updates tasks and their work items: one markdown plan file per task in the plans folder at the project root. ' +
        'action "create" starts a task (title, optional date YYYY-MM-DD); "list" shows the task and its numbered items; "add" adds items; "status" sets item n to todo, doing or done; ' +
        '"edit" changes item n\'s title, details or stage. ' +
        `Titles are short labels of 2 to 5 words (at most ${ROW_CHARS} characters, refused past ${TITLE_MAX}), never sentences; ` +
        'put the explanation in details. Mark an item doing when you start it and done when it is finished. ' +
        'You may also edit the plan file directly: "- [ ] Title `stage`" with the details indented below; [~] in progress, [x] done, [?] draft.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'add', 'status', 'edit'] },
          task: { type: 'string', description: 'Task key; defaults to the current task' },
          items: {
            type: 'array',
            description: 'For add',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', maxLength: TITLE_MAX, description: 'Short label, 2 to 5 words, e.g. "Auth screen"' },
                stage: { type: 'string', enum: STAGES },
                details: { type: 'string', description: 'What to do and when it counts as done, 1 to 2 sentences' },
              },
              required: ['title', 'stage'],
            },
          },
          draft: { type: 'boolean', description: 'For add: true marks items for the person to approve (default true)' },
          n: { type: 'number', description: 'For status and edit: item number from list, 1-based' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          title: { type: 'string', description: 'For create: the task title. For edit: the item title (a short label)' },
          date: { type: 'string', description: 'For create: the day it starts, YYYY-MM-DD; today when absent' },
          details: { type: 'string', description: 'For edit' },
          stage: { type: 'string', enum: STAGES, description: 'For edit' },
        },
        required: ['action'],
      },
      isDeferred: false,
    })
    const r = await next(e)
    void $.ui.status(undefined)
    void startWorkbench($)
    void refresh($)
    return r
  })

  // `task` is registered at start; `workbench:task` is commands/task.md, which the app lists before a session starts.
  on('turn.complete', afterTurn)

  on('command.run', { command: 'task' }, taskCommand)
  on('command.run', { command: 'workbench:task' }, taskCommand)

  on('tool.call', { tool: TOOL_FULL }, async ($, e) => {
    const input = e as unknown as {
      action: 'create' | 'list' | 'add' | 'status' | 'edit'
      date?: string
      task?: string
      items?: { title: string; stage: string; details?: string }[]
      draft?: boolean
      n?: number
      status?: 'todo' | 'doing' | 'done'
      title?: string
      details?: string
      stage?: string
    }
    if (input.action === 'create') return { result: await createTask($, input.title ?? '', input.date) }
    let snap = await read($, snapAtom)
    if (snap.status !== 'ready') snap = await refresh($)
    if (snap.status !== 'ready') return { result: snap.status === 'none' ? NONE : 'Plans unavailable: ' + snap.message }
    const pool = [snap.cur, ...snap.next, ...snap.prev].filter(Boolean) as Group[]
    const g = input.task ? pool.find(x => x.key === input.task) : snap.cur
    if (!g) return { result: `No task ${input.task ?? '(current)'} here. Tasks: ${pool.map(x => `${x.key} ${x.title}`).join('; ')}` }
    const tooLong = (t?: string) => !!t && t.trim().length > TITLE_MAX

    if (input.action === 'list') {
      const lines = g.items.map((i, k) => `${k + 1}. ${box(i.status)} ${i.stage}: ${i.title}${i.details ? `\n   ${i.details}` : ''}`)
      const head = `${g.key} · ${g.title} (${g.short}, ${when(g)})\nPlan file: ${g.file ?? '(none)'}\nStages: ${g.stages.join(', ') || 'none'}`
      return { result: g.items.length ? `${head}\n${lines.join('\n')}` : `${head}\nNo work items yet: break the task down with action "add".` }
    }
    if (input.action === 'add') {
      const add = (input.items ?? []).filter(i => i.title?.trim() && STAGES.includes(i.stage))
      if (!add.length) return { result: 'Nothing to add: give items as {title, stage, details}.' }
      const long = add.filter(i => tooLong(i.title))
      if (long.length)
        return { result: `Not saved. These titles are sentences, not labels: ${long.map(i => `"${i.title}"`).join(', ')}. Use 2 to 5 words (at most ${ROW_CHARS} characters) and move the rest to details.` }
      const status: WorkItem['status'] = input.draft === false ? 'todo' : 'draft'
      const made = add.map(i => ({ id: newId(), title: i.title.trim(), stage: i.stage, status, ...(i.details?.trim() ? { details: i.details.trim() } : {}) }))
      const msg = await writeEntry($, g.key, x => ({ ...x, items: [...x.items, ...made] }))
      return { result: `${msg}: ${add.length} item(s) on "${g.title}"${status === 'draft' ? ' as drafts for the person to approve' : ''}.` }
    }
    const it = g.items[(input.n ?? 0) - 1]
    if (!it) return { result: 'Give n, the item number from list (1-based).' }
    if (input.action === 'edit') {
      if (tooLong(input.title)) return { result: `Not saved: the title is a sentence. Use 2 to 5 words and put the rest in details.` }
      if (input.stage && !STAGES.includes(input.stage)) return { result: `Stage is one of ${STAGES.join(', ')}.` }
      const patch: Partial<WorkItem> = {
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        ...(input.details !== undefined ? { details: input.details.trim() || undefined } : {}),
        ...(input.stage ? { stage: input.stage } : {}),
      }
      if (!Object.keys(patch).length) return { result: 'Give title, details or stage to change.' }
      const msg = await writeEntry($, g.key, x => ({ ...x, items: x.items.map(i => (i.id === it.id ? { ...i, ...patch } : i)) }))
      return { result: `${msg}: ${patch.title ?? it.title}` }
    }
    if (!input.status) return { result: 'Give status: todo, doing or done.' }
    const msg = await writeEntry($, g.key, x => ({ ...x, items: x.items.map(i => (i.id === it.id ? { ...i, status: input.status! } : i)) }))
    return { result: `${msg}: ${it.title} → ${input.status}` }
  }).catch(() => ({ result: 'Workbench could not read or write the plan files. Try /task refresh.' }))

  /* ── band above the prompt: line 1 the task, line 2 the bar ── */

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapAtom)
    if (!settings.band || e.props.hasSurvey || snap.status !== 'ready' || !snap.cur) return next(e)
    await read($, uiAtom)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const cur = snap.cur
    const n = byStatus(cur.items)
    const bar = barIn(cur)
    const now = inHand(cur)
    const isUp = (await $.ui.panes()).some(p => p.id === PANE)
    const dot = bar.finished ? DONE : n.doing ? DOING : cur.items.length ? ACCENT : MUTED
    const chevron = <Button key="band-chev" plain label={isUp ? '❮' : '❯'} onPress={() => void togglePane($)} />

    if (e.surface === 'desktop' && 'Svg' in els) {
      const { Svg } = els
      // About 8 CSS px a column; the rest is the chevron and its gap. A row wider than the slot wraps.
      const W = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 64))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg key="band-title" width={W} height={20} alt={`${cur.short}: ${cur.title}${now ? `, now ${now.title}` : ''}`} source={bandTitleSvg(W, dot, cur.short, cur.title, now?.title)} />
            {chevron}
          </Box>
          <Svg key="band-bar" width={W} height={20} alt={`${bar.pill}, ${bar.total ? Math.round((bar.done / bar.total) * 100) : 0}% done`} source={bandBarSvg(W, bar)} />
        </Box>
      )
    }

    const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    const width = Math.max(8, Math.min(48, cols - bar.pill.length - 10))
    const filled = bar.total ? Math.round((width * bar.done) / bar.total) : 0
    const running = bar.total ? Math.min(width - filled, Math.round((width * bar.doing) / bar.total)) : 0
    const pct = `${bar.total ? Math.round((bar.done / bar.total) * 100) : 0}%`
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1} flexWrap="nowrap">
          <Text color={dot}>●</Text>
          <Text dimColor>{cur.short}</Text>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text bold wrap="truncate-end">
              {cur.title}
              {now ? <Text dimColor bold={false}>{`  now · ${now.title}`}</Text> : ''}
            </Text>
          </Box>
          {chevron}
        </Box>
        <Box flexDirection="row" columnGap={1}>
          <Text>
            <Text color={bar.finished ? DONE : ACCENT}>{'█'.repeat(filled)}</Text>
            <Text color={ACCENT} dimColor>{'▓'.repeat(running)}</Text>
            <Text dimColor>{'░'.repeat(Math.max(0, width - filled - running))}</Text>
          </Text>
          <Text color={bar.finished ? DONE : ACCENT} bold>{bar.pill}</Text>
          <Text dimColor>{pct}</Text>
        </Box>
      </Box>
    )
  })

  /* ── side pane: the Workbench ── */

  // What Claude reads and edits, for "Right now" and "Claude touched".
  on('tool.call', async ($, e, next) => {
    const kind = FILE_TOOLS[e.tool]
    const args = e as unknown as { file_path?: unknown; notebook_path?: unknown }
    const raw = args.file_path ?? args.notebook_path
    if (!kind || typeof raw !== 'string') return next(e)
    const path = absOf(raw, (await quiet($.session.cwd())) ?? '')
    await quiet(update($, touchedAtom, l => addTouch(l, { path, kind, active: true, at: Date.now() })))
    try {
      return await next(e)
    } finally {
      await quiet(update($, touchedAtom, l => addTouch(l, { path, kind, active: false, at: Date.now() })))
      if (kind === 'edited') {
        void quiet(refreshGit($))
        const f = await quiet(read($, filesAtom))
        if (f?.dirs[parentOf(path)]) void quiet(loadDirs($, [parentOf(path)]))
      }
    }
  }).catch(($, e, next) => next(e)) // never in the way of a tool call

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const cols = Math.max(28, e.props?.bodyColumns || 44)
    const pal = await paletteNow($)
    const snap = await read($, snapAtom)
    const ui = await read($, benchAtom)
    const files = await read($, filesAtom)
    const git = await read($, gitAtom)
    const touched = await read($, touchedAtom)

    // Text in a skin color; with no skin, Claude Code's theme color for the slot (it follows light and dark).
    const c = (slot: Slot) => (pal.themed ? { color: pal[slot] } : THEME_KEY[slot] ? { color: THEME_KEY[slot] } : slot === 'muted' ? { dimColor: true } : {})
    // Desktop draws Lucide icons, caps labels and pills as SVG; the terminal gets text and glyphs.
    const Svg = e.surface === 'desktop' && 'Svg' in els ? els.Svg : undefined
    // A drawing's color: the skin's, or with no skin a light and dark pair.
    const ink = (slot: Slot): Ink => inkOf(pal, slot)
    const mutedInk = ink('muted')
    // Room inside `depth` nested cards, in px (about 8 a column; each card takes its border and padding).
    const room = (depth: number) => Math.max(140, cols * 8 - 24 - depth * 56)
    const capsText = (key: string, text: string, slot: Slot = 'muted', size = 12) => {
      if (!Svg) return <Text key={key} bold {...c(slot)}>{text.toUpperCase()}</Text>
      const l = caps(text, ink(slot), size)
      return <Svg key={key} width={l.w} height={l.h} alt={text} source={l.source} />
    }
    const label = (key: string, text: string, right?: string) => (
      <Box key={key} flexDirection="row" justifyContent="space-between" alignItems="center" marginTop={1} width="100%">
        {capsText(key + '-l', text)}
        {right ? capsText(key + '-r', right) : null}
      </Box>
    )
    // A tinted card (Current task, Right now) takes the app's message surface, which follows light and dark.
    const card = (key: string, kids: unknown[], marginTop = 0, tinted = false) => (
      <Box key={key} flexDirection="column" alignItems="stretch" width="100%" marginTop={marginTop} backgroundColor={tinted ? 'userMessageBackground' : undefined} borderStyle="round" borderColor={pal.themed ? pal.muted : undefined} borderDimColor={!pal.themed} paddingX={2} paddingY={1}>
        {kids as never}
      </Box>
    )
    const dot = (key: string, slot: Slot) => <Text key={key} {...c(slot)}>●</Text>

    /* ── box 1: task management ── */

    const ico = (key: string, name: IconName, color: Ink, size = 16) => (Svg ? <Svg key={key} width={size} height={size} alt={name} source={icon(name, color, size)} /> : null)
    const divider = (key: string) =>
      Svg ? (
        <Box key={key} marginY={1} width="100%"><Svg height={9} alt="divider" source={rule(mutedInk)} /></Box>
      ) : (
        <Text key={key} {...c('muted')} wrap="truncate-end">{'─'.repeat(200)}</Text>
      )

    const task: unknown[] = []
    const cur = snap.cur
    if (snap.status === 'idle' || snap.status === 'loading') task.push(<Text key="t-wait" {...c('muted')}>Reading plans…</Text>)
    else if (snap.status === 'none') task.push(<Text key="t-none" {...c('muted')}>{'No tasks here yet. /task new <title> starts one.'}</Text>)
    else if (snap.status === 'error') task.push(<Text key="t-err" {...c('err')}>{`Plans unavailable: ${snap.message ?? ''}`}</Text>)
    else if (!cur) task.push(<Text key="t-free" {...c('muted')}>No open tasks here.</Text>)
    else {
      const done = cur.items.filter(i => i.status === 'done').length
      const doing = cur.items.filter(i => i.status === 'doing')
      const total = cur.items.length
      const pct = total ? Math.round((done / total) * 100) : 0
      const when = cur.start === cur.end ? shortDate(cur.start) : `${shortDate(cur.start)} → ${shortDate(cur.end)}`
      // Each stage in its own color, the one the band's bar takes while that stage is current.
      const stageTag = (key: string, stage: string) => <Text key={key} color={STAGE_COLOR[stage] ?? MUTED}>{stage}</Text>
      const STATUS_ICON = { draft: 'square-dashed', todo: 'square', doing: 'square-dot', done: 'square-check' } as const
      const statusInk = (s: WorkItem['status']) => ink(s === 'done' ? 'ok' : s === 'doing' ? 'write' : 'muted')
      // The status square: a Lucide icon with a press over it; a glyph on the terminal.
      const square = (it: WorkItem) => {
        const press = () => setStatus($, cur.key, it.id, nextStatus(it.status))
        if (!Svg) return <Button key={'sq-' + it.id} plain label={GLYPH[it.status]} onPress={press} />
        return (
          <Box key={'sq-' + it.id} width={2} height={1} flexShrink={0} justifyContent="center" alignItems="center">
            <Svg width={16} height={16} alt={it.status} source={icon(STATUS_ICON[it.status], statusInk(it.status), 16)} />
            <Box position="absolute" top={0} left={0} right={0} bottom={0}>
              <Button key={'sqb-' + it.id} plain label="  " onPress={press} />
            </Box>
          </Box>
        )
      }

      // Current task: the check disc, the title, the bar; then what is in progress
      const curKids: unknown[] = [
        // On the desktop the top is one drawing; the card under it is tinted
        Svg ? (
          <Svg key="ct-top" width={room(2)} height={78} alt={`Current task: ${cur.title}`} source={hero({ icon: 'check', accent: ink('ok'), label: 'Current task', title: cur.title, sub: `${cur.short} · ${when}`, w: room(2), panel: false })} />
        ) : (
          <Box key="ct-top" flexDirection="column">
            {capsText('ct-cap', 'Current task', 'ok')}
            <Text bold wrap="wrap" {...c('fg')}>{cur.title}</Text>
            <Text wrap="truncate-end" {...c('muted')}>{`${cur.short} · ${when}`}</Text>
          </Box>
        ),
        Svg ? (
          // The band's bar: the current stage's color and its pill, the percent at the end.
          <Box key="ct-bar" marginTop={1} width="100%"><Svg width={room(2)} height={20} alt={`${barIn(cur).pill}, ${pct}% done`} source={bandBarSvg(room(2), barIn(cur))} /></Box>
        ) : (
          <Text key="ct-bar" wrap="truncate-end">
            <Text {...c('ok')}>{'█'.repeat(Math.round((Math.max(8, cols - 12) * done) / Math.max(1, total)))}</Text>
            <Text {...c('muted')}>{'░'.repeat(200)}</Text>
          </Text>
        ),
        <Box key="ct-count" flexDirection="row" justifyContent="space-between" width="100%">
          <Text {...c('muted')}>{total ? `${done} of ${total} done` : 'Not broken down yet'}</Text>
          {Svg ? null : <Text bold {...c('ok')}>{`${pct}%`}</Text>}
        </Box>,
        divider('ct-hr'),
        capsText('ip-cap', 'In progress', 'write'),
      ]
      if (!doing.length) curKids.push(<Box key="ip-none" marginTop={1}><Text {...c('muted')}>Nothing in progress</Text></Box>)
      for (const it of doing)
        curKids.push(
          <Box key={'ip-' + it.id} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} width="100%">
            {square(it)}
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text bold wrap="truncate-end" {...c('fg')}>{it.title}</Text></Box>
            {stageTag('ips-' + it.id, it.stage)}
            <Button key={'ipd-' + it.id} onPress={() => setStatus($, cur.key, it.id, 'done')}>Done</Button>
          </Box>,
        )
      task.push(card('ct-card', curKids, 1, true))

      // Work items, in their own box
      const wiKids: unknown[] = [
        <Box key="wi-h" flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
          <Box flexDirection="row" columnGap={1} alignItems="center">
            {capsText('wi-cap', 'Work items')}
            <Button key="wi-toggle" plain label={ui.itemsOpen ? '▾' : '▸'} onPress={() => void update($, benchAtom, u => ({ ...u, itemsOpen: !u.itemsOpen }))} />
          </Box>
          {capsText('wi-count', `${done}/${total}`)}
        </Box>,
      ]
      if (ui.itemsOpen) {
        if (!total) wiKids.push(<Box key="wi-none" marginTop={1}><Text {...c('muted')}>No work items yet</Text></Box>)
        for (const it of cur.items)
          wiKids.push(
            <Box key={'wi-' + it.id} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} width="100%">
              {square(it)}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text wrap="truncate-end" {...(it.status === 'done' ? c('muted') : c('fg'))}>{it.title}</Text>
              </Box>
              {stageTag('wis-' + it.id, it.stage)}
            </Box>,
          )
      }
      task.push(card('wi-card', wiKids, 1))

      // Add work item: a button that opens the field
      const fallback = doing[0]?.stage ?? cur.stages[0] ?? 'build'
      if (ui.adding && Input)
        task.push(
          <Box key="wi-add" flexDirection="column" alignItems="stretch" marginTop={1} width="100%">
            <Input
              key="wi-add"
              autoFocus
              placeholder="Title, or stage: title"
              submitLabel="add"
              onSubmit={(v: string) => {
                const { stage, title, details } = parseAdd(v, fallback)
                if (title) save($, cur.key, x => ({ ...x, items: [...x.items, { id: newId(), title, stage, status: 'todo', ...(details ? { details } : {}) }] }))
                void update($, benchAtom, u => ({ ...u, adding: false }))
              }}
            />
            <Box marginTop={1}>
              <Button key="wi-cancel" onPress={() => void update($, benchAtom, u => ({ ...u, adding: false }))}>Cancel</Button>
            </Box>
          </Box>,
        )
      else
        task.push(
          <Box key="wi-add" flexDirection="row" marginTop={1}>
            <Button key="wi-add-btn" onPress={() => void update($, benchAtom, u => ({ ...u, adding: true, itemsOpen: true }))}>+ Add work item</Button>
          </Box>,
        )

      // Up next
      task.push(divider('nx-hr'), capsText('nx-cap', 'Up next'))
      const nx = snap.next.slice(0, 3)
      if (!nx.length) task.push(<Box key="nx-none" marginTop={1}><Text {...c('muted')}>Nothing queued</Text></Box>)
      for (const g of nx)
        task.push(
          <Box key={'nx-' + g.key} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} width="100%">
            {dot('nxd-' + g.key, g.items.some(i => i.status === 'doing') ? 'write' : 'muted')}
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text wrap="truncate-end" {...c('fg')}>{clip(g.title, 30)}</Text></Box>
            <Text {...c('muted')}>{shortDate(g.start)}</Text>
          </Box>,
        )
    }

    /* ── box 2: file management ── */

    const root = files.root
    const now = touched.find(t => t.active)
    const last = touched[0]
    const dirtyHere = git.dirty.filter(p => p === root || p.startsWith(root + '/'))
    const fileKids: unknown[] = []

    // Right now: what Claude is doing, the branch, the legend
    const state = now
      ? now.kind === 'read'
        ? { icon: 'eye' as const, slot: 'read' as const, verb: 'reading', glyph: '◉' }
        : { icon: 'pencil' as const, slot: 'write' as const, verb: 'editing', glyph: '✎' }
      : { icon: 'coffee' as const, slot: 'muted' as const, verb: '', glyph: '◌' }
    const stateInk = ink(state.slot)
    const headText = now ? `Claude is ${state.verb} ${baseOf(now.path)}` : 'Claude is idle'
    const sub = now ? `in ${relDir(now.path, root)}` : last ? `last ${last.kind === 'read' ? 'read' : 'edited'} ${baseOf(last.path)}` : 'Waiting for the next file'
    const nowKids: unknown[] = [
      Svg ? (
        <Svg key="rn-top" width={room(2)} height={78} alt={`${headText}, ${sub}`} source={hero({ icon: state.icon, accent: stateInk, label: 'Right now', title: headText, sub, w: room(2), panel: false })} />
      ) : (
        <Box key="rn-top" flexDirection="row" columnGap={1}>
          <Text {...c(state.slot)}>{state.glyph}</Text>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            {capsText('rn-cap', 'Right now', state.slot)}
            <Text bold wrap="truncate-end" {...c('fg')}>{headText}</Text>
            <Text wrap="truncate-end" {...c('muted')}>{sub}</Text>
          </Box>
        </Box>
      ),
      divider('rn-hr'),
      <Box key="rn-git" flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        <Box flexDirection="row" columnGap={1} alignItems="center">
          {Svg ? ico('rn-branch', 'git-branch', ink('user'), 18) : <Text {...c('user')}>⎇</Text>}
          <Text bold {...c('fg')}>{git.isRepo ? git.branch : 'not a git repo'}</Text>
        </Box>
        {git.isRepo ? <Text {...c(dirtyHere.length ? 'warn' : 'muted')}>{dirtyHere.length ? `${dirtyHere.length} not committed` : 'clean, nothing changed'}</Text> : null}
      </Box>,
      <Box key="rn-legend" flexDirection="row" columnGap={3} flexWrap="wrap" marginTop={1}>
        <Text><Text {...c('read')}>● </Text><Text {...c('muted')}>Claude read</Text></Text>
        <Text><Text {...c('write')}>● </Text><Text {...c('muted')}>Claude edited</Text></Text>
        <Text><Text {...c('warn')}>● </Text><Text {...c('muted')}>Not committed</Text></Text>
      </Box>,
    ]
    fileKids.push(card('rn-card', nowKids, 1, true))

    // Find a file: the whole width
    if (Input)
      fileKids.push(
        // The field stretches as a column child; the icon rides in the placeholder, inside the field.
        <Box key="f-find" flexDirection="column" alignItems="stretch" marginTop={1} width="100%">
          <Box flexDirection="column" alignItems="stretch" flexGrow={1} width="100%">
            <Input
              key="find"
              placeholder="⌕  Find a file"
              value={files.query}
              onInput={(v: string) => {
                void update($, filesAtom, f => ({ ...f, query: v }))
                if (v.trim() && !files.all.length) void loadAll($)
              }}
              onSubmit={(v: string) => {
                const hit = search(files.all, v, files.showHidden, 1)[0]
                if (hit) void reveal($, join(root, hit))
              }}
            />
          </Box>
        </Box>,
      )

    const btn = (key: string, text: string, fn: () => unknown) => <Button key={key} onPress={() => void fn()}>{text}</Button>
    fileKids.push(
      <Box key="f-btns" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} marginTop={1} width="100%">
        {btn('b-refresh', 'Refresh', () => refreshFiles($))}
        {btn('b-collapse', 'Collapse all', () => update($, filesAtom, f => ({ ...f, expanded: [] })))}
        {btn('b-sizes', files.showSizes ? 'Hide sizes' : 'Show sizes', () => update($, filesAtom, f => ({ ...f, showSizes: !f.showSizes })))}
        {btn('b-up', 'Up a folder', () => (root !== '/' ? setRoot($, parentOf(root)) : undefined))}
        {btn('b-home', 'Back to project', () => (root !== files.project ? setRoot($, files.project) : undefined))}
        {btn('b-hidden', files.showHidden ? 'Hide hidden files' : 'Show hidden files', () => update($, filesAtom, f => ({ ...f, showHidden: !f.showHidden })))}
      </Box>,
    )

    // Claude touched: type tag, name, folder, state pill
    const touchKids: unknown[] = [
      <Box key="tc-h" flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
        {capsText('tc-l', 'Claude touched')}
        {capsText('tc-r', `${touched.length} file${touched.length === 1 ? '' : 's'}`)}
      </Box>,
    ]
    if (!touched.length) touchKids.push(<Box key="tc-none" marginTop={1}><Text {...c('muted')}>Nothing yet this session</Text></Box>)
    for (const t of touched.slice(0, 8)) {
      const slot = t.kind === 'read' ? 'read' : 'write'
      const tag = fileTag(extOf(t.path), ink('run'))
      const p = pill(badge(t), ink(slot))
      touchKids.push(
        <Box key={'tc-' + t.path} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} paddingLeft={2} width="100%">
          {Svg ? <Svg key={'tct-' + t.path} width={tag.w} height={tag.h} alt={extOf(t.path) || 'file'} source={tag.source} /> : null}
          <Box flexShrink={1} minWidth={0}><Text bold wrap="truncate-end" {...c('fg')}>{clip(baseOf(t.path), 20)}</Text></Box>
          <Box flexGrow={1} flexShrink={2} minWidth={0}><Text wrap="truncate-end" {...c('muted')}>{relDir(t.path, root)}</Text></Box>
          {Svg ? <Svg key={'tcp-' + t.path} width={p.w} height={p.h} alt={badge(t)} source={p.source} /> : <Text bold {...c(slot)}>{badge(t)}</Text>}
        </Box>,
      )
    }
    fileKids.push(card('tc-card', touchKids, 1))

    // All files, or the search's matches
    const marks = (path: string, isDir: boolean) => {
      const t = touched.find(x => x.path === path || (isDir && x.path.startsWith(path + '/')))
      const isChanged = isDirty(path, git.dirty)
      return [t ? dot('m-t-' + path, t.kind === 'read' ? 'read' : 'write') : null, isChanged ? dot('m-g-' + path, 'warn') : null]
    }
    const folderInk = ink('user')
    if (files.query.trim()) {
      const hits = search(files.all, files.query, files.showHidden)
      fileKids.push(label('f-all-h', 'Matches', files.all.length ? String(hits.length) : 'searching'))
      for (const p of hits)
        fileKids.push(
          <Box key={'hit-' + p} flexDirection="row" columnGap={1} alignItems="center" width="100%">
            {ico('hi-' + p, 'file', mutedInk, 15)}
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Button key={'hb-' + p} plain onPress={() => void reveal($, join(root, p))}>{clip(p, cols - 8)}</Button>
            </Box>
            {marks(join(root, p), false) as never}
          </Box>,
        )
    } else {
      fileKids.push(label('f-all-h', 'All files', baseOf(root) || '/'))
      const rows = rowsOf(root, files.dirs, files.expanded, files.showHidden)
      if (!files.dirs[root]) fileKids.push(<Text key="f-loading" {...c('muted')}>Reading folder…</Text>)
      else if (!rows.length) fileKids.push(<Text key="f-empty" {...c('muted')}>Empty folder</Text>)
      for (const r of rows) {
        const toggle = () => void toggleDir($, r.path)
        const hidden = r.name.startsWith('.')
        // chevron, icon, name: each in its own column so they line up at every depth
        // A triangle button on every surface (⏵/⏷ on the desktop, larger than ▸/▾): an invisible button laid over a drawn triangle missed clicks.
        const chevron = r.dir ? (
          <Button key={'cv-' + r.path} plain label={Svg ? (r.open ? '⏷' : '⏵') : r.open ? '▾' : '▸'} onPress={toggle} />
        ) : (
          <Box key={'cv-' + r.path} width={2} flexShrink={0} />
        )
        const glyph = Svg ? (
          <Box key={'ic-' + r.path} width={3} flexShrink={0} justifyContent="center" alignItems="center">
            <Svg width={17} height={17} alt={r.dir ? 'folder' : 'file'} source={icon(r.dir ? (r.open ? 'folder-open' : 'folder') : 'file', r.dir && !hidden ? folderInk : mutedInk, 17)} />
          </Box>
        ) : null
        fileKids.push(
          <Box key={'row-' + r.path} flexDirection="row" columnGap={1} alignItems="center" paddingLeft={1} marginTop={1} width="100%">
            {r.depth ? <Box key={'in-' + r.path} width={r.depth * 3} flexShrink={0} /> : null}
            {chevron}
            {glyph}
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              {r.dir ? (
                <Button key={'rb-' + r.path} plain dimColor={hidden} onPress={toggle}>{r.name}</Button>
              ) : (
                <Text wrap="truncate-end" {...c(hidden ? 'muted' : 'fg')}>{r.name}</Text>
              )}
            </Box>
            {marks(r.path, r.dir) as never}
            {files.showSizes && !r.dir ? <Text {...c('muted')}>{humanSize(r.size)}</Text> : null}
          </Box>,
        )
      }
    }

    return (
      <Box flexDirection="column" alignItems="stretch" width="100%" gap={1}>
        {card('box-task', [<Text key="bt-h" bold {...c('fg')}>{cur ? `Task · ${cur.short}` : 'Task'}</Text>, ...task])}
        {card('box-files', [<Text key="bf-h" bold {...c('fg')}>{`Files: ${baseOf(root) || '/'}`}</Text>, ...fileKids])}
      </Box>
    )
  })
}
