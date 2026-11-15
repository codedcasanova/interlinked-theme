// The command console: the band above the prompt, drawn as one SVG.
//
// Every mark on it is a reading. Four cells, left to right:
//   the companion's hologram;
//   CONTEXT: how full the window is, what is filling it, and how fast;
//   PLAN LIMITS: how much of each window is used against how much time is gone;
//   TOOL CALLS PER TURN: one bar for each recent turn, failures marked.
//
// It is laid out in CSS pixels with no viewBox, so type is drawn at its real
// size whatever the band's width. (The desktop clamps the frame to the band's
// width, and a viewBox wider than the band shrinks everything in it.)

import { PORTRAIT } from './portrait'
import { PRESETS } from './scenes'
import type { Palette, PresetId } from './scenes'

export type ConsoleData = {
  /** How full the context window is, 0 to 100. */
  context: number
  /** Tokens in the window and the window's size; 0 when unknown. */
  tokens: number
  window: number
  /** What fills the window, biggest first, and the compaction reserve. */
  parts: readonly { name: string; tokens: number }[]
  reserve: number
  /** Context percent at the end of each recent turn, oldest first. */
  trend: readonly number[]
  /** Plan limits, at most two. `elapsed` is the share of the window's time gone, 0 to 1. */
  limits: readonly { name: string; percent: number; elapsed: number | null; resets: string; left: string }[]
  /** Tool calls in each recent turn, oldest first. */
  turns: readonly { ops: number; faults: number }[]
  hasCompanion: boolean
  /** The page color behind the console. */
  ground: string
}

/** The console's size. Its four cells need `minWidth`; a wider band gets more ruler. */
export const CONSOLE = { minWidth: 752, frameWidth: 1600, height: 132 }

const FONT = "font-family=\"Bahnschrift,'DIN Alternate','Segoe UI',sans-serif\""
const H = CONSOLE.height

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `642K`, `1M`, `1.2M`: a token count short enough for a readout. */
export function tokenLabel(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(Math.round(n))
}

/** Where a gauge turns warm, and where it turns to alarm, in percent. */
const WARM = 65
const ALARM = 85

/** A gauge's color by how full it is: calm, then warm, then alarm. */
const level = (p: Palette, percent: number) =>
  percent >= ALARM ? p.hud.alert : percent >= WARM ? p.hud.warn : p.hud.calm

/** How the companion carries herself: at ease, watchful, or raising the alarm. */
export type Mood = 'calm' | 'warm' | 'alarm'

/**
 * The companion's mood: the fullest of the context gauge and the plan limits,
 * on the gauges' own thresholds, so she changes when a gauge changes color.
 */
export function moodOf(context: number, limits: readonly { percent: number }[]): Mood {
  const worst = Math.max(context, ...limits.slice(0, 2).map(limit => limit.percent))
  const percent = clamp(Math.round(worst), 0, 100)
  return percent >= ALARM ? 'alarm' : percent >= WARM ? 'warm' : 'calm'
}

/**
 * How many more turns fit at the recent rate of growth, from the trend.
 * Undefined when there is too little history or the window isn't filling.
 */
export function turnsOfRoom(trend: readonly number[]): number | undefined {
  if (trend.length < 3) return undefined
  const recent = trend.slice(-6)
  const growth = (recent[recent.length - 1]! - recent[0]!) / (recent.length - 1)
  if (growth < 0.2) return undefined
  return Math.max(0, Math.round((100 - recent[recent.length - 1]!) / growth))
}

type TextStyle = {
  size?: number
  color?: string
  opacity?: number
  anchor?: 'start' | 'end' | 'middle'
  weight?: number
  lamp?: boolean
  /** The width the text must stay inside, in px: past it, the text is squeezed to fit. */
  max?: number
}

/**
 * The console's grid. After the companion's cell come three cells of
 * readings, each inset 10px from the dividers beside it, and all three share
 * a baseline for their heading and one for their closing note.
 */
