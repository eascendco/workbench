// In flight, the Workbench's third card. The pure tests are adapted from claude-flightdeck's own
// (MIT, Stephen Casella); the pane tests check the card inside the Workbench.
import { expect, mock, test } from 'claude-code/testing'

import {
  adviceLine, afterCall, applyStep, consultTimeline, DEFAULT_ARCHITECT, DEFAULT_GATE, DEFAULT_TURN, describeInput, endConsult,
  gateSummary, handbackOf, lanes, limitLabel, momentOf, normalizeCard, normalizeGate, normalizeLog, prettyModel, promptLine,
  receiptOf, recordCheck, redact, settleCheck, startConsult, titleLines, trimRecent,
} from '../hooks/deck'
import type { DeckCheck } from '../types'

/* ── pure behavior ── */

test('redaction masks credentials before anything is stored', () => {
  expect(redact('curl -H "Authorization: Bearer abc.def.ghi123" x')).not.toContain('abc.def')
  expect(redact('gh auth --token ghp_abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  expect(redact('password=hunter2 ls')).not.toContain('hunter2')
  expect(redact('ls -la src/')).toBe('ls -la src/')
  expect(describeInput('Read', { file_path: '/Users/me/proj/src/main.ts' })).toBe('Read → src/main.ts')
})

const check = (id: string, verdict: DeckCheck['verdict'], bucket: DeckCheck['bucket'] = 'shell'): DeckCheck => ({ id, tool: 'Bash', bucket, verdict, inSubagent: false, detail: 'Bash → ls', at: 1 })

test('an ask is settled by the call that follows: cleared if it ran, deny if refused', () => {
  let g = recordCheck(DEFAULT_GATE, check('a', 'ask'))
  g = recordCheck(g, check('b', 'ask'))
  g = recordCheck(g, check('c', 'rule', 'file'))
  g = settleCheck(g, 'a', true)
  g = settleCheck(g, 'b', false)
  g = settleCheck(g, 'zzz', true)
  const s = gateSummary(g)
  expect([s.rule, s.ask, s.cleared, s.deny, s.total]).toEqual([1, 0, 1, 1, 3])
  expect(g.recent.map(c => c.verdict)).toEqual(['cleared', 'deny', 'rule'])
})

test('a pending ask is never trimmed out before it settles', () => {
  let g = recordCheck(DEFAULT_GATE, check('old-ask', 'ask'))
  for (let i = 0; i < 120; i += 1) g = recordCheck(g, check(`r${i}`, 'rule', 'file'))
  expect(g.recent.length).toBe(80)
  expect(g.recent.some(c => c.id === 'old-ask')).toBe(true)
  expect(trimRecent([check('a', 'rule'), check('b', 'rule')], 5).length).toBe(2)
})

test('edits count from every loop; errors only from the main loop', () => {
  const t = { ...DEFAULT_TURN, errorStreak: 1 }
  expect(afterCall(t, { inSubagent: true, hasFailed: false, isEdit: true }).edits).toBe(1)
  expect(afterCall(t, { inSubagent: false, hasFailed: true, isEdit: false })).toEqual({ ...t, errorStreak: 2, errors: 1 })
  expect(momentOf({ edits: 0, errorStreak: 2 })).toBe('error repeats')
})

test("a card's context is its latest step's whole input; output adds up", () => {
  let c = normalizeCard({ id: 'x' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 2_000, output_tokens: 500 }, stopReason: 'tool_use' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 5, cache_read_input_tokens: 40_000, output_tokens: 700 }, stopReason: 'max_tokens' })
  expect([c.ctx, c.out, c.steps, c.lastStop]).toEqual([40_005, 1200, 2, 'max_tokens'])
})

test('consults open, close by id, and draw on a shared timeline', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 's1', at: 0, moment: 'before a plan', via: 'advisor tool' })
  a = endConsult(a, 10, null, 's1')
  a = startConsult(a, { id: 's2', at: 90, moment: 'before done', via: 'advisor tool' })
  const tl = consultTimeline(a, 100, 11)
  expect(tl.startsWith('◆━')).toBe(true)
  expect(tl.split('◆').length - 1).toBe(2)
})

test('older shapes still read; lanes share one axis; names and lines read as people say them', () => {
  expect(normalizeLog([{ at: '08:00:00', who: 'x', text: 'y' }])[0]).toEqual({ at: 0, who: 'x', text: 'y', agentId: null, kind: 'info' })
  expect(normalizeGate({ file: { allow: 1 } }).totals.shell.rule).toBe(0)
  const [a, b] = lanes([{ ...normalizeCard({}), id: 'a', spawnedAt: 1000, endedAt: 1050 }, { ...normalizeCard({}), id: 'b', spawnedAt: 1050, endedAt: null }], 1100, 20)
  expect(a).toEqual({ id: 'a', before: 0, bar: 10, after: 10 })
  expect((b?.before ?? 0) + (b?.bar ?? 0) + (b?.after ?? 0)).toBe(20)
  expect(limitLabel('five_hour')).toBe('5h')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('')).toBe('-')
  expect(promptLine('fix the parser')).toEqual({ who: 'you', text: 'fix the parser' })
  expect(handbackOf('<agent-message from="x">\nPlain report line\n</agent-message>')).toEqual({ from: 'x', body: 'Plain report line' })
  expect(adviceLine('## Ship it after one more gate test.\n- details')).toBe('Ship it after one more gate test.')
  expect(titleLines('Write tinyqueue test suite', 13, 16)).toEqual(['Write', 'tinyqueue test…'])
  expect(receiptOf({ ...DEFAULT_TURN, costAtStart: 1, edits: 2 }, { durationMs: 1000, agentsSince: 3, costNow: 1.5, reason: 'answer' }).costDelta).toBe(0.5)
})

