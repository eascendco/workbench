/* Desktop drawings. The desktop has no font sizes and wraps sibling elements,
 * so anything with small type or several parts on one line is one SVG.
 * Every Svg needs a non-empty alt: the desktop drops one whose alt is empty. */

export const ACCENT = '#8f8cf4'
export const DONE = '#5fbf8f'
export const DOING = '#BA7517'
export const MUTED = '#888780'

export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const CSS = `<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}.bg{fill:#f0eee6}.k2{fill:#dfdcd2}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}.bg{fill:#30302e}.k2{fill:#454542}}
</style>`

const svg = (W: number, H: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}${body}</svg>`

export const xml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** Rough advance of system UI text, in em (as savvy-progress measures). */
const charEm = (ch: string) => (/[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%mw]/.test(ch) ? 0.72 : 0.56)
export const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

export function fitText(s: string, size: number, maxW: number) {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out.trimEnd() + '…'
}

/** Deterministic noise so the dither does not shimmer between redraws. */
const noise = (x: number, y: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

export type BarIn = { done: number; doing: number; total: number; pill: string; finished: boolean }

/** savvy-flow's bar: dithered fill, a faint layer for work in progress, step ticks, a pill at the head. */
function barG(x: number, y: number, W: number, H: number, b: BarIn, id: string, track = 'k') {
  const CELL = 3
  const color = b.finished ? DONE : ACCENT
  const fillW = b.total ? Math.round((W * b.done) / b.total) : 0
  const runW = b.total ? Math.round((W * Math.min(b.total, b.done + b.doing)) / b.total) : 0
  const rows = Math.floor(H / CELL)
  const dots: string[] = []
  const cols = Math.floor(fillW / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) if (noise(c, r) < density) dots.push(`<rect x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
  }
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++)
    for (let r = 0; r < rows; r++) if (noise(c + 7, r + 3) < 0.25) faint.push(`<rect x="${c * CELL + 1}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
  const ticks: string[] = []
  for (let i = 1; i < b.total; i++) {
    const tx = Math.round((W * i) / b.total)
    if (tx > fillW + 4) ticks.push(`<rect x="${tx}" y="${H / 2 - 3}" width="1.5" height="6" rx="0.75"/>`)
  }
  const pillSize = H >= 16 ? 11 : 9.5
  const pillW = Math.round(textWidth(b.pill, pillSize) + 16)
  const pillX = Math.max(0, Math.min(W - pillW, fillW - pillW))
  return `<defs><clipPath id="${id}"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath></defs>
<g transform="translate(${x},${y})">
<rect class="${track}" width="${W}" height="${H}" rx="${H / 2}"/>
<g clip-path="url(#${id})"><g fill="${color}">${dots.join('')}</g><g fill="${color}" opacity="0.45">${faint.join('')}</g><g class="tk">${ticks.join('')}</g></g>
<rect x="${pillX}" width="${pillW}" height="${H}" rx="${H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${H / 2 + pillSize * 0.36}" text-anchor="middle" font-family="${FONT}" font-size="${pillSize}" font-weight="600" fill="#ffffff">${xml(b.pill)}</text>
</g>`
}

const pct = (b: BarIn) => `${b.total ? Math.round((b.done / b.total) * 100) : 0}%`

/** Band line 2: the bar and the percent, no count. */
export function bandBarSvg(W: number, b: BarIn) {
  const H = 20
  const BAR_H = 16
  const barW = Math.max(60, W - 44)
  return svg(
    W,
    H,
    `${barG(0, (H - BAR_H) / 2, barW, BAR_H, b, 'bb')}
<text class="m" x="${W}" y="${H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${pct(b)}</text>`,
  )
}

/** Band line 1: status dot, project, task title, the item in hand. */
export function bandTitleSvg(W: number, dot: string, short: string, title: string, now?: string) {
  const H = 20
  const y = H / 2 + 4.5
  const tx = 16 + textWidth(short, 11.5) + 10
  const nowLabel = now ? `now · ${now}` : ''
  const nowMax = now ? Math.min(textWidth(nowLabel, 12), W * 0.38) : 0
  const t = fitText(title, 13, Math.max(40, W - tx - (now ? nowMax + 18 : 0)))
  const nx = tx + textWidth(t, 13) + 14
  return svg(
    W,
    H,
    `<circle cx="5" cy="${H / 2}" r="4" fill="${dot}"/>
<text class="m" x="16" y="${y - 0.5}" font-family="${FONT}" font-size="11.5" font-weight="500" letter-spacing="0.3">${xml(short)}</text>
<text class="t" x="${tx}" y="${y}" font-family="${FONT}" font-size="13" font-weight="600">${xml(t)}</text>
${now ? `<text class="m" x="${nx}" y="${y}" font-family="${FONT}" font-size="12">${xml(fitText(nowLabel, 12, Math.max(30, W - nx)))}</text>` : ''}`,
  )
}