const GRID = {
  dividers: [96, 342, 560],
  context: { x: 106, w: 226 },
  limits: { x: 352, w: 198 },
  chart: { x: 570, w: 172 },
  head: 18,
  foot: 122,
} as const

/**
 * How wide a line of the readout's capitals draws, in px: 0.73 of the type
 * size a letter, spacing included. Measured from the console as drawn in
 * Bahnschrift; a font that sets wider is held to `max` by the squeeze.
 */
export const textWidth = (body: string, size: number) => body.length * size * 0.73

/** Short names for the legend, where three parts share 226px. */
const LEGEND_NAMES: Record<string, string> = {
  'system tools': 'TOOLS',
  'system prompt': 'PROMPT',
  'mcp tools': 'MCP',
  'memory files': 'MEMORY',
  'custom agents': 'AGENTS',
}
const legendName = (name: string) => LEGEND_NAMES[name.toLowerCase()] ?? name.toUpperCase().slice(0, 9)

/**
 * The hologram: a woman of light standing in a projector's cone, drawn as a
 * bust in scan slices with a sweep line and the odd glitch. She is this mod's
 * own figure, modelled on no one.
 *
 * Her mood shows in the light around her, never in the figure itself: the
 * projector's cone, the emitter at her feet and her frame take the color of
 * the gauge that is filling up, and she flickers faster. Calm is her own tint.
 */
