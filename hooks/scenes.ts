// Builds the SVG scenes for each preset: an original retro-future city at
// night, drawn from a seeded PRNG so every build of a preset is identical.
//
// The design language is taken from early-80s film screen graphics and their
// 2010s successors, not copied from them: monochrome phosphor readouts, a
// measurement grid, a crosshair that moves in mechanical steps, dashes that
// chase along an edge, wide all-caps labels, and worn, optical-looking light.
// Every label, code and number here is this mod's own.

export type Palette = {
  label: string
  /** A fixed tag for the readout bar. */
  sector: string
  skyTop: string
  skyMid: string
  horizon: string
  haze: string
  hazeOpacity: number
  far: string
  mid: string
  near: string
  /** Megastructures and stacks, between the sky and the far skyline. */
  mega: string
  windows: string[]
  neon: string[]
  rain: string
  rainCount: number
  rainOpacity: number
  beams: string
  flame: string
  /** A blurred sun: its place as a share of the width and a height, its size and its strength. */
  sun?: { color: string; r: number; cx: number; cy: number; opacity: number }
  /** Drifting dust motes when animated (presets without rain). */
  dust?: string
  /**
   * Readout colors: phosphor text, a second hue, alerts, the grid, your tag.
   * `calm` and `warn` are what a gauge shows while there is room and while it
   * is filling up; with `alert` they are three hues no one could confuse, in
   * every look.
   */
  hud: { primary: string; secondary: string; alert: string; grid: string; you: string; calm: string; warn: string }
  seed: number
}

export const PRESETS = {
  'neon-noir': {
    label: 'Neon Noir',
    sector: 'SECTOR 07',
    skyTop: '#04060c',
    skyMid: '#0d1626',
    horizon: '#e8752a',
    haze: '#ff7b3a',
    hazeOpacity: 0.34,
    far: '#18202f',
    mid: '#0b111d',
    near: '#04060b',
    mega: '#101827',
    windows: ['#ffb347', '#ffd9a0', '#ffc46b', '#4de8ff'],
    neon: ['#ff2bd6', '#00e5ff', '#ff5a1f', '#b84dff', '#39ff88'],
    rain: '#a9d8ff',
    rainCount: 260,
    rainOpacity: 0.22,
    beams: '#ffd3a1',
    flame: '#ff9a2e',
    // cyan, amber, red
    hud: { primary: '#ffb000', secondary: '#2de2e6', alert: '#ff4d5e', grid: '#3aa0ff', you: '#ff3da6', calm: '#2de2e6', warn: '#ffb000' },
    seed: 2019,
  },
  'amber-dust': {
    label: 'Amber Dust',
    sector: 'OUTER ZONE',
    skyTop: '#2b0d02',
    skyMid: '#8a3204',
    horizon: '#ffb24a',
    haze: '#ff9a2e',
    hazeOpacity: 0.55,
    far: '#a8480f',
    mid: '#5c2306',
    near: '#1f0a02',
    mega: '#7a3209',
    windows: ['#ffe2a8', '#ffcf73'],
    neon: ['#ffdd99', '#ff8c42', '#ffd166'],
    rain: '#ffd9a0',
    rainCount: 0,
    rainOpacity: 0,
    beams: '#fff0c9',
    flame: '#ffd27a',
    // Low and to the right, behind the towers: in the middle of the sky it sat
    // under the conversation, where it washed out the words over it.
    sun: { color: '#ffe0a3', r: 170, cx: 0.78, cy: 760, opacity: 0.7 },
    dust: '#ffe6b8',
    // The look is orange throughout, so a gauge with room is the look's green: olive, amber, red.
    hud: { primary: '#ffc247', secondary: '#ff8a2a', alert: '#e5484d', grid: '#ffb86b', you: '#f6e3c3', calm: '#9bbf4a', warn: '#ffc247' },
    seed: 2049,
  },
  'acid-rain': {
    label: 'Acid Rain',
    sector: 'LOWER LEVELS',
    skyTop: '#020a0d',
    skyMid: '#06232a',
    horizon: '#1fbfa5',
    haze: '#2affc6',
    hazeOpacity: 0.22,
    far: '#0b2f36',
    mid: '#061a1f',
    near: '#020709',
    mega: '#082329',
    windows: ['#7dffe1', '#c6ff6b', '#4dc3ff'],
    neon: ['#39ff88', '#00d0ff', '#e2ff3d', '#ff3d81'],
    rain: '#b8fff0',
    rainCount: 420,
    rainOpacity: 0.3,
    beams: '#9dfff0',
    flame: '#c6ff6b',
    // The readouts are mint, so a gauge filling up turns orange: green, orange, red.
    hud: { primary: '#7dffcf', secondary: '#35e0a1', alert: '#ff5d6c', grid: '#35e0a1', you: '#e6d04a', calm: '#35e0a1', warn: '#ff9d2e' },
    seed: 1982,
  },
} as const satisfies Record<string, Palette>

