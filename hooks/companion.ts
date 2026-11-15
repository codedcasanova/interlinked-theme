// The hologram companion: an original character of this mod's own. It
// stands in the console's first cell and says one line at a time, and every
// line is something true and useful about the session. Pure functions only,
// so the lines can be tested without drawing anything.

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** What the companion knows when it speaks. */
export type Vitals = {
  isWorking: boolean
  /** Tool calls in the turn running now, or the last one. */
  turnOps: number
  /** Whether one of them came back as an error. */
  hadFault: boolean
  /** How full the context window is, 0 to 100. */
  context: number
  limits: readonly Limit[]
  /** How long the last turn ran, in seconds. */
  lastSeconds: number
  turns: number
  /** The wall clock in epoch ms; 0 when unknown. */
  now: number
}

export const DEFAULT_NAME = 'JOI'

/** A name fit for the readout: caps, letters, digits, spaces and hyphens, at most 16. */
export function cleanName(raw: string): string {
  const name = raw.replace(/[^A-Za-z0-9 -]/g, '').trim().toUpperCase().slice(0, 16).trim()
  return name === '' ? DEFAULT_NAME : name
}

/** The plan limits as stored: a JSON list. Anything else is no limits. */
export function parseLimits(json: string): Limit[] {
  try {
    const list: unknown = JSON.parse(json)
    if (!Array.isArray(list)) return []
    return list.filter(
      (row): row is Limit =>
        typeof row === 'object' && row !== null &&
        typeof (row as Limit).kind === 'string' && typeof (row as Limit).percentUsed === 'number',
    )
  } catch {
    return []
  }
}

/** A limit's two-character label for the gauge. */
export const limitLabel = (kind: string) =>
  kind === 'five_hour' ? '5H' : kind === 'seven_day' ? '7D' : kind === 'spend_limit' ? 'SP' : kind.slice(0, 2).toUpperCase()

const limitName = (kind: string) =>
  kind === 'five_hour' ? 'five-hour' : kind === 'seven_day' ? 'weekly' : kind === 'spend_limit' ? 'spend' : kind.replace(/_/g, ' ')

/** From this share of a limit used, the companion speaks of it and books a note for its reset. */
export const HOT_LIMIT = 80

/** The longest a client holds a booked notification. */
const WEEK_MS = 7 * 86_400_000

/** One notification to book: its name among this mod's, the moment to raise it, and what it says. */
export type ResetAlert = { key: string; at: number; text: string }

/**
 * The notifications to hold at `now`: one for each limit used past HOT_LIMIT
 * whose reset lies ahead, and no further ahead than a client will hold one.
 * It is raised at the reset, so it says the limit is open again.
 */
export function resetAlerts(limits: readonly Limit[], now: number): ResetAlert[] {
  if (now <= 0) return []
  const alerts: ResetAlert[] = []
  for (const limit of limits) {
    if (limit.percentUsed < HOT_LIMIT || !limit.resetsAt) continue
    const at = Date.parse(limit.resetsAt)
    if (Number.isNaN(at) || at <= now || at - now >= WEEK_MS) continue
    alerts.push({
      key: `limit-${limit.kind.replace(/[^A-Za-z0-9_-]/g, '-')}`,
      at,
      text: `Your ${limitName(limit.kind)} limit has reset. You have a fresh window to work in.`,
    })
  }
  return alerts
}

const two = (n: number) => String(n).padStart(2, '0')

/** `21:17`, in the computer's own time zone. */
export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

/** `FRI 13 NOV`: the date as a title card would set it. */
export function dateLabel(ms: number): string {
  const d = new Date(ms)
  return `${DAYS[d.getDay()]} ${two(d.getDate())} ${MONTHS[d.getMonth()]}`
}

/** `21:17  FRI 13 NOV`: the clock and the date together. */
export function clockLabel(ms: number): string {
  return `${hhmm(ms)}  ${dateLabel(ms)}`
}

/** How long the session has run, as `HH:MM`; `--:--` when the start is unknown. */
export function uptimeLabel(startedAt: number, now: number): string {
  if (startedAt <= 0 || now < startedAt) return '--:--'
  const minutes = Math.floor((now - startedAt) / 60_000)
  return `${two(Math.min(99, Math.floor(minutes / 60)))}:${two(minutes % 60)}`
}

function greeting(now: number): string {
  if (now <= 0) return 'Hello.'
  const hour = new Date(now).getHours()
  if (hour < 5) return 'Still up.'
  if (hour < 12) return 'Good morning.'
  if (hour < 18) return 'Good afternoon.'
  return 'Good evening.'
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The companion's one line, most pressing first: what's happening now, then
 * what will soon run out, then what went wrong, then a plain greeting.
 */
export function companionLine(v: Vitals): string {
  const context = Math.round(v.context)

  if (v.isWorking) {
    return v.turnOps > 0
      ? `Working on it. ${plural(v.turnOps, 'operation')} so far this turn.`
      : 'Working on it.'
  }
  // What is about to run out comes before a fault: a command that exits
  // non-zero is routine, and it shouldn't hide a warning that matters more.
  if (context >= 85) {
    return `Context is at ${context} percent. Run /compact soon, before it gets trimmed for you.`
  }
  const hot = v.limits.find(limit => limit.percentUsed >= HOT_LIMIT)
  if (hot) {
    const resets = hot.resetsAt ? Date.parse(hot.resetsAt) : NaN
    const when = Number.isNaN(resets) ? '' : ` It resets at ${hhmm(resets)}.`
    return `You have used ${Math.round(hot.percentUsed)} percent of your ${limitName(hot.kind)} limit.${when}`
  }
  if (v.hadFault) {
    return 'One of those operations faulted. Worth reading the error before a retry.'
  }
  if (v.lastSeconds >= 300) {
    return `That one ran ${Math.round(v.lastSeconds / 60)} minutes. A good moment to stretch.`
  }
  if (context >= 65) {
    return `Context is at ${context} percent. Still room, and I am watching it.`
  }
  if (v.turns === 0) {
    return `${greeting(v.now)} All systems nominal. What are we working on?`
  }
  if (v.now > 0) {
    const hour = new Date(v.now).getHours()
    if (hour >= 1 && hour < 5) {
      return `It is past ${hour} in the morning. The city stays up all night. You don't have to.`
    }
  }
  return `${greeting(v.now)} ${plural(v.turns, 'turn')} in, context at ${context} percent. All quiet.`
}