function hologram(p: Palette, ground: string, animated: boolean, mood: Mood, picture: string) {
  const tint = p.hud.you
  const aura = mood === 'alarm' ? p.hud.alert : mood === 'warm' ? p.hud.warn : tint
  // a shorter period is a faster flicker
  const pace = mood === 'alarm' ? 0.4 : mood === 'warm' ? 0.7 : 1
  const dur = (seconds: number) => `${Number((seconds * pace).toFixed(2))}s`
  const glow = mood === 'alarm' ? 0.42 : mood === 'warm' ? 0.34 : 0.26
  const flicker = animated
    ? `<animate attributeName="opacity" values="0.95;0.72;0.95;0.88;0.45;0.95" keyTimes="0;0.31;0.34;0.7;0.72;1" dur="${dur(4.6)}" repeatCount="indefinite"/>`
    : ''
  const glitch = animated
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;2.5 0;0 0;-2 0;0 0" keyTimes="0;0.45;0.47;0.5;0.86;0.88" calcMode="discrete" dur="${dur(5.8)}" repeatCount="indefinite"/>`
    : ''
  const sweep = animated
    ? `<rect x="8" y="4" width="76" height="3.5" fill="#ffffff" opacity="0.5"><animate attributeName="y" values="4;116" dur="3.4s" repeatCount="indefinite"/></rect>`
    : ''
  const breathe = animated
    ? `<animate attributeName="opacity" values="${glow};${Number((glow + 0.12).toFixed(2))};${glow}" dur="3.8s" repeatCount="indefinite"/>`
    : ''
  // the emitter beats while she raises the alarm
  const beat = animated && mood === 'alarm'
    ? `<animate attributeName="rx" values="19;26;19" dur="0.9s" repeatCount="indefinite"/>`
    : ''

  // The figure, in a 90 x 132 cell with her feet at the emitter (y 122).
  const hair =
    'M45 12C30 12 23 23 23 38C23 56 20 72 15 88C24 92 33 88 36 76L36 58L54 58L55 74' +
    'C57 82 62 87 69 89C71 76 68 56 68 38C68 23 60 12 45 12Z'
  const face = '<ellipse cx="45" cy="38" rx="12" ry="15.5"/>'
  const neck = '<path d="M40.5 50h9v13h-9z"/>'
  const shoulders = '<path d="M17 122C18 94 28 72 40 65L50 65C62 72 72 94 73 122Z"/>'
  const fringe = 'M32.5 34C33 22 41 17 50 19C55 21 57.5 26 57.5 32C51 24 41 24 32.5 34Z'

  // The person's own portrait, when the mod carries one: projected as a
  // framed image in the drawn figure's place, under the hologram's texture
  // (fine scan lines), a band of light that sweeps down it, and a faint
  // flicker. The portrait covers its frame whole, so the figure is left out:
  // drawn beneath it, she would be animated and filtered where nobody sees.
  const hasPortrait = picture !== ''
  const sheen = animated
    ? `<animate attributeName="y" values="-34;126" dur="9s" repeatCount="indefinite"/>`
    : ''
  const shimmer = animated
    ? `<animate attributeName="opacity" values="1;0.9;1;1;0.82;1" keyTimes="0;0.3;0.33;0.7;0.72;1" dur="${dur(5.2)}" repeatCount="indefinite"/>`
    : ''
  const portraitDefs = hasPortrait
    ? `<clipPath id="frame"><rect x="4" y="8" width="82" height="114" rx="5"/></clipPath>` +
      `<filter id="soften" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="0.55"/></filter>` +
      `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6a9ff" stop-opacity="0"/><stop offset="0.5" stop-color="#b6a9ff" stop-opacity="0.34"/><stop offset="1" stop-color="#b6a9ff" stop-opacity="0"/></linearGradient>` +
      `<pattern id="weave" width="3" height="3" patternUnits="userSpaceOnUse"><rect y="2" width="3" height="1" fill="#1a052e" opacity="0.5"/></pattern>`
    : ''
  const portrait = hasPortrait
    ? `<g clip-path="url(#frame)">` +
      // the picture as colored cells, softened so the cells read as one image
      `<g filter="url(#soften)">${picture}${shimmer}</g>` +
      `<rect x="4" y="8" width="82" height="114" fill="url(#weave)"/>` +
      `<rect x="4" y="${animated ? -34 : 40}" width="82" height="34" fill="url(#sheen)">${sheen}</rect>` +
      `</g>` +
      `<rect x="4" y="8" width="82" height="114" rx="5" fill="none" stroke="${aura}" stroke-width="${mood === 'alarm' ? 2 : mood === 'warm' ? 1.6 : 1.2}" opacity="${mood === 'calm' ? 0.75 : 1}" filter="url(#lamp)"/>`
    : ''
  // The drawn figure has no frame, so a mood other than calm brackets her cell.
  const brackets = hasPortrait || mood === 'calm'
    ? ''
    : `<path d="M6 22V10H18M72 10H84V22M6 106V118H18M72 118H84V106" fill="none" stroke="${aura}" stroke-width="${mood === 'alarm' ? 2 : 1.4}" filter="url(#lamp)"/>`

  return {
    defs:
      portraitDefs +
      `<linearGradient id="cone" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${aura}" stop-opacity="0.9"/><stop offset="1" stop-color="${aura}" stop-opacity="0"/></linearGradient>` +
      (hasPortrait
        ? ''
        : `<clipPath id="figure"><path d="${hair}"/>${face}${neck}${shoulders}</clipPath>` +
          `<clipPath id="skin">${face}${neck}</clipPath>` +
          `<pattern id="slice" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1.8" fill="${tint}"/></pattern>`),
    body:
      `<path d="M36 124L4 6h82L54 124z" fill="url(#cone)" opacity="${glow}">${breathe}</path>` +
      `<g>${glitch}` +
      (hasPortrait
        ? portrait
        : `<g filter="url(#lamp)">` +
          `<g clip-path="url(#figure)"><rect x="4" y="4" width="84" height="120" fill="url(#slice)" opacity="0.95">${flicker}</rect>${sweep}</g>` +
          `<g clip-path="url(#skin)"><rect x="30" y="20" width="30" height="46" fill="#ffffff" opacity="0.34"/></g>` +
          `<path d="${fringe}" fill="${tint}" opacity="0.92"/>` +
          `</g>` +
          // eyes and mouth: small gaps in the light
          `<path d="M38 39.5h5M47.5 39.5h5" stroke="${ground}" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>` +
          `<path d="M42.5 47.5q2.5 1.8 5 0" fill="none" stroke="${ground}" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>`) +
      `</g>` +
      brackets +
      (beat
        ? `<ellipse cx="45" cy="124" rx="19" ry="2.6" fill="${aura}" filter="url(#lamp)">${beat}</ellipse>`
        : `<ellipse cx="45" cy="124" rx="19" ry="2.6" fill="${aura}" filter="url(#lamp)"/>`),
  }
}

