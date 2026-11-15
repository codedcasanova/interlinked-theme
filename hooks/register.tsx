// Interlinked: a whole look for the Claude desktop app.
//
// One `$.theme.set` call carries the app's colors and a moving city behind
// the conversation. Around it, the parts of the interface a mod can draw are
// restyled as one instrument: a command console above the prompt with a
// hologram companion, tags and cards on the conversation's rows, a lead on
// the prompt's hint, and a control deck in a side panel.
//
// The readouts are real. Every label-value pair shows something true about
// this session (context used, tool calls, turns, the last turn's length),
// written the way old screen graphics wrote theirs: two letters, four digits.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Band, Current, Glass, Motion } from '../types'
import {
  DEFAULT_NAME, HOT_LIMIT, cleanName, clockLabel, companionLine, dateLabel, hhmm, parseLimits, resetAlerts, uptimeLabel,
} from './companion'
import type { Limit } from './companion'
import { CONSOLE, consoleSvg } from './console'
import type { LiveRowProps } from './live-row'
import { LOOKS } from './looks'
import { PRESETS, PRESET_IDS, isPresetId, pad4, railSvg, sceneSvg } from './scenes'
import type { PresetId } from './scenes'
import { durationLabel, groupTally, toolFacts, toolLabel } from './tools'

const COMMAND = 'theme-mod'
const DECK = 'noir-scene'
const DEFAULT: PresetId = 'neon-noir'

/** `$.store` keys, kept across sessions. */
const CHOICE = 'preset'
const BAND = 'band'
/** Motion as older versions stored it: on or off. Still written, so an older copy reads it. */
const RAIN = 'rain'
const MOTION = 'motion'
const STYLE = 'style'
const GLASS = 'glass'
const COMPANION = 'companion'
const COMPANION_ON = 'companion.on'
const ALERTS = 'alerts'

/**
 * Explicit Svg sizes in CSS px. With `isInteractive` (which the animation
 * needs) the desktop draws an SVG in a sandboxed frame that is 300px wide
 * unless given a width; the enclosing Box clips what overflows the slot.
 * The strip is 5760 x 300 units, so 120px tall is 2304px wide.
 */
const STRIP = { width: 2304, height: 120 }
const RAIL = { width: 2400, height: 26 }

/**
 * The two strengths of glass over the scene, by their blur. How opaque each
 * is depends on the look (`LOOKS[id].veil`). `solid` sets no scene at all.
 */
const GLASS_BLUR: Record<Exclude<Glass, 'solid'>, number> = { clear: 3, frost: 12 }

const BANDS: readonly Band[] = ['console', 'rail', 'scene', 'off']
const GLASSES: readonly Glass[] = ['clear', 'frost', 'solid']
const MOTIONS: readonly Motion[] = ['full', 'calm', 'off']

const current = atom({ plugin: 'interlinked-theme', key: 'current' } as const, DEFAULT as Current)
const band = atom({ plugin: 'interlinked-theme', key: 'band' } as const, 'console' as Band)
const glass = atom({ plugin: 'interlinked-theme', key: 'glass' } as const, 'frost' as Glass)
const motion = atom({ plugin: 'interlinked-theme', key: 'motion' } as const, 'full' as Motion)
const isStyled = atom({ plugin: 'interlinked-theme', key: 'isStyled' } as const, true)
const toolCalls = atom({ plugin: 'interlinked-theme', key: 'toolCalls' } as const, 0)
const turns = atom({ plugin: 'interlinked-theme', key: 'turns' } as const, 0)
const lastSeconds = atom({ plugin: 'interlinked-theme', key: 'lastSeconds' } as const, 0)
const contextPercent = atom({ plugin: 'interlinked-theme', key: 'contextPercent' } as const, 0)
const model = atom({ plugin: 'interlinked-theme', key: 'model' } as const, '')
const turnBase = atom({ plugin: 'interlinked-theme', key: 'turnBase' } as const, 0)
const failures = atom({ plugin: 'interlinked-theme', key: 'failures' } as const, 0)
const hadFailure = atom({ plugin: 'interlinked-theme', key: 'hadFailure' } as const, false)
const limitsJson = atom({ plugin: 'interlinked-theme', key: 'limitsJson' } as const, '[]')
const startedAt = atom({ plugin: 'interlinked-theme', key: 'startedAt' } as const, 0)
const minute = atom({ plugin: 'interlinked-theme', key: 'minute' } as const, 0)
const folder = atom({ plugin: 'interlinked-theme', key: 'folder' } as const, '')
const companion = atom({ plugin: 'interlinked-theme', key: 'companion' } as const, DEFAULT_NAME)
const isCompanionOn = atom({ plugin: 'interlinked-theme', key: 'isCompanionOn' } as const, true)
const isAlertsOn = atom({ plugin: 'interlinked-theme', key: 'isAlertsOn' } as const, true)
const turnStartedAt = atom({ plugin: 'interlinked-theme', key: 'turnStartedAt' } as const, 0)
const historyJson = atom({ plugin: 'interlinked-theme', key: 'historyJson' } as const, '[]')
const consoleJson = atom({ plugin: 'interlinked-theme', key: 'consoleJson' } as const, '{}')

/** One finished turn: its tool calls, how many failed, and the context after it (-1 when unknown). */
type Turn = { o: number; f: number; c: number }
/** What fills the context window, as the console draws it. */
type Detail = { tokens: number; window: number; parts: { name: string; tokens: number }[]; reserve: number }

const HISTORY = 24
/** Tool calls that failed in the turn running now. */
let turnFailures = 0
/**
 * Names this load's live row to its surface module, so two sessions drawn in
 * one window each keep their own.
 */
const LIVE_ROW = Math.random().toString(36).slice(2)

function parseHistory(text: string): Turn[] {
  try {
    const list: unknown = JSON.parse(text)
    if (!Array.isArray(list)) return []
    return list.filter(
      (row): row is Turn =>
        typeof row === 'object' && row !== null &&
        typeof (row as Turn).o === 'number' && typeof (row as Turn).f === 'number' && typeof (row as Turn).c === 'number',
    )
  } catch {
    return []
  }
}

/** What the console's drawing shows: the readings as they stood when it was last allowed to change. */
type Held = { context: number; limits: Limit[]; detail: Detail }

function parseHeld(text: string): Held {
  const empty: Held = { context: 0, limits: [], detail: parseDetail(undefined) }
  try {
    const held = JSON.parse(text) as Partial<Held> | null
    if (typeof held !== 'object' || held === null) return empty
    return {
      context: typeof held.context === 'number' ? held.context : 0,
      limits: parseLimits(JSON.stringify(held.limits ?? [])),
      detail: parseDetail(held.detail),
    }
  } catch {
    return empty
  }
}

