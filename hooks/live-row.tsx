// The console's live row: the companion's line, typed out as she says it,
// beside a clock that counts seconds and a timer for the turn that is running.
//
// It is a surface module: it draws on the app's own frame clock, so nothing
// here goes back through the hooks module, and the console's drawing beside it
// is never touched. (Changing that drawing's source restarts its animation,
// which is why the fast-moving parts live in text.)
//
// The hooks module hands it plain data and it counts on from there: `now` is
// the wall clock when the hook last drew, and each tick adds to it.

import type { ClientModule } from 'claude-code'

export type LiveRowProps = {
  /** Which console this is: two sessions in one window each keep their own row. */
  id: string
  /** The companion's name, as the readout writes it. */
  name: string
  /** What she says now. */
  line: string
  /** The wall clock when the hook drew this, in epoch ms; 0 when unknown. */
  now: number
  /** When the running turn began, in epoch ms; 0 while no turn runs. */
  turnStartedAt: number
  /** Colors for her name, the clock and the turn timer. */
  nameColor: string
  clockColor: string
  turnColor: string
}

/** One row's running state, shared by its draws and its timers. */
type Row = {
  line: string
  /** How many characters of the line are typed so far. */
  shown: number
  /** The clock's starting point and the time counted since, in ms. */
  base: number
  elapsed: number
  /** The hook's last reading of the wall clock, to tell a new one from a redraw. */
  reading: number
  /** Stops the typing timer while one runs. */
  stopTyping: (() => void) | undefined
  /** Counts the row's changes: a fresh state each time, so every one is drawn. */
  changes: number
}

const rows = new Map<string, Row>()

/** The typing timer's period and the characters it adds: about 50 a second. */
const TYPE_MS = 40
const TYPE_STEP = 2
/** A line that opens like the last one is the same thought updated, and isn't typed again. */
const OPENING = 12
/** How far the row's clock may stray from the hook's before it is set again. */
const DRIFT_MS = 1500

const two = (n: number) => String(n).padStart(2, '0')

/** `21:17:42`, in the computer's own time zone. */
export function secondsLabel(ms: number): string {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/** `01:23`, or `1:04:09` past the hour: how long the turn has run. */
export function turnLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const rest = `${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`
  return hours > 0 ? `${hours}:${rest}` : rest
}

const LiveRow: ClientModule<LiveRowProps, number> = (props, surface) => {
  const { Box, Text } = surface.elements
  let row = rows.get(props.id)

  /** Types the rest of the line, then stops its own timer. */
  const type = (target: Row) => {
    if (target.stopTyping !== undefined || target.shown >= target.line.length) return
    target.stopTyping = surface.every(TYPE_MS, () => {
      target.shown = Math.min(target.line.length, target.shown + TYPE_STEP)
      if (target.shown >= target.line.length) {
        target.stopTyping?.()
        target.stopTyping = undefined
      }
      surface.setState((target.changes += 1))
    })
  }

  if (surface.state === undefined || row === undefined) {
    // A new instance: start the clock once, and type the line from its start.
    row = { line: props.line, shown: 0, base: props.now, elapsed: 0, reading: props.now, stopTyping: undefined, changes: 0 }
    rows.set(props.id, row)
    const mounted = row
    surface.setState(0)
    surface.every(1000, () => {
      mounted.elapsed += 1000
      surface.setState((mounted.changes += 1))
    })
    type(mounted)
  } else {
    if (props.line !== row.line) {
      const isSameThought = props.line.slice(0, OPENING) === row.line.slice(0, OPENING)
      row.shown = isSameThought ? props.line.length : 0
      row.line = props.line
      type(row)
    }
    // The row keeps its own time. A new reading from the hook corrects it only
    // after a real gap (the computer slept), so the seconds never stutter.
    if (props.now !== row.reading) {
      row.reading = props.now
      if (props.now > 0 && Math.abs(props.now - (row.base + row.elapsed)) > DRIFT_MS) {
        row.base = props.now
        row.elapsed = 0
      }
    }
  }

  const time = row.base + row.elapsed
  const isTyping = row.shown < row.line.length
  const turn = props.turnStartedAt > 0 && time > 0 ? turnLabel(time - props.turnStartedAt) : ''

  return (
    <Box width="100%" flexDirection="row" justifyContent="space-between" gap={2}>
      <Text size="caption" wrap="truncate">
        <Text mono color={props.nameColor} weight="bold">◆ {props.name} ▸ </Text>
        <Text>{row.line.slice(0, row.shown)}{isTyping ? '▌' : ''}</Text>
      </Text>
      <Text mono size="caption" wrap="truncate">
        {turn === '' ? null : <Text color={props.turnColor} weight="bold">TURN {turn}{'   '}</Text>}
        {time > 0 ? <Text color={props.clockColor}>{secondsLabel(time)}</Text> : null}
      </Text>
    </Box>
  )
}

export default LiveRow
