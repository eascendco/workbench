// The In Flight card's drawing, stacked for the Workbench's one column: main vitals, the
// sessions on this machine, the architect, the permission gate, the agents list, other loops, the turn receipt and the
// session log. Pure: register.tsx reads the state and passes the presses back in.
//
// Adapted from claude-flightdeck (https://github.com/scasella/claude-flightdeck, hooks/register.tsx),
// MIT License, Copyright (c) 2026 Stephen Casella. The full notice is at the top of ./deck.ts.
import type { ThemeKey } from 'claude-code'

import type { DeckAgent, DeckBucket, DeckCheck, DeckLogLine, DeckSession } from '../types'
import type { Palette, Slot } from './bench'
import {
  cardTitle, consultTimeline, fmtDuration, fmtTimer, fmtUsd, gateSummary, gauge, isAdvising, isLoopActive, kTokens,
  limitLabel, plural, prettyModel, sessionsLine, shorten,
} from './deck'
import type { DeckData } from './deck'

/** Agents listed, newest first, before `+n more`. */
const AGENT_ROWS = 6
const ARCH_LABEL = 'Architect'
/** Sessions listed before `+n more`. */
const SESSION_ROWS = 8

type Role = 'main' | 'agent' | 'gate' | 'cleared' | 'arch' | 'amber' | 'warn' | 'dim' | 'faint' | 'text'
/** Each role's skin slot, and with no skin the Claude Code theme key the original Flightdeck uses. */
const ROLE: Record<Role, [Slot, ThemeKey]> = {
  main: ['write', 'claude'],
  agent: ['read', 'suggestion'],
  gate: ['ok', 'success'],
  cleared: ['user', 'permission'],
  arch: ['search', 'merged'],
  amber: ['warn', 'warning'],
  warn: ['err', 'error'],
  dim: ['muted', 'inactive'],
  faint: ['muted', 'subtle'],
  text: ['fg', 'text'],
}

/** What the pane lends the card: its elements, width, palette and helpers, so the card looks like the other two. */
export type DeckKit = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  els: any
  cols: number
  pal: Palette & { themed: boolean }
  card: (key: string, kids: unknown[], marginTop?: number, tinted?: boolean) => unknown
  capsText: (key: string, text: string, slot?: Slot, size?: number) => unknown
  /** A desktop draws text in a proportional font: a ─ or ■ is wider than a column. */
  isDesktop: boolean
  /** The agent whose transcript the person is viewing: the log narrows to it. */
  viewed: string | null
  onGate: (b: DeckBucket) => void
  onExpand: (id: string) => void
  onReset: () => void
}

/** The section's title: the main model and whether it works. */
export function deckTitle(m: DeckData['main']) {
  return `In Flight · ${m.model ? prettyModel(m.model) : 'main'} ${m.isRunning ? 'working' : 'idle'}`
}

