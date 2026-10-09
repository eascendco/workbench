import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, Register } from 'claude-code'

import type { DevEntry, Entry, Files, Git, Group, PaneUi, Snap, Touch, Activity, WorkbenchUi, WorkItem } from '../types'
import type { BarIn } from './draw'
import { ACCENT, bandBarSvg, bandTitleSvg, DOING, DONE, MUTED, paneBarSvg, STAGE_COLOR } from './draw'
import { activeItem, byStatus, themeFor, clip, counts, localDate, newId, nextStatus, parseAdd, STAGES, TITLE_MAX, withStages } from './logic'
import type { Plan, PlanFront } from './plans'
import { allDone, devEntryOf, newPlanText, newTaskKey, parsePlan, plansDirName, setFront, setItems, snapshotOfPlans } from './plans'
import {
  absOf, addTouch, badge, baseOf, extOf, FILE_TOOLS, foldersTo, humanSize, isDirty, join,
  inkOf, paletteOf, parentOf, parseStatus, relDir, rowsOf, search, THEME_KEY,
} from './bench'
import type { SkinCustom, SkinPrefs, Slot } from './bench'
import type { DeckAgent, DeckArchitect, DeckCheck, DeckLogLine, DeckLoop, DeckReceipt, DeckSession, DeckView } from '../types'
import {
  adviceLine, afterCall, applyStep, bucketOf, cardTitle, DEFAULT_ARCHITECT, DEFAULT_GATE, DEFAULT_MAIN, DEFAULT_ROSTER, DEFAULT_TURN,
  DEFAULT_USAGE, DEFAULT_VIEW, describeInput, EDIT_TOOLS, endConsult, fmtDuration, handbackOf, listOf, momentOf, normalize,
  normalizeCard, normalizeGate, normalizeLog, noteTool, promptLine, receiptOf, recordCheck, RESET, settleCheck, shorten, startConsult, stepLoop,
  alivePids, parseSessionFile, sessionsLine, sessionsOf,
} from './deck'
import type { SessionFile } from './deck'
import type { DeckData } from './deck'
import { deckKids, deckTitle } from './deck-view'
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
const activityAtom = atom({ plugin: 'workbench', key: 'activity' } as const, { busy: false } as Activity)
const benchAtom = atom({ plugin: 'workbench', key: 'bench' } as const, { itemsOpen: true } as WorkbenchUi)

// The skin /skin has on. Skins is optional (not a dependency): its refs are cast because its
// contract is not laid here, and with it off the pane uses its own colors.
const SKIN_PREFS = { plugin: 'skins', key: 'prefs' } as const
const SKIN_CUSTOM = { plugin: 'skins', key: 'custom' } as const
const SKIN_LIGHT = { plugin: 'skins', key: 'isLight' } as const

const quiet = <T,>(p: Promise<T>) => p.catch(() => undefined)
/** The label of a blank button laid over a drawn icon: two em spaces. Plain spaces collapse to one on the desktop, which left only the icon's left edge clickable. */
const COVER = '\u2003\u2003'

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
  // The sections as last left, from the store.
  const sections = sectionsOf(await quiet($.store.get(SECTIONS)))
  await update($, benchAtom, u => ({ ...u, sections }))
  if (settings.openPane) void openPane($)
}

/** After each turn: commits and checkouts happen in Bash, so the branch line catches up. */
/** Which Workbench sections are open, kept across sessions: Tasks open, Files and In Flight collapsed until changed. */
const SECTIONS = 'sections'
type Sections = { tasks: boolean; files: boolean; deck: boolean }
const sectionsOf = (v: unknown): Sections => ({ tasks: true, files: false, deck: false, ...(v && typeof v === 'object' ? (v as Partial<Sections>) : {}) })
async function toggleSection($: $, k: keyof Sections) {
  const ui = await update($, benchAtom, u => {
    const cur = sectionsOf(u.sections)
    return { ...u, sections: { ...cur, [k]: !cur[k] } }
  })
  await quiet($.store.set(SECTIONS, ui.sections))
}

/* ── the In Flight card: its state, read and drawn here; its hooks are further down ── */

