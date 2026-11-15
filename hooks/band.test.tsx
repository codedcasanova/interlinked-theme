// The band above the prompt in a running session: the console, the live row,
// the counters, and the readings that feed them.

import { expect, test } from 'claude-code/testing'

import { resetAlerts } from './companion'
import type { Limit } from './companion'
import { secondsLabel, turnLabel } from './live-row'
import { once } from './readings'
import { MOD, NOW, LIMITS, world, START, BAND, TYPED, advance, LIVE } from './test-world'
import type { Drawn, Loose } from './test-world'

test('the band is the command console, with real readings and the companion', async ($, on) => {
  const { stored } = world(on)
  await $.session.start(START)

  let ui = await $.ui.mount(BAND as never)
  const svg = (await ui.find({ type: 'Svg' })) as Drawn
  expect(svg?.props.height).toBe(132)
  // the gauges carry the session's numbers: 43% context, 12% and 72% of the limits
  const source = String(svg?.props.source)
  expect(source.includes('>43%<')).toBe(true)
  expect(source.includes('>12%<')).toBe(true)
  expect(source.includes('>72%<')).toBe(true)
  // the chart is filled from the transcript: two prompts, two tool calls, one failed
  expect(source.includes('2 TURNS · AVG 1')).toBe(true)
  expect(source.includes('1 FAILED')).toBe(true)
  // the companion greets by the clock and the session's own count
  expect(await ui.find({ type: 'Text', text: /JOI/, ...LIVE })).toBeDefined()
  await advance(ui, TYPED)
  expect(await ui.find({ type: 'Text', text: 'Good evening. 3 turns in, context at 43 percent. All quiet.', ...LIVE })).toBeDefined()
  // the counters: uptime, the date and the state. The live row has the time.
  expect(await ui.find({ type: 'Text', text: '01:42   ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'FRI 13 NOV' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○ STANDBY' })).toBeDefined()
  await ui.unmount()

  const run = (args: string) => $.command.run({ command: 'theme-mod', args } as never)
  await run('band rail')
  expect(stored.band).toBe('rail')
  ui = await $.ui.mount(BAND as never)
  expect(((await ui.find({ type: 'Svg' })) as Drawn)?.props.height).toBe(26)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /JOI/ })).toBeUndefined()
  // without the live row the counters keep the whole clock
  expect(await ui.find({ type: 'Text', text: '21:17  FRI 13 NOV' })).toBeDefined()
  await ui.unmount()

  await run('band scene')
  ui = await $.ui.mount(BAND as never)
  expect(((await ui.find({ type: 'Svg' })) as Drawn)?.props.height).toBe(120)
  await ui.unmount()

  await run('band off')
  ui = await $.ui.mount(BAND as never)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the companion can be renamed and sent away', async ($, on) => {
  const { stored } = world(on)
  await $.session.start(START)
  const run = (args: string) =>
    $.command.run({ command: 'theme-mod', args } as never) as Promise<{ text: string }>

  expect((await run('companion name Vesper')).text).toBe('The companion answers to VESPER now.')
  expect(stored.companion).toBe('VESPER')
  let ui = await $.ui.mount(BAND as never)
  expect(await ui.find({ type: 'Text', text: /VESPER/, ...LIVE })).toBeDefined()
  await ui.unmount()

  expect((await run('companion off')).text).toContain('VESPER has stepped out')
  ui = await $.ui.mount(BAND as never)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /VESPER/ })).toBeUndefined()
  expect(String(((await ui.find({ type: 'Svg' })) as Drawn)?.props.source).includes('id="figure"')).toBe(false)
  await ui.unmount()
})

test('while Claude works, the companion says so and the state reads ACTIVE', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  await $.session.start(START)
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  await ($ as unknown as Loose).tool.call({ tool: 'Bash', command: 'ls' } as never)

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } } as never)
  await advance(ui, TYPED)
  expect(await ui.find({ type: 'Text', text: 'Working on it. 1 tool call so far this turn.', ...LIVE })).toBeDefined()
  // the turn's timer runs beside the clock: four seconds in, by the row's own count
  expect(await ui.find({ type: 'Text', text: 'TURN 00:04   ', ...LIVE })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● ACTIVE' })).toBeDefined()
  await ui.unmount()
})