const cache = new Map<string, string>()

/**
 * The console's SVG. Readings are baked into the drawing, so it is rebuilt
 * when one changes: at the end of a turn, and as a limit's clock runs down.
 * `picture` is the companion's portrait as SVG markup, or '' for the drawn
 * figure: the mod's own unless a caller hands in another.
 */
export function consoleSvg(id: PresetId, d: ConsoleData, animated = false, picture: string = PORTRAIT): string {
  const key = `${id}:${animated ? 'anim' : 'still'}:${picture.length}:${JSON.stringify(d)}`
  const hit = cache.get(key)
  if (hit) return hit
  // Readings change through a session; don't keep every drawing ever made.
  if (cache.size > 60) cache.clear()

  const p: Palette = PRESETS[id]
  const text = (x: number | string, y: number, body: string, s: TextStyle = {}) => {
    const size = s.size ?? 9
    const fit = s.max !== undefined && textWidth(body, size) > s.max
      ? ` textLength="${Math.max(1, Math.round(s.max))}" lengthAdjust="spacingAndGlyphs"`
      : ''
    return (
      `<text x="${x}" y="${y}" font-size="${size}" letter-spacing="${(size * (size > 14 ? 0.04 : 0.14)).toFixed(1)}" ` +
      `text-anchor="${s.anchor ?? 'start'}" font-weight="${s.weight ?? 600}" ${FONT} fill="${s.color ?? p.hud.primary}" ` +
      `fill-opacity="${s.opacity ?? 1}"${fit}${s.lamp ? ' filter="url(#lamp)"' : ''}>${esc(body)}</text>`
    )
  }
  const heading = (x: number, body: string) => text(x, GRID.head, body, { opacity: 0.9 })
  // The small print: 9px at 72%, which reads at 5.9:1 or better in every look.
  const note = (x: number | string, y: number, body: string, s: TextStyle = {}) =>
    text(x, y, body, { size: 9, opacity: 0.72, weight: 500, ...s })

  // ── the companion's cell, or a small tracking grid when she is away ──────
  const holo = d.hasCompanion
    ? hologram(p, d.ground, animated, moodOf(d.context, d.limits), picture)
    : { defs: '', body: '' }
  const idle = d.hasCompanion
    ? ''
    : `<path d="M10 34H80M10 66H80M10 98H80M25 14V118M45 14V118M65 14V118" stroke="${p.hud.grid}" stroke-width="0.6" opacity="0.35"/>` +
      `<rect x="37" y="58" width="16" height="16" fill="none" stroke="#ffe14d" stroke-width="1.4"/>`

  // ── CONTEXT ──────────────────────────────────────────────────────────────
  const CX = GRID.context.x
  const CW = GRID.context.w
  const cx = clamp(Math.round(d.context), 0, 100)
  const cxColor = level(p, cx)
  const total = d.window > 0 ? d.window : 0
  const partColors = [p.hud.calm, p.hud.primary, p.hud.you, p.hud.grid]
  const used = d.parts.filter(part => part.tokens > 0)
  const shown = used.slice(0, 2)
  const rest = used.slice(2).reduce((sum, part) => sum + part.tokens, 0)
  const stack = rest > 0 ? [...shown, { name: 'Other', tokens: rest }] : shown

  let bar = `<rect x="${CX}" y="54" width="${CW}" height="12" fill="${p.hud.primary}" opacity="0.13"/>`
  let legend = ''
  if (total > 0 && stack.length > 0) {
    let x = CX
    // The legend names as many parts as fit the cell, biggest first, and
    // stops at the first that doesn't: the bar still shows every part.
    let lx: number = CX
    let isLegendFull = false
    stack.forEach((part, i) => {
      const w = Math.max(1.5, (CW * part.tokens) / total)
      const color = partColors[i % partColors.length]!
      bar += `<rect x="${x.toFixed(1)}" y="54" width="${Math.min(w, CX + CW - x).toFixed(1)}" height="12" fill="${color}" filter="url(#lamp)"/>`
      x += w + 1
      const name = `${legendName(part.name)} ${Math.round((100 * part.tokens) / total)}%`
      const width = 10 + textWidth(name, 8.5)
      if (isLegendFull || lx + width > CX + CW) {
        isLegendFull = true
        return
      }
      legend += `<rect x="${lx.toFixed(1)}" y="73" width="7" height="7" fill="${color}"/>` +
        note((lx + 10).toFixed(1), 80, name, { size: 8.5, opacity: 0.8 })
      lx += width + 7
    })
    if (d.reserve > 0) {
      const w = (CW * d.reserve) / total
      bar += `<rect x="${(CX + CW - w).toFixed(1)}" y="54" width="${w.toFixed(1)}" height="12" fill="url(#hatch)"/>`
      if (w >= 34) bar += note(CX + CW, 51, 'RESERVE', { anchor: 'end', size: 8, opacity: 0.65 })
    }
  } else {
    // no breakdown: one plain fill
    bar += `<rect x="${CX}" y="54" width="${((CW * cx) / 100).toFixed(1)}" height="12" fill="${cxColor}" filter="url(#lamp)"/>`
    legend = note(CX, 80, cx >= ALARM ? 'NEARLY FULL' : cx >= WARM ? 'FILLING UP' : 'ROOM TO WORK', { color: cxColor, opacity: 0.85 })
  }

  // the trend: context at the end of each recent turn
  const TY = 88
  const TH = 22
  let trend = `<path d="M${CX} ${TY + TH + 0.5}H${CX + CW}" stroke="${p.hud.primary}" stroke-width="1" opacity="0.25"/>`
  if (d.trend.length >= 2) {
    const pts = d.trend.slice(-24)
    const step = CW / (pts.length - 1)
    const at = (v: number, i: number) => `${(CX + i * step).toFixed(1)},${(TY + TH - (TH * clamp(v, 0, 100)) / 100).toFixed(1)}`
    const line = pts.map(at).join(' ')
    const lastX = CX + (pts.length - 1) * step
    const lastY = TY + TH - (TH * clamp(pts[pts.length - 1]!, 0, 100)) / 100
    trend +=
      `<polygon points="${CX},${TY + TH} ${line} ${lastX.toFixed(1)},${TY + TH}" fill="${cxColor}" opacity="0.16"/>` +
      `<polyline points="${line}" fill="none" stroke="${cxColor}" stroke-width="1.4" filter="url(#lamp)"/>` +
      `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.4" fill="${cxColor}"/>`
    trend += note(CX, GRID.foot, `CONTEXT OVER THE LAST ${pts.length} TURNS`, { max: CW })
  } else {
    trend += note(CX, GRID.foot, 'TREND APPEARS AFTER TWO TURNS', { opacity: 0.6, max: CW })
  }

  // How long the room lasts at this rate, on the figure's own line, in the
  // space to the right of it: over the trend it crossed the line it describes.
  const usedAt = CX + (cx >= 100 ? 74 : cx >= 10 ? 60 : 44)
  const room = turnsOfRoom(d.trend)
  const roomNote = room === undefined
    ? ''
    : note(CX + CW, 46, room === 0 ? 'FULL AT THIS RATE' : `ABOUT ${room} TURNS OF ROOM`, {
        anchor: 'end', color: cxColor, opacity: 0.95, max: CX + CW - (usedAt + textWidth('USED', 9) + 10),
      })

  const context =
    heading(CX, 'CONTEXT') +
    (total > 0 ? note(CX + CW, GRID.head, `${tokenLabel(d.tokens)} OF ${tokenLabel(total)} TOKENS`, { anchor: 'end', max: CW - 64 }) : '') +
    text(CX, 46, `${cx}%`, { size: 26, color: cxColor, weight: 700, lamp: true }) +
    text(usedAt, 46, 'USED', { size: 9, color: cxColor, opacity: 0.85 }) +
    roomNote + bar + legend + trend

  // ── PLAN LIMITS ──────────────────────────────────────────────────────────
  const LX = GRID.limits.x
  const LW = GRID.limits.w
  const rows = d.limits.slice(0, 2)
  let limits = heading(LX, 'PLAN LIMITS')
  if (rows.length === 0) {
    // A new session has no reading until Claude has replied once.
    limits += note(LX, 46, 'NO READING YET', { opacity: 0.65 }) +
      note(LX, 60, 'SHOWS AFTER THE NEXT REPLY', { opacity: 0.6, max: LW })
  } else {
    limits += note(LX + LW, GRID.head, '▼ TIME GONE', { anchor: 'end' })
    rows.forEach((row, i) => {
      // two rows, the second closing on the cells' shared foot
      const y = GRID.foot - 42 - (rows.length - 1 - i) * 52
      const pct = clamp(Math.round(row.percent), 0, 100)
      const color = level(p, pct)
      const lit = Math.round((20 * pct) / 100)
      let on = ''
      let off = ''
      for (let k = 0; k < 20; k++) {
        const seg = `M${LX + k * 10} ${y + 20}h8v10h-8z`
        if (k < lit) on += seg
        else off += seg
      }
      const figure = `${pct}%`
      limits +=
        text(LX, y + 10, row.name, { opacity: 0.85 }) +
        text(LX + LW, y + 12, figure, { size: 16, color, anchor: 'end', weight: 700, lamp: true }) +
        (off ? `<path d="${off}" fill="${color}" opacity="0.16"/>` : '') +
        (on ? `<path d="${on}" fill="${color}" filter="url(#lamp)"/>` : '')
      if (row.elapsed !== null) {
        const mx = LX + LW * clamp(row.elapsed, 0, 1)
        limits += `<path d="M${mx.toFixed(1)} ${y + 19}l-3.5 -5h7z" fill="#ffffff" opacity="0.9"/>`
        // the verdict sits beside the name, in the room the figure leaves
        const gone = row.elapsed * 100
        const verdict = pct > gone + 10 ? 'AHEAD OF PACE' : pct < gone - 10 ? 'UNDER PACE' : 'ON PACE'
        const from = LX + textWidth(row.name, 9) + 6
        const room = LX + LW - textWidth(figure, 16) - 8 - from
        if (room >= 40) limits += note(from.toFixed(1), y + 10, `· ${verdict}`, { max: room })
      }
      // under the bar: when it resets at the left, how long is left at the right
      if (row.resets !== '') {
        const left = `${row.left} LEFT`
        limits +=
          note(LX, y + 42, `RESETS ${row.resets}`, { max: LW - textWidth(left, 9) - 8 }) +
          note(LX + LW, y + 42, left, { anchor: 'end' })
      }
    })
  }

  // ── TOOL CALLS PER TURN ──────────────────────────────────────────────────
  const AX = GRID.chart.x
  const AW = GRID.chart.w
  const top = 30
  const base = 108
  const turns = d.turns.slice(-24)
  let activity = heading(AX, 'TOOL CALLS PER TURN') +
    `<path d="M${AX} ${base + 0.5}H${AX + AW}" stroke="${p.hud.primary}" stroke-width="1" opacity="0.35"/>`
  if (turns.length === 0) {
    activity += note(AX, 64, 'NO TURNS RECORDED YET', { opacity: 0.6, max: AW })
  } else {
    const peak = Math.max(1, ...turns.map(t => t.ops))
    const sum = turns.reduce((n, t) => n + t.ops, 0)
    const failed = turns.reduce((n, t) => n + t.faults, 0)
    let ok = ''
    let bad = ''
    let latest = ''
    turns.forEach((t, i) => {
      // right-aligned: the newest turn is the last bar
      const x = AX + AW - (turns.length - i) * 7
      const h = t.ops === 0 ? 1.5 : Math.max(3, ((base - top) * t.ops) / peak)
      const failH = t.faults > 0 ? Math.max(3, (h * t.faults) / Math.max(1, t.ops)) : 0
      const seg = `M${x} ${(base - h).toFixed(1)}h5v${(h - failH).toFixed(1)}h-5z`
      if (i === turns.length - 1) latest = seg
      else ok += seg
      if (failH > 0) bad += `M${x} ${(base - failH).toFixed(1)}h5v${failH.toFixed(1)}h-5z`
    })
    // the closing note shares its line with the failures, so it takes the shorter wording when it must
    const failedNote = failed > 0 ? `${failed} FAILED` : ''
    const room = AW - (failed > 0 ? textWidth(failedNote, 9) + 8 : 0)
    const long = turns.length === 1 ? `LAST TURN · ${sum} CALLS` : `LAST ${turns.length} TURNS · AVG ${Math.round(sum / turns.length)}`
    const short = turns.length === 1 ? `${sum} CALLS` : `${turns.length} TURNS · AVG ${Math.round(sum / turns.length)}`
    activity +=
      (ok ? `<path d="${ok}" fill="${p.hud.calm}" opacity="0.6"/>` : '') +
      (latest ? `<path d="${latest}" fill="${p.hud.calm}" filter="url(#lamp)"/>` : '') +
      (bad ? `<path d="${bad}" fill="${p.hud.alert}" filter="url(#lamp)"/>` : '') +
      `<path d="M${AX} ${top + 0.5}H${AX + AW}" stroke="${p.hud.primary}" stroke-width="1" stroke-dasharray="2 4" opacity="0.3"/>` +
      note(AX, top - 3, `PEAK ${peak}`, { size: 8.5 }) +
      (sum === 0 ? note(AX, 64, 'NO TOOL CALLS YET', { opacity: 0.6 }) : '') +
      note(AX, GRID.foot, textWidth(long, 9) <= room ? long : short, { max: room }) +
      (failed > 0 ? note(AX + AW, GRID.foot, failedNote, { anchor: 'end', color: p.hud.alert, opacity: 0.95 }) : '')
  }

  const chase = animated
    ? `<animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1.1s" repeatCount="indefinite"/>`
    : ''
  // Animated, the frame is as wide as the band and the drawing is in px.
  // Still, it is an image, which needs a size of its own to scale from.
  const root = animated
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}">`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${CONSOLE.minWidth}" height="${H}" viewBox="0 0 ${CONSOLE.minWidth} ${H}">`

  const svg =
    root +
    `<defs>` +
    `<filter id="lamp" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<pattern id="scan" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="#000" opacity="0.2"/></pattern>` +
    `<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="4" fill="${p.hud.primary}" opacity="0.55"/></pattern>` +
    `<pattern id="ruler" width="13" height="6" patternUnits="userSpaceOnUse"><path d="M0.5 6v-3" stroke="${p.hud.primary}" stroke-width="1" opacity="0.45"/></pattern>` +
    holo.defs +
    `</defs>` +
    `<rect width="100%" height="${H}" fill="${d.ground}"/>` +
    `<line x1="0" y1="2" x2="100%" y2="2" stroke="${p.hud.primary}" stroke-width="1.5" stroke-dasharray="14 14" opacity="0.8">${chase}</line>` +
    `<rect x="0" y="${H - 6}" width="100%" height="6" fill="url(#ruler)"/>` +
    `<path d="${GRID.dividers.map(x => `M${x} 12V${H - 12}`).join('')}" stroke="${p.hud.primary}" stroke-width="1" opacity="0.22"/>` +
    holo.body + idle +
    context + limits + activity +
    `<rect width="100%" height="${H}" fill="url(#scan)"/>` +
    `</svg>`

  cache.set(key, svg)
  return svg
}
