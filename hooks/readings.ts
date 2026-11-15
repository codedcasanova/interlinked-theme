// The readings the console draws from, as plain data: how a turn, the context
// and a plan limit are stored and read back, and how each is worded for a
// readout. Pure functions with no session behind them, so they can be tested
// alone. The hooks module (register.tsx) reads the session and calls these.

import { clockLabel, hhmm, parseLimits } from './companion'
import type { Limit } from './companion'

/** One finished turn: its tool calls, how many failed, and the context after it (-1 when unknown). */
export type Turn = { o: number; f: number; c: number }
/** What fills the context window, as the console draws it. */
export type Detail = { tokens: number; window: number; parts: { name: string; tokens: number }[]; reserve: number }

export const HISTORY = 24
export function parseHistory(text: string): Turn[] {
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
export type Held = { context: number; limits: Limit[]; detail: Detail }

export function parseHeld(text: string): Held {
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

export function parseDetail(value: unknown): Detail {
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

/** The build this mod was made on. An older one may lack what it draws with. */
export const MIN_VERSION = '2.1.325'

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
export function once<T>(parse: (text: string) => T): (text: string) => T {
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
/** `2D 11H`, `2H 55M`, `45M`: time left, short enough for a readout. */
export function spanLabel(ms: number): string {
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
export function limitRow(limit: Limit, now: number) {
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

/** What the working line leads with, by what the turn is doing. A mode not listed gets no lead. */
export const WORKING_LEADS: Record<string, string> = {
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
export function workingWord(mode: string, word: string): string {
  const lead = WORKING_LEADS[mode]
  if (lead === undefined) return word
  const said = word.trim()
  return said === '' || said === 'Working' ? lead : `${lead}  ·  ${said}`
}

/** The model id as a unit designation: `claude-fable-5-2` reads `FABLE-5-2`. */
export const unitLabel = (id: string) => id.replace(/^claude-/, '').replace(/\[.*$/, '').toUpperCase()