function parseDetail(value: unknown): Detail {
  const empty: Detail = { tokens: 0, window: 0, parts: [], reserve: 0 }
  try {
    const d = value as Partial<Detail> | null | undefined
    if (typeof d !== 'object' || d === null) return empty
    return {
      tokens: typeof d.tokens === 'number' ? d.tokens : 0,
      window: typeof d.window === 'number' ? d.window : 0,
      parts: Array.isArray(d.parts)
        ? d.parts.filter(part => typeof part?.name === 'string' && typeof part?.tokens === 'number')
        : [],
      reserve: typeof d.reserve === 'number' ? d.reserve : 0,
    }
  } catch {
    return empty
  }
}

/**
 * Notes a failure the mod carries on from, in the debug log (`claude
 * --debug`). Each of these used to be swallowed whole, and a readout that
 * quietly stops is hard to find.
 */
function quiet($: EngineInterface, err: unknown): void {
  try {
    $.ui.log(`carried on after: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300), { to: 'debug' })
  } catch {
    // Nowhere to say so.
  }
}

/** The build this mod was made on. An older one may lack what it draws with. */
const MIN_VERSION = '2.1.325'

/** Whether version `a` comes before `b`, part by part: `2.1.99` is older than `2.1.325`. */
export function isOlder(a: string, b: string): boolean {
  const parts = (v: string) => v.split(/[^0-9]+/).filter(Boolean).map(Number)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  }
  return false
}

/**
 * Parses a stored JSON string once. The band reads the same text on every
 * draw, and it is drawn on every tool call.
 */
function once<T>(parse: (text: string) => T): (text: string) => T {
  let last: string | undefined
  let value: T | undefined
  return text => {
    if (text !== last || value === undefined) {
      value = parse(text)
      last = text
    }
    return value
  }
}
const limitsOf = once(parseLimits)
const historyOf = once(parseHistory)
const heldOf = once(parseHeld)

/** `2D 11H`, `2H 55M`, `45M`: time left, short enough for a readout. */
function spanLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}D ${hours}H`
  if (hours > 0) return `${hours}H ${minutes % 60}M`
  return `${minutes}M`
}

/**
 * One plan limit as the console draws it: how much is used, how much of the
 * window's time is gone, and when it resets.
 */
function limitRow(limit: Limit, now: number) {
  const span = limit.kind === 'five_hour' ? 5 * 3_600_000 : limit.kind === 'seven_day' ? 7 * 86_400_000 : 0
  const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  const isKnown = !Number.isNaN(resetsAt) && now > 0
  const left = isKnown ? Math.max(0, resetsAt - now) : 0
  const day = isKnown && left > 86_400_000 ? `${clockLabel(resetsAt).slice(7, 10)} ` : ''
  return {
    name:
      limit.kind === 'five_hour' ? '5-HOUR'
      : limit.kind === 'seven_day' ? 'WEEKLY'
      : limit.kind.replace(/_/g, ' ').toUpperCase().slice(0, 12),
    percent: limit.percentUsed,
    elapsed: isKnown && span > 0 ? Math.max(0, Math.min(1, 1 - left / span)) : null,
    resets: isKnown ? `${day}${hhmm(resetsAt)}` : '',
    left: isKnown ? spanLabel(left) : '',
  }
}

/**
 * Fills the turn history from the transcript the first time, so the chart
 * shows the session so far and not an empty axis: one entry for each prompt,
 * counting the tool calls that followed it.
 */
async function backfill($: EngineInterface): Promise<void> {
  if (parseHistory(await read($, historyJson)).length > 0) return
  const messages = await $.session.messages()
  const found: Turn[] = []
  let open: Turn | undefined
  for (const message of messages) {
    if (message.role === 'user') {
      const isPrompt = (message.toolResults?.length ?? 0) === 0 && message.text.trim() !== ''
      if (!isPrompt) continue
      if (open) found.push(open)
      open = { o: 0, f: 0, c: -1 }
    } else if (open) {
      open.o += message.toolUses.length
      open.f += message.toolUses.filter(use => use.isError === true).length
    }
  }
  if (open) found.push(open)
  const recent = JSON.stringify(found.slice(-HISTORY))
  await update($, historyJson, () => recent)
}

/**
 * Tool calls numbered in the order they ran, by call id, for the cards.
 * Module state: a reload forgets the numbers of calls already drawn, and
 * `seq` picks up from the session's count.
 */
let seq = 0
const callNumbers = new Map<string, number>()
/** How long each finished call ran, in ms, by call id, for the cards. Module state, as above. */
const callTimes = new Map<string, number>()
const CALLS_KEPT = 600

/** Sets a call's entry and drops the oldest once the map is full. */
function keep(map: Map<string, number>, id: string, value: number): void {
  map.set(id, value)
  if (map.size > CALLS_KEPT) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
}
/**
 * Whether an app draws this mod's scene: it said so when the theme was set,
 * or it asked for the scene to be drawn. Module state: session.start sets the
 * theme again after a reload.
 */
let isSceneDrawn = false

/**
 * The reset notifications booked this load, by key, with the moment each is
 * booked for. Module state: after a reload the next reading books them again
 * under the same keys, which replaces what the app holds.
 */
const booked = new Map<string, number>()

/**
 * Whether a notification booked for later will be held until then. Only an
 * app holds one: a terminal ignores the time and raises it at once, which
 * would announce a reset that hasn't happened. So a session a terminal draws
 * books nothing.
 */
async function holdsNotifications($: EngineInterface): Promise<boolean> {
  const surfaces = await $.session.surfaces()
  return !surfaces.includes('terminal') && surfaces.some(surface => surface === 'desktop' || surface === 'mobile')
}

/**
 * Books a notification for the reset of each limit that is running out. A
 * reading with nothing running out costs no call. Never throws.
 *
 * A limit that is no longer running out is only forgotten here, never taken
 * back: its window has reset, so its notification is on screen or about to
 * be, and a cancel would remove it. Taking back is for `alerts off` and `off`.
 */
async function syncAlerts($: EngineInterface, limits: readonly Limit[]): Promise<void> {
  try {
    const mayBook = limits.some(limit => limit.percentUsed >= HOT_LIMIT)
    if (!mayBook) {
      booked.clear()
      return
    }
    const wanted =
      isPresetId(await read($, current)) && (await read($, isAlertsOn)) && (await holdsNotifications($))
        ? resetAlerts(limits, await $.clock.now())
        : []
    for (const key of [...booked.keys()]) {
      if (!wanted.some(alert => alert.key === key)) booked.delete(key)
    }
    if (wanted.length === 0) return
    // She signs it while she is in the console; otherwise the mod's own name heads it.
    const title = (await read($, isCompanionOn)) ? await read($, companion) : undefined
    for (const alert of wanted) {
      if (booked.get(alert.key) === alert.at) continue
      const sent = await $.ui.notify(alert.text, { ...(title ? { title } : {}), key: alert.key, at: alert.at })
      if (sent.isSent) booked.set(alert.key, alert.at)
    }
  } catch (err) {
    quiet($, err)
    // A notification that cannot be booked costs nothing else.
  }
}

/**
 * Takes back every reset notification: the ones booked this load, and the
 * ones an earlier load would have booked for the limits as they stand.
 */
async function cancelAlerts($: EngineInterface): Promise<void> {
  try {
    const limits = parseLimits(await read($, limitsJson))
    const keys = new Set([...booked.keys(), ...resetAlerts(limits, await $.clock.now()).map(alert => alert.key)])
    booked.clear()
    for (const key of keys) await $.ui.cancelNotify(key)
  } catch (err) {
    quiet($, err)
    // Nothing held, or no app to ask.
  }
}

const isBand = (v: unknown): v is Band => BANDS.includes(v as Band)
const isGlass = (v: unknown): v is Glass => GLASSES.includes(v as Glass)
const isMotion = (v: unknown): v is Motion => MOTIONS.includes(v as Motion)
const isOnOff = (v: string): v is 'on' | 'off' => v === 'on' || v === 'off'

/** What the working line leads with, by what the turn is doing. A mode not listed gets no lead. */
const WORKING_LEADS: Record<string, string> = {
  requesting: 'UPLINK',
  thinking: 'REASONING',
  'tool-input': 'OPERATING',
  'tool-use': 'OPERATING',
  responding: 'COMPOSING',
}

/**
 * The working line's word: the lead for the turn's mode, then the app's own
 * words. The desktop says `Working` when it has nothing to say about the
 * step, so the lead stands alone there.
 */
function workingWord(mode: string, word: string): string {
  const lead = WORKING_LEADS[mode]
  if (lead === undefined) return word
  const said = word.trim()
  return said === '' || said === 'Working' ? lead : `${lead}  ·  ${said}`
}

/** The model id as a unit designation: `claude-fable-5-2` reads `FABLE-5-2`. */
const unitLabel = (id: string) => id.replace(/^claude-/, '').replace(/\[.*$/, '').toUpperCase()

/** The preset the conversation styling follows, or undefined when it should stay out. */
async function styledPreset($: EngineInterface): Promise<PresetId | undefined> {
  const now = await read($, current)
  if (!isPresetId(now) || !(await read($, isStyled))) return undefined
  return now
}

/**
 * Sets the whole look in one call: a set replaces the theme, so the colors,
 * the scene and the mode always travel together. Never throws.
 */
async function apply($: EngineInterface, id: PresetId): Promise<{ isDrawn: boolean; reason?: string }> {
  const look = LOOKS[id]
  const level = await read($, glass)
  const args: ThemeSetArgs = {
    overrideColorScheme: 'dark',
    ...(look.colors ? { colors: look.colors } : {}),
    ...(level === 'solid'
      ? {}
      : { backdrop: { scene: id, glass: { blur: GLASS_BLUR[level], opacity: look.veil[level], tint: look.surface } } }),
  }
  try {
    const set = await $.theme.set(args)
    isSceneDrawn = set.isDrawn && level !== 'solid'
    return set.isDrawn ? { isDrawn: true } : { isDrawn: false, reason: set.reason }
  } catch (err) {
    isSceneDrawn = false
    return { isDrawn: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Reads a stored band choice; earlier versions stored sizes and booleans. */
function toBand(v: unknown): Band {
  if (isBand(v)) return v
  return v === false ? 'off' : 'console'
}

/** Copies the saved choices from $.store into $.state. */
async function loadChoices($: EngineInterface): Promise<Current> {
  const savedBand = await $.store.get(BAND)
  await update($, band, () => toBand(savedBand))
  const savedGlass = await $.store.get(GLASS)
  await update($, glass, () => (isGlass(savedGlass) ? savedGlass : 'frost'))
  // the level, or what an earlier version stored: motion on or off
  const savedMotion = await $.store.get(MOTION)
  const rain = await $.store.get(RAIN)
  const level: Motion = isMotion(savedMotion) ? savedMotion : rain === false ? 'off' : 'full'
  await update($, motion, () => level)
  const style = await $.store.get(STYLE)
  await update($, isStyled, () => style !== false)
  const name = await $.store.get(COMPANION)
  await update($, companion, () => (typeof name === 'string' ? cleanName(name) : DEFAULT_NAME))
  const companionOn = await $.store.get(COMPANION_ON)
  await update($, isCompanionOn, () => companionOn !== false)
  const alerts = await $.store.get(ALERTS)
  await update($, isAlertsOn, () => alerts !== false)

  const saved = await $.store.get(CHOICE)
  const now: Current =
    saved === 'off' ? 'off' : typeof saved === 'string' && isPresetId(saved) ? saved : DEFAULT
  await update($, current, () => now)
  isOff = now === 'off'
  return now
}

/** Whether the theme is off. Module state, set wherever the look is loaded or chosen. */
let isOff = false

/**
 * Runs `write` only when `value` differs from what is `stored`. Every write
 * draws its readers again, the band among them, so an unchanged one is
 * skipped. The read and the write stay at the call, where the engine can see
 * which value they name: it refuses a state call made through a parameter.
 */
async function fresh<T>(stored: T, value: T, write: () => Promise<unknown>): Promise<void> {
  if (stored !== value) await write()
}

/**
 * Takes in a reading as the session reports one mid-turn: how full the
 * context is and the plan limits. Only the text readouts follow it; the
 * console's drawing holds what it showed until the turn ends, because a new
 * source restarts its animation. Never throws.
 */
async function takeReading($: EngineInterface, percent: unknown, limits: unknown): Promise<void> {
  try {
    if (typeof percent === 'number') {
      const filled = Math.round(percent)
      await fresh(await read($, contextPercent), filled, () => update($, contextPercent, () => filled))
    }
    if (Array.isArray(limits)) {
      const text = JSON.stringify(parseLimits(JSON.stringify(limits)).map(limit => ({
        kind: limit.kind, percentUsed: limit.percentUsed, resetsAt: limit.resetsAt,
      })))
      await fresh(await read($, limitsJson), text, () => update($, limitsJson, () => text))
      await syncAlerts($, parseLimits(text))
    }
  } catch (err) {
    quiet($, err)
    // The readouts keep their last values.
  }
}

/** Reads what the session keeps for its whole length: the model and the working folder. Never throws. */
async function readSession($: EngineInterface): Promise<void> {
  try {
    const id = await $.session.model()
    await fresh(await read($, model), id, () => update($, model, () => id))
  } catch (err) {
    quiet($, err)
    // Keep the last one.
  }
  try {
    const cwd = await $.session.cwd()
    const last = cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''
    await fresh(await read($, folder), last, () => update($, folder, () => last))
  } catch (err) {
    quiet($, err)
    // Same.
  }
}

/**
 * Takes a full reading, with what fills the context, and lets the console's
 * drawing show it. Called where the drawing may change: when the session
 * starts, when a turn ends, and when a look is chosen. Never throws.
 */
async function refreshReadouts($: EngineInterface): Promise<void> {
  try {
    // `summary` estimates the breakdown locally: no request is sent for it.
    const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => $.session.usage())
    const percent = usage.context.percent
    const breakdown = usage.context.breakdown
    const detail: Detail = {
      // before the first reply there is no measured count: use the estimate
      tokens: usage.context.tokens ?? (breakdown ? breakdown.totalTokens : 0),
      window: breakdown ? breakdown.rawMaxTokens : usage.context.window,
      parts: breakdown
        ? breakdown.categories
            .filter(row => row.kind === 'used' && row.tokens > 0)
            .map(row => ({ name: row.name, tokens: row.tokens }))
            .sort((a, b) => b.tokens - a.tokens)
        : [],
      reserve: breakdown
        ? breakdown.categories.filter(row => row.kind === 'buffer').reduce((sum, row) => sum + row.tokens, 0)
        : 0,
    }
    const filled = typeof percent === 'number' ? percent : breakdown ? breakdown.percentage : undefined
    await takeReading($, filled, usage.rateLimits)
    const began = usage.startedAt
    if (typeof began === 'number') await fresh(await read($, startedAt), began, () => update($, startedAt, () => began))
    const held: Held = {
      context: await read($, contextPercent),
      limits: parseLimits(await read($, limitsJson)),
      detail,
    }
    const text = JSON.stringify(held)
    await fresh(await read($, consoleJson), text, () => update($, consoleJson, () => text))
  } catch (err) {
    quiet($, err)
    // No usage on this build or surface: the readouts keep their last values.
  }
}

/** Moves the band's clock to the current minute, when it has changed. */
async function tick($: EngineInterface): Promise<void> {
  if (isOff) return
  const now = Math.floor((await $.clock.now()) / 60_000)
  await fresh(await read($, minute), now, () => update($, minute, () => now))
}

async function setCompanion($: EngineInterface, isOn: boolean): Promise<string> {
  await $.store.set(COMPANION_ON, isOn)
  await update($, isCompanionOn, () => isOn)
  const name = await read($, companion)
  return isOn ? `${name} is back in the console.` : `${name} has stepped out. The console keeps its gauges.`
}

async function nameCompanion($: EngineInterface, raw: string): Promise<string> {
  const name = cleanName(raw)
  await $.store.set(COMPANION, name)
  await update($, companion, () => name)
  return `The companion answers to ${name} now.`
}

async function setAlerts($: EngineInterface, isOn: boolean): Promise<string> {
  await $.store.set(ALERTS, isOn)
  await update($, isAlertsOn, () => isOn)
  if (!isOn) {
    await cancelAlerts($)
    return 'Alerts off: no notifications are booked.'
  }
  await syncAlerts($, parseLimits(await read($, limitsJson)))
  return 'Alerts on: when a limit passes 80 percent, a notification is booked for the moment it resets.'
}

async function choosePreset($: EngineInterface, id: PresetId): Promise<string> {
  await $.store.set(CHOICE, id)
  await update($, current, () => id as Current)
  const wasOff = isOff
  isOff = false
  const set = await apply($, id)
  // Coming back from `off`: the readouts stood still meanwhile, so take a
  // fresh reading, which also books again what turning off took back.
  if (wasOff) {
    await tick($).catch(() => undefined)
    await refreshReadouts($)
  }
  $.ui.toast(`${PRESETS[id].label.toUpperCase()} // ONLINE`)
  return set.isDrawn
    ? `Look set: ${PRESETS[id].label}.`
    : `Look set: ${PRESETS[id].label}. This app isn't drawing the colors and scene: ${set.reason}`
}

async function chooseGlass($: EngineInterface, level: Glass): Promise<string> {
  await $.store.set(GLASS, level)
  await update($, glass, () => level)
  const now = await read($, current)
  if (isPresetId(now)) await apply($, now)
  return level === 'solid'
    ? 'Glass: solid. The colors stay and the moving city is off.'
    : `Glass: ${level}.`
}

async function chooseBand($: EngineInterface, choice: Band): Promise<string> {
  await $.store.set(BAND, choice)
  await update($, band, () => choice)
  return choice === 'off' ? 'Band hidden.' : `Band: ${choice}.`
}

async function setMotion($: EngineInterface, level: Motion): Promise<string> {
  await $.store.set(MOTION, level)
  await $.store.set(RAIN, level !== 'off')
  await update($, motion, () => level)
  if (level === 'calm') return 'Motion calm: the rain, the dust and the searchlights hold still; the rest moves.'
  const isOn = level === 'full'
  return isOn ? 'Motion on.' : 'Motion off: the scene holds still.'
}

async function setStyle($: EngineInterface, isOn: boolean): Promise<string> {
  await $.store.set(STYLE, isOn)
  await update($, isStyled, () => isOn)
  return isOn ? 'Conversation styling on.' : 'Conversation back to the app’s own look.'
}

async function turnOff($: EngineInterface): Promise<string> {
  await $.store.set(CHOICE, 'off')
  await update($, current, () => 'off' as Current)
  isOff = true
  isSceneDrawn = false
  await cancelAlerts($)
  await $.theme.clear()
  return 'Theme off: back to the app’s own look.'
}

async function openDeck($: EngineInterface) {
  return $.ui.open({ id: DECK, title: 'Control deck' })
}

const usage = () =>
  [
    `/${COMMAND} <${PRESET_IDS.join(' | ')}>   switch look`,
    `/${COMMAND} glass clear|frost|solid   how much city shows through`,
    `/${COMMAND} band console|rail|scene|off  what sits above the prompt`,
    `/${COMMAND} companion on|off          the hologram in the console`,
    `/${COMMAND} companion name <name>     what the hologram answers to`,
    `/${COMMAND} motion full|calm|off      how much moves (rain on|off still works)`,
    `/${COMMAND} style on|off              tags and cards in the conversation`,
    `/${COMMAND} alerts on|off             a notification when a limit that ran low resets`,
    `/${COMMAND} deck                      open the control deck`,
    `/${COMMAND} off                       back to the app's own look`,
  ].join('\n')

async function statusText($: EngineInterface): Promise<string> {
  const now = await read($, current)
  const drawn = isSceneDrawn
  return [
    `LOOK   ${now}${isPresetId(now) ? ` (${PRESETS[now].label})` : ''}`,
    `SCENE  ${drawn ? 'drawn behind the conversation' : 'not drawn by this app'}`,
    `GLASS  ${await read($, glass)}`,
    `BAND   ${await read($, band)}`,
    `HOLO   ${(await read($, isCompanionOn)) ? (await read($, companion)) : 'off'}`,
    `MOTION ${await read($, motion)}`,
    `STYLE  ${(await read($, isStyled)) ? 'on' : 'off'}`,
    `ALERTS ${(await read($, isAlertsOn)) ? 'on' : 'off'}`,
    '',
    usage(),
  ].join('\n')
}

async function runCommand($: EngineInterface, args: string) {
  const [verb = '', option = ''] = args.trim().toLowerCase().split(/\s+/)

  if (verb === '' || verb === 'list' || verb === 'status') {
    return { text: await statusText($) }
  }

  if (verb === 'off') return { text: await turnOff($) }

  if (verb === 'glass') {
    if (!isGlass(option)) return { text: `Usage: /${COMMAND} glass clear|frost|solid` }
    return { text: await chooseGlass($, option) }
  }

  if (verb === 'band') {
    if (!isBand(option)) return { text: `Usage: /${COMMAND} band console|rail|scene|off` }
    return { text: await chooseBand($, option) }
  }

  if (verb === 'companion') {
    if (isOnOff(option)) return { text: await setCompanion($, option === 'on') }
    // the name keeps the case and spaces it was typed with
    const typed = args.trim().split(/\s+/).slice(2).join(' ')
    if (option === 'name' && typed !== '') return { text: await nameCompanion($, typed) }
    return { text: `Usage: /${COMMAND} companion on|off, or /${COMMAND} companion name <name>` }
  }

  if (verb === 'motion') {
    if (!isMotion(option)) return { text: `Usage: /${COMMAND} motion full|calm|off` }
    return { text: await setMotion($, option) }
  }

  // the older name for the same switch
  if (verb === 'rain') {
    if (!isOnOff(option)) return { text: `Usage: /${COMMAND} motion full|calm|off` }
    return { text: await setMotion($, option === 'on' ? 'full' : 'off') }
  }

  if (verb === 'style') {
    if (!isOnOff(option)) return { text: `Usage: /${COMMAND} style on|off` }
    return { text: await setStyle($, option === 'on') }
  }

  if (verb === 'alerts') {
    if (!isOnOff(option)) return { text: `Usage: /${COMMAND} alerts on|off` }
    return { text: await setAlerts($, option === 'on') }
  }

  if (verb === 'deck' || verb === 'panel') {
    if ((await read($, current)) === 'off') {
      return { text: `The theme is off. Pick a look first: /${COMMAND} ${DEFAULT}` }
    }
    const opened = await openDeck($)
    return {
      text: opened.isPlaced
        ? 'Control deck opened.'
        : 'The control deck is ready, but this app has nowhere to place it right now.',
    }
  }

  if (!isPresetId(verb)) {
    return { text: `No look or option named “${verb}”.\n${usage()}` }
  }

  return { text: await choosePreset($, verb) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Interlinked look: presets, glass, command console, companion, motion, row styling, alerts, control deck',
        argumentHint: `[${PRESET_IDS.join('|')}|glass|band|companion|motion|style|alerts|deck|off]`,
      })
    } catch (err) {
      quiet($, err)
      // The name is taken on this build: the look still loads.
    }

    // Say so once on a build older than the one this was made on.
    try {
      const { version } = await $.session.version()
      if (isOlder(version, MIN_VERSION)) {
        $.ui.toast(`Interlinked was made for Claude Code ${MIN_VERSION} or later. This is ${version}: some of it may not draw.`)
      }
    } catch (err) {
      quiet($, err)
    }

    const now = await loadChoices($)
    seq = await read($, toolCalls)
    if ((await read($, turns)) === 0) {
      try {
        const done = await $.session.turns()
        await update($, turns, () => done)
      } catch (err) {
        quiet($, err)
        // Count from here.
      }
    }
    await readSession($)
    await refreshReadouts($)

    try {
      await backfill($)
    } catch (err) {
      quiet($, err)
      // No transcript here: the chart fills as turns finish.
    }

    // The console's clock: check twice a minute, redraw when the minute turns.
    try {
      await tick($)
      $.clock.every(30_000, () => tick($).catch(() => undefined))
    } catch (err) {
      quiet($, err)
      // No clock here: the console draws without one.
    }

    // 'off' means the person turned it off: leave whatever theme stands alone.
    if (now !== 'off') {
      await apply($, now)
      const unpainted = LOOKS[now].unpainted
      if (unpainted !== undefined) $.ui.log(`colors not painted: ${unpainted}`, { to: 'debug' })
    }

    return next(e)
  })

  // /clear, /resume and /branch reset $.state to its defaults without firing
  // session.start again, so load the saved choices once more.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    try {
      await loadChoices($)
      await readSession($)
      await refreshReadouts($)
    } catch (err) {
      // a settings store that can't be read must not stop the session starting
      quiet($, err)
    }
    return next(e)
  })

  // Plan limits and the context count arrive with Claude's replies. The event
  // carries both, so a reading costs no call; a build that sends neither is
  // asked for the plain figures. Mid-turn only the text readouts follow it.
  on('session.measure', async ($, e, next) => {
    if (isOff) return next(e)
    try {
      if ((await read($, turnStartedAt)) === 0) {
        // no turn is running (a /compact, a resume): the console may show it
        await refreshReadouts($)
      } else {
        const reading = e as { context?: { percent?: number }; rateLimits?: unknown }
        if (reading.context === undefined || reading.rateLimits === undefined) {
          const usage = await $.session.usage()
          await takeReading($, usage.context.percent, usage.rateLimits)
        } else {
          await takeReading($, reading.context.percent, reading.rateLimits)
        }
      }
    } catch (err) {
      quiet($, err)
      // The readouts keep their last values.
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, ($, e) =>
    runCommand($, e.args).catch(err => ({
      text: `/${COMMAND} failed: ${err instanceof Error ? err.message : String(err)}`,
    })),
  )

  // ── The readouts' sources ────────────────────────────────────────────────

  // Every tool call is counted. The call itself passes through untouched.
  on('tool.call', async ($, e, next) => {
    seq += 1
    const n = seq
    // Read through plain shapes: the union of every connected tool is too deep to narrow.
    const callId = (e as { tool_use_id: string }).tool_use_id
    keep(callNumbers, callId, n)
    // One write for the count, started now and finished while the tool runs,
    // so the call doesn't wait on a readout. Calls made side by side each
    // write their own number: the larger stands. A readout must never cost a
    // tool call, so a failed write is let go.
    const counted = update($, toolCalls, count => Math.max(count, n)).catch(() => undefined)
    // Timed here and not with $.clock, which would add two dispatches to every call.
    const began = Date.now()
    const result = await next(e)
    // The row is drawn with its result only after this hook returns, so the
    // card finds the time here when it needs it.
    keep(callTimes, callId, Date.now() - began)
    await counted
    try {
      if ((result as { isError?: boolean }).isError === true) {
        turnFailures += 1
        await update($, failures, count => count + 1)
        await fresh(await read($, hadFailure), true, () => update($, hadFailure, () => true))
      }
    } catch (err) {
      quiet($, err)
      // Same.
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        await update($, turns, n => n + 1)
        turnFailures = 0
        // the turn's own count of calls is the session's count less this
        const base = await read($, toolCalls)
        await fresh(await read($, turnBase), base, () => update($, turnBase, () => base))
        await fresh(await read($, hadFailure), false, () => update($, hadFailure, () => false))
        const began = await $.clock.now()
        await fresh(await read($, turnStartedAt), began, () => update($, turnStartedAt, () => began))
        const id = await $.session.model()
        await fresh(await read($, model), id, () => update($, model, () => id))
      } catch (err) {
        quiet($, err)
        // Keep the last values.
      }
    }
    return next(e)
  })

  // Close each answer with a stamp: how long it ran and what it used.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const seconds = Math.round(e.durationMs / 1000)
    try {
      await fresh(await read($, turnStartedAt), 0, () => update($, turnStartedAt, () => 0))
      await fresh(await read($, lastSeconds), seconds, () => update($, lastSeconds, () => seconds))
    } catch (err) {
      quiet($, err)
      // Keep the last value.
    }
    // The turn is over: the console's drawing may take the new figures.
    if (!isOff) await refreshReadouts($)

    const calls = Math.max(0, (await read($, toolCalls)) - (await read($, turnBase)))
    const context = await read($, contextPercent)
    try {
      // one more bar on the chart, one more point on the trend
      const entry: Turn = { o: calls, f: turnFailures, c: context }
      await update($, historyJson, text => JSON.stringify([...parseHistory(text), entry].slice(-HISTORY)))
    } catch (err) {
      quiet($, err)
      // Keep the history as it was.
    }

    if (e.isAborted || (await styledPreset($)) === undefined) return result
    const stamp = `◣ DONE IN ${seconds}s  ·  ${calls} TOOL CALL${calls === 1 ? '' : 'S'}  ·  CONTEXT ${context}%`
    return { ...result, text: stamp }
  })

  // ── The band above the prompt ────────────────────────────────────────────

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    const now = await read($, current)
    const choice = await read($, band)
    if (!isPresetId(now) || choice === 'off') return next(e)

    const level = await read($, motion)
    const anim = level !== 'off'
    const p = PRESETS[now]
    const hud = p.hud
    const ground = LOOKS[now].surface
    const { Box, Client, Svg, Text } = $.ui.resolve(e)

    const context = await read($, contextPercent)
    const limits = limitsOf(await read($, limitsJson))
    const clock = (await read($, minute)) * 60_000
    const name = await read($, companion)
    const hasCompanion = choice === 'console' && (await read($, isCompanionOn))
    const isWorking = e.props.isWorking

    const calls = await read($, toolCalls)

    let graphic
    let shown = context
    if (choice === 'console') {
      // The drawing shows the readings as they stood when the last turn
      // ended: a new source would restart its animation mid-turn.
      const held = heldOf(await read($, consoleJson))
      const detail = held.detail
      shown = held.context
      const history = historyOf(await read($, historyJson))
      // The limits' clocks move in five-minute steps, so the drawing is
      // rebuilt every five minutes and not every one.
      const step = Math.floor(clock / 300_000) * 300_000
      graphic = (
        <Svg
          source={consoleSvg(
            now,
            {
              context: shown,
              tokens: detail.tokens,
              window: detail.window,
              parts: detail.parts,
              reserve: detail.reserve,
              trend: history.filter(turn => turn.c >= 0).map(turn => turn.c),
              limits: held.limits.slice(0, 2).map(limit => limitRow(limit, step)),
              turns: history.map(turn => ({ calls: turn.o, failed: turn.f })),
              hasCompanion,
              ground,
            },
            anim,
          )}
          alt={`Command console: context window ${shown} percent used`}
          width={anim ? CONSOLE.frameWidth : CONSOLE.minWidth}
          height={CONSOLE.height}
          isInteractive={anim || undefined}
        />
      )
    } else if (choice === 'scene') {
      graphic = (
        <Svg
          source={sceneSvg(now, 'strip', level)}
          alt={`${p.label}: rooftops under a measurement grid`}
          width={STRIP.width}
          height={STRIP.height}
          isInteractive={anim || undefined}
        />
      )
    } else {
      graphic = (
        <Svg
          source={railSvg(now, anim)}
          alt="Instrument rail"
          width={RAIL.width}
          height={RAIL.height}
          isInteractive={anim || undefined}
        />
      )
    }

    const pair = (label: string, value: string) => [
      <Text color={hud.primary} dimColor>{label} </Text>,
      <Text color={hud.primary} weight="bold">{value}{'   '}</Text>,
    ]

    const line = hasCompanion
      ? companionLine({
          isWorking,
          turnCalls: Math.max(0, calls - (await read($, turnBase))),
          hadFailure: await read($, hadFailure),
          context,
          limits,
          lastSeconds: await read($, lastSeconds),
          turns: await read($, turns),
          now: clock,
        })
      : ''
    // With motion on, the companion's row is live: her line is typed out
    // beside a clock with seconds and the running turn's timer, all drawn by
    // a surface module on its own clock. Held still, it is plain text.
    let live: LiveRowProps | undefined
    if (hasCompanion && anim) {
      live = {
        id: LIVE_ROW,
        name,
        line,
        now: await $.clock.now().catch(() => 0),
        turnStartedAt: isWorking ? await read($, turnStartedAt) : 0,
        nameColor: hud.you,
        clockColor: hud.primary,
        turnColor: hud.secondary,
      }
    }

    return (
      <Box width="100%" flexDirection="column" overflow="hidden" backgroundColor={ground}>
        <Box width="100%" overflow="hidden">{graphic}</Box>
        {live !== undefined ? (
          <Box width="100%" paddingX={1}>
            <Client key="live" module="./live-row.tsx" props={live} width="100%" />
          </Box>
        ) : hasCompanion ? (
          <Box width="100%" paddingX={1}>
            <Text size="caption" wrap="truncate">
              <Text mono color={hud.you} weight="bold">◆ {name} ▸ </Text>
              <Text>{line}</Text>
            </Text>
          </Box>
        ) : null}
        <Box width="100%" flexDirection="row" justifyContent="space-between" paddingX={1}>
          <Text mono size="caption" wrap="truncate">
            {pair('TOOL CALLS', String(calls))}
            {pair('TURNS', String(await read($, turns)))}
            {pair('LAST TURN', `${await read($, lastSeconds)}s`)}
            {pair('FAILED', String(await read($, failures)))}
            {pair('UPTIME', uptimeLabel(await read($, startedAt), clock))}
          </Text>
          {/* The state has a Text of its own, so a narrow band cuts the clock before it. */}
          <Box flexDirection="row" gap={2}>
            {clock > 0 ? (
              <Text mono size="caption" wrap="truncate" color={hud.primary}>
                {/* the live row above carries the time, to the second */}
                {live !== undefined ? dateLabel(clock) : clockLabel(clock)}
              </Text>
            ) : null}
            <Text mono size="caption" weight="bold" color={isWorking ? hud.secondary : hud.primary}>
              {isWorking ? '● ACTIVE' : '○ STANDBY'}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })

  // The prompt's hint: the app's own words, behind a lead that says what the
  // line is waiting for.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hint === '') return next(e)
    if ((await styledPreset($)) === undefined) return next(e)
    const lead = e.props.isWorking ? '▸ TRANSMITTING' : e.props.isDraft ? '▸ QUERY READY' : '▸ AWAITING QUERY'
    return next({ ...e, props: { ...e.props, hint: `${lead}  ·  ${e.props.hint}` } })
  })

  // ── The conversation's rows ──────────────────────────────────────────────
  // A Box that holds one of the app's own rows may not set a size, a place,
  // `overflow` or `display` (the desktop refuses the tree), so none here do.

  // The working line: a lead that says what the turn is doing, the app's own
  // words after it, and the count at the end. A `message` that overrides the
  // word is the app's to say, so it passes untouched.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || (await styledPreset($)) === undefined) return next(e)
    return next({
      ...e,
      props: {
        ...e.props,
        word: workingWord(e.props.mode, e.props.word),
        suffix: `  ·  ${await read($, toolCalls)} tool calls`,
      },
    })
  })

  // Your prompts.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.origin.kind !== 'composer') return next(e)
    const id = await styledPreset($)
    if (!id) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" alignItems="flex-end">
        <Text mono size="caption" color={PRESETS[id].hud.you} weight="bold">OPERATOR ◂</Text>
        {await next(e)}
      </Box>
    )
  })

  // Claude's replies: a tag on the first block of each, with the unit that answered.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || !e.props.isFirstOfReply || e.props.isSummary) return next(e)
    const id = await styledPreset($)
    if (!id) return next(e)
    const hud = PRESETS[id].hud
    const unit = unitLabel(await read($, model))
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text mono size="caption">
          <Text color={hud.secondary} weight="bold">▸ CLAUDE</Text>
          {unit === '' ? null : <Text color={hud.secondary} dimColor>{'  //  '}{unit}</Text>}
        </Text>
        {await next(e)}
      </Box>
    )
  })

  // Tool calls: a card with the call's number in the session, the tool, and its state.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const id = await styledPreset($)
    if (!id) return next(e)
    const hud = PRESETS[id].hud
    const [edge, state] = e.props.isErrored
      ? [hud.alert, 'FAILED']
      : e.props.isInterrupted
        ? [hud.alert, 'STOPPED']
        : e.props.isRunning
          ? [hud.secondary, 'RUNNING']
          : [hud.primary, 'DONE']
    const n = callNumbers.get(e.requestId)
    // Once the call is over: how long it ran, and what its result amounts to.
    const ms = e.props.isRunning ? undefined : callTimes.get(e.requestId)
    const facts = e.props.isRunning
      ? []
      : [
          ...(ms === undefined ? [] : [durationLabel(ms)]),
          ...(e.props.isErrored || e.props.isInterrupted ? [] : toolFacts(e.props.tool, e.props.output)),
        ]
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={edge} paddingX={1}>
        <Text mono size="caption" wrap="truncate">
          <Text color={edge} weight="bold">◤ {toolLabel(e.props.tool)}</Text>
          {n === undefined ? null : <Text color={hud.primary} dimColor>{'  #'}{pad4(n)}</Text>}
          <Text color={edge}>{'  '}{state}</Text>
          {facts.length === 0 ? null : (
            <Text color={hud.primary} dimColor>{'  ·  '}{facts.join('  ·  ')}</Text>
          )}
        </Text>
        {await next(e)}
      </Box>
    )
  })

  // A run of calls the app folds into one line: the same card, with the
  // count by tool. Unfolded, each call is a row with a card of its own.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.isExpanded || e.props.calls.length === 0) return next(e)
    const id = await styledPreset($)
    if (!id) return next(e)
    const hud = PRESETS[id].hud
    const calls = e.props.calls
    const failed = calls.filter(call => call.isErrored).length
    const isRunning = e.props.isActive || calls.some(call => call.isRunning)
    const [edge, state] = failed > 0
      ? [hud.alert, `${failed} FAILED`]
      : isRunning
        ? [hud.secondary, 'RUNNING']
        : [hud.primary, 'DONE']
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={edge} paddingX={1}>
        <Text mono size="caption" wrap="truncate">
          <Text color={edge} weight="bold">◤ {calls.length} OPERATION{calls.length === 1 ? '' : 'S'}</Text>
          <Text color={edge}>{'  '}{state}</Text>
          <Text color={hud.primary} dimColor>{'  ·  '}{groupTally(calls.map(call => call.tool))}</Text>
        </Text>
        {await next(e)}
      </Box>
    )
  })

  // The question dialog: a heading above it, the app's own dialog untouched.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const id = await styledPreset($)
    if (!id) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text mono size="caption" color={PRESETS[id].hud.primary} weight="bold">
          ◤ OPERATOR INPUT REQUIRED
        </Text>
        {await next(e)}
      </Box>
    )
  })

  // This mod's own command output, as a console card.
  on('ui.render', { component: 'CommandOutput', props: { command: 'theme-mod' } }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const now = await read($, current)
    if (!isPresetId(now)) return next(e)
    const hud = PRESETS[now].hud
    const { Box, Text } = $.ui.resolve(e)
    const lines = e.props.text.split('\n').slice(0, 40)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={hud.primary} paddingX={1}>
        <Text mono size="caption" color={hud.primary} weight="bold">
          ◤ THEME CONTROL  //  {e.props.args.trim() === '' ? 'STATUS' : e.props.args.trim().toUpperCase()}
        </Text>
        {lines.map(line => (
          <Text mono size="caption" color={hud.secondary}>{line === '' ? ' ' : line}</Text>
        ))}
      </Box>
    )
  })

  // ── The control deck ─────────────────────────────────────────────────────

  on('ui.render', { component: 'Pane', requestId: DECK }, async ($, e) => {
    const now = await read($, current)
    if (e.surface !== 'desktop' || !isPresetId(now)) {
      const { Text } = $.ui.resolve(e)
      return (
        <Text dimColor>
          {isPresetId(now)
            ? 'The control deck draws in the Claude desktop app.'
            : `Theme is off. /${COMMAND} ${DEFAULT} turns it back on.`}
        </Text>
      )
    }

    const moving = await read($, motion)
    const anim = moving !== 'off'
    const styled = await read($, isStyled)
    const level = await read($, glass)
    const choice = await read($, band)
    const hasCompanion = await read($, isCompanionOn)
    const hasAlerts = await read($, isAlertsOn)
    const name = await read($, companion)
    const p = PRESETS[now]
    const hud = p.hud
    const { Box, Button, Svg, Text } = $.ui.resolve(e)

    // The pane's width in px isn't given; size the viewport from its columns.
    const width = Math.max(280, Math.min(640, Math.round((e.props.bodyColumns || 50) * 8)))
    const height = Math.round((width * 9) / 16)

    const heading = (text: string) => (
      <Text mono size="caption" color={hud.primary} dimColor>{text}</Text>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box overflow="hidden" backgroundColor={p.skyTop}>
          <Svg
            source={sceneSvg(now, 'deck', moving)}
            alt={`${p.label}: the city under an analysis grid, with a stepping crosshair`}
            width={width}
            height={height}
            isInteractive={anim || undefined}
          />
        </Box>
        <Text mono size="caption">
          <Text color={hud.primary} weight="bold">◤ CONTROL DECK</Text>
          <Text color={hud.secondary}>{'  //  '}{p.label.toUpperCase()}{'  //  '}{p.sector}</Text>
        </Text>

        {heading('LOOK')}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {PRESET_IDS.map(id => (
            <Button
              key={`look-${id}`}
              label={PRESETS[id].label}
              variant={id === now ? 'primary' : 'secondary'}
              onPress={() => choosePreset($, id)}
            />
          ))}
        </Box>

        {heading('GLASS  ·  how much city shows through')}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {GLASSES.map(g => (
            <Button
              key={`glass-${g}`}
              label={g}
              variant={g === level ? 'primary' : 'secondary'}
              onPress={() => chooseGlass($, g)}
            />
          ))}
        </Box>

        {heading('BAND  ·  what sits above the prompt')}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {BANDS.map(b => (
            <Button
              key={`band-${b}`}
              label={b}
              variant={b === choice ? 'primary' : 'secondary'}
              onPress={() => chooseBand($, b)}
            />
          ))}
        </Box>

        {heading('MOTION  ·  how much moves')}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {MOTIONS.map(m => (
            <Button
              key={`motion-${m}`}
              label={m}
              variant={m === moving ? 'primary' : 'secondary'}
              onPress={() => setMotion($, m)}
            />
          ))}
        </Box>

        {heading('SYSTEMS')}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button
            key="style"
            label={styled ? 'Row styling: on' : 'Row styling: off'}
            variant={styled ? 'primary' : 'secondary'}
            onPress={() => setStyle($, !styled)}
          />
          <Button
            key="companion"
            label={hasCompanion ? `${name}: on` : `${name}: off`}
            variant={hasCompanion ? 'primary' : 'secondary'}
            onPress={() => setCompanion($, !hasCompanion)}
          />
          <Button
            key="alerts"
            label={hasAlerts ? 'Alerts: on' : 'Alerts: off'}
            variant={hasAlerts ? 'primary' : 'secondary'}
            onPress={() => setAlerts($, !hasAlerts)}
          />
          <Button key="off" label="Theme off" variant="secondary" onPress={() => turnOff($)} />
        </Box>

        {heading('READOUTS')}
        <Text mono size="caption" color={hud.primary}>
          CX {pad4(await read($, contextPercent))}  context used, percent
        </Text>
        <Text mono size="caption" color={hud.primary}>
          OP {pad4(await read($, toolCalls))}  tool calls this session
        </Text>
        <Text mono size="caption" color={hud.primary}>
          TN {pad4(await read($, turns))}  turns this session
        </Text>
        <Text mono size="caption" color={hud.primary}>
          EL {pad4(await read($, lastSeconds))}  last turn, seconds
        </Text>
        <Text mono size="caption" color={hud.primary}>
          FL {pad4(await read($, failures))}  tool calls that failed
        </Text>
        <Text mono size="caption" color={hud.primary}>
          UP  session uptime, hours and minutes
        </Text>
        <Text mono size="caption" color={hud.primary} wrap="truncate">
          DIR  {(await read($, folder)).toUpperCase() || 'UNKNOWN'}
        </Text>
      </Box>
    )
  })

  // ── The city behind the conversation ─────────────────────────────────────

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const id = e.props.scene
    if (e.props.plugin !== $.plugin.name || !isPresetId(id)) return next(e)

    // An app asked for the scene, so it draws backdrops: /theme-mod status says so.
    isSceneDrawn = true

    const level = await read($, motion)
    const anim = level !== 'off'
    const { Svg } = $.ui.resolve(e)
    return (
      <Svg
        source={sceneSvg(id, 'full', level)}
        alt={`${PRESETS[id].label}: a city at night`}
        isInteractive={anim || undefined}
      />
    )
  })
}