export type PresetId = keyof typeof PRESETS

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

export const isPresetId = (id: string): id is PresetId =>
  Object.prototype.hasOwnProperty.call(PRESETS, id)

/**
 * `full` is the whole 16:9 scene, for the backdrop. `strip` is a slim band
 * of rooftops with a readout overlay, three scenes wide: the desktop sizes
 * an Svg's width from its height and aspect, so a narrow slice has to be
 * wide to span the band. `deck` is the full scene under the analysis
 * overlay, for the control deck.
 */
export type View = 'full' | 'strip' | 'deck'

const H = 1080
const VIEWS: Record<View, { width: number; box: (w: number) => string; fit: string }> = {
  full: { width: 1920, box: w => `0 0 ${w} ${H}`, fit: 'xMidYMid slice' },
  strip: { width: 5760, box: w => `0 330 ${w} 300`, fit: 'xMinYMid slice' },
  deck: { width: 1920, box: w => `0 0 ${w} ${H}`, fit: 'xMidYMid slice' },
}

const FONT = "font-family=\"Bahnschrift,'DIN Alternate','Segoe UI',sans-serif\" font-weight=\"600\""

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = ReturnType<typeof mulberry32>

const between = (r: Rand, lo: number, hi: number) => Math.round(lo + r() * (hi - lo))
const pick = <T,>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length)]!
const pad4 = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, '0')

/**
 * How much of a scene moves. `calm` holds still the parts that redraw the
 * whole window on every frame (the weather and the searchlights) and keeps
 * the rest moving.
 */
export type Motion = 'full' | 'calm' | 'off'

/** A motion level from the older on-or-off flag, which callers may still pass. */
export const toMotion = (level: Motion | boolean): Motion =>
  level === true ? 'full' : level === false ? 'off' : level

/**
 * What one build shares: the palette, the PRNG, the width and the view.
 * `animated` is false only with motion off; `isCalm` also holds the weather
 * and the searchlights.
 */
type Ctx = { p: Palette; r: Rand; W: number; view: View; animated: boolean; isCalm: boolean }

/** Animation markup, left out of a still build. */
const motion = (c: Ctx, markup: string) => (c.animated ? markup : '')

type Layer = {
  fill: string
  minW: number
  maxW: number
  minH: number
  maxH: number
  gap: number
  windowDensity: number
  windowOpacity: number
  cell: number
  win: number
  antennas: boolean
  /** Chance a tall building carries a vertical neon sign / a billboard. */
  signChance: number
  billboardChance: number
  /** Opacity of the thin horizon-colored rim along each roofline. */
  rim: number
}

/**
 * One skyline layer: silhouettes, lit windows grouped by color, neon signs
 * and their lens flares. In the full scene the middle of the city sits
 * lower, so the tall shapes frame the conversation and stay out from under it.
 */