/* ── the card in the Workbench ── */

type On = Parameters<import('claude-code/testing').TestBody>[1]
const ROOT = '/Users/x/proj'

/** A session with no plans and an empty folder: only the cards' frames matter here. */
function world(on: On) {
  mock.clock(on)
  mock.env(on, { HOME: '/Users/x' })
  mock.store(on)
  on('session.cwd', async () => ({ value: ROOT }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.list', async () => ({ value: [] }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('tool.register', async () => ({ value: undefined }) as never)
  on('session.start', async () => ({ cwd: ROOT }) as never)
  on('process.run', async () => ({ value: { code: 1, stdout: '', stderr: '' } }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: '' }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
}

const pane = (surface: 'terminal' | 'desktop', bodyColumns = 48) =>
  ({ plugin: 'workbench', surface, component: 'Pane', requestId: 'workbench', props: { bodyColumns, view: {} } }) as never

let spawnN = 0
const spawn = (subagentType: string, description: string) => ({
  prompt: description, description, subagentType, tool_use_id: `tu${++spawnN}`,
  provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'claude-opus-5-5', background: true, fork: false,
})

test('In flight starts collapsed under Files, opens to its main panel and log, and the choice is kept', async ($, on) => {
  world(on)
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Button', text: /^In flight$/ })).toBeDefined()
      expect(await ui.find({ text: /idle/ })).toBeUndefined()
      await ui.press({ key: 'bd-toggle' })
    }
    expect(await ui.find({ type: 'Button', text: /^In flight · main idle$/ })).toBeDefined()
    expect(await ui.find({ text: /nothing yet/ })).toBeDefined()
    // Empty panels take no room: no checks, no agents, no architect yet
    expect(await ui.find({ text: /Agents ·/i })).toBeUndefined()
    expect(await ui.find({ text: /^Reset$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the gate fills from checks, a row opens its redacted drill-down, and Reset clears it', async ($, on) => {
  world(on)
  on('tool.check', (_$, e) => ({ decision: e.tool === 'Read' ? 'allow' : 'ask' }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'k1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'curl -H "Authorization: Bearer abcdefgh12345" api' }, tool_use_id: 'k2' })
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'bd-toggle' })
  expect(await ui.find({ text: /^2 checks$/ })).toBeDefined()
  expect(await ui.find({ text: /1 pending/ })).toBeDefined()
  await ui.press({ key: 'fd-gb-shell' })
  expect(await ui.find({ text: /Authorization: Bearer •••/ })).toBeDefined()
  expect(await ui.find({ text: /abcdefgh12345/ })).toBeUndefined()
  await ui.press({ key: 'fd-reset-b' })
  expect(await ui.find({ text: /checks$/ })).toBeUndefined()
  await ui.unmount()
})

test('the newest three agents are tiles; earlier ones are listed below; a tile expands', async ($, on) => {
  world(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++n}` }))
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.turn.start({ text: 'go', turnId: 'W1' })
  await $.agent.spawn(spawn('Explore', 'task alpha'))
  const ui = await $.ui.mount(pane('terminal', 90))
  await ui.press({ key: 'bd-toggle' })
  expect(await ui.find({ text: /1 running · 1 total/i })).toBeDefined()
  await ui.press({ key: 'fd-cb-w1' })
  expect(await ui.find({ text: /no tool calls yet/ })).toBeDefined()
  for (const d of ['beta', 'gamma', 'delta', 'epsilon']) await $.agent.spawn(spawn('Explore', `task ${d}`))
  // Tiles: gamma, delta, epsilon. Listed below, newest first: beta, alpha.
  for (const id of ['w3', 'w4', 'w5']) expect(await ui.find({ key: 'fd-cb-' + id })).toBeDefined()
  for (const id of ['w2', 'w1']) expect(await ui.find({ key: 'fd-eb-' + id })).toBeDefined()
  expect(await ui.find({ key: 'fd-cb-w1' })).toBeUndefined()
  expect(await ui.find({ text: /Earlier · 2/i })).toBeDefined()
  await ui.unmount()
})

test('the server-side advisor is read from assistant rows: advising, then on call', async ($, on) => {
  world(on)
  await $.session.start({ source: 'startup', cwd: ROOT } as never)
  await $.turn.start({ text: 'plan it', turnId: 'T2' })
  const row = (content: unknown[]) =>
    $.session
      .append({ message: { type: 'assistant', role: 'assistant', content: content as never }, door: 'response', origin: { kind: 'model', model: 'claude-opus-5-5' } as never, uuid: `u${++spawnN}` })
      .catch(() => undefined)
  await row([{ type: 'server_tool_use', id: 'srv1', name: 'advisor', input: {} }])
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'bd-toggle' })
  expect(await ui.find({ text: /ARCHITECT · ADVISING/ })).toBeDefined()
  expect(await ui.find({ text: /◆ before a plan/ })).toBeDefined()
  await row([{ type: 'advisor_tool_result', tool_use_id: 'srv1', content: { type: 'advisor_redacted_result' } }])
  expect(await ui.find({ text: /ARCHITECT · ON CALL/ })).toBeDefined()
  await ui.unmount()
})