const mainAtom = atom({ plugin: 'workbench', key: 'deckMain' } as const, DEFAULT_MAIN)
const usageAtom = atom({ plugin: 'workbench', key: 'deckUsage' } as const, DEFAULT_USAGE)
const archAtom = atom({ plugin: 'workbench', key: 'deckArchitect' } as const, DEFAULT_ARCHITECT)
const gateAtom = atom({ plugin: 'workbench', key: 'deckGate' } as const, DEFAULT_GATE)
const agentsAtom = atom({ plugin: 'workbench', key: 'deckAgents' } as const, [] as DeckAgent[])
const loopsAtom = atom({ plugin: 'workbench', key: 'deckLoops' } as const, [] as DeckLoop[])
const logAtom = atom({ plugin: 'workbench', key: 'deckLog' } as const, [] as DeckLogLine[])
const turnAtom = atom({ plugin: 'workbench', key: 'deckTurn' } as const, DEFAULT_TURN)
const receiptAtom = atom({ plugin: 'workbench', key: 'deckReceipt' } as const, null as DeckReceipt | null)
const viewAtom = atom({ plugin: 'workbench', key: 'deckView' } as const, DEFAULT_VIEW)
const rosterAtom = atom({ plugin: 'workbench', key: 'deckRoster' } as const, DEFAULT_ROSTER)
const sessionsAtom = atom({ plugin: 'workbench', key: 'deckSessions' } as const, [] as DeckSession[])

/** How often the Sessions panel rereads the registry. Read even while In Flight is collapsed: its header counts them. */
const SESSIONS_MS = 3000