function skyline(c: Ctx, layer: Layer, signs: string[], flares: string[]) {
  const { p, r, W } = c
  const body: string[] = []
  const rims: string[] = []
  const lit = new Map<string, string[]>()
  let x = -30
  while (x < W + 30) {
    const w = between(r, layer.minW, layer.maxW)
    const off = Math.min(1, Math.abs(x + w / 2 - W / 2) / (W / 2))
    const shape = c.view === 'strip' ? 1 : 0.58 + 0.42 * off
    const h = Math.round(between(r, layer.minH, layer.maxH) * shape)
    const top = H - h
    body.push(`M${x} ${H}V${top}h${w}V${H}z`)
    rims.push(`M${x} ${top}h${w}`)

    // stepped crown
    if (r() < 0.45) {
      const cw = Math.round(w * (0.35 + r() * 0.35))
      const ch = between(r, 18, 60)
      const cx = x + Math.round((w - cw) / 2)
      body.push(`M${cx} ${top}v-${ch}h${cw}v${ch}z`)
    }
    if (layer.antennas && r() < 0.35) {
      const ax = x + between(r, 6, Math.max(7, w - 6))
      body.push(`M${ax} ${top}v-${between(r, 40, 120)}h2v${between(r, 40, 120)}z`)
    }

    // windows on a grid
    const cols = Math.floor((w - 8) / layer.cell)
    const rows = Math.floor((h - 20) / layer.cell)
    for (let cy = 0; cy < rows; cy++) {
      // whole dark floors read more like a real tower
      if (r() < 0.25) continue
      for (let cx = 0; cx < cols; cx++) {
        if (r() > layer.windowDensity) continue
        const color = pick(r, p.windows)
        const wx = x + 6 + cx * layer.cell
        const wy = top + 14 + cy * layer.cell
        const ww = layer.win
        const wh = Math.max(2, Math.round(layer.win * 1.4))
        const list = lit.get(color) ?? []
        list.push(`M${wx} ${wy}h${ww}v${wh}h-${ww}z`)
        lit.set(color, list)
      }
    }

    // vertical neon sign hanging off the building edge
    if (r() < layer.signChance && h > 260) {
      const color = pick(r, p.neon)
      const sw = 16
      const sx = r() < 0.5 ? x - 6 : x + w - sw + 6
      const sh = between(r, 90, 190)
      const sy = top + between(r, 30, Math.max(31, Math.min(260, h - sh - 40)))
      const marks: string[] = []
      for (let gy = sy + 10; gy < sy + sh - 12; gy += between(r, 16, 26)) {
        const gw = between(r, 6, 10)
        marks.push(`M${sx + Math.round((sw - gw) / 2)} ${gy}h${gw}v${between(r, 3, 8)}h-${gw}z`)
      }
      // a tube that stutters, as worn signs do
      const isWorn = r() < 0.3
      const dur = (4 + r() * 5).toFixed(1)
      const stutter = isWorn
        ? motion(c, `<animate attributeName="opacity" values="1;0.2;1;1;0.45;1" keyTimes="0;0.03;0.07;0.6;0.63;1" dur="${dur}s" repeatCount="indefinite"/>`)
        : ''
      signs.push(
        `<g filter="url(#glow)">${stutter}<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="3" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2"/><path d="${marks.join('')}" fill="${color}"/></g>`,
      )
      if (r() < 0.45) {
        const fy = sy + Math.round(sh / 2)
        flares.push(`<ellipse cx="${sx + 8}" cy="${fy}" rx="${between(r, 70, 130)}" ry="1.6" fill="${color}" opacity="0.4"/>`)
      }
    }

    // wide billboard across the face: bars that fade like a looping advert
    if (r() < layer.billboardChance && w > 110 && h > 320) {
      const color = pick(r, p.neon)
      const bw = Math.round(w * (0.6 + r() * 0.25))
      const bh = between(r, 34, 60)
      const bx = x + Math.round((w - bw) / 2)
      const by = top + between(r, 40, 140)
      const bars: string[] = []
      let cx = bx + 8
      while (cx < bx + bw - 14) {
        const seg = between(r, 6, 22)
        if (cx + seg > bx + bw - 8) break
        bars.push(`M${cx} ${by + 10}h${seg}v${bh - 20}h-${seg}z`)
        cx += seg + between(r, 4, 9)
      }
      const dur = (5 + r() * 4).toFixed(1)
      const loop = motion(c, `<animate attributeName="opacity" values="0.85;0.85;0.25;0.85;0.5;0.85" keyTimes="0;0.4;0.45;0.5;0.8;1" dur="${dur}s" repeatCount="indefinite"/>`)
      signs.push(
        `<g filter="url(#glow)"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="2"/><path d="${bars.join('')}" fill="${color}" opacity="0.85">${loop}</path></g>`,
      )
      flares.push(`<ellipse cx="${bx + Math.round(bw / 2)}" cy="${by + Math.round(bh / 2)}" rx="${Math.round(bw * 0.9)}" ry="1.8" fill="${color}" opacity="0.35"/>`)
    }

    x += w + between(r, 0, layer.gap)
  }

  const windows = [...lit.entries()]
    .map(([color, d]) => `<path d="${d.join('')}" fill="${color}"/>`)
    .join('')

  const rim = layer.rim > 0
    ? `<path d="${rims.join('')}" stroke="${p.horizon}" stroke-width="2" opacity="${layer.rim}"/>`
    : ''

  return `<path d="${body.join('')}" fill="${layer.fill}"/>${rim}<g opacity="${layer.windowOpacity}">${windows}</g>`
}

/**
 * A megastructure: a tapered slab many times the height of the city, with
 * dashed rows of lights, a glowing spine and a beacon at its crown.
 */
function megastructure(c: Ctx, cx: number, base: number, crown: number, h: number) {
  const { p } = c
  const top = H - h
  const rows: string[] = []
  for (let y = top + 34; y < H - 40; y += 28) {
    const t = (y - top) / h
    const half = (crown + (base - crown) * t) / 2 - 14
    rows.push(`M${Math.round(cx - half)} ${y}H${Math.round(cx - 12)}M${Math.round(cx + 12)} ${y}H${Math.round(cx + half)}`)
  }
  const edge = `M${cx - base / 2} ${H}L${cx - crown / 2} ${top}h${crown}L${cx + base / 2} ${H}`
  const beacon = motion(c, `<animate attributeName="opacity" values="1;1;0.1;1" keyTimes="0;0.7;0.85;1" dur="2.6s" repeatCount="indefinite"/>`)
  return (
    `<path d="${edge}z" fill="${p.mega}"/>` +
    `<path d="${edge}" fill="none" stroke="${p.horizon}" stroke-width="2" opacity="0.28"/>` +
    `<path d="${rows.join('')}" stroke="${p.windows[0]}" stroke-width="3" stroke-dasharray="3 10" opacity="0.5"/>` +
    `<rect x="${cx - 3}" y="${top + 10}" width="6" height="${h - 10}" fill="${p.neon[1] ?? p.neon[0]}" opacity="0.4" filter="url(#glow)"/>` +
    `<circle cx="${cx}" cy="${top - 8}" r="5" fill="${p.hud.alert}" filter="url(#glow)">${beacon}</circle>`
  )
}

