// Mockups of the Workbench band and pane for the README, drawn with the mod's own SVG helpers and invented test data.
// node scripts/mockups.mts <out dir>, then render each HTML file to PNG (headless Chrome: --screenshot --force-device-scale-factor=2).
import fs from 'node:fs'
import { ACCENT, bandBarSvg, bandTitleSvg, DOING } from '../hooks/draw.ts'
import { caps, fileTag, hero, icon, pill, progress, rule, triangle } from '../hooks/icons.ts'

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
.box{border-color:transparent;background:#262625}
.mt{margin-top:10px}.mt2{margin-top:14px}
.muted{color:${C.muted}}.bold{font-weight:600}.trunc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{border:1px solid #55554f;border-radius:7px;padding:3px 10px;font-size:13px;background:#30302e;color:${C.fg};white-space:nowrap}
.input{border:1px solid #55554f;border-radius:7px;padding:5px 10px;color:${C.muted};font-size:13px;background:#1f1f1e;width:100%}
.pane{width:${W}px;background:#1f1f1e;border:1px solid #3a3a37;border-radius:14px;overflow:hidden}
.pane-head{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid #33332f;color:#c9c9c4;font-size:14px}
.pane-body{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.tree .row{height:26px}
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
const STAGE: Record<string, string> = { spec: C.read, design: C.read, build: C.write, track: C.user, test: C.run, ship: C.ok }
const SQ = { draft: 'square-dashed', todo: 'square', doing: 'square-dot', done: 'square-check' } as const
const sqColor = (st: string) => (st === 'done' ? C.ok : st === 'doing' ? C.write : C.muted)

/* ── the band above the prompt ── */
const BW = 700
const band = page(`
<div style="width:${BW + 40}px">
  <div class="col" style="gap:4px;padding:0 6px 10px">
    <div class="row">${img(dark(bandTitleSvg(BW - 24, DOING, 'weather-app', 'Seven-day forecast', 'Forecast screen')))}<span class="muted" style="font-size:15px">❯</span></div>
    ${img(dark(bandBarSvg(BW - 24, { done: 1, doing: 1, total: 4, pill: 'build', finished: false })))}
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
  <div class="mt" style="line-height:0">${img(progress(1, 1, 4, C.ok, C.muted).replace('width="1000"', `width="${IN2}"`))}</div>
  <div class="row between"><span class="muted">1 of 4 done</span><span class="bold" style="color:${C.ok}">25%</span></div>
  <div style="margin:8px 0;line-height:0">${img(rule(C.muted).replace('width="2000"', `width="${IN2}"`))}</div>
  ${capsL('In progress', C.write)}
  <div class="row mt">${sq('doing')}<span class="grow bold">Forecast screen</span><span style="color:${C.write}">build</span><span class="btn">Done</span></div>
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
const touched = [
  ['src/api/client.ts', 'src/api', 'Reading', C.read],
  ['ForecastScreen.tsx', 'src/screens', 'Edited', C.write],
  ['seven-day-forecast.md', 'plans', 'Edited', C.write],
] as const
const ext = (n: string) => n.slice(n.lastIndexOf('.') + 1)
const touchCard = `
<div class="card">
  <div class="row between">${capsL('Claude touched')}${capsL('3 files')}</div>
  ${touched.map(([n, d, b, col]) => { const t = fileTag(ext(n), C.run); const p = pill(b, col); return `<div class="row mt" style="padding-left:14px">${img(t.source)}<span class="bold">${n.split('/').pop()}</span><span class="grow muted trunc">${d}</span>${img(p.source)}</div>` }).join('')}
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
  const chev = k === 'dir' ? img(triangle(open, C.muted)) : ''
  const glyph = ico(k === 'dir' ? (open ? 'folder-open' : 'folder') : 'file', k === 'dir' && !hidden ? C.folder : C.muted, 17)
  return `<div class="row" style="padding-left:${8 + d * 22}px"><span style="width:12px;display:inline-flex">${chev}</span>${glyph}<span class="grow ${hidden ? 'muted' : ''}">${n}</span>${marks.map(mark).join(' ')}</div>`
}).join('')

const pane = page(`
<div class="pane">
  <div class="pane-head"><span>Workbench</span><span>✕</span></div>
  <div class="pane-body">
    <div class="card box"><span class="bold">Task · weather-app</span>${taskCard}${wiCard}
      <div class="row mt"><span class="btn">+ Add work item</span></div>
      <div class="mt">${upNext}</div>
    </div>
    <div class="card box"><span class="bold">Files: weather-app</span>
      <div class="mt">${nowCard}</div>
      <div class="row mt"><div class="input">⌕  Find a file</div></div>
      <div class="row mt" style="flex-wrap:wrap;gap:6px">${['Refresh', 'Collapse all', 'Show sizes', 'Up a folder', 'Back to project', 'Hide hidden files'].map(b => `<span class="btn">${b}</span>`).join('')}</div>
      <div class="mt">${touchCard}</div>
      <div class="row between mt2" style="padding:0 2px">${capsL('All files')}${capsL('weather-app')}</div>
      <div class="tree mt">${treeRows}</div>
    </div>
  </div>
</div>`)

fs.writeFileSync(`${out}/band.html`, band)
fs.writeFileSync(`${out}/pane.html`, pane)
console.log('written', ACCENT.length > 0)
