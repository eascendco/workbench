// Lucide icons (ISC license, lucide.dev), drawn as small SVGs on the desktop surface.

const PATHS = {
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  'git-branch': '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  'folder-open': '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  'square-dot': '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="12" cy="12" r="1"/>',
  'square-check': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
  'square-dashed': '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  'loader-circle': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
} as const

export type IconName = keyof typeof PATHS

/** A color, or a pair the drawing picks from by light or dark mode. */
export type Ink = string | { light: string; dark: string }

/** `[style block, value]` for an ink: a pair becomes a CSS variable that follows prefers-color-scheme. */
const paint = (c: Ink, name = 'ink'): [string, string] =>
  typeof c === 'string'
    ? ['', c]
    : [`<style>svg{--${name}:${c.light}}@media (prefers-color-scheme: dark){svg{--${name}:${c.dark}}}</style>`, `var(--${name})`]

const FONT = 'font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif"'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One Lucide icon, `size` px square, stroked in `color`. */
export const icon = (name: IconName, color: Ink, size = 16) => {
  const [css, c] = paint(color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="stroke:${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${css}${PATHS[name]}</svg>`
}

/** An icon centred on a tinted disc, as the "Right now" card leads with. */
export const disc = (name: IconName, color: Ink, size = 44) => {
  const [css, c] = paint(color)
  const s = Math.round(size * 0.5)
  const o = (size - s) / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${css}` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" style="fill:${c}" fill-opacity="0.18"/>` +
    `<g transform="translate(${o} ${o}) scale(${s / 24})" fill="none" style="stroke:${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</g></svg>`
  )
}

/** A rounded label on a tint of its own color: "Reading", "Edited". */
export const pill = (text: string, color: Ink) => {
  const [css, c] = paint(color)
  const w = Math.round(text.length * 7.4 + 22)
  const h = 22
  return {
    w,
    h,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${css}` +
      `<rect width="${w}" height="${h}" rx="${h / 2}" style="fill:${c}" fill-opacity="0.18"/>` +
      `<text x="${w / 2}" y="15" text-anchor="middle" font-size="12" font-weight="600" style="fill:${c}" ${FONT}>${esc(text)}</text></svg>`,
  }
}

/** A file-type tag: the extension, short, on a square tint. */
export const fileTag = (ext: string, color: Ink) => {
  const [css, c] = paint(color)
  const label = (ext || '·').slice(0, 4).toUpperCase()
  const w = Math.max(26, Math.round(label.length * 7 + 12))
  const h = 20
  return {
    w,
    h,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${css}` +
      `<rect width="${w}" height="${h}" rx="5" style="fill:${c}" fill-opacity="0.16"/>` +
      `<text x="${w / 2}" y="14" text-anchor="middle" font-size="10" font-weight="700" style="fill:${c}" ${FONT}>${esc(label)}</text></svg>`,
  }
}

/** A hairline: drawn without a width it fills its slot, stretched by preserveAspectRatio. */
export const rule = (color: Ink) => {
  const [css, c] = paint(color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="9" viewBox="0 0 2000 9" preserveAspectRatio="none">${css}<line x1="0" y1="4.5" x2="2000" y2="4.5" style="stroke:${c}" stroke-opacity="0.7" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`
}

/** A letter-spaced caps label ("RIGHT NOW", "ALL FILES"), its width from its text. */
export const caps = (text: string, color: Ink, size = 12) => {
  const [css, c] = paint(color)
  const t = text.toUpperCase()
  const w = Math.ceil(t.length * (size * 0.68 + 1.6)) + 2
  const h = Math.round(size * 1.5)
  return {
    w,
    h,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${css}` +
      `<text x="0" y="${Math.round(size * 1.1)}" font-size="${size}" font-weight="700" letter-spacing="1.6" style="fill:${c}" ${FONT}>${esc(t)}</text></svg>`,
  }
}

/** A headline in one line, cut with an ellipsis to fit `maxW` px. */
export const headline = (text: string, color: Ink, maxW: number, size = 17) => {
  const [css, c] = paint(color)
  const per = size * 0.56
  const fit = Math.max(4, Math.floor(maxW / per))
  const t = text.length > fit ? text.slice(0, fit - 1) + '…' : text
  const w = Math.min(maxW, Math.ceil(t.length * per) + 4)
  const h = Math.round(size * 1.45)
  return {
    w,
    h,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${css}` +
      `<text x="0" y="${Math.round(size * 1.1)}" font-size="${size}" font-weight="700" style="fill:${c}" ${FONT}>${esc(t)}</text></svg>`,
  }
}

/** The tree's small filled disclosure triangle. */
export const triangle = (open: boolean, color: Ink, size = 10) => {
  const [css, c] = paint(color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 10 10">${css}<path d="${open ? 'M1.5 3h7L5 7.5z' : 'M3 1.5v7L7.5 5z'}" style="fill:${c}"/></svg>`
}

/** A progress bar that fills its slot: `done` of `total`, the doing share lighter. */
export const progress = (done: number, doing: number, total: number, color: Ink, track: Ink) => {
  const [cssA, c] = paint(color, 'bar')
  const [cssB, t] = paint(track, 'track')
  const W = 1000
  const a = total ? (W * done) / total : 0
  const b = total ? (W * doing) / total : 0
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="8" viewBox="0 0 ${W} 8" preserveAspectRatio="none">${cssA}${cssB}` +
    `<rect width="${W}" height="8" style="fill:${t}" fill-opacity="0.22"/>` +
    `<rect x="${a}" width="${b}" height="8" style="fill:${c}" fill-opacity="0.45"/>` +
    `<rect width="${a}" height="8" style="fill:${c}"/></svg>`
  )
}

/** The top of a hero card: icon disc, caps label, title, a line under it; on its own tinted panel unless `panel` is false.
 * The disc's left edge sits at x 0, in line with the card's rows below it. */
export function hero(o: { icon: IconName; accent: Ink; label: string; title: string; sub: string; w: number; panel?: boolean }) {
  const [css, c] = paint(o.accent, 'acc')
  const H = 78
  const x = 58
  const room = Math.max(60, o.w - x - 14)
  const cut = (s: string, size: number, bold: boolean) => {
    const per = size * (bold ? 0.58 : 0.52)
    const fit = Math.max(4, Math.floor(room / per))
    return s.length > fit ? s.slice(0, fit - 1) + '…' : s
  }
  const label = o.label.toUpperCase()
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.w}" height="${H}" viewBox="0 0 ${o.w} ${H}">${css}` +
    `<style>.bg{fill:#f0eee6}.t{fill:#1f1f1f}.m{fill:#5f5f5c}@media (prefers-color-scheme: dark){.bg{fill:#30302e}.t{fill:#ececec}.m{fill:#9a9a96}}</style>` +
    (o.panel === false ? '' : `<rect class="bg" width="${o.w}" height="${H}" rx="12"/>`) +
    `<circle cx="22" cy="${H / 2}" r="22" style="fill:${c}" fill-opacity="0.18"/>` +
    `<g transform="translate(11 ${H / 2 - 11}) scale(${22 / 24})" fill="none" style="stroke:${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[o.icon]}</g>` +
    `<text x="${x}" y="24" font-size="11" font-weight="700" letter-spacing="1.6" style="fill:${c}" ${FONT}>${esc(label)}</text>` +
    `<text class="t" x="${x}" y="47" font-size="17" font-weight="700" ${FONT}>${esc(cut(o.title, 17, true))}</text>` +
    `<text class="m" x="${x}" y="66" font-size="12.5" ${FONT}>${esc(cut(o.sub, 12.5, false))}</text></svg>`
  )
}