/**
 * A stack that vents a burst of flame, with the glow it throws on the smog.
 * The glow is a gradient that fades as a blurred disc would. It was a disc
 * put through a wide blur, which had to be blurred again on every frame of
 * the burn; the flame's own gradient already fades at its edge, so it takes
 * no filter either.
 */
function flareStack(c: Ctx, x: number, h: number, delay: number) {
  const { p } = c
  const top = H - h
  const dur = 5.3
  const burn = (attr: string, values: string) =>
    motion(c, `<animate attributeName="${attr}" values="${values}" keyTimes="0;0.08;0.3;0.42;0.5;1" dur="${dur}s" begin="-${delay}s" repeatCount="indefinite"/>`)
  return (
    `<rect x="${x - 7}" y="${top}" width="14" height="${h}" fill="${p.mega}"/>` +
    `<rect x="${x - 11}" y="${top}" width="22" height="8" fill="${p.mega}"/>` +
    `<circle cx="${x}" cy="${top - 40}" r="185" fill="url(#smog)" opacity="${c.animated ? 0 : 0.16}">${burn('opacity', '0;0.3;0.22;0.3;0;0')}</circle>` +
    `<ellipse cx="${x}" cy="${top - 34}" rx="17" ry="${c.animated ? 6 : 40}" fill="url(#flame)" opacity="${c.animated ? 0 : 0.9}">` +
    burn('ry', '6;58;40;66;10;6') +
    burn('cy', `${top - 8};${top - 56};${top - 40};${top - 64};${top - 12};${top - 8}`) +
    burn('opacity', '0;1;0.85;1;0;0') +
    `</ellipse>` +
    `<ellipse cx="${x}" cy="${top - 40}" rx="150" ry="2" fill="${p.flame}" opacity="${c.animated ? 0 : 0.35}">${burn('opacity', '0;0.5;0.35;0.5;0;0')}</ellipse>`
  )
}

/** A slow airship: a dark hull, a strip of running lights, two beacons. */
function airship(c: Ctx, y: number, dur: number, delay: number) {
  const { p, W } = c
  const color = p.neon[0]
  const drift = motion(c, `<animateTransform attributeName="transform" type="translate" from="-420 ${y}" to="${W + 420} ${y}" dur="${dur}s" begin="-${delay}s" repeatCount="indefinite"/>`)
  const run = motion(c, `<animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1.4s" repeatCount="indefinite"/>`)
  const blink = (begin: number) =>
    motion(c, `<animate attributeName="opacity" values="1;0.1;1" keyTimes="0;0.5;1" dur="1.8s" begin="-${begin}s" repeatCount="indefinite"/>`)
  return (
    `<g transform="translate(${Math.round(W * 0.3)} ${y})">${drift}` +
    `<ellipse cx="0" cy="0" rx="170" ry="38" fill="#05070c"/>` +
    `<path d="M-150 -18A170 38 0 0 1 150 -18" fill="none" stroke="${p.horizon}" stroke-width="1.5" opacity="0.45"/>` +
    `<path d="M150 -8l48 -26v68l-48 -26z" fill="#05070c"/>` +
    `<rect x="-34" y="36" width="68" height="14" rx="3" fill="#05070c"/>` +
    `<path d="M-120 6H120" stroke="${color}" stroke-width="6" stroke-dasharray="14 22" filter="url(#glow)">${run}</path>` +
    `<circle cx="-168" cy="0" r="3.5" fill="${p.hud.alert}" filter="url(#glow)">${blink(0)}</circle>` +
    `<circle cx="0" cy="52" r="3" fill="#ffffff" filter="url(#glow)">${blink(0.9)}</circle>` +
    `<path d="M-20 50L-90 330H90L20 50z" fill="url(#beamDown)" opacity="0.08"/>` +
    `</g>`
  )
}