/** Every Claude Code session running on this machine, from the registry under `~/.claude/sessions`; written only when it changed. */
async function pollSessions($: $) {
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? ''}/.claude`
  const dir = `${home}/sessions`
  const names = (await $.fs.list(dir)).filter(f => f.kind === 'file' && /^\d+\.json$/.test(f.name)).map(f => f.name)
  const files = (await Promise.all(names.map(n => quiet($.fs.read(`${dir}/${n}`)).then(t => (t ? parseSessionFile(t) : null)))))
    .filter((f): f is SessionFile => f !== null)
  const pids = files.map(f => f.pid)
  const ps = pids.length ? await quiet($.process.run(['ps', '-o', 'pid=,comm=', '-p', pids.join(',')], { timeoutMs: 5000 })) : undefined
  const list = sessionsOf(files, alivePids(ps?.stdout ?? ''), (await quiet($.session.id())) ?? '')
  const was = await read($, sessionsAtom)
  if (JSON.stringify(was) !== JSON.stringify(list)) await update($, sessionsAtom, () => list)
}

async function watchSessions($: $) {
  await quiet(pollSessions($))
  $.clock.every(SESSIONS_MS, () => quiet(pollSessions($)))
}

async function readDeck($: $): Promise<DeckData> {
  const [main, usage, arch, gate, cards, loops, log, turn, receipt, view, sessions, now] = await Promise.all([
    getMain($), getUsage($), getArch($), getGate($), getCards($), getLoops($), getLog($), getTurn($), read($, receiptAtom), getView($),
    getSessions($), $.clock.now(),
  ])
  return { main, usage, arch, gate, cards, loops, log, turn, receipt, view, sessions, now }
}

/** The card's Reset: agents, checks, consults, log and the turn clear; cost, rate limits and compactions stay. */
async function resetDeck($: $) {
  await update($, mainAtom, RESET.main)
  await update($, archAtom, () => DEFAULT_ARCHITECT)
  await update($, gateAtom, () => DEFAULT_GATE)
  await update($, agentsAtom, () => [])
  await update($, loopsAtom, () => [])
  await update($, logAtom, () => [])
  await update($, turnAtom, () => DEFAULT_TURN)
  await update($, receiptAtom, () => null)
  await update($, viewAtom, () => DEFAULT_VIEW)
  await update($, usageAtom, RESET.usage)
}

const afterTurnWorkbench = ($: $) => {
  void quiet(refreshGit($))
  // The turn is over: Right now goes back to idle.
  void quiet(update($, activityAtom, a => ({ ...a, busy: false })))
}


/* ── Plan files: the source of truth, read from disk ── */

/** The plans folder this session works in, and the plans read from it last. */
let plansDir: string | undefined
let plans: Plan[] = []

/** The settings from /config (the manifest's userConfig), read when the module loads. */
const settings = { plansDir: 'plans', openPane: true, band: true, followMacos: true }

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
  await quiet(deckTurnDone($, e))
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

/* ── In Flight's hooks: they watch the session and keep the card's state; each passes its event on unchanged ── */

/** Agent types and server tools that count as the on-call architect. */
const ARCHITECT = /advisor|architect/i

type ServerBlock = { type: string; id?: string; name?: string; tool_use_id?: string }

// Every read goes through these, so a value saved under an older shape still reads after a reload.
const getMain = async ($: $) => normalize(DEFAULT_MAIN, await read($, mainAtom))
const getUsage = async ($: $) => normalize(DEFAULT_USAGE, await read($, usageAtom))
async function getArch($: $): Promise<DeckArchitect> {
  const a = normalize(DEFAULT_ARCHITECT, await read($, archAtom))
  return { ...a, consults: listOf(a.consults), ids: listOf(a.ids), seen: listOf(a.seen) }
}
const getGate = async ($: $) => normalizeGate(await read($, gateAtom))
const getCards = async ($: $) => listOf<unknown>(await read($, agentsAtom)).map(normalizeCard)
const getLoops = async ($: $) => listOf<DeckLoop>(await read($, loopsAtom))
const getLog = async ($: $) => normalizeLog(await read($, logAtom))
const getTurn = async ($: $) => normalize(DEFAULT_TURN, await read($, turnAtom))
const getView = async ($: $): Promise<DeckView> => normalize(DEFAULT_VIEW, await read($, viewAtom))
const getSessions = async ($: $) => listOf<DeckSession>(await read($, sessionsAtom))
const getRoster = async ($: $) => ({ architectTypes: listOf<string>(normalize(DEFAULT_ROSTER, await read($, rosterAtom)).architectTypes) })

async function say($: $, who: string, text: string, kind: DeckLogLine['kind'] = 'info', agentId: string | null = null) {
  const line: DeckLogLine = { at: await $.clock.now(), who, text, kind, agentId }
  await update($, logAtom, list => [...normalizeLog(list), line].slice(-60))
}

async function whoIs($: $, agentId: string | undefined) {
  if (!agentId) return 'main'
  const card = (await getCards($)).find(c => c.id === agentId)
  return card ? shorten(cardTitle(card), 14) : 'agent'
}

async function consultStarted($: $, id: string, via: string) {
  const moment = momentOf(await getTurn($))
  const at = await $.clock.now()
  await update($, archAtom, a => startConsult(normalize(DEFAULT_ARCHITECT, a), { id, at, moment, via }))
  if (moment === 'before done') await update($, turnAtom, x => ({ ...normalize(DEFAULT_TURN, x), isReviewing: true }))
  await say($, 'architect', `${moment} · ${via}`, 'consult')
}

async function consultEnded($: $, advice: string | null, id?: string) {
  const at = await $.clock.now()
  const first = advice?.split('\n').find(l => l.trim()) ?? null
  const text = first ? shorten(first.replace(/^[#>*\s-]+/, ''), 160) : null
  await update($, archAtom, a => endConsult(normalize(DEFAULT_ARCHITECT, a), at, text, id))
  await update($, turnAtom, t => ({ ...normalize(DEFAULT_TURN, t), isReviewing: false }))
  await say($, 'architect', text ? `advice: ${shorten(text, 60)}` : 'advice returned', 'consult')
}

async function noteAdvice($: $, advice: string) {
  await update($, archAtom, x => ({ ...normalize(DEFAULT_ARCHITECT, x), lastAdvice: advice }))
  await say($, 'architect', `advice: ${shorten(advice, 60)}`, 'consult')
}

const isArchitectType = async ($: $, type: string) => ARCHITECT.test(type) || (await getRoster($)).architectTypes.includes(type)

/** The session's cost read fresh, not from the last measurement: the receipt subtracts two of these. */
const costNow = async ($: $) => (await $.session.usage().catch(() => null))?.cost?.usd ?? null

async function noteMode($: $, mode: string | undefined) {
  if (mode) await update($, mainAtom, m => (normalize(DEFAULT_MAIN, m).mode === mode ? normalize(DEFAULT_MAIN, m) : { ...normalize(DEFAULT_MAIN, m), mode }))
}

/* ── hooks: each passes its event on unchanged ── */

// tool.check carries no loop id; the tool.call around it does, keyed by the call's id.
const callLoop = new Map<string, string | null>()
type CallIn = Parameters<Hook<'tool.call'>>[1]
type CallOut = Awaited<ReturnType<Hook<'tool.call'>>>
type TurnIn = Parameters<Hook<'turn.complete'>>[1]

/** After a tool call: settle its permission check, note it on its agent's card, log edits, errors and refusals. */
async function noteCall($: $, e: CallIn, ran: CallOut) {
  const didRun = ran.deny === undefined
  // Settle this call's pending ask, if it had one; skip the write (and the redraw) otherwise.
  const g0 = await getGate($)
  if (settleCheck(g0, e.tool_use_id, didRun) !== g0) await update($, gateAtom, g => settleCheck(normalizeGate(g), e.tool_use_id, didRun))
  // A background agent hands its report back through this tool; an architect's report is its advice.
  if (String(e.tool) === 'SubagentHandback') {
    const message = (e as unknown as { message?: unknown }).message
    const a = e.agentId ? await getArch($) : null
    if (a && e.agentId && a.ids.includes(e.agentId) && typeof message === 'string') {
      const advice = adviceLine(message)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, advice)
    }
    return
  }
  if (e.tool === 'Agent') return
  const hasFailed = didRun && ran.isError === true
  const isEdit = !hasFailed && didRun && EDIT_TOOLS.has(e.tool)
  const t0 = await getTurn($)
  if (isEdit || hasFailed || (!e.agentId && t0.errorStreak > 0))
    await update($, turnAtom, t => afterCall(normalize(DEFAULT_TURN, t), { inSubagent: Boolean(e.agentId), hasFailed, isEdit }))
  const text = shorten(describeInput(e.tool, e), 64)
  if (e.agentId) {
    const id = e.agentId
    await update($, agentsAtom, list =>
      listOf<unknown>(list)
        .map(normalizeCard)
        .map(c => (c.id === id ? noteTool(c, { tool: e.tool, text, isError: hasFailed || ran.deny !== undefined }) : c)),
    )
  }
  // The log keeps what is worth a glance: refusals, errors and edits; the rest is on the cards.
  if (ran.deny !== undefined) await say($, await whoIs($, e.agentId), `${text}  denied`, 'error', e.agentId ?? null)
  else if (hasFailed) await say($, await whoIs($, e.agentId), `${text}  ✗`, 'error', e.agentId ?? null)
  else if (isEdit) await say($, await whoIs($, e.agentId), text, 'info', e.agentId ?? null)
}

/** In Flight at session start: the first usage reading. A host without usage just starts without it. */
async function deckStart($: $) {
  const u = await $.session.usage().catch(() => null)
  if (u)
    await update($, usageAtom, x => ({
      ...normalize(DEFAULT_USAGE, x),
      pct: u.context.percent ?? null,
      tokens: u.context.tokens ?? null,
      window: u.context.window,
      costUsd: u.cost?.usd ?? null,
      limits: u.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed })),
    }))
}

/** In Flight around a tool call: it runs the call, then notes it; nothing after the call may throw into it. */
async function deckToolCall($: $, e: CallIn, next: (e: CallIn) => Promise<CallOut>): Promise<CallOut> {
  callLoop.set(e.tool_use_id, e.agentId ?? null)
  const ran = await next(e).finally(() => callLoop.delete(e.tool_use_id))
  await noteCall($, e, ran).catch(() => undefined)
  return ran
}

/** In Flight after a turn, the main loop's or an agent's: the receipt, or the agent's card done. */
async function deckTurnDone($: $, e: TurnIn) {
  const id = e.agentId
  const now = await $.clock.now()
  if (!id) {
    const [t, cards, cost] = await Promise.all([getTurn($), getCards($), costNow($)])
    const r = receiptOf(t, { durationMs: e.durationMs, agentsSince: cards.filter(c => c.spawnedAt >= t.startedAt).length, costNow: cost, reason: e.reason })
    await update($, receiptAtom, () => r)
    await update($, mainAtom, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
    return
  }
  if ((await getArch($)).ids.includes(id)) {
    await consultEnded($, e.answer, id)
    return
  }
  const cards = await getCards($)
  if (cards.some(c => c.id === id)) {
    const status = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
    await update($, agentsAtom, list =>
      listOf<unknown>(list)
        .map(normalizeCard)
        .map(c => (c.id === id ? { ...c, status, endedAt: now, answer: shorten(e.answer, 400) } : c)),
    )
    const card = cards.find(c => c.id === id)
    await say($, await whoIs($, id), status === 'done' ? `done · ${card ? fmtDuration(now - card.spawnedAt) : ''}` : status, status === 'done' ? 'done' : 'error', id)
  } else {
    await update($, loopsAtom, l => listOf<DeckLoop>(l).map(x => (x.id === id ? { ...x, isDone: true, lastAt: now } : x)))
  }
}

// The desktop app follows macOS appearance, but mods only see Claude Code's `theme` setting.
// Keeping it on light or dark to match lets skins and the pane redraw for the right background.
async function syncAppearance($: EngineInterface): Promise<void> {
  const { stdout } = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 5000 })
  const current = (await $.config.list()).find(row => row.key === 'theme')?.value
  const want = themeFor(current, stdout)

  if (current !== want) {
    await $.config.set({ key: 'theme', value: want })
    // Skins re-reads the theme inside that set and still sees the old one; setting it again
    // a moment later makes it read the new one.
    await $.clock.sleep(1000)
    await $.config.set({ key: 'theme', value: want })
  }
}

// The first sync fails off macOS (no `defaults`), and then nothing keeps checking.
async function followAppearance($: EngineInterface): Promise<void> {
  await syncAppearance($)
  $.clock.every(5000, () => quiet(syncAppearance($)))
}

export const register: Register = (on, options) => {
  settings.plansDir = plansDirName(options.plans_dir)
  settings.openPane = options.open_pane !== 'off'
  settings.band = options.band !== 'off'
  settings.followMacos = options.follow_macos !== 'off'

  // In Flight: the events only it watches. session.start, tool.call and turn.complete go through the Workbench's own hooks.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await resetDeck($)
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    if (ARCHITECT.test(e.agent))
      await update($, rosterAtom, r => {
        const x = { architectTypes: listOf<string>(normalize(DEFAULT_ROSTER, r).architectTypes) }
        return x.architectTypes.includes(e.agent) ? x : { architectTypes: [...x.architectTypes, e.agent].slice(-20) }
      })
    return offered
  })

  on('turn.start', async ($, e, next) => {
    const [now, cost] = await Promise.all([$.clock.now(), costNow($)])
    await update($, turnAtom, () => ({ ...DEFAULT_TURN, startedAt: now, costAtStart: cost }))
    await update($, mainAtom, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: true }))
    // A background architect's report reaches the main loop as the text opening this turn. The
    // SubagentHandback tool call (in tool.call) normally carries it first; this is the fallback.
    const back = e.text ? handbackOf(e.text) : null
    const a = back ? await getArch($) : null
    if (back && a && a.ids.includes(back.from)) {
      const advice = adviceLine(back.body)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, advice)
    } else if (e.text) {
      const p = promptLine(e.text)
      await say($, p.who, p.text)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // The main loop's model is known when its request starts; a long first request shouldn't read "-".
    if (!e.agentId) {
      await update($, mainAtom, m => {
        const x = normalize(DEFAULT_MAIN, m)
        return { ...x, model: e.model, effort: String(e.effort ?? x.effort), steps: x.steps + 1 }
      })
      return yield* next(e)
    }
    const result = yield* next(e)
    const id = e.agentId
    const [cards, a] = await Promise.all([getCards($), getArch($)])
    if (cards.some(c => c.id === id)) {
      const step = { model: e.model, usage: result.usage, stopReason: result.stopReason }
      await update($, agentsAtom, list => listOf<unknown>(list).map(normalizeCard).map(c => (c.id === id ? applyStep(c, step) : c)))
      if (result.stopReason === 'max_tokens') await say($, await whoIs($, id), 'hit max_tokens', 'error', id)
    } else if (!a.ids.includes(id)) {
      const now = await $.clock.now()
      await update($, loopsAtom, l => stepLoop(listOf<DeckLoop>(l), id, now))
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usageAtom, x => ({
      ...normalize(DEFAULT_USAGE, x),
      pct: e.context.percent ?? null,
      tokens: e.context.tokens ?? null,
      window: e.context.window,
      costUsd: e.cost?.usd ?? null,
      limits: e.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed })),
    }))
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') {
      const now = await $.clock.now()
      await update($, usageAtom, x => {
        const u = normalize(DEFAULT_USAGE, x)
        return { ...u, compactions: u.compactions + 1, lastCompactAt: now }
      })
      await say($, 'main', `context compacted (${e.trigger})`)
    }
    return done
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id) {
      const check: DeckCheck = {
        id: e.tool_use_id,
        tool: e.tool,
        bucket: bucketOf(e.tool),
        verdict: verdict.decision === 'allow' ? 'rule' : verdict.decision,
        inSubagent: Boolean(callLoop.get(e.tool_use_id)),
        detail: shorten(describeInput(e.tool, e.input), 90),
        at: await $.clock.now(),
      }
      await update($, gateAtom, g => recordCheck(normalizeGate(g), check))
      if (verdict.decision === 'deny') await say($, 'gate', `denied by rule · ${check.detail}`, 'error')
    }
    return verdict
  })

  // A server-side review tool never reaches tool.call: it shows only in the assistant's rows.
  on('session.append', async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const a = await getArch($)
      // Consults this row opened: their result may be in the same row, after the stale read above.
      const opened = new Set<string>()
      for (const block of e.message.content as unknown as readonly ServerBlock[]) {
        if (block.type === 'server_tool_use' && block.name && block.id && ARCHITECT.test(block.name)) {
          if (a.seen.includes(block.id)) continue
          const id = block.id
          await update($, archAtom, x => {
            const y = normalize(DEFAULT_ARCHITECT, x)
            return { ...y, seen: [...listOf<string>(y.seen), id].slice(-60) }
          })
          opened.add(id)
          await consultStarted($, id, `${block.name} tool`)
        } else if (block.type.endsWith('_tool_result') && block.tool_use_id) {
          const id = block.tool_use_id
          const isOpen = opened.has(id) || (await getArch($)).consults.some(c => c.id === id && c.endAt === null)
          if (isOpen) await consultEnded($, null, id)
        }
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (!e.parentAgentId) await noteMode($, e.permissionMode)
    if (started.deny !== undefined || !started.agentId) return started
    const id = started.agentId
    if (await isArchitectType($, e.subagentType)) {
      await update($, archAtom, a => {
        const x = normalize(DEFAULT_ARCHITECT, a)
        return { ...x, ids: [...listOf<string>(x.ids), id].slice(-40) }
      })
      await update($, loopsAtom, l => listOf<DeckLoop>(l).filter(x => x.id !== id))
      await consultStarted($, id, e.subagentType.split(':').pop() ?? 'agent')
      return started
    }
    const card: DeckAgent = { ...normalizeCard({}), id, type: e.name ?? e.subagentType, model: started.model, description: e.description, spawnedAt: await $.clock.now() }
    await update($, agentsAtom, list => [...listOf<unknown>(list).map(normalizeCard), card].slice(-24))
    await update($, loopsAtom, l => listOf<DeckLoop>(l).filter(x => x.id !== id))
    await say($, shorten(cardTitle(card), 12), `spawned · ${card.type}`, 'info', id)
    return started
  })


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
    void quiet(deckStart($))
    void startWorkbench($)
    if (settings.followMacos) void quiet(followAppearance($))
    void quiet(watchSessions($))
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

  // A prompt starts a turn: Right now shows Claude working until the turn ends.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    await quiet(update($, activityAtom, () => ({ busy: true, since: Date.now() })))
    return r
  }).catch(($, e, next) => next(e))

  // What Claude reads and edits, for "Right now" and "Claude touched"; commands and searches for "Right now".
  // Every call also runs through In Flight, which settles its permission check and logs edits and errors.
  on('tool.call', async ($, e, next) => {
    const kind = FILE_TOOLS[e.tool]
    const args = e as unknown as { file_path?: unknown; notebook_path?: unknown; command?: unknown; description?: unknown; pattern?: unknown }
    const raw = args.file_path ?? args.notebook_path
    if (!kind || typeof raw !== 'string') {
      const text = (v: unknown) => (typeof v === 'string' ? v.split('\n')[0]!.trim() : '')
      const act: Activity =
        e.tool === 'Bash' ? { busy: true, kind: 'run', label: text(args.description) || text(args.command) }
        : (e.tool as string) === 'Grep' || (e.tool as string) === 'Glob' ? { busy: true, kind: 'search', label: text(args.pattern) } // where the build has them
        : { busy: true }
      await quiet(update($, activityAtom, a => (act.kind ? { ...act, since: a.since } : { ...a, busy: true })))
      return deckToolCall($, e, next)
    }
    const path = absOf(raw, (await quiet($.session.cwd())) ?? '')
    await quiet(update($, activityAtom, a => ({ busy: true, kind, path, since: a.since })))
    await quiet(update($, touchedAtom, l => addTouch(l, { path, kind, active: true, at: Date.now() })))
    try {
      return await deckToolCall($, e, next)
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
    const activity = await read($, activityAtom)
    const open = sectionsOf(ui.sections)

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
      // The bar takes the row less its text (about 7 px a character) and a gap.
      const tail = `${pct}% · ${total ? `${done} of ${total} done` : 'not broken down'}`
      const barW = Math.max(60, room(2) - tail.length * 7 - 12)
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
              <Button key={'sqb-' + it.id} plain label={COVER} onPress={press} />
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
          // The band's bar, then the percent and the count flush with the card's right edge.
          <Box key="ct-bar" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1} marginTop={1} width="100%">
            <Svg width={barW} height={16} alt={`${barIn(cur).pill}, ${pct}% done`} source={paneBarSvg(barW, barIn(cur))} />
            <Box flexShrink={0}><Text {...c('muted')}>{tail}</Text></Box>
          </Box>
        ) : (
          <Text key="ct-bar" wrap="truncate-end">
            <Text {...c('ok')}>{'█'.repeat(Math.round((Math.max(8, cols - 12) * done) / Math.max(1, total)))}</Text>
            <Text {...c('muted')}>{'░'.repeat(200)}</Text>
          </Text>
        ),
        // On the desktop the count rides at the end of the bar's line, beside the percent.
        Svg ? null : (
          <Box key="ct-count" flexDirection="row" justifyContent="space-between" width="100%">
            <Text {...c('muted')}>{total ? `${done} of ${total} done` : 'Not broken down yet'}</Text>
            <Text bold {...c('ok')}>{`${pct}%`}</Text>
          </Box>
        ),
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
    // While a turn runs, the last thing Claude did stays up; idle once the turn ends.
    const act = activity.busy ? activity : undefined
    // The file Claude is on right now shimmers; files edited this turn stay lit until the next prompt.
    const hotPath = act && (act.kind === 'read' || act.kind === 'edited') ? act.path : undefined
    const hotSlot: Slot = act?.kind === 'read' ? 'read' : 'write'
    const editedNow = new Set(touched.filter(t => t.kind === 'edited' && activity.since !== undefined && t.at >= activity.since).map(t => t.path))
    const tone = (slot: Slot) => (pal.themed ? pal[slot] : THEME_KEY[slot] ?? 'text')
    const isUnder = (dir: string, set: Iterable<string>) => [...set].some(p => p.startsWith(dir + '/'))
    /** A file's name: shimmering while Claude is on it, lit if edited this turn, else as `plain` draws it. */
    const fileName = (key: string, path: string, text: string, plain: () => unknown) =>
      path === hotPath
        ? 'Client' in els
          ? <els.Client key={key + '-sh-' + path} module="./shimmer.tsx" props={{ text, color: tone(hotSlot), shine: tone('fg') }} />
          : <Text key={key} bold wrap="truncate-end" {...c(hotSlot)}>{text}</Text>
        : editedNow.has(path)
          ? <Text key={key} bold wrap="truncate-end" {...c('write')}>{text}</Text>
          : plain()
    const last = touched[0]
    const dirtyHere = git.dirty.filter(p => p === root || p.startsWith(root + '/'))
    const fileKids: unknown[] = []

    // Right now: what Claude is doing, the branch, the legend
    const state =
      act?.kind === 'read' ? { icon: 'eye' as const, slot: 'read' as const, glyph: '◉' }
      : act?.kind === 'edited' ? { icon: 'pencil' as const, slot: 'write' as const, glyph: '✎' }
      : act?.kind === 'run' ? { icon: 'terminal' as const, slot: 'run' as const, glyph: '❯' }
      : act?.kind === 'search' ? { icon: 'search' as const, slot: 'search' as const, glyph: '⌕' }
      : act ? { icon: 'loader-circle' as const, slot: 'user' as const, glyph: '…' }
      : { icon: 'coffee' as const, slot: 'muted' as const, glyph: '◌' }
    const stateInk = ink(state.slot)
    const headText =
      act?.path ? `Claude is ${act.kind === 'read' ? 'reading' : 'editing'} ${baseOf(act.path)}`
      : act?.kind === 'run' ? 'Claude is running a command'
      : act?.kind === 'search' ? 'Claude is searching'
      : act ? 'Claude is thinking'
      : 'Claude is idle'
    const sub =
      act?.path ? `in ${relDir(act.path, root)}`
      : act?.label ? act.label
      : act ? 'Working on your prompt'
      : last ? `last ${last.kind === 'read' ? 'read' : 'edited'} ${baseOf(last.path)}` : 'Waiting for the next file'
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
    for (const t of touched.slice(0, 5)) { // the last five; the header counts them all
      const slot = t.kind === 'read' ? 'read' : 'write'
      const tag = fileTag(extOf(t.path), ink('run'))
      const p = pill(badge(t), ink(slot))
      touchKids.push(
        <Box key={'tc-' + t.path} flexDirection="row" columnGap={1} alignItems="center" marginTop={1} paddingLeft={2} width="100%">
          {Svg ? <Svg key={'tct-' + t.path} width={tag.w} height={tag.h} alt={extOf(t.path) || 'file'} source={tag.source} /> : null}
          {/* The name, at most 20 characters, never squeezed; the folder after it takes what is left. */}
          <Box flexShrink={0}>{fileName('tcn-' + t.path, t.path, clip(baseOf(t.path), 20), () => <Text bold {...c('fg')}>{clip(baseOf(t.path), 20)}</Text>) as never}</Box>
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
            <Svg width={17} height={17} alt={r.dir ? 'folder' : 'file'} source={icon(r.dir ? (r.open ? 'folder-open' : 'folder') : 'file', r.path === hotPath || (r.dir && !r.open && hotPath && isUnder(r.path, [hotPath])) ? ink(hotSlot) : editedNow.has(r.path) || (r.dir && !r.open && isUnder(r.path, editedNow)) ? ink('write') : r.dir && !hidden ? folderInk : mutedInk, 17)} />
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
                fileName('rn-' + r.path, r.path, r.name, () => <Text wrap="truncate-end" {...c(hidden ? 'muted' : 'fg')}>{r.name}</Text>) as never
              )}
            </Box>
            {marks(r.path, r.dir) as never}
            {files.showSizes && !r.dir ? <Text {...c('muted')}>{humanSize(r.size)}</Text> : null}
          </Box>,
        )
      }
    }

    // A section's header: ▼ open, ▶ collapsed to this one row; the arrow, the icon and the title all toggle it.
    // The icon is a drawing, so a blank button lies over it; spilling onto its neighbours is harmless, they toggle too.
    // In Flight is read only while open, so a collapsed card does not redraw the pane on every event.
    const deck = open.deck ? await readDeck($) : undefined
    // Collapsed, the header still counts the sessions on this machine.
    const others = deck ? '' : sessionsLine(await getSessions($))
    const deckBody = deck
      ? deckKids(deck, {
          els, cols, pal, card, capsText,
          viewed: e.props?.view?.agentId ?? null,
          onGate: b => void update($, viewAtom, x => ({ ...normalize(DEFAULT_VIEW, x), gateOpen: normalize(DEFAULT_VIEW, x).gateOpen === b ? null : b })),
          onExpand: id => void update($, viewAtom, x => ({ ...normalize(DEFAULT_VIEW, x), expanded: normalize(DEFAULT_VIEW, x).expanded === id ? null : id })),
          onReset: () => void resetDeck($),
        })
      : []

    const SECTION_ICON = { tasks: ['list-checks', 'ok'], files: ['folder', 'user'], deck: ['gauge', 'write'] } as const
    const section = (key: string, k: keyof Sections, title: string) => {
      const toggle = () => void toggleSection($, k)
      return (
        <Box key={key + '-h'} flexDirection="row" alignItems="center" columnGap={1}>
          <Button key={key + '-toggle'} plain label={open[k] ? '▼' : '▶'} onPress={toggle} />
          {Svg ? (
            <Box key={key + '-icon'} width={2} height={1} flexShrink={0} justifyContent="center" alignItems="center">
              <Svg width={16} height={16} alt={k} source={icon(SECTION_ICON[k][0], ink(SECTION_ICON[k][1]), 16)} />
              <Box position="absolute" top={0} left={0} right={0} bottom={0}>
                <Button key={key + '-iconb'} plain label={COVER} onPress={toggle} />
              </Box>
            </Box>
          ) : null}
          <Button key={key + '-name'} plain onPress={toggle}>{title}</Button>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" alignItems="stretch" width="100%" gap={1}>
        {card('box-task', open.tasks ? [section('bt', 'tasks', cur ? `Task · ${cur.short}` : 'Task'), ...task] : [section('bt', 'tasks', 'Tasks')])}
        {card('box-files', open.files ? [section('bf', 'files', `Files: ${baseOf(root) || '/'}`), ...fileKids] : [section('bf', 'files', 'Files')])}
        {card('box-deck', deck ? [section('bd', 'deck', deckTitle(deck.main)), ...deckBody] : [section('bd', 'deck', others ? `In Flight · ${others}` : 'In Flight')])}
      </Box>
    )
  })
}
