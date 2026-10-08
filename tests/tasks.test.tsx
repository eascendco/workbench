import { expect, mock, test } from 'claude-code/testing'

import type { WorkItem } from '../types'
import { activeItem, clip, parseAdd } from '../hooks/logic'
import { newPlanText, newTaskKey, parsePlan, plansDirName, setItems, snapshotOfPlans } from '../hooks/plans'
import type { PlanFront } from '../hooks/plans'

const ROOT = '/Users/x/code/weather-app'
const PLANS = ROOT + '/plans'

const ITEMS: WorkItem[] = [
  { id: 'w1', title: 'Pick an API', stage: 'spec', status: 'done' },
  { id: 'w2', title: 'Forecast screen', stage: 'build', status: 'doing', details: 'Seven days, with the hourly view behind a tap' },
  { id: 'w3', title: 'Offline cache', stage: 'build', status: 'draft' },
]
const front = (task: string, title: string, date: string, end = date): PlanFront => ({ task, project: 'weather-app', short: 'weather-app', title, date, end, status: 'open' })
const FORECAST = newPlanText(front('forecast', 'Seven-day forecast', '2026-10-08'), ITEMS, 'Use the free tier first.')
const ALERTS = newPlanText(front('alerts', 'Severe weather alerts and push notifications', '2026-12-06', '2026-12-07'), [])

type On = Parameters<import('claude-code/testing').TestBody>[1]

/** An in-memory disk beneath the plugin. */
function world(on: On, files: Record<string, string>, cwd = ROOT) {
  const disk = new Map(Object.entries(files))
  const s = { disk, clock: mock.clock(on) }
  mock.env(on, { HOME: '/Users/x' })
  on('session.cwd', async () => ({ value: cwd }))
  on('fs.exists', async ($, e) => ({ value: disk.has(e.path) || [...disk.keys()].some(k => k.startsWith(e.path + '/')) }))
  on('fs.read', async ($, e) => {
    const t = disk.get(e.path)
    if (t === undefined) throw new Error('ENOENT ' + e.path)
    return { value: t }
  })
  on('fs.write', async ($, e) => {
    disk.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', async ($, e) => {
    const names = new Map<string, 'file' | 'dir'>()
    for (const k of disk.keys())
      if (k.startsWith(e.path + '/')) {
        const rest = k.slice(e.path.length + 1)
        names.set(rest.split('/')[0]!, rest.includes('/') ? 'dir' : 'file')
      }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', async () => ({ value: undefined }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.panes', async () => ({ value: [] }) as never)
  return s
}
const run = async ($: { command: { run: (x: never) => Promise<unknown> } }, args: string) =>
  String(((await $.command.run({ command: 'task', args } as never)) as { text?: string }).text ?? '')
const tool = async ($: { tool: { call: (x: never) => Promise<unknown> } }, input: object) =>
  String(((await $.tool.call({ tool: 'mcp__workbench__work_items', ...input } as never)) as { result?: unknown }).result ?? '')
type Found = { props: Record<string, unknown> }
const svgs = async (ui: { findAll: (q: never) => Promise<Found[]> }, alt: RegExp) =>
  (await ui.findAll({ type: 'Svg' } as never)).filter(f => alt.test(String(f.props.alt ?? '')))

/* ── plan files ── */

test('a plan file reads back as written: header, items with stages, status marks and details', async () => {
  const p = parsePlan(FORECAST, PLANS + '/forecast.md')!
  expect(p).toMatchObject({ task: 'forecast', title: 'Seven-day forecast', date: '2026-10-08', short: 'weather-app', status: 'open' })
  expect(p.items.map(i => [i.title, i.stage, i.status, i.details])).toEqual([
    ['Pick an API', 'spec', 'done', undefined],
    ['Forecast screen', 'build', 'doing', 'Seven days, with the hourly view behind a tap'],
    ['Offline cache', 'build', 'draft', undefined],
  ])
  expect(FORECAST).toMatch(/- \[x\] Pick an API `spec`\n- \[~\] Forecast screen `build`\n  Seven days/)
  expect(FORECAST).toMatch(/## Notes\n\nUse the free tier first\./)
})

test('rewriting the items keeps the rest of the file; hand-written items parse too', async () => {
  const p = parsePlan(FORECAST, 'f')!
  const next = setItems(FORECAST, [...p.items, { id: 'x', title: 'Smoke test', stage: 'test', status: 'todo', details: 'Run it once' }])
  expect(next).toMatch(/## Notes\n\nUse the free tier first\./)
  expect(parsePlan(next, 'f')!.items.at(-1)).toMatchObject({ title: 'Smoke test', stage: 'test', details: 'Run it once' })
  const hand = FORECAST.replace('## Notes', '* [X] Extra step\n  first line\n  second line\n\n## Notes')
  expect(parsePlan(hand, 'f')!.items.at(-1)).toMatchObject({ title: 'Extra step', stage: 'build', status: 'done', details: 'first line second line' })
})

test('the current task is the earliest open plan; done plans drop out', async () => {
  const snap = snapshotOfPlans([parsePlan(ALERTS, 'b')!, parsePlan(FORECAST, 'a')!], ROOT)
  expect(snap.cur?.key).toBe('forecast')
  expect(snap.next.map(g => g.key)).toEqual(['alerts'])
  const done = snapshotOfPlans([parsePlan(FORECAST.replace('status: open', 'status: done'), 'a')!, parsePlan(ALERTS, 'b')!], ROOT)
  expect(done.cur?.key).toBe('alerts')
})

test('helpers: add parsing, item in hand, clipping, task keys, the plans folder setting', async () => {
  expect(parseAdd('test: Smoke test -- run the app once', 'build')).toEqual({ stage: 'test', title: 'Smoke test', details: 'run the app once' })
  expect(parseAdd('Just a title', 'build')).toEqual({ stage: 'build', title: 'Just a title' })
  expect(activeItem(ITEMS)?.id).toBe('w2')
  expect(clip('Severe weather alerts and push notifications', 30)).toBe('Severe weather alerts and pus…')
  expect(newTaskKey('Severe weather alerts and push notifications', [])).toBe('severe-weather-alerts-and')
  expect(newTaskKey('Forecast', ['forecast', 'forecast-2'])).toBe('forecast-3')
  expect(plansDirName('tasks')).toBe('tasks')
  expect(plansDirName('../etc')).toBe('plans')
  expect(plansDirName(undefined)).toBe('plans')
})

/* ── the plugin over files ── */

test('the band and the Workbench draw the task from the plan files', async ($, on) => {
  world(on, { [PLANS + '/forecast.md']: FORECAST, [PLANS + '/alerts.md']: ALERTS })
  await run($, '')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'workbench', surface, component: 'Pane', requestId: 'workbench', props: {} } as never)
    if (surface === 'desktop') expect((await svgs(ui as never, /^Seven-day forecast$/)).length).toBe(1)
    else expect(await ui.find({ text: /Seven-day forecast/ })).toBeDefined()
    expect(await ui.find({ text: /Forecast screen/ })).toBeDefined()
    expect(await ui.find({ text: /Offline cache/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /\+ Add work item/ })).toBeDefined()
    expect(await ui.find({ text: /Severe weather alerts/ })).toBeDefined()
    await ui.unmount()
  }
  const band = await $.ui.mount({ plugin: 'workbench', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 100 } } as never)
  expect((await svgs(band as never, /weather-app: Seven-day forecast, now Forecast screen/)).length).toBe(1)
  await band.unmount()
})