/** Flying craft: a light and its fading trail, each following a long arc. */
function craft(c: Ctx) {
  const { p, r, W } = c
  const out: string[] = []
  const n = Math.round(3 * W / 1920)
  const band = c.view === 'strip' ? [350, 470] : [150, 430]
  for (let i = 0; i < n; i++) {
    const y0 = between(r, band[0]!, band[1]!)
    const y1 = between(r, band[0]!, band[1]!)
    const sag = between(r, -90, 90)
    const isLeftward = r() < 0.5
    const path = isLeftward
      ? `M${W + 120} ${y0}C${Math.round(W * 0.66)} ${y0 + sag},${Math.round(W * 0.33)} ${y1 - sag},-120 ${y1}`
      : `M-120 ${y0}C${Math.round(W * 0.33)} ${y0 + sag},${Math.round(W * 0.66)} ${y1 - sag},${W + 120} ${y1}`
    const dur = Math.round((22 + r() * 18) * W / 1920)
    const start = Math.round(r() * dur)
    const color = r() < 0.55 ? p.windows[0]! : pick(r, p.neon)
    if (!c.animated) {
      // a still build keeps the old look: a light with a short streak
      const sx = between(r, 80, W - 80)
      out.push(
        `<path d="M${sx} ${y0}l${isLeftward ? 120 : -120} 8" stroke="${color}" stroke-width="1.5" opacity="0.25"/>` +
          `<circle cx="${sx}" cy="${y0}" r="3" fill="${color}" filter="url(#glow)"/>`,
      )
      continue
    }
    // the trail is three dimmer lights flying the same path a beat behind
    for (const [lag, radius, opacity] of [[0.9, 1.4, 0.2], [0.6, 1.8, 0.35], [0.3, 2.2, 0.55], [0, 3.2, 1]] as const) {
      out.push(
        `<circle r="${radius}" fill="${color}" opacity="${opacity}"${lag === 0 ? ' filter="url(#glow)"' : ''}>` +
          `<animateMotion path="${path}" dur="${dur}s" begin="-${(start - lag + dur).toFixed(1)}s" repeatCount="indefinite"/></circle>`,
      )
    }
  }
  return out.join('')
}

/** Searchlights raking the smog from the rooftops. */
function beams(c: Ctx) {
  const { r, W } = c
  const out: string[] = []
  for (let i = 0; i < Math.round(3 * W / 1920); i++) {
    const bx = between(r, 200, W - 200)
    const spread = between(r, 50, 110)
    const lean = between(r, -26, 26)
    const sweep = between(r, 14, 30)
    const dur = between(r, 15, 28)
    const opacity = (0.08 + r() * 0.08).toFixed(2)
    const rake = c.isCalm
      ? ''
      : motion(c, `<animateTransform attributeName="transform" type="rotate" values="${lean - sweep};${lean + sweep};${lean - sweep}" dur="${dur}s" repeatCount="indefinite"/>`)
    out.push(
      `<g transform="translate(${bx} ${H - 300})"><path d="M0 0L${-spread} -900h${spread * 2}z" fill="url(#beam)" opacity="${opacity}" transform="rotate(${lean})">${rake}</path></g>`,
    )
  }
  return out.join('')
}

/** Still rain, for a build with motion off. */
function stillRain(c: Ctx) {
  const { p, r, W } = c
  if (p.rainCount === 0) return ''
  const d: string[] = []
  for (let i = 0; i < Math.round(p.rainCount * W / 1920); i++) {
    const x = between(r, -100, W)
    const y = between(r, -40, H)
    const len = between(r, 24, 70)
    d.push(`M${x} ${y}l${Math.round(len * 0.18)} ${len}`)
  }
  return `<path d="${d.join('')}" stroke="${p.rain}" stroke-width="1.2" stroke-linecap="round" opacity="${p.rainOpacity}"/>`
}

/**
 * One seamless tile of streaks: a line that runs off the right or bottom edge
 * is drawn again on the opposite side, so the tile repeats without seams.
 */
function streakTile(r: Rand, size: number, count: number, minLen: number, maxLen: number, slant: number) {
  const d: string[] = []
  for (let i = 0; i < count; i++) {
    const x = between(r, 0, size - 1)
    const y = between(r, 0, size - 1)
    const len = between(r, minLen, maxLen)
    const dx = Math.round(len * slant)
    for (const ox of [0, -size]) {
      if (ox !== 0 && x + dx < size) continue
      for (const oy of [0, -size]) {
        if (oy !== 0 && y + len < size) continue
        d.push(`M${x + ox} ${y + oy}l${dx} ${len}`)
      }
    }
  }
  return d.join('')
}

/**
 * Moving weather as SMIL-driven patterns: two rain layers falling at
 * different speeds for depth, or slow drifting dust.
 */
function weather(c: Ctx) {
  const { p, W } = c
  const r = mulberry32(p.seed + 7)
  const defs: string[] = []
  const fills: string[] = []

  const layer = (id: string, size: number, body: string, to: string, dur: number) => {
    defs.push(
      `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${body}` +
        `<animateTransform attributeName="patternTransform" type="translate" from="0 0" to="${to}" dur="${dur}s" repeatCount="indefinite"/></pattern>`,
    )
    fills.push(`<rect width="${W}" height="${H}" fill="url(#${id})"/>`)
  }

  if (p.rainCount > 0) {
    const far = streakTile(r, 360, Math.round(p.rainCount / 9), 14, 34, 0.12)
    const near = streakTile(r, 480, Math.round(p.rainCount / 12), 46, 90, 0.12)
    layer('rainFar', 360,
      `<path d="${far}" stroke="${p.rain}" stroke-width="1" stroke-linecap="round" opacity="${(p.rainOpacity * 0.8).toFixed(2)}"/>`,
      '0 360', 1.3)
    layer('rainNear', 480,
      `<path d="${near}" stroke="${p.rain}" stroke-width="1.6" stroke-linecap="round" opacity="${Math.min(0.6, p.rainOpacity * 1.4).toFixed(2)}"/>`,
      '0 480', 0.7)
  } else if (p.dust) {
    const motes: string[] = []
    for (let i = 0; i < 26; i++) {
      motes.push(`<circle cx="${between(r, 4, 396)}" cy="${between(r, 4, 396)}" r="${(0.8 + r() * 2).toFixed(1)}"/>`)
    }
    layer('dust', 400, `<g fill="${p.dust}" opacity="0.35">${motes.join('')}</g>`, '400 0', 24)
  }

  return { defs: defs.join(''), fills: fills.join('') }
}

