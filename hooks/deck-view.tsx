// The In Flight card's drawing, stacked for the Workbench's one column: main vitals, the
// architect, the permission gate, agent cards and lanes, other loops, the turn receipt and the
// session log. Pure: register.tsx reads the state and passes the presses back in.
//
// Adapted from claude-flightdeck (https://github.com/scasella/claude-flightdeck, hooks/register.tsx),
// MIT License, Copyright (c) 2026 Stephen Casella. The full notice is at the top of ./deck.ts.
import type { ThemeKey } from 'claude-code'

import type { DeckAgent, DeckBucket, DeckCheck, DeckLogLine } from '../types'
import type { Palette, Slot } from './bench'
import {
  cardTitle, consultTimeline, fmtDuration, fmtTimer, fmtUsd, gateSummary, gauge, isAdvising, isLoopActive, kTokens,
  limitLabel, plural, prettyModel, shorten, titleLines,
} from './deck'
import type { DeckData } from './deck'

/** Agent tiles side by side; earlier agents are listed below them, this many rows at most. */
const TILES = 3
const EARLIER_ROWS = 6
const ARCH_LABEL = 'Architect'

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
  const { main: m, usage: u, arch: a, gate: g, cards, loops: lp, log: lines, turn: t, receipt: r, view: v, now } = d
  const col = (role: Role) => (pal.themed ? pal[ROLE[role][0]] : ROLE[role][1])
  const slot = (role: Role) => ROLE[role][0]
  // The text width inside a card inside the section's card: each takes its border and padding.
  const w = Math.max(20, cols - 13)
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
      head('fd-main-h', `${modelName} · main`, 'main', <Text key="fd-run" color={m.isRunning ? col('main') : col('dim')}>{m.isRunning ? '● working' : '○ idle'}</Text>),
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
        <Box key="fd-cost" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {u.costUsd !== null ? <Text key="fd-usd" color={col('text')}>{fmtUsd(u.costUsd)}</Text> : null}
          {u.limits.slice(0, 2).map(l => {
            const lg = gauge(l.pct, 5)
            return (
              <Text key={'fd-lim-' + l.kind}>
                <Text dimColor>{`${limitLabel(l.kind)} `}</Text>
                <Text color={l.pct >= 80 ? col('warn') : col('main')}>{lg.on}</Text>
                <Text color={col('faint')}>{lg.off}</Text>
                <Text dimColor>{` ${Math.round(l.pct)}%`}</Text>
              </Text>
            )
          })}
        </Box>
      ) : null,
    ], 1, true),
  )

  // ── architect: only once one has been consulted or spawned
  if (a.consults.length > 0 || a.ids.length > 0) {
    const last = a.consults[a.consults.length - 1]
    out.push(
      card('fd-arch', [
        head('fd-arch-h', `${ARCH_LABEL} · ${advising ? 'advising' : 'on call'}`, 'arch', <Text key="fd-arch-n"><Text dimColor>consults </Text><Text color={col('arch')} bold>{a.consults.length}</Text></Text>),
        <Text key="fd-arch-tl" color={col('arch')}>{consultTimeline(a, now, w)}</Text>,
        <Text key="fd-arch-last" dimColor wrap="truncate-end">
          {!last ? 'not consulted yet'
            : advising ? `consulting for ${fmtDuration(now - last.at)}`
            : `last ${fmtDuration(now - (last.endAt ?? last.at))} ago · took ${fmtDuration((last.endAt ?? now) - last.at)}`}
        </Text>,
        <Box key="fd-arch-mo" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {(['before a plan', 'error repeats', 'before done'] as const).map(mo => (
            <Text key={'fd-mo-' + mo} color={last?.moment === mo ? col('arch') : col('dim')} bold={last?.moment === mo}>{`${last?.moment === mo ? '◆' : '◇'} ${mo}`}</Text>
          ))}
          <Text key="fd-mo-inf" color={col('faint')}>(inferred)</Text>
        </Box>,
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
      head('fd-gate-h', 'Gate · permissions', 'gate', <Text key="fd-gate-n" dimColor>{plural(s.total, 'check')}</Text>),
      <Text key="fd-strip" wrap="truncate-end">
        {g.recent.slice(-w).map((c, i) => <Text key={'fd-c-' + i} color={verdictColor(c)} dimColor={c.inSubagent}>{c.verdict === 'deny' ? '✗' : '■'}</Text>)}
      </Text>,
      <Box key="fd-gate-sum" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text key="fd-g-r"><Text color={col('gate')}>■</Text><Text dimColor>{` ${s.rule} allowed`}</Text></Text>
        <Text key="fd-g-c"><Text color={col('cleared')}>■</Text><Text dimColor>{` ${s.cleared} ${decider}`}</Text></Text>
        {s.ask > 0 ? <Text key="fd-g-a" color={col('amber')}>{`■ ${s.ask} pending`}</Text> : null}
        <Text key="fd-g-d" color={s.deny > 0 ? col('warn') : col('dim')}>{`✗ ${s.deny} denied`}</Text>
      </Box>,
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

  // ── agents: the newest three as tiles side by side, any earlier ones listed below
  if (cards.length > 0) {
    const statusColor = (c: DeckAgent) => (c.status === 'failed' ? col('warn') : c.status === 'done' ? col('gate') : col('agent'))
    const glyph = (c: DeckAgent) => (c.status === 'running' ? '◐' : c.status === 'done' ? '✓' : c.status === 'failed' ? '✗' : '■')
    const expand = (id: string) => () => kit.onExpand(id)
    const tiles = cards.slice(-TILES)
    const earlier = cards.slice(0, -TILES).reverse()
    // Each tile shares the row; its text gets the tile less its border and padding.
    const inner = Math.max(6, Math.floor((w - (tiles.length - 1)) / tiles.length) - 4)
    const kids: unknown[] = [head('fd-ag-h', `Agents · ${running.length} running · ${cards.length} total`, 'agent')]
    kids.push(
      <Box key="fd-tiles" flexDirection="row" columnGap={1} marginTop={1} width="100%">
        {tiles.map((c, i) => {
          const title = titleLines(cardTitle(c), inner - 3, inner)
          const sameModel = !c.model || prettyModel(c.model) === modelName
          const isMax = c.lastStop === 'max_tokens'
          return (
            <Box key={'fd-cd-' + c.id} flexDirection="column" width={`${Math.floor(100 / tiles.length)}%`} flexShrink={1} minWidth={0}
              borderStyle={v.expanded === c.id ? 'double' : 'round'} borderColor={isMax ? col('warn') : col('agent')} borderDimColor={c.status !== 'running' && v.expanded !== c.id} paddingX={1}>
              <Button key={'fd-cb-' + c.id} plain hotkey={String(i + 1)} label={title[0]} onPress={expand(c.id)} />
              <Text bold wrap="truncate-end">{title[1] || ' '}</Text>
              <Text color={col('dim')} wrap="truncate-end">{sameModel ? c.type : `${c.type} · ${prettyModel(c.model)}`}</Text>
              <Text dimColor wrap="truncate-end">{c.steps > 0 ? `${kTokens(c.ctx)} ctx · ${c.steps} st` : 'starting…'}</Text>
              <Box flexDirection="row" columnGap={1}>
                <Text color={isMax ? col('warn') : statusColor(c)} wrap="truncate-end">{`${glyph(c)} ${isMax ? 'max_tokens' : c.status}`}</Text>
                <Box flexShrink={0}>{clock('fd-cc-' + c.id, c.spawnedAt, c.endedAt, col('dim'))}</Box>
              </Box>
            </Box>
          )
        })}
      </Box>,
    )
    if (earlier.length) {
      kids.push(<Box key="fd-ag-earlier" marginTop={1}>{capsText('fd-ag-earlier-l', `Earlier · ${earlier.length}`, slot('dim'))}</Box>)
      for (const [i, c] of earlier.slice(0, EARLIER_ROWS).entries())
        kids.push(
          <Box key={'fd-er-' + c.id} flexDirection="row" columnGap={1} alignItems="center" width="100%">
            <Text color={statusColor(c)}>{glyph(c)}</Text>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Button key={'fd-eb-' + c.id} plain hotkey={i + TILES < 9 ? String(i + TILES + 1) : undefined} label={shorten(cardTitle(c), Math.max(8, w - 18))} onPress={expand(c.id)} />
            </Box>
            {c.steps > 0 ? <Text dimColor>{`${kTokens(c.ctx)} ctx`}</Text> : null}
            <Box flexShrink={0}>{clock('fd-ec-' + c.id, c.spawnedAt, c.endedAt, col('dim'))}</Box>
          </Box>,
        )
      if (earlier.length > EARLIER_ROWS) kids.push(<Text key="fd-ag-more" color={col('faint')}>{`+${earlier.length - EARLIER_ROWS} more`}</Text>)
    }
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
    kids.push(<Text key="fd-ag-hint" color={col('faint')}>{`press an agent to expand it · 1-${Math.min(9, cards.length)} when the pane has focus`}</Text>)
    out.push(card('fd-agents', kids, 1))
  }

  // ── other loops: model loops no card claims (workflow agents, compactions, memory forks)
  if (lp.length > 0) {
    const active = lp.filter(l => isLoopActive(l, now)).length
    out.push(
      <Box key="fd-loops" flexDirection="row" columnGap={1} marginTop={1} width="100%">
        <Text bold>other loops</Text>
        <Text dimColor>{`${lp.length} seen · ${active} active`}</Text>
        <Text wrap="truncate-end">
          {lp.slice(-Math.max(4, w - 28)).map((l, i) => (
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
          <Box key="fd-rc" flexDirection="row" flexWrap="wrap" columnGap={1}>
            <Text color={col('main')}>{`◐ ${modelName.toLowerCase()} · turn`}</Text>
            <Box flexShrink={0}>{clock('fd-turn', t.startedAt, null, col('main'))}</Box>
            <Text dimColor>{`· ${plural(t.edits, 'edit')} · ${plural(t.errors, 'error')}`}</Text>
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