test('the live row types her line, counts seconds, and holds still with motion off', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  await $.session.start(START)
  const GREETING = 'Good evening. 3 turns in, context at 43 percent. All quiet.'

  let ui = await $.ui.mount(BAND as never)
  const client = (await ui.find({ type: 'Client' })) as Drawn
  expect(String(client?.props.module)).toContain('live-row.tsx')
  expect(client?.props.width).toBe('100%')
  // nothing typed yet, and the clock stands at the hook's own time
  expect(await ui.find({ type: 'Text', text: GREETING, ...LIVE })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '21:17:00', ...LIVE })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /TURN/, ...LIVE })).toBeUndefined()

  // part-way through, the line ends in a cursor
  await advance(ui, 200)
  expect(await ui.find({ type: 'Text', text: 'Good eveni▌', ...LIVE })).toBeDefined()
  await advance(ui, 2800)
  expect(await ui.find({ type: 'Text', text: GREETING, ...LIVE })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '21:17:03', ...LIVE })).toBeDefined()

  // a redraw with the same line keeps what is typed and the row's own time
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: GREETING, ...LIVE })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '21:17:03', ...LIVE })).toBeDefined()

  // a new thought is typed from its start
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  await ui.redraw({ ...BAND.props, isWorking: true } as never)
  expect(await ui.find({ type: 'Text', text: 'Working on it.', ...LIVE })).toBeUndefined()
  await advance(ui, 400)
  expect(await ui.find({ type: 'Text', text: 'Working on it.', ...LIVE })).toBeDefined()
  // the same thought with a new count is swapped whole, with no typing
  await ($ as unknown as Loose).tool.call({ tool: 'Bash', command: 'ls' } as never)
  await ui.redraw({ ...BAND.props, isWorking: true } as never)
  expect(await ui.find({ type: 'Text', text: 'Working on it. 1 tool call so far this turn.', ...LIVE })).toBeDefined()
  await ui.unmount()

  // motion off: the same words as plain text, the whole clock below, nothing ticking
  await $.command.run({ command: 'theme-mod', args: 'rain off' } as never)
  ui = await $.ui.mount(BAND as never)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  // (one more turn has begun since the greeting above)
  expect(await ui.find({ type: 'Text', text: 'Good evening. 4 turns in, context at 43 percent. All quiet.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '21:17  FRI 13 NOV' })).toBeDefined()
  await ui.unmount()

  expect(secondsLabel(NOW + 42_000)).toBe('21:17:42')
  expect(turnLabel(83_000)).toBe('01:23')
  expect(turnLabel(3_849_000)).toBe('1:04:09')
  expect(turnLabel(-5)).toBe('00:00')
})

test('a failed tool call is counted and the companion flags it', async ($, on) => {
  world(on)
  on('tool.call', () => ({ result: 'boom', isError: true }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  await $.session.start(START)
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  const out = (await ($ as unknown as Loose).tool.call({ tool: 'Bash', command: 'false' } as never)) as { isError?: boolean }
  // the result reaches Claude untouched
  expect(out.isError).toBe(true)

  const ui = await $.ui.mount(BAND as never)
  await advance(ui, TYPED)
  expect(await ui.find({ type: 'Text', text: /tool calls failed/, ...LIVE })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'FAILED ' })).toBeDefined()
  await ui.unmount()
})

test('the readouts count real tool calls and turns', async ($, on) => {
  world(on)
  let lastId = ''
  on('tool.call', (_, e) => {
    lastId = (e as { tool_use_id: string }).tool_use_id
    return { result: 'ok' }
  })
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start(START)
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  await ($ as unknown as Loose).tool.call({ tool: 'Bash', command: 'ls' } as never)
  await ($ as unknown as Loose).tool.call({ tool: 'Read', file_path: 'README.md' } as never)
  const done = (await $.turn.complete({
    turnId: 't1', answer: 'done', durationMs: 42000, isAborted: false, usage: null, reason: 'answer',
  } as never)) as { text: string }

  // the stamp under the answer: 42 seconds, 2 operations, 43% context
  expect(done.text).toBe('◣ DONE IN 42s  ·  2 TOOL CALLS  ·  CONTEXT 43%')

  const ui = await $.ui.mount(BAND as never)
  expect(await ui.find({ type: 'Text', text: '2   ' })).toBeDefined()
  // 3 turns before this mod loaded, plus this one
  expect(await ui.find({ type: 'Text', text: '4   ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '42s   ' })).toBeDefined()
  // the finished turn is the chart's newest bar
  expect(String(((await ui.find({ type: 'Svg' })) as Drawn)?.props.source).includes('3 TURNS · AVG')).toBe(true)
  await ui.unmount()

  // the second call's card carries its operation number and keeps the app's row
  const card = await $.ui.mount({
    plugin: MOD, component: 'ToolUse', requestId: lastId, surface: 'desktop',
    props: {
      tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false,
      output: { type: 'text', file: { filePath: 'README.md', content: '', numLines: 40, startLine: 1, totalLines: 120 } },
    },
  } as never)
  expect(((await card.find({ type: 'Box' })) as Drawn)?.props.borderStyle).toBe('round')
  expect(await card.find({ type: 'Text', text: /READ/ })).toBeDefined()
  expect(await card.find({ type: 'Text', text: /#0002/ })).toBeDefined()
  expect(await card.find({ type: 'Text', text: /DONE/ })).toBeDefined()
  // how long the call ran, then what its result amounts to
  expect(await card.find({ type: 'Text', text: /^  ·  \d+ms  ·  40 OF 120 LINES$/ })).toBeDefined()
  expect(await card.keepsBeneath()).toBe(true)
  await card.unmount()

  // a failed call keeps its time and says nothing about a result it doesn't have
  const failed = await $.ui.mount({
    plugin: MOD, component: 'ToolUse', requestId: lastId, surface: 'desktop',
    props: { tool: 'Read', input: {}, isRunning: false, isErrored: true, isInterrupted: false, output: 'no such file' },
  } as never)
  expect(await failed.find({ type: 'Text', text: /FAILED/ })).toBeDefined()
  expect(await failed.find({ type: 'Text', text: /^  ·  \d+ms$/ })).toBeDefined()
  await failed.unmount()
})

test('a reading mid-turn moves the text readouts and leaves the console drawing alone', async ($, on) => {
  const session: { now: Limit[]; percent?: number } = { now: LIMITS }
  world(on, {}, 'undrawn', session)
  const writes: string[] = []
  on('state.set', (_, e, next) => {
    writes.push(String((e as { key?: string }).key))
    return next(e)
  })
  on('session.measure', () => ({ changed: [] }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start(START)

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } } as never)
  const source = async () => String(((await ui.find({ type: 'Svg' })) as Drawn)?.props.source)
  const before = await source()
  expect(before.includes('>43%<')).toBe(true)

  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  const atTurnStart = await source()

  // a reading arrives mid-turn: the context has grown and a limit has moved.
  // It comes with the event, so nothing is fetched, and only what changed is written.
  const grown = [{ kind: 'five_hour', percentUsed: 30 }, { kind: 'seven_day', percentUsed: 71.5 }]
  const reading = { context: { window: 200000, percent: 58 }, rateLimits: grown, changed: [] }
  writes.length = 0
  await $.session.measure(reading as never)
  expect([...writes].sort()).toEqual(['contextPercent', 'limitsJson'])
  // the drawing is the one the turn began with: a new source would restart its animation
  expect(await source()).toBe(atTurnStart)
  expect(atTurnStart).toBe(before)

  // the same reading again writes nothing at all
  writes.length = 0
  await $.session.measure(reading as never)
  expect(writes).toEqual([])

  // a tool call is one write
  writes.length = 0
  await ($ as unknown as Loose).tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(writes).toEqual(['toolCalls'])
  expect(await source()).toBe(before)

  // the turn ends: the console takes the new figures, and the stamp has them too
  session.percent = 58
  session.now = grown as Limit[]
  const done = (await $.turn.complete({
    turnId: 't1', answer: 'done', durationMs: 9000, isAborted: false, usage: null, reason: 'answer',
  } as never)) as { text: string }
  expect(done.text).toBe('◣ DONE IN 9s  ·  1 TOOL CALL  ·  CONTEXT 58%')
  const after = await source()
  expect(after.includes('>58%<')).toBe(true)
  expect(after.includes('>30%<')).toBe(true)
  await ui.unmount()

  // with the theme off, a reading is left alone
  await $.command.run({ command: 'theme-mod', args: 'off' } as never)
  writes.length = 0
  await $.session.measure({ ...reading, context: { window: 200000, percent: 77 } } as never)
  expect(writes).toEqual([])
})

test('a limit running out books one notification for its reset, and alerts off takes it back', async ($, on) => {
  const resetsAt = new Date(NOW + 3 * 3_600_000).toISOString()
  const hot: Limit[] = [{ kind: 'five_hour', percentUsed: 88, resetsAt }, { kind: 'seven_day', percentUsed: 40, resetsAt }]

  // what to book, as a plain reading of the limits
  expect(resetAlerts(hot, NOW)).toEqual([
    { key: 'limit-five_hour', at: NOW + 3 * 3_600_000, text: 'Your five-hour limit has reset. You have a fresh window to work in.' },
  ])
  // nothing for a limit with room, a reset already past, one with no time, or one a client won't hold that long
  expect(resetAlerts([{ kind: 'five_hour', percentUsed: 79, resetsAt }], NOW)).toEqual([])
  expect(resetAlerts([{ kind: 'five_hour', percentUsed: 95, resetsAt: new Date(NOW - 1000).toISOString() }], NOW)).toEqual([])
  expect(resetAlerts([{ kind: 'five_hour', percentUsed: 95 }], NOW)).toEqual([])
  expect(resetAlerts([{ kind: 'seven_day', percentUsed: 95, resetsAt: new Date(NOW + 8 * 86_400_000).toISOString() }], NOW)).toEqual([])
  expect(resetAlerts(hot, 0)).toEqual([])

  const limits: { now: Limit[]; surfaces?: string[] } = { now: LIMITS }
  const { notes, cancels, stored } = world(on, {}, 'undrawn', limits)
  on('session.measure', () => ({ changed: [] }))
  const run = (args: string) => $.command.run({ command: 'theme-mod', args } as never) as Promise<{ text: string }>

  // with room on every limit, nothing is booked and nothing is asked of the app
  await $.session.start(START)
  expect(notes.length).toBe(0)
  expect(cancels.length).toBe(0)

  // the limit passes 80 percent: one notification, at its reset, signed by the companion
  limits.now = hot
  await $.session.measure({} as never)
  expect(notes.length).toBe(1)
  expect(notes[0]?.key).toBe('limit-five_hour')
  expect(notes[0]?.at).toBe(NOW + 3 * 3_600_000)
  expect(notes[0]?.title).toBe('JOI')
  expect(notes[0]?.text).toContain('five-hour limit has reset')
  // a second reading of the same limits books nothing more
  await $.session.measure({} as never)
  expect(notes.length).toBe(1)

  // alerts off takes it back and books no more
  expect((await run('alerts off')).text).toContain('Alerts off')
  expect(stored.alerts).toBe(false)
  expect(cancels).toEqual(['limit-five_hour'])
  await $.session.measure({} as never)
  expect(notes.length).toBe(1)
  expect((await run('status')).text).toContain('ALERTS off')

  // alerts on books it again
  expect((await run('alerts on')).text).toContain('Alerts on')
  expect(notes.length).toBe(2)

  // the window resets: by now the notification is on screen, so it is
  // forgotten and never taken back
  limits.now = LIMITS
  await $.session.measure({} as never)
  expect(cancels).toEqual(['limit-five_hour'])

  // the next window runs low too, and is booked afresh
  limits.now = hot
  await $.session.measure({} as never)
  expect(notes.length).toBe(3)

  // turning the theme off takes back whatever is booked
  await run('off')
  expect(cancels).toEqual(['limit-five_hour', 'limit-five_hour'])
  await $.session.measure({} as never)
  expect(notes.length).toBe(3)

  // a terminal raises a notification at once whatever time it is booked
  // for, so a session a terminal draws books none
  await run('neon-noir')
  expect(notes.length).toBe(4)
  await run('alerts off')
  limits.surfaces = ['terminal', 'desktop']
  await run('alerts on')
  await $.session.measure({} as never)
  expect(notes.length).toBe(4)
})

test('an interrupted turn gets no stamp', async ($, on) => {
  world(on)
  on('turn.complete', () => ({ text: '' }))
  const done = (await $.turn.complete({
    turnId: 't1', answer: '', durationMs: 5000, isAborted: true, usage: null, reason: 'aborted',
  } as never)) as { text: string }
  expect(done.text).toBe('')
})

test('a refused theme does not stop the console', async ($, on) => {
  const { stored, wasStarted } = world(on, { preset: 'amber-dust' }, 'refused')

  await $.session.start(START)
  // the hook reached next(e), so it was not skipped for throwing
  expect(wasStarted()).toBe(true)
  expect(stored.preset).toBe('amber-dust')

  const ui = await $.ui.mount(BAND as never)
  expect(((await ui.find({ type: 'Svg' })) as Drawn)?.props.height).toBe(132)
  await ui.unmount()
})

test('a session with no usage and no transcript still draws its console', async ($, on) => {
  const session: { now: Limit[]; isUsageDown?: boolean; isEmpty?: boolean } = { now: LIMITS, isUsageDown: true, isEmpty: true }
  world(on, {}, 'undrawn', session)
  await $.session.start(START)

  const ui = await $.ui.mount(BAND as never)
  const source = String(((await ui.find({ type: 'Svg' })) as Drawn)?.props.source)
  // nothing to read yet: each cell says so, and nothing is made up
  expect(source.includes('>0%<')).toBe(true)
  expect(source.includes('NO READING YET')).toBe(true)
  expect(source.includes('NO TURNS RECORDED YET')).toBe(true)
  expect(source.includes('TREND APPEARS AFTER TWO TURNS')).toBe(true)
  // the counters stand at the session's own count, and uptime is unknown
  expect(await ui.find({ type: 'Text', text: '--:--   ' })).toBeDefined()
  await ui.unmount()
})