/**
 * The stops a crosshair visits, as fractions of its field. It holds on each
 * one and jumps to the next, like a head driven by stepper motors.
 */
const STOPS = [
  [0.22, 0.3], [0.22, 0.62], [0.47, 0.62], [0.47, 0.38], [0.71, 0.38], [0.71, 0.7], [0.36, 0.7], [0.36, 0.3],
] as const

/**
 * The analysis overlay: a measurement grid, a crosshair that steps from stop
 * to stop, a target box that blinks before each move, and label-value
 * readouts along the foot that change with the crosshair. `x0..x1`, `y0..y1`
 * is the field in viewBox units; `u` scales strokes and type to the view.
 */
function overlay(c: Ctx, x0: number, y0: number, x1: number, y1: number, u: number, cell: number) {
  const { p } = c
  const w = x1 - x0
  const h = y1 - y0
  const dur = 24
  const n = STOPS.length
  const keyTimes = STOPS.map((_, i) => (i / n).toFixed(4)).join(';')
  const xs = STOPS.map(s => Math.round(x0 + s[0] * w))
  const ys = STOPS.map(s => Math.round(y0 + s[1] * h))
  const step = (attr: string, values: (number | string)[]) =>
    motion(c, `<animate attributeName="${attr}" values="${values.join(';')}" keyTimes="${keyTimes}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`)

  const grid =
    `<pattern id="grid" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">` +
    `<path d="M${cell} 0H0V${cell}" fill="none" stroke="${p.hud.grid}" stroke-width="${u}"/></pattern>`

  // corner brackets
  const arm = Math.round(22 * u)
  const m = Math.round(8 * u)
  const brackets =
    `M${x0 + m} ${y0 + m + arm}v-${arm}h${arm}M${x1 - m - arm} ${y0 + m}h${arm}v${arm}` +
    `M${x0 + m} ${y1 - m - arm}v${arm}h${arm}M${x1 - m - arm} ${y1 - m}h${arm}v-${arm}`

  // dashes that chase along the top edge
  const dash = Math.round(18 * u)
  const chase = motion(c, `<animate attributeName="stroke-dashoffset" from="0" to="-${dash * 2}" dur="1.1s" repeatCount="indefinite"/>`)

  // the target box blinks twice just before each jump
  const box = Math.round(34 * u)
  const blinkTimes: string[] = []
  const blinkValues: string[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    const end = (i + 1) / n
    for (const [k, v] of [[0, 1], [0.7, 0], [0.78, 1], [0.86, 0], [0.94, 1]] as const) {
      blinkTimes.push((t + (end - t) * k).toFixed(4))
      blinkValues.push(String(v))
    }
  }
  const blink = motion(c, `<animate attributeName="opacity" values="${blinkValues.join(';')}" keyTimes="${blinkTimes.join(';')}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`)

  // readouts: one set per stop, shown while the crosshair holds there
  const size = Math.round(13 * u)
  const ty = y1 - Math.round(12 * u)
  const sets = STOPS.map((s, i) => {
    const show = c.animated
      ? `<animate attributeName="opacity" values="${STOPS.map((_, j) => (j === i ? 1 : 0)).join(';')}" keyTimes="${keyTimes}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`
      : ''
    const pair = (label: string, value: string, dx: number) =>
      `<tspan x="${x0 + Math.round(dx * u)}" fill="${p.hud.primary}" fill-opacity="0.6">${label} </tspan><tspan fill="${p.hud.primary}">${value}</tspan>`
    return (
      `<text y="${ty}" font-size="${size}" letter-spacing="${(size * 0.16).toFixed(1)}" ${FONT} opacity="${i === 0 ? 1 : 0}">${show}` +
      pair('GX', pad4(s[0] * 1000), 40) + pair('GY', pad4(s[1] * 1000), 170) + pair('MG', pad4(1 + (i % 4)), 300) +
      `</text>`
    )
  })

  return {
    defs: grid,
    body:
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#grid)" opacity="0.2"/>` +
      `<path d="${brackets}" fill="none" stroke="${p.hud.primary}" stroke-width="${u * 2}"/>` +
      `<path d="M${x0 + m + arm * 2} ${y0 + m}H${x1 - m - arm * 2}" stroke="${p.hud.primary}" stroke-width="${u * 2}" stroke-dasharray="${dash} ${dash}" opacity="0.85">${chase}</path>` +
      `<path d="M${xs[0]} ${y0}V${y1}" stroke="${p.hud.secondary}" stroke-width="${u}" opacity="0.55">${step('d', xs.map(x => `M${x} ${y0}V${y1}`))}</path>` +
      `<path d="M${x0} ${ys[0]}H${x1}" stroke="${p.hud.secondary}" stroke-width="${u}" opacity="0.55">${step('d', ys.map(y => `M${x0} ${y}H${x1}`))}</path>` +
      `<rect x="${xs[0]! - box / 2}" y="${ys[0]! - box / 2}" width="${box}" height="${box}" fill="none" stroke="#ffe14d" stroke-width="${u * 2}">` +
      step('x', xs.map(x => x - box / 2)) + step('y', ys.map(y => y - box / 2)) + blink +
      `</rect>` +
      sets.join(''),
  }
}