export function deckKids(d: DeckData, kit: DeckKit): unknown[] {
  const { els, cols, pal, card, capsText, viewed } = kit
  const { Box, Text, Button } = els
  const hasClient = 'Client' in els
  const { main: m, usage: u, arch: a, gate: g, cards, loops: lp, log: lines, turn: t, receipt: r, view: v, sessions: ss, now } = d
  const col = (role: Role) => (pal.themed ? pal[ROLE[role][0]] : ROLE[role][1])
  const slot = (role: Role) => ROLE[role][0]
  // The text width inside a card inside the section's card: each takes its border and padding.
  const w = Math.max(20, cols - 13)
  // Cells for a glyph strip (timeline, permission checks, loops) that must stay on one row: on a desktop
  // ─ ■ ● draw wider than a column, about 1.6 of them, so a strip w cells long wrapped onto a second row.
  const strip = kit.isDesktop ? Math.max(8, Math.floor(w * 0.55)) : w
  const modelName = prettyModel(m.model)
  const advising = isAdvising(a)
  const running = cards.filter(c => c.status === 'running')
  const decider = m.mode === 'auto' ? 'classifier' : 'you'
  const head = (key: string, left: string, role: Role, right?: unknown) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
      {capsText(key + '-l', left, slot(role))}
      {right ?? null}
    </Box>
  )
  // A start time of 0 is unknown: no clock rather than decades. The client ticks between redraws.
  const clock = (key: string, since: number, endAt: number | null, color: string) =>
    since <= 0 ? <Text key={key} color={color}>-</Text>
    : hasClient ? <els.Client key={key} module="./elapsed.tsx" props={{ since, now, endAt, color }} />
    : <Text key={key} color={color}>{fmtTimer((endAt ?? now) - since)}</Text>
  const out: unknown[] = []

  // ── main: model, effort, context, cost and rate limits
  const effortN = ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 4 } as Record<string, number>)[m.effort] ?? 0
  const ctx = u.pct !== null ? gauge(u.pct, Math.min(16, Math.max(6, w - 18))) : null
  out.push(
    card('fd-main', [
      head('fd-main-h', modelName, 'main', <Text key="fd-run" color={m.isRunning ? col('main') : col('dim')}>{m.isRunning ? '● working' : '○ idle'}</Text>),
      <Text key="fd-effort" wrap="truncate-end">
        <Text dimColor>effort </Text>
        <Text color={col('main')}>{'▮'.repeat(effortN) + '▯'.repeat(4 - effortN)} </Text>
        <Text color={col('main')} bold>{m.effort || '-'}</Text>
        {m.mode ? <Text dimColor>{`  mode ${m.mode}`}</Text> : null}
        <Text dimColor>{`  ${m.steps} req`}</Text>
      </Text>,
      ctx ? (
        <Text key="fd-ctx" wrap="truncate-end">
          <Text dimColor>ctx </Text>
          <Text color={(u.pct ?? 0) >= 80 ? col('warn') : col('main')}>{ctx.on}</Text>
          <Text color={col('faint')}>{ctx.off}</Text>
          <Text bold>{` ${Math.round(u.pct ?? 0)}%`}</Text>
          {u.tokens !== null ? <Text dimColor>{` ${kTokens(u.tokens)}/${kTokens(u.window)}`}</Text> : null}
          {u.compactions > 0 ? <Text color={col('amber')}>{`  ⟲${u.compactions}`}</Text> : null}
        </Text>
      ) : null,
      u.costUsd !== null || u.limits.length > 0 ? (
        <Text key="fd-cost" wrap="truncate-end">
          {u.costUsd !== null ? <Text color={col('text')}>{fmtUsd(u.costUsd)}</Text> : null}
          {u.limits.slice(0, 2).map((l, i) => {
            const lg = gauge(l.pct, 5)
            return (
              <Text key={'fd-lim-' + l.kind}>
                <Text dimColor>{`${u.costUsd !== null || i > 0 ? '  ' : ''}${limitLabel(l.kind)} `}</Text>
                <Text color={l.pct >= 80 ? col('warn') : col('main')}>{lg.on}</Text>
                <Text color={col('faint')}>{lg.off}</Text>
                <Text dimColor>{` ${Math.round(l.pct)}%`}</Text>
              </Text>
            )
          })}
        </Text>
      ) : null,
    ], 1, true),
  )

  // ── sessions: every Claude Code session on this machine, waiting first, then working, then done
  if (ss.length > 0) {
    const look: Record<DeckSession['status'], [string, Role]> = { waiting: ['◆', 'amber'], working: ['●', 'main'], done: ['✓', 'gate'] }
    const kids: unknown[] = [head('fd-ss-h', 'Sessions', 'dim', <Text key="fd-ss-n" dimColor>{sessionsLine(ss)}</Text>)]
    for (const x of ss.slice(0, SESSION_ROWS)) {
      const [glyph, role] = look[x.status]
      const folder = x.cwd.split('/').filter(Boolean).pop() ?? ''
      const where = [folder, x.where, x.isSelf ? 'this session' : ''].filter(Boolean).join(' · ')
      kids.push(
        <Box key={'fd-ss-' + x.pid} flexDirection="column" marginTop={1} width="100%">
          <Box flexDirection="row" columnGap={1} width="100%">
            <Box width={9} flexShrink={0}><Text color={col(role)} bold={x.status !== 'done'}>{`${glyph} ${x.status}`}</Text></Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text bold={x.status !== 'done'} wrap="truncate-end">{x.name}</Text></Box>
            <Box flexShrink={0}>{clock('fd-ssc-' + x.pid, x.since, null, col('dim'))}</Box>
          </Box>
          <Box flexDirection="row" columnGap={1} paddingLeft={10} width="100%">
            {x.detail ? <Box flexShrink={0}><Text color={col('amber')}>{x.detail}</Text></Box> : null}
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text dimColor wrap="truncate-end">{where}</Text></Box>
          </Box>
        </Box>,
      )
    }
    if (ss.length > SESSION_ROWS) kids.push(<Text key="fd-ss-more" color={col('faint')}>{`+${ss.length - SESSION_ROWS} more`}</Text>)
    out.push(card('fd-sessions', kids, 1))
  }

  // ── architect: only once one has been consulted or spawned
  if (a.consults.length > 0 || a.ids.length > 0) {
    const last = a.consults[a.consults.length - 1]
    out.push(
      card('fd-arch', [
        head('fd-arch-h', ARCH_LABEL, 'arch', <Text key="fd-arch-n"><Text color={col('arch')}>{advising ? 'advising' : 'on call'}</Text><Text dimColor>{` · ${plural(a.consults.length, 'consult')}`}</Text></Text>),
        <Text key="fd-arch-tl" color={col('arch')} wrap="truncate-end">{consultTimeline(a, now, strip)}</Text>,
        <Text key="fd-arch-last" dimColor wrap="truncate-end">
          {!last ? 'not consulted yet'
            : advising ? `consulting for ${fmtDuration(now - last.at)}`
            : `last ${fmtDuration(now - (last.endAt ?? last.at))} ago · took ${fmtDuration((last.endAt ?? now) - last.at)}`}
        </Text>,
        <Text key="fd-arch-mo" wrap="truncate-end">
          {(['before a plan', 'error repeats', 'before done'] as const).map(mo => (
            <Text key={'fd-mo-' + mo} color={last?.moment === mo ? col('arch') : col('dim')} bold={last?.moment === mo}>{`${last?.moment === mo ? '◆' : '◇'} ${mo}  `}</Text>
          ))}
          <Text key="fd-mo-inf" color={col('faint')}>(inferred)</Text>
        </Text>,
        a.lastAdvice ? <Text key="fd-arch-adv" color={col('arch')} wrap="truncate-end">{`» ${a.lastAdvice}`}</Text> : null,
      ], 1),
    )
  }

  // ── gate: one cell per permission check, totals, a drill-down per tool family
  const s = gateSummary(g)
  if (g.recent.length > 0 || s.total > 0) {
    const verdictColor = (c: DeckCheck) => (c.verdict === 'rule' ? col('gate') : c.verdict === 'cleared' ? col('cleared') : c.verdict === 'ask' ? col('amber') : col('warn'))
    const said = (c: DeckCheck) => (c.verdict === 'rule' ? 'allowed' : c.verdict === 'cleared' ? decider : c.verdict === 'ask' ? 'pending' : 'denied')
    const open = v.gateOpen
    const kids: unknown[] = [
      head('fd-gate-h', 'Permissions', 'gate', <Text key="fd-gate-n" dimColor>{plural(s.total, 'check')}</Text>),
      <Text key="fd-strip" wrap="truncate-end">
        {g.recent.slice(-strip).map((c, i) => <Text key={'fd-c-' + i} color={verdictColor(c)} dimColor={c.inSubagent}>{c.verdict === 'deny' ? '✗' : '■'}</Text>)}
      </Text>,
      <Text key="fd-gate-sum" wrap="truncate-end">
        <Text color={col('gate')}>■</Text><Text dimColor>{` ${s.rule} allowed  `}</Text>
        <Text color={col('cleared')}>■</Text><Text dimColor>{` ${s.cleared} ${decider}  `}</Text>
        {s.ask > 0 ? <Text color={col('amber')}>{`■ ${s.ask} pending  `}</Text> : null}
        <Text color={s.deny > 0 ? col('warn') : col('dim')}>{`✗ ${s.deny} denied`}</Text>
      </Text>,
      <Box key="fd-gate-b" flexDirection="row" columnGap={2} marginTop={1}>
        {(['file', 'shell', 'other'] as const).map((b: DeckBucket) => {
          const tl = g.totals[b]
          const n = tl.rule + tl.ask + tl.cleared + tl.deny
          return (
            <Button key={'fd-gb-' + b} plain hotkey={b[0]} label={`${b} ${n}${open === b ? ' ▾' : ''}`} dimColor={n === 0}
              onPress={() => kit.onGate(b)} />
          )
        })}
      </Box>,
    ]
    if (open)
      for (const [i, c] of g.recent.filter(x => x.bucket === open).slice(-5).entries())
        kids.push(
          <Text key={'fd-gd-' + i} wrap="truncate-end">
            <Text color={verdictColor(c)}>{c.verdict === 'deny' ? '✗ ' : '■ '}</Text>
            <Text color={col('dim')}>{`${said(c).padEnd(10)} `}</Text>
            <Text dimColor={c.inSubagent}>{c.detail}</Text>
          </Text>,
        )
    out.push(card('fd-gate', kids, 1))
  }

  // ── agents: one full-width row each, newest first, like Sessions. The title is Text so it truncates: a desktop
  // draws a Button natively and wraps its label, so the press sits on the ▸ in front.
  if (cards.length > 0) {
    const statusColor = (c: DeckAgent) => (c.status === 'failed' ? col('warn') : c.status === 'done' ? col('gate') : col('agent'))
    const glyph = (c: DeckAgent) => (c.status === 'running' ? '◐' : c.status === 'done' ? '✓' : c.status === 'failed' ? '✗' : '■')
    const expand = (id: string) => () => kit.onExpand(id)
    const rows = cards.slice().reverse()
    const kids: unknown[] = [head('fd-ag-h', 'Agents', 'agent', <Text key="fd-ag-n" dimColor>{`${running.length} running · ${cards.length} total`}</Text>)]
    for (const [i, c] of rows.slice(0, AGENT_ROWS).entries()) {
      const isMax = c.lastStop === 'max_tokens'
      const sameModel = !c.model || prettyModel(c.model) === modelName
      const meta = [sameModel ? c.type : `${c.type} · ${prettyModel(c.model)}`, c.steps > 0 ? `${kTokens(c.ctx)} ctx · ${c.steps} st` : 'starting…'].join(' · ')
      kids.push(
        <Box key={'fd-ag-' + c.id} flexDirection="column" marginTop={1} width="100%">
          <Box flexDirection="row" columnGap={1} width="100%">
            <Box flexShrink={0}>
              <Button key={'fd-cb-' + c.id} plain hotkey={i < 9 ? String(i + 1) : undefined} label={v.expanded === c.id ? '▾' : '▸'} onPress={expand(c.id)} />
            </Box>
            <Box width={9} flexShrink={0}><Text color={isMax ? col('warn') : statusColor(c)} bold={c.status === 'running'} wrap="truncate-end">{`${glyph(c)} ${c.status}`}</Text></Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text bold={c.status === 'running'} wrap="truncate-end">{cardTitle(c)}</Text></Box>
            <Box flexShrink={0}>{clock('fd-cc-' + c.id, c.spawnedAt, c.endedAt, col('dim'))}</Box>
          </Box>
          <Box flexDirection="row" columnGap={1} paddingLeft={13} width="100%">
            {isMax ? <Box flexShrink={0}><Text color={col('warn')}>max_tokens</Text></Box> : null}
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text dimColor wrap="truncate-end">{meta}</Text></Box>
          </Box>
        </Box>,
      )
    }
    if (rows.length > AGENT_ROWS) kids.push(<Text key="fd-ag-more" color={col('faint')}>{`+${rows.length - AGENT_ROWS} more`}</Text>)
    const x = cards.find(c => c.id === v.expanded)
    if (x) {
      kids.push(
        <Box key="fd-exp" flexDirection="column" marginTop={1} width="100%" borderStyle="single" borderColor={col('agent')} paddingX={1}>
          <Text bold wrap="wrap">{x.description || x.type}</Text>
          <Text dimColor wrap="truncate-end">{`${x.type} · ${prettyModel(x.model)} · ${x.status} · ${plural(x.steps, 'step')}`}</Text>
          {x.steps > 0 ? <Text dimColor wrap="truncate-end">{`ctx ${kTokens(x.ctx)} · out ${kTokens(x.out)}`}</Text> : null}
          {x.tools.length === 0 ? <Text color={col('faint')}>no tool calls yet</Text> : null}
          {x.tools.map((n, i) => <Text key={'fd-et-' + i} color={n.isError ? col('warn') : col('text')} wrap="truncate-end">{`${n.isError ? '✗' : '·'} ${n.text}`}</Text>)}
          {x.answer ? <Text dimColor wrap="wrap">{`» ${shorten(x.answer, 240)}`}</Text> : null}
        </Box>,
      )
    }
    kids.push(<Text key="fd-ag-hint" color={col('faint')}>{`press ▸ to expand an agent · 1-${Math.min(9, cards.length)} when the pane has focus`}</Text>)
    out.push(card('fd-agents', kids, 1))
  }

  // ── other loops: model loops no card claims (workflow agents, compactions, memory forks)
  if (lp.length > 0) {
    const active = lp.filter(l => isLoopActive(l, now)).length
    out.push(
      <Box key="fd-loops" flexDirection="row" columnGap={1} marginTop={1} width="100%">
        <Box flexShrink={0}><Text bold>other loops</Text></Box>
        <Box flexShrink={0}><Text dimColor>{`${lp.length} seen · ${active} active`}</Text></Box>
        <Text wrap="truncate-end">
          {lp.slice(-Math.max(4, strip - 20)).map((l, i) => (
            <Text key={'fd-lp-' + i} color={isLoopActive(l, now) ? col('agent') : l.isDone ? col('dim') : col('faint')}>{isLoopActive(l, now) ? '●' : l.isDone ? '✓' : '○'}</Text>
          ))}
        </Text>
      </Box>,
    )
  }

  // ── receipt: the turn now, or the last one
  if (m.isRunning || r) {
    out.push(
      card('fd-receipt', [
        m.isRunning ? (
          <Box key="fd-rc" flexDirection="row" columnGap={1} width="100%">
            <Box flexShrink={0}><Text color={col('main')}>{`◐ ${modelName.toLowerCase()} · turn`}</Text></Box>
            <Box flexShrink={0}>{clock('fd-turn', t.startedAt, null, col('main'))}</Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}><Text dimColor wrap="truncate-end">{`· ${plural(t.edits, 'edit')} · ${plural(t.errors, 'error')}`}</Text></Box>
          </Box>
        ) : r ? (
          <Text key="fd-rc" wrap="wrap">
            <Text color={r.reason === 'answer' ? col('gate') : col('warn')}>{r.reason === 'answer' ? '✓ ' : '✗ '}</Text>
            <Text>{`last turn ${fmtDuration(r.durationMs)} · ${plural(r.agents, 'agent')} · ${plural(r.edits, 'edit')} · ${plural(r.errors, 'error')}`}</Text>
            {r.costDelta !== null ? <Text color={col('main')}>{` · +${fmtUsd(r.costDelta)}`}</Text> : null}
          </Text>
        ) : null,
        t.isReviewing ? <Text key="fd-rv" color={col('arch')}>architect reviewing before done (inferred)</Text> : null,
      ], 1),
    )
  }

  // ── log: prompts, spawns, completions, consults, edits, errors and denials; one agent's while you view it
  const shown = (viewed ? lines.filter(l => l.agentId === viewed) : lines).slice(-8)
  const colorOf = (l: DeckLogLine) =>
    l.kind === 'error' ? col('warn') : l.kind === 'consult' ? col('arch') : l.who === 'main' ? col('main') : l.who === 'gate' ? col('gate') : l.who === 'you' ? col('text') : col('agent')
  const hhmm = (ms: number) => (ms > 0 ? new Date(ms).toTimeString().slice(0, 5) : '--:--')
  out.push(
    card('fd-log', [
      head('fd-log-h', 'Session log', 'dim'),
      ...(shown.length === 0 ? [<Text key="fd-log-none" color={col('faint')}>nothing yet</Text>] : []),
      ...shown.map((l, i) => (
        <Box key={'fd-l-' + i} flexDirection="row" columnGap={1} width="100%">
          <Box width={5} flexShrink={0}><Text color={col('faint')}>{hhmm(l.at)}</Text></Box>
          <Box width={9} flexShrink={0}><Text color={colorOf(l)} bold wrap="truncate-end">{l.who}</Text></Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0}><Text color={l.kind === 'error' ? col('warn') : col('text')} wrap="truncate-end">{l.text}</Text></Box>
        </Box>
      )),
    ], 1),
  )

  out.push(
    <Box key="fd-reset" flexDirection="row" marginTop={1}>
      <Button key="fd-reset-b" onPress={() => kit.onReset()}>Reset</Button>
    </Box>,
  )
  return out
}
