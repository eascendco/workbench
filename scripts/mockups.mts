// Mockups of the Workbench band and pane for the README, drawn with the mod's own SVG helpers and invented test data.
// node scripts/mockups.mts <out dir> (band, pane, tasks, files, inflight), then render each HTML file to PNG (headless Chrome: --screenshot --force-device-scale-factor=2).
import fs from 'node:fs'
import { ACCENT, bandBarSvg, bandTitleSvg, DOING, paneBarSvg, STAGE_COLOR } from '../hooks/draw.ts'
import { caps, fileTag, hero, icon, pill, rule } from '../hooks/icons.ts'

const out = process.argv[2]!
// The pane's own colors (no skin), on the desktop app's dark theme
const C = { read: '#c084fc', write: '#fb923c', warn: '#e9c46a', ok: '#4ade80', user: '#60a5fa', fg: '#ececec', muted: '#9a9a96', folder: '#60a5fa', run: '#e9c46a' }
// The drawings pick light or dark by prefers-color-scheme; the mockups show dark
const darkHero = (s: string) => s.replace(/\.bg\{fill:#f0eee6\}\.t\{fill:#1f1f1f\}\.m\{fill:#5f5f5c\}@media \(prefers-color-scheme: dark\)\{([^}]*\}[^}]*\}[^}]*\})\}/, '$1')
const dark = (s: string) => s.replace(/\.t\{fill:#1f1f1f\}[^\n]*\n@media \(prefers-color-scheme: dark\)\{([^\n]*)\}/, '$1')
const img = (svg: string, alt = '') => `<span class="svg" role="img" aria-label="${alt}">${svg}</span>`
const ico = (name: Parameters<typeof icon>[0], color: string, size = 16) => img(icon(name, color, size))
const capsL = (t: string, color = C.muted) => img(caps(t, color).source, t)
const W = 520 // pane width, px
const IN2 = W - 2 * 18 - 2 * 2 * 17 // inside two nested cards

const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#262624;color:${C.fg};font:14px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;-webkit-font-smoothing:antialiased;padding:28px;display:inline-block}
.svg{display:inline-flex;line-height:0}
.row{display:flex;align-items:center;gap:8px}.between{justify-content:space-between}.grow{flex:1;min-width:0}
.col{display:flex;flex-direction:column}
.tint{background:#373737}
.card{border:1px solid #4a4a46;border-radius:12px;padding:10px 16px;display:flex;flex-direction:column;gap:2px}
.mt{margin-top:10px}.mt2{margin-top:14px}
.muted{color:${C.muted}}.bold{font-weight:600}.trunc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{border:1px solid #55554f;border-radius:7px;padding:3px 10px;font-size:13px;background:#30302e;color:${C.fg};white-space:nowrap}
.input{border:1px solid #55554f;border-radius:7px;padding:5px 10px;color:${C.muted};font-size:13px;background:#1f1f1e;width:100%}
.pane{width:${W}px;background:#1f1f1e;border:1px solid #3a3a37;border-radius:14px;overflow:hidden}
.pane-head{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid #33332f;color:#c9c9c4;font-size:14px}
.pane-body{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.tree .row{height:26px}
.rel{position:relative}.badge{position:absolute;right:-11px;top:-11px;width:22px;height:22px;border-radius:11px;background:#d97757;color:#1f1f1e;font:700 12px/22px -apple-system,sans-serif;text-align:center;box-shadow:0 0 0 3px #1f1f1e;z-index:1}
`
const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`

/* ── test data: an invented weather app ── */
const items = [
  { t: 'Pick an API', s: 'spec', st: 'done' },
  { t: 'Forecast screen', s: 'build', st: 'doing' },
  { t: 'Hourly view', s: 'build', st: 'todo' },
  { t: 'Offline cache', s: 'build', st: 'todo' },
  { t: 'Smoke test', s: 'test', st: 'draft' },
] as const
const STAGE = STAGE_COLOR
const SQ = { draft: 'square-dashed', todo: 'square', doing: 'square-dot', done: 'square-check' } as const
const sqColor = (st: string) => (st === 'done' ? C.ok : st === 'doing' ? C.write : C.muted)

/* ── the band above the prompt ── */
const BW = 700
const band = page(`
<div style="width:${BW + 40}px">
  <div class="col" style="gap:4px;padding:0 6px 10px">
    <div class="row">${img(dark(bandTitleSvg(BW - 24, DOING, 'weather-app', 'Seven-day forecast', 'Forecast screen')))}<span class="muted" style="font-size:15px">❯</span></div>
    ${img(dark(bandBarSvg(BW - 24, { done: 1, doing: 1, total: 4, pill: 'build', finished: false, color: STAGE_COLOR.build })))}
  </div>
  <div style="border:1px solid #4a4a46;border-radius:14px;background:#30302e;padding:14px 16px 12px;color:${C.muted}">
    <div style="min-height:44px">Reply to Claude…</div>
    <div class="row between" style="font-size:12.5px"><span>＋</span><span>Opus · ↑</span></div>
  </div>
</div>`)

/* ── the pane ── */
const sq = (st: keyof typeof SQ) => ico(SQ[st], sqColor(st), 16)
const taskCard = `
<div class="card tint">
  ${img(darkHero(hero({ icon: 'check', accent: C.ok, label: 'Current task', title: 'Seven-day forecast', sub: 'weather-app · Oct 8 → Oct 10', w: IN2, panel: false })))}
  <div class="row between mt">${img(dark(paneBarSvg(IN2 - 18 * 7 - 12, { done: 1, doing: 1, total: 4, pill: 'build', finished: false, color: STAGE_COLOR.build })))}<span class="muted">25% · 1 of 4 done</span></div>
  <div style="margin:8px 0;line-height:0">${img(rule(C.muted).replace('width="2000"', `width="${IN2}"`))}</div>
  ${capsL('In progress', C.write)}
  <div class="row mt">${sq('doing')}<span class="grow bold">Forecast screen</span><span style="color:${STAGE_COLOR.build}">build</span><span class="btn">Done</span></div>
</div>`
const wiCard = `
<div class="card mt">
  <div class="row between"><div class="row">${capsL('Work items')}<span class="muted">▾</span></div>${capsL('1/4')}</div>
  ${items.map(i => `<div class="row mt">${sq(i.st)}<span class="grow ${i.st === 'done' ? 'muted' : ''}">${i.t}</span><span style="color:${STAGE[i.s]}">${i.s}</span></div>`).join('')}
</div>`
const upNext = `
<div style="line-height:0">${img(rule(C.muted).replace('width="2000"', `width="${W - 36 - 34}"`))}</div>
${capsL('Up next')}
${[['Severe weather alerts', 'Oct 14'], ['Location search', 'Oct 20'], ['Settings screen', 'Oct 27']].map(([t, d]) => `<div class="row mt"><span style="color:${C.muted}">●</span><span class="grow">${t}</span><span class="muted">${d}</span></div>`).join('')}`

const nowCard = `
<div class="card tint">
  ${img(darkHero(hero({ icon: 'eye', accent: C.read, label: 'Right now', title: 'Claude is reading client.ts', sub: 'in src/api', w: IN2, panel: false })))}
  <div style="margin:8px 0;line-height:0">${img(rule(C.muted).replace('width="2000"', `width="${IN2}"`))}</div>
  <div class="row between"><div class="row">${ico('git-branch', C.user, 18)}<span class="bold">main</span></div><span style="color:${C.warn}">2 not committed</span></div>
  <div class="row mt" style="gap:22px;font-size:13px">
    <span><span style="color:${C.read}">●</span> <span class="muted">Claude read</span></span>
    <span><span style="color:${C.write}">●</span> <span class="muted">Claude edited</span></span>
    <span><span style="color:${C.warn}">●</span> <span class="muted">Not committed</span></span>
  </div>
</div>`
// The file Claude is on right now: its name in the kind's color with a band of light partway across (the shimmer, caught mid-sweep).
const shim = (n: string, col: string, at = 3) => `<span class="bold" style="color:${col}">${n.slice(0, at)}<span style="color:#ffffff;text-shadow:0 0 6px ${col}">${n.slice(at, at + 3)}</span>${n.slice(at + 3)}</span>`
// A file edited this turn: lit in the edit color until the next prompt.
const lit = (n: string) => `<span class="bold" style="color:${C.write}">${n}</span>`
const SESSIONS_LINE = 'In Flight · 1 waiting · 2 working · 1 done'
const touched = [
  ['src/api/client.ts', 'src/api', 'Reading', C.read],
  ['ForecastScreen.tsx', 'src/screens', 'Edited', C.write],
  ['seven-day-forecast.md', 'plans', 'Edited', C.write],
] as const
const ext = (n: string) => n.slice(n.lastIndexOf('.') + 1)
const touchCard = `
<div class="card">
  <div class="row between">${capsL('Claude touched')}${capsL('3 files')}</div>
  ${touched.map(([n, d, b, col]) => { const t = fileTag(ext(n), C.run); const p = pill(b, col); const base = n.split('/').pop()!; const name = b === 'Reading' ? shim(base, C.read) : n === 'ForecastScreen.tsx' ? lit(base) : `<span class="bold">${base}</span>`; return `<div class="row mt" style="padding-left:14px">${img(t.source)}${name}<span class="grow muted trunc">${d}</span>${img(p.source)}</div>` }).join('')}
</div>`
const tree: [number, string, 'dir' | 'file', boolean, string[]][] = [
  [0, '.github', 'dir', false, []],
  [0, 'plans', 'dir', false, ['w']],
  [0, 'src', 'dir', true, ['r', 'w', 'g']],
  [1, 'api', 'dir', true, ['r']],
  [2, 'client.ts', 'file', false, ['r']],
  [2, 'forecast.ts', 'file', false, []],
  [1, 'screens', 'dir', true, ['w', 'g']],
  [2, 'ForecastScreen.tsx', 'file', false, ['w', 'g']],
  [2, 'HomeScreen.tsx', 'file', false, []],
  [1, 'components', 'dir', false, []],
  [0, 'tests', 'dir', false, []],
  [0, 'package.json', 'file', false, ['g']],
  [0, 'README.md', 'file', false, []],
  [0, 'tsconfig.json', 'file', false, []],
]
const mark = (m: string) => `<span style="color:${m === 'r' ? C.read : m === 'w' ? C.write : C.warn};font-size:12px">●</span>`
const treeRows = tree.map(([d, n, k, open, marks]) => {
  const hidden = n.startsWith('.')
  const chev = k === 'dir' ? `<span class="muted">${open ? '⏷' : '⏵'}</span>` : ''
  const hot = n === 'client.ts' ? C.read : n === 'ForecastScreen.tsx' ? C.write : ''
  const glyph = ico(k === 'dir' ? (open ? 'folder-open' : 'folder') : 'file', hot || (k === 'dir' && !hidden ? C.folder : C.muted), 17)
  const name = n === 'client.ts' ? shim(n, C.read, 2) : n === 'ForecastScreen.tsx' ? lit(n) : n
  return `<div class="row" style="padding-left:${8 + d * 22}px"><span style="width:12px;display:inline-flex">${chev}</span>${glyph}<span class="grow ${hidden ? 'muted' : ''}">${name}</span>${marks.map(mark).join(' ')}</div>`
}).join('')

const pane = page(`
<div class="pane">
  <div class="pane-head"><span>Workbench</span><span>✕</span></div>
  <div class="pane-body">
    <div class="card"><span class="row"><span class="muted">▼</span>${img(icon('list-checks', C.ok, 16))}<span>Task · weather-app</span></span>${taskCard}${wiCard}
      <div class="row mt"><span class="btn">+ Add work item</span></div>
      <div class="mt">${upNext}</div>
    </div>
    <div class="card"><span class="row"><span class="muted">▼</span>${img(icon('folder', C.folder, 16))}<span>Files: weather-app</span></span>
      <div class="mt">${nowCard}</div>
      <div class="row mt"><div class="input">⌕  Find a file</div></div>
      <div class="row mt" style="flex-wrap:wrap;gap:6px">${['Refresh', 'Collapse all', 'Show sizes', 'Up a folder', 'Back to project', 'Hide hidden files'].map(b => `<span class="btn">${b}</span>`).join('')}</div>
      <div class="mt">${touchCard}</div>
      <div class="row between mt2" style="padding:0 2px">${capsL('All files')}${capsL('weather-app')}</div>
      <div class="tree mt">${treeRows}</div>
    </div>
    <div class="card"><span class="row"><span class="muted">▶</span>${img(icon('gauge', C.write, 16))}<span>${SESSIONS_LINE}</span></span></div>
  </div>
</div>`)

/* ── In Flight, expanded, with numbered badges the README explains ── */
// Text in the pane takes Claude Code's theme colors (dark); caps labels and icons take the pane's own ink.
const TH = { claude: '#d97757', sugg: '#b1b9f9', ok: '#4eba65', perm: '#b1b9f9', merged: '#af87ff', warn: '#ffc107', err: '#ff6b80', inact: '#999999', subtle: '#5a5a56', text: '#ececec', dim: '#8a8a85' }
const sp = (c: string, t: string, x = '') => `<span style="color:${c};${x}">${t}</span>`
const dm = (t: string) => sp(TH.dim, t)
const badge = (n: number) => `<span class="badge">${n}</span>`
const panel = (n: number, inner: string, cls = '') => `<div class="card mt rel ${cls}">${badge(n)}${inner}</div>`
const key = (k: string) => sp(TH.claude, k) + dm(':')
const tile = (g: string, gc: string, n: number, t1: string, t2: string, type: string, ctx: string, st: string, clock: string, live: boolean, open: boolean) => `
  <div class="col" style="flex:1;min-width:0;border:${open ? '3px double' : '1px solid'} ${live || open ? TH.sugg : '#5a5a7a'};border-radius:${open ? 3 : 9}px;padding:6px 9px;gap:1px">
    <div class="trunc">${key(String(n))} <span class="bold">${t1}</span></div><div class="trunc bold">${t2}</div>
    <div class="trunc" style="color:${TH.inact}">${type}</div><div class="trunc" style="color:${TH.dim}">${ctx}</div>
    <div class="row" style="gap:6px"><span class="trunc" style="color:${gc}">${g} ${st}</span><span style="color:${TH.inact}">${clock}</span></div>
  </div>`
const strip = 'rrrrcrrrrraccrrrrrrsrrcrrrrrrrrrcrrrrdrrrr'.split('').map(k => (k === 'r' ? sp(TH.ok, '■') : k === 'c' ? sp(TH.perm, '■') : k === 'a' ? sp(TH.warn, '■') : k === 'd' ? sp(TH.err, '✗') : sp(TH.ok, '■', 'opacity:.45'))).join('')
const logRow = (t: string, who: string, wc: string, text: string, tc = TH.text) => `<div class="row"><span style="width:44px;flex-shrink:0;color:${TH.subtle}">${t}</span><span class="trunc bold" style="width:86px;flex-shrink:0;color:${wc}">${who}</span><span class="grow trunc" style="color:${tc}">${text}</span></div>`
const collapsedRow = (name: string, ic: Parameters<typeof icon>[0], c: string) => `<div class="card"><span class="row"><span class="muted">▶</span>${img(icon(ic, c, 16))}<span>${name}</span></span></div>`
const inflightCss = css + `
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;letter-spacing:-.5px}.wrap{flex-wrap:wrap;column-gap:16px}`
const inflight = `<!doctype html><html><head><meta charset="utf-8"><style>${inflightCss}</style></head><body>
<div class="pane">
  <div class="pane-head"><span>Workbench</span><span>✕</span></div>
  <div class="pane-body">
    ${collapsedRow('Tasks', 'list-checks', C.ok)}${collapsedRow('Files', 'folder', C.folder)}
    <div class="card"><span class="row"><span class="muted">▼</span>${img(icon('gauge', C.write, 16))}<span>In Flight · Opus 5.5 working</span></span>
      ${panel(1, `<div class="row between">${capsL('Opus 5.5 · main', C.write)}${sp(TH.claude, '● working')}</div>
        <div>${dm('effort ')}${sp(TH.claude, '▮▮▮▯ ')}${sp(TH.claude, 'high', 'font-weight:600')}${dm('  mode auto  42 req')}</div>
        <div>${dm('ctx ')}<span class="mono">${sp(TH.claude, '▰▰▰▰▰')}${sp(TH.subtle, '▱▱▱▱▱▱▱▱▱▱▱')}</span><span class="bold"> 31%</span>${dm(' 62k/200k')}${sp(TH.warn, '  ⟲1')}</div>
        <div class="row wrap">${sp(TH.text, '$4.82')}<span>${dm('5h ')}<span class="mono">${sp(TH.claude, '▰▰')}${sp(TH.subtle, '▱▱▱')}</span>${dm(' 38%')}</span><span>${dm('7d ')}<span class="mono">${sp(TH.claude, '▰')}${sp(TH.subtle, '▱▱▱▱')}</span>${dm(' 12%')}</span></div>`, 'tint')}
      ${panel(2, `<div class="row between">${capsL('Sessions')}${dm('1 waiting · 2 working · 1 done')}</div>
        ${[
          ['◆ waiting', TH.warn, 'Add the hourly view', '0:48', 'input needed', 'weather-app · desktop'],
          ['● working', TH.claude, 'Seven-day forecast', '12:04', '', 'weather-app · desktop · this session'],
          ['● working', TH.claude, 'Fix the login redirect', '3:31', '', 'auth-service · terminal'],
          ['✓ done', TH.ok, 'Release notes draft', '1h12', '', 'docs · vscode'],
        ].map(([st, c, name, clock, why, where]) => `<div class="col mt">
          <div class="row"><span style="width:80px;flex-shrink:0;color:${c};font-weight:${st.startsWith('✓') ? 400 : 600}">${st}</span><span class="grow trunc" style="font-weight:${st.startsWith('✓') ? 400 : 600}">${name}</span>${dm(clock)}</div>
          <div class="row" style="padding-left:88px">${why ? sp(TH.warn, why) : ''}<span class="grow trunc">${dm(where)}</span></div></div>`).join('')}`)}
      ${panel(3, `<div class="row between">${capsL('Architect · on call', C.read)}<span>${dm('consults ')}${sp(TH.merged, '2', 'font-weight:600')}</span></div>
        <div class="mono" style="color:${TH.merged}">◆━━─────────────────────────────◆━━━──────────</div>
        <div>${dm('last 3m02s ago · took 41s')}</div>
        <div class="row wrap">${sp(TH.inact, '◇ before a plan')}${sp(TH.inact, '◇ error repeats')}${sp(TH.merged, '◆ before done', 'font-weight:600')}${sp(TH.subtle, '(inferred)')}</div>
        <div class="trunc" style="color:${TH.merged}">» Ship it after one more test of the gate drill-down.</div>`)}
      ${panel(4, `<div class="row between">${capsL('Gate · permissions', C.ok)}${dm('42 checks')}</div>
        <div class="mono">${strip}</div>
        <div class="row wrap"><span>${sp(TH.ok, '■')}${dm(' 34 allowed')}</span><span>${sp(TH.perm, '■')}${dm(' 6 classifier')}</span>${sp(TH.warn, '■ 1 pending')}${sp(TH.err, '✗ 1 denied')}</div>
        <div class="row mt" style="gap:16px"><span>${key('f')} file 24</span><span>${key('s')} shell 14 ▾</span><span>${key('o')} other 4</span></div>
        <div class="trunc">${sp(TH.ok, '■ ')}${sp(TH.inact, 'allowed&nbsp;&nbsp;&nbsp;&nbsp;')}Bash → git status</div>
        <div class="trunc">${sp(TH.perm, '■ ')}${sp(TH.inact, 'classifier ')}Bash → npm test -- deck</div>
        <div class="trunc">${sp(TH.warn, '■ ')}${sp(TH.inact, 'pending&nbsp;&nbsp;&nbsp;&nbsp;')}Bash → curl -H "Authorization: Bearer •••" api</div>
        <div class="trunc">${sp(TH.err, '✗ ')}${sp(TH.inact, 'denied&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')}Bash → rm -rf build</div>`)}
      ${panel(5, `${capsL('Agents · 2 running · 5 total', C.read)}
        <div class="row mt" style="gap:8px;align-items:stretch">
          ${tile('✓', TH.ok, 1, 'Audit the gate', 'redaction rules', 'Explore', '41k ctx · 12 st', 'done', '1:12', false, false)}
          ${tile('◐', TH.sugg, 2, 'Find every', 'caller of addTouch', 'Explore', '28k ctx · 7 st', 'running', '2:05', true, true)}
          ${tile('◐', TH.sugg, 3, 'Check skins', 'palette in light…', 'general', 'starting…', 'running', '0:48', true, false)}
        </div>
        <div class="mt">${capsL('Earlier · 2')}</div>
        <div class="row">${sp(TH.ok, '✓')}<span class="grow trunc">${key('4')} Map the pane redraw triggers</span>${dm('36k ctx')}${sp(TH.inact, '0:54')}</div>
        <div class="row">${sp(TH.err, '✗')}<span class="grow trunc">${key('5')} Run the desktop screenshot script</span>${dm('9k ctx')}${sp(TH.inact, '0:21')}</div>
        <div class="card mt" style="border-color:${TH.sugg};border-radius:2px">
          <div class="bold">Find every caller of addTouch</div>
          <div>${dm('Explore · Opus 5.5 · running · 7 steps')}</div><div>${dm('ctx 28k · out 3k')}</div>
          <div class="trunc">· Grep → addTouch</div><div class="trunc">· Read → hooks/register.tsx</div><div class="trunc">· Read → hooks/bench.ts</div>
        </div>`)}
      ${panel(6, `<div class="row">${sp(TH.claude, '◐ opus 5.5 · turn 2:14')}${dm('· 3 edits · 1 error')}</div>`)}
      ${panel(7, `${capsL('Session log')}
        ${logRow('14:02', 'you', TH.text, 'add a third card for the agents')}
        ${logRow('14:03', 'architect', TH.merged, 'before a plan · advisor tool')}
        ${logRow('14:04', 'Audit the g…', TH.sugg, 'spawned · Explore')}
        ${logRow('14:05', 'gate', TH.err, 'denied by rule · Bash → rm -rf build', TH.err)}
        ${logRow('14:06', 'main', TH.claude, 'Edit → hooks/deck-view.tsx')}
        ${logRow('14:06', 'main', TH.err, 'Bash → npm test  ✗', TH.err)}
        ${logRow('14:07', 'Audit the g…', TH.ok, 'done · 1m12s')}
        ${logRow('14:08', 'architect', TH.merged, 'advice: Ship it after one more test of the…')}`)}
      <div class="row mt"><span class="btn">Reset</span></div>
    </div>
  </div>
</div></body></html>`
fs.writeFileSync(`${out}/inflight.html`, inflight)

/* ── Tasks and Files on their own, numbered like In Flight; the README explains each number ── */
const num = (n: number, inner: string, cls = '') => `<div class="rel ${cls}"><span class="badge">${n}</span>${inner}</div>`
const closedRow = (name: string, ic: Parameters<typeof icon>[0], c: string) => `<div class="card"><span class="row"><span class="muted">▶</span>${img(icon(ic, c, 16))}<span>${name}</span></span></div>`
const onePane = (body: string) => page(`<div class="pane"><div class="pane-head"><span>Workbench</span><span>✕</span></div><div class="pane-body">${body}</div></div>`)
const nowTop = `<div class="card tint">${img(darkHero(hero({ icon: 'eye', accent: C.read, label: 'Right now', title: 'Claude is reading client.ts', sub: 'in src/api', w: IN2, panel: false })))}`
const nowGit = `<div style="margin:8px 0;line-height:0">${img(rule(C.muted).replace('width="2000"', `width="${IN2}"`))}</div>
  <div class="row between"><div class="row">${ico('git-branch', C.user, 18)}<span class="bold">main</span></div><span style="color:${C.warn}">2 not committed</span></div>
  <div class="row mt" style="gap:22px;font-size:13px">
    <span><span style="color:${C.read}">●</span> <span class="muted">Claude read</span></span>
    <span><span style="color:${C.write}">●</span> <span class="muted">Claude edited</span></span>
    <span><span style="color:${C.warn}">●</span> <span class="muted">Not committed</span></span>
  </div>`
const tasksPane = onePane(`
  <div class="card"><span class="row"><span class="muted">▼</span>${img(icon('list-checks', C.ok, 16))}<span>Task · weather-app</span></span>
    <div class="card tint rel"><span class="badge">1</span>
      ${img(darkHero(hero({ icon: 'check', accent: C.ok, label: 'Current task', title: 'Seven-day forecast', sub: 'weather-app · Oct 8 → Oct 10', w: IN2, panel: false })))}
      <div class="row between mt">${img(dark(paneBarSvg(IN2 - 18 * 7 - 12, { done: 1, doing: 1, total: 4, pill: 'build', finished: false, color: STAGE_COLOR.build })))}<span class="muted">25% · 1 of 4 done</span></div>
      <div style="margin:8px 0;line-height:0">${img(rule(C.muted).replace('width="2000"', `width="${IN2}"`))}</div>
      ${num(2, `${capsL('In progress', C.write)}
      <div class="row mt">${sq('doing')}<span class="grow bold">Forecast screen</span><span style="color:${STAGE_COLOR.build}">build</span><span class="btn">Done</span></div>`)}
    </div>
    ${num(3, wiCard)}
    ${num(4, `<div class="row mt"><span class="btn">+ Add work item</span></div>`)}
    ${num(5, `<div class="mt">${upNext}</div>`)}
  </div>
  ${closedRow('Files', 'folder', C.folder)}${closedRow(SESSIONS_LINE, 'gauge', C.write)}`)
const filesPane = onePane(`
  ${closedRow('Tasks', 'list-checks', C.ok)}
  <div class="card"><span class="row"><span class="muted">▼</span>${img(icon('folder', C.folder, 16))}<span>Files: weather-app</span></span>
    <div class="mt rel"><span class="badge">1</span>${nowTop}${num(2, nowGit)}</div></div>
    ${num(3, `<div class="row mt"><div class="input">⌕  Find a file</div></div>`)}
    ${num(4, `<div class="row mt" style="flex-wrap:wrap;gap:6px">${['Refresh', 'Collapse all', 'Show sizes', 'Up a folder', 'Back to project', 'Hide hidden files'].map(b => `<span class="btn">${b}</span>`).join('')}</div>`)}
    ${num(5, `<div class="mt">${touchCard}</div>`)}
    ${num(6, `<div class="row between mt2" style="padding:0 2px">${capsL('All files')}${capsL('weather-app')}</div><div class="tree mt">${treeRows}</div>`)}
  </div>
  ${closedRow(SESSIONS_LINE, 'gauge', C.write)}`)
fs.writeFileSync(`${out}/tasks.html`, tasksPane)
fs.writeFileSync(`${out}/files.html`, filesPane)

fs.writeFileSync(`${out}/band.html`, band)
fs.writeFileSync(`${out}/pane.html`, pane)
console.log('written', ACCENT.length > 0)