test('changes write the plan file; a plan with every item done is marked done', async ($, on) => {
  const w = world(on, { [PLANS + '/forecast.md']: FORECAST, [PLANS + '/alerts.md']: ALERTS })
  expect(await run($, 'start 3')).toMatch(/Saved: Offline cache → doing/)
  expect(await run($, 'done 2')).toMatch(/Saved/)
  expect(w.disk.get(PLANS + '/forecast.md')).toMatch(/- \[x\] Forecast screen `build`\n  Seven days[\s\S]*- \[~\] Offline cache `build`/)
  expect(w.disk.get(PLANS + '/forecast.md')).toMatch(/status: open/)
  expect(await run($, 'done 3')).toMatch(/Saved/)
  expect(w.disk.get(PLANS + '/forecast.md')).toMatch(/status: done/)
  expect(await run($, '')).toMatch(/\*\*Severe weather alerts and push notifications\*\*/)
})

test('/task new starts a plans folder in a fresh project; the tool can create tasks too', async ($, on) => {
  const w = world(on, {})
  expect(await run($, '')).toMatch(/No tasks here yet/)
  expect(await run($, 'new Seven-day forecast')).toMatch(/Created \/Users\/x\/code\/weather-app\/plans\/seven-day-forecast\.md/)
  const p = parsePlan(w.disk.get(PLANS + '/seven-day-forecast.md')!, 'f')!
  expect(p).toMatchObject({ task: 'seven-day-forecast', title: 'Seven-day forecast', project: 'weather-app', status: 'open' })
  expect(await tool($, { action: 'create', title: 'Alerts', date: '2026-12-06' })).toMatch(/task alerts/)
  expect(parsePlan(w.disk.get(PLANS + '/alerts.md')!, 'f')!.date).toBe('2026-12-06')
  expect(await run($, '')).toMatch(/Not broken down yet/)
})

test('the tool refuses sentence titles and edits the plan file', async ($, on) => {
  const w = world(on, { [PLANS + '/forecast.md']: FORECAST })
  await run($, '')
  expect(await tool($, { action: 'add', items: [{ title: 'Set up the continuous integration pipeline on GitHub Actions', stage: 'build' }] })).toMatch(/Not saved/)
  expect(await tool($, { action: 'add', items: [{ title: 'Release build', stage: 'ship', details: 'Store build with notes' }] })).toMatch(/Saved/)
  expect(w.disk.get(PLANS + '/forecast.md')).toMatch(/- \[\?\] Release build `ship`\n  Store build with notes/)
  expect(await tool($, { action: 'edit', n: 2, title: 'Forecast view', details: 'Seven days' })).toMatch(/Saved/)
  expect(await tool($, { action: 'list' })).toMatch(/Plan file: \/Users\/x\/code\/weather-app\/plans\/forecast\.md[\s\S]*2\. \[~\] build: Forecast view\n {3}Seven days/)
})

test('adding from the pane writes the file; /task <words> goes to Claude with the plan file named', async ($, on) => {
  const w = world(on, { [PLANS + '/forecast.md']: FORECAST })
  const sent: string[] = []
  on('prompt.submit', async ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await run($, '')
  const ui = await $.ui.mount({ plugin: 'workbench', surface: 'terminal', component: 'Pane', requestId: 'workbench', props: {} } as never)
  const pane = ui as never as { press: (x: object) => Promise<unknown>; input: (x: object) => Promise<unknown> }
  await pane.press({ key: 'wi-add-btn' })
  await pane.input({ key: 'wi-add', text: 'test: Smoke test -- run it once' })
  expect(w.disk.get(PLANS + '/forecast.md')).toMatch(/- \[ \] Smoke test `test`\n  run it once/)
  await ui.unmount()
  expect(await run($, "let's get started")).toMatch(/\*\*Seven-day forecast\*\*/)
  await w.clock.advance(400)
  expect(sent[0]).toMatch(/^let's get started\n[\s\S]*plan file: \/Users\/x\/code\/weather-app\/plans\/forecast\.md/)
})