const cache = new Map<string, string>()

/**
 * The SVG document for a preset, built once per module load, view and motion.
 * `full` adds every moving part: weather, searchlights, craft, flames, the
 * overlay. `calm` leaves the weather and the searchlights as a still picture.
 */
export function sceneSvg(id: PresetId, view: View = 'full', level: Motion | boolean = false): string {
  const motionLevel = toMotion(level)
  const animated = motionLevel !== 'off'
  const isCalm = motionLevel === 'calm'
  const key = `${id}:${view}:${motionLevel}`
  const hit = cache.get(key)
  if (hit) return hit

  const W = VIEWS[view].width
  const p: Palette = PRESETS[id]
  const c: Ctx = { p, r: mulberry32(p.seed), W, view, animated, isCalm }
  const isStrip = view === 'strip'
  const signs: string[] = []
  const nearSigns: string[] = []
  const flares: string[] = []

  const far = skyline(c, {
    fill: p.far, minW: 40, maxW: 100, minH: 220, maxH: 560, gap: 4,
    windowDensity: 0.08, windowOpacity: 0.45, cell: 10, win: 3, antennas: true,
    signChance: 0, billboardChance: 0, rim: 0.25,
  }, [], [])
  const mid = skyline(c, {
    fill: p.mid, minW: 80, maxW: 170, minH: 320, maxH: 800, gap: 26,
    windowDensity: 0.12, windowOpacity: 0.85, cell: 14, win: 4, antennas: true,
    signChance: 0.45, billboardChance: 0.3, rim: 0.4,
  }, signs, flares)
  const near = skyline(c, {
    fill: p.near, minW: 140, maxW: 300, minH: 120, maxH: 440, gap: 70,
    windowDensity: 0.04, windowOpacity: 0.9, cell: 18, win: 5, antennas: false,
    signChance: 0.5, billboardChance: 0, rim: 0.18,
  }, nearSigns, flares)

  // The giants stand at the sides of the full scene and are spread along the strip.
  const giants = isStrip
    ? megastructure(c, 980, 520, 150, 900) + megastructure(c, 2860, 460, 130, 820) + megastructure(c, 4700, 540, 160, 940)
    : megastructure(c, 250, 440, 120, 830) + megastructure(c, 1700, 400, 110, 720)
  const stacks = isStrip
    ? flareStack(c, 420, 560, 0) + flareStack(c, 1720, 600, 2.1) + flareStack(c, 3460, 540, 3.6) + flareStack(c, 5200, 590, 1.2)
    : flareStack(c, 560, 440, 0) + flareStack(c, 1360, 390, 2.7)
  const ship = isStrip ? airship(c, 420, 520, 140) : airship(c, 200, 210, 60)

  const hasWeather = animated && !isCalm
  const weatherParts = hasWeather ? weather(c) : { defs: '', fills: '' }
  const lights = beams(c) + craft(c)
  const rainStill = hasWeather ? '' : stillRain(c)

  const hud =
    view === 'strip' ? overlay(c, 0, 330, 2600, 630, 2.5, 100)
    : view === 'deck' ? overlay(c, 0, 0, W, H, 3, 96)
    : { defs: '', body: '' }

  const sun = p.sun
    ? // the strip shows a band of sky above the rooftops, so its sun rides higher
      `<circle cx="${Math.round(W * p.sun.cx)}" cy="${isStrip ? 480 : p.sun.cy}" r="${p.sun.r}" fill="${p.sun.color}" opacity="${p.sun.opacity}" filter="url(#soft)"/>`
    : ''

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWS[view].box(W)}" width="100%" height="100%" preserveAspectRatio="${VIEWS[view].fit}">` +
    `<defs>` +
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.skyTop}"/><stop offset="0.55" stop-color="${p.skyMid}"/><stop offset="1" stop-color="${p.horizon}"/>` +
    `</linearGradient>` +
    `<radialGradient id="haze" cx="0.5" cy="0.78" r="0.6">` +
    `<stop offset="0" stop-color="${p.haze}" stop-opacity="${p.hazeOpacity}"/><stop offset="1" stop-color="${p.haze}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.haze}" stop-opacity="0"/><stop offset="1" stop-color="${p.haze}" stop-opacity="${(p.hazeOpacity * 0.6).toFixed(2)}"/>` +
    `</linearGradient>` +
    `<linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="${p.beams}" stop-opacity="1"/><stop offset="1" stop-color="${p.beams}" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<linearGradient id="beamDown" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.beams}" stop-opacity="1"/><stop offset="1" stop-color="${p.beams}" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<radialGradient id="flame" cx="0.5" cy="0.75" r="0.6">` +
    `<stop offset="0" stop-color="#fff6d8"/><stop offset="0.45" stop-color="${p.flame}"/><stop offset="1" stop-color="${p.flame}" stop-opacity="0"/>` +
    `</radialGradient>` +
    // a disc of 120 under a 28px blur, as a gradient: full to 70, half at 120, gone by 185
    `<radialGradient id="smog">` +
    `<stop offset="0" stop-color="${p.flame}"/><stop offset="0.38" stop-color="${p.flame}" stop-opacity="0.97"/>` +
    `<stop offset="0.65" stop-color="${p.flame}" stop-opacity="0.5"/><stop offset="0.82" stop-color="${p.flame}" stop-opacity="0.13"/>` +
    `<stop offset="1" stop-color="${p.flame}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">` +
    `<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/>` +
    `</radialGradient>` +
    `<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity="0.28"/></pattern>` +
    `<filter id="glow" x="-200%" y="-20%" width="500%" height="140%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>` +
    weatherParts.defs +
    hud.defs +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>` +
    sun +
    `<rect width="${W}" height="${H}" fill="url(#haze)"/>` +
    giants +
    stacks +
    lights +
    ship +
    far +
    `<rect y="${H - 520}" width="${W}" height="520" fill="url(#fog)"/>` +
    mid +
    signs.join('') +
    near +
    nearSigns.join('') +
    flares.join('') +
    `<rect y="${H - 260}" width="${W}" height="260" fill="url(#fog)"/>` +
    (hasWeather ? weatherParts.fills : rainStill) +
    `<rect width="${W}" height="${H}" fill="url(#scan)"/>` +
    (isStrip ? '' : `<rect width="${W}" height="${H}" fill="url(#vignette)"/>`) +
    hud.body +
    `</svg>`

  cache.set(key, svg)
  return svg
}

/**
 * The instrument rail: a slim strip for the band when the city already fills
 * the window behind it. A ruler with numbered marks, dashes chasing along the
 * top, and a marker that steps from mark to mark.
 */
export function railSvg(id: PresetId, animated = false): string {
  const key = `${id}:rail:${animated ? 'anim' : 'still'}`
  const hit = cache.get(key)
  if (hit) return hit

  const p: Palette = PRESETS[id]
  const W = 2400
  const RH = 26
  const ticks: string[] = []
  const labels: string[] = []
  for (let x = 0; x <= W; x += 20) {
    const isMajor = x % 100 === 0
    ticks.push(`M${x} ${RH}v-${isMajor ? 9 : 4}`)
    if (isMajor && x > 0 && x < W) {
      labels.push(`<text x="${x + 4}" y="${RH - 10}" font-size="7.5" letter-spacing="1" ${FONT} fill="${p.hud.primary}" fill-opacity="0.55">${pad4(x / 10)}</text>`)
    }
  }
  const stops = [140, 380, 380, 620, 900, 760, 1100, 300]
  const keyTimes = stops.map((_, i) => (i / stops.length).toFixed(4)).join(';')
  const hop = animated
    ? `<animateTransform attributeName="transform" type="translate" values="${stops.map(x => `${x} 0`).join(';')}" keyTimes="${keyTimes}" calcMode="discrete" dur="20s" repeatCount="indefinite"/>`
    : ''
  const chase = animated
    ? `<animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1.1s" repeatCount="indefinite"/>`
    : ''

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${RH}" width="100%" height="100%" preserveAspectRatio="xMinYMid slice">` +
    `<rect width="${W}" height="${RH}" fill="${p.skyTop}"/>` +
    `<path d="M0 3H${W}" stroke="${p.hud.primary}" stroke-width="2" stroke-dasharray="18 18" opacity="0.85">${chase}</path>` +
    `<path d="${ticks.join('')}" stroke="${p.hud.primary}" stroke-width="1" opacity="0.6"/>` +
    labels.join('') +
    `<g transform="translate(${stops[0]} 0)">${hop}` +
    `<path d="M0 ${RH - 10}V${RH}" stroke="${p.hud.secondary}" stroke-width="1.5"/>` +
    `<path d="M-5 8h10l-5 7z" fill="${p.hud.secondary}"/>` +
    `</g>` +
    `</svg>`

  cache.set(key, svg)
  return svg
}
