import { expect, mock, test } from 'claude-code/testing'

import { cleanName, clockLabel, companionLine, limitLabel, parseLimits, resetAlerts, uptimeLabel } from './companion'
import type { Limit, Vitals } from './companion'
import { consoleSvg, moodOf, tokenLabel, turnsOfRoom } from './console'
import { secondsLabel, turnLabel } from './live-row'
import type { ConsoleData } from './console'
import { LOOKS } from './looks'
import { PRESET_IDS, railSvg, sceneSvg } from './scenes'
import { durationLabel, groupTally, toolFacts, toolLabel } from './tools'

const MOD = 'interlinked-theme'
/** Friday 13 November 2026, 21:17 Pacific. */
const NOW = 1794633420000

/** A console with every cell filled, as a long session would have it. */
const SAMPLE: ConsoleData = {
  context: 64, tokens: 642600, window: 1000000, reserve: 33000,
  parts: [{ name: 'Messages', tokens: 578600 }, { name: 'System tools', tokens: 22500 }, { name: 'MCP tools', tokens: 18300 }],
  trend: [40, 46, 52, 58, 64],
  limits: [{ name: '5-HOUR', percent: 80, elapsed: 0.42, resets: '00:30', left: '2H 55M' }],
  turns: [{ ops: 3, faults: 0 }, { ops: 12, faults: 2 }, { ops: 5, faults: 0 }],
  hasCompanion: true,
  ground: '#080b12',
}

type Stored = Record<string, unknown>
type SetCall = { backdrop?: { scene?: string; glass?: unknown }; colors?: unknown; overrideColorScheme?: string }
type Note = { text: string; title?: string; key?: string; at?: number }

/** The plan limits a session reports unless a test says otherwise: neither is running out. */
const LIMITS: Limit[] = [{ kind: 'five_hour', percentUsed: 12 }, { kind: 'seven_day', percentUsed: 71.5 }]

/**
 * The stubs most tests need: a store backed by `stored`, a theme that records
 * each set and answers as `theme` says, a clock, and the session's readouts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function world(
  on: any,
  stored: Stored = {},
  theme: 'drawn' | 'undrawn' | 'refused' = 'undrawn',
  limits: { now: Limit[]; surfaces?: string[]; percent?: number } = { now: LIMITS },
) {
  const sets: SetCall[] = []
  const calls: string[] = []
  const notes: Note[] = []
  const cancels: string[] = []
  let wasStarted = false
  mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'theme-mod' } }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('theme.set', (_: unknown, e: SetCall) => {
    sets.push(e)
    calls.push('set')
    if (theme === 'refused') return { deny: 'this build draws no look' }
    return {
      value: theme === 'drawn' ? { isDrawn: true, requestId: 'backdrop' } : { isDrawn: false, reason: 'no app draws it' },
    }
  })
  on('theme.clear', () => {
    calls.push('clear')
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', (_: unknown, e: Note) => {
    notes.push(e)
    return { value: { isSent: true, channel: 'client' } }
  })
  on('ui.cancelNotify', (_: unknown, e: unknown) => {
    cancels.push(typeof e === 'string' ? e : String((e as { key?: string }).key))
    return { value: { isSent: true } }
  })
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 102 * 60_000,
      context: { window: 200000, percent: limits.percent ?? 43 },
      rateLimits: limits.now,
    },
  }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.surfaces', () => ({ value: limits.surfaces ?? ['desktop'] }))
  on('session.turns', () => ({ value: 3 }))
  on('session.cwd', () => ({ value: 'C:\\work\\night-shift' }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'first', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'a', tool: 'Bash', input: {} }, { tool_use_id: 'b', tool: 'Read', input: {}, isError: true }] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'a', text: 'ok', isError: false }] },
      { role: 'user', text: 'second', toolUses: [] },
      { role: 'assistant', text: 'done', toolUses: [] },
    ],
  }))
  on('session.start', (_: unknown, e: { cwd: string }) => {
    wasStarted = true
    return { cwd: e.cwd }
  })
  return { sets, calls, stored, notes, cancels, wasStarted: () => wasStarted }
}

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const

const BAND = {
  plugin: MOD,
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

type Drawn = { props: Record<string, unknown> } | undefined

/** The companion's row is a surface module, keyed `live`: look inside it. */
const LIVE = { in: 'live' } as const
/** Long enough for the live row to finish typing any line. */
const TYPED = 4000

/** Moves a drawing's frame clock on. The mounts here are cast, which hides the acts a `Client` adds. */
const advance = (ui: unknown, ms: number) => (ui as { advance: (ms: number) => Promise<void> }).advance(ms)

/** `$.tool.call` without its input and result types: with many MCP tools connected they are too deep to check. */
type Loose = { tool: { call: (input: unknown) => Promise<unknown> } }

const VITALS: Vitals = {
  isWorking: false, turnOps: 0, hadFault: false, context: 20, limits: [], lastSeconds: 12, turns: 4, now: NOW,
}

test('every scene fits the Svg bound, runs no script, and is deterministic', async () => {
  for (const id of PRESET_IDS) {
    for (const view of ['full', 'strip', 'deck'] as const) {
      for (const animated of [false, true]) {
        const svg = sceneSvg(id, view, animated)
        expect(svg.length < 131072).toBe(true)
        expect(svg.startsWith('<svg')).toBe(true)
        expect(/<script|\son[a-z]+=|href=/i.test(svg)).toBe(false)
        expect(svg.includes('<animate')).toBe(animated)
        expect(sceneSvg(id, view, animated)).toBe(svg)
      }
    }
    // the overlay belongs to the strip and the deck, never the backdrop
    expect(sceneSvg(id, 'full', true).includes('id="grid"')).toBe(false)
    expect(sceneSvg(id, 'deck', true).includes('id="grid"')).toBe(true)
    for (const svg of [
      railSvg(id, true),
      consoleSvg(id, SAMPLE, true),
      consoleSvg(id, SAMPLE, false),
    ]) {
      expect(svg.length < 131072).toBe(true)
      // the portrait is an embedded picture; nothing else may link out
      expect(/<script|\son[a-z]+=|href="(?!data:image)/i.test(svg)).toBe(false)
    }
  }
})

test('the console draws its readings in plain words', async () => {
  const svg = consoleSvg('neon-noir', SAMPLE, false)
  // context: the figure, what fills it, and the room left at this rate
  expect(svg.includes('>64%<')).toBe(true)
  expect(svg.includes('643K OF 1M TOKENS')).toBe(true)
  expect(svg.includes('MESSAGES 58%')).toBe(true)
  expect(svg.includes('ABOUT 6 TURNS OF ROOM')).toBe(true)
  // the limit: used against time gone, and when it resets
  expect(svg.includes('>80%<')).toBe(true)
  expect(svg.includes('RESETS 00:30 · 2H 55M LEFT · AHEAD OF PACE')).toBe(true)
  // the chart: the turns it covers and the failures in them
  expect(svg.includes('LAST 3 TURNS · AVG 7')).toBe(true)
  expect(svg.includes('2 FAILED')).toBe(true)
  // the companion stands in her cell, and can step out
  expect(svg.includes('id="figure"')).toBe(true)
  expect(consoleSvg('neon-noir', { ...SAMPLE, hasCompanion: false }, false).includes('id="figure"')).toBe(false)
  // an empty session says so and draws no chart
  const empty = consoleSvg('neon-noir', { ...SAMPLE, limits: [], turns: [], trend: [], parts: [] }, false)
  expect(empty.includes('SHOWS AFTER THE NEXT REPLY')).toBe(true)
  expect(empty.includes('NO TURNS RECORDED YET')).toBe(true)
  expect(tokenLabel(1_200_000)).toBe('1.2M')
  expect(turnsOfRoom([50, 50, 50])).toBeUndefined()
})

test('the companion carries the mood of the fullest gauge', async () => {
  const limit = (percent: number) => ({ name: '5-HOUR', percent, elapsed: 0.42, resets: '00:30', left: '2H 55M' })
  // the gauges' own thresholds: warm from 65 percent, alarm from 85
  expect(moodOf(42, [limit(30)])).toBe('calm')
  expect(moodOf(64.6, [])).toBe('warm')
  expect(moodOf(20, [limit(30), limit(93)])).toBe('alarm')
  // only the two limits the console draws count
  expect(moodOf(20, [limit(30), limit(30), limit(99)])).toBe('calm')

  const draw = (context: number, percent: number, animated = false, picture = '') =>
    consoleSvg('neon-noir', { ...SAMPLE, context, limits: [limit(percent)] }, animated, picture)
  const BRACKETS = 'M6 22V10H18'

  // calm is her own tint and nothing more
  const calm = draw(42, 30)
  expect(calm.includes(BRACKETS)).toBe(false)
  expect(calm.includes('<stop offset="0" stop-color="#ff3da6" stop-opacity="0.9"/>')).toBe(true)

  // warm and alarm take the gauge's color into the cone and bracket her cell
  const warm = draw(71, 30)
  expect(warm.includes(`${BRACKETS}M72 10H84V22M6 106V118H18M72 118H84V106" fill="none" stroke="#ffb000"`)).toBe(true)
  expect(warm.includes('<stop offset="0" stop-color="#ffb000" stop-opacity="0.9"/>')).toBe(true)
  const alarm = draw(42, 93, true)
  expect(alarm.includes('fill="none" stroke="#ff4d5e" stroke-width="2"')).toBe(true)
  // she flickers faster, and the emitter beats
  expect(alarm.includes('dur="1.84s"')).toBe(true)
  expect(alarm.includes('attributeName="rx"')).toBe(true)
  expect(draw(42, 30, true).includes('attributeName="rx"')).toBe(false)
  // held still, the alarm keeps its color and drops the beat
  expect(draw(42, 93).includes('attributeName="rx"')).toBe(false)

  // with a portrait the frame carries the mood, and there are no brackets.
  // The picture is made up here, at the size a real one takes.
  const picture = `<path d="${'M4 8h1.5v1.7h-1.5z'.repeat(3300)}" fill="#8a6fd1"/>`
  expect(picture.length > 59_000).toBe(true)
  const framed = draw(42, 93, true, picture)
  expect(framed.includes(BRACKETS)).toBe(false)
  expect(framed.includes('rx="5" fill="none" stroke="#ff4d5e" stroke-width="2" opacity="1"')).toBe(true)
  expect(draw(42, 30, true, picture).includes('rx="5" fill="none" stroke="#ff3da6" stroke-width="1.2" opacity="0.75"')).toBe(true)
  for (const id of PRESET_IDS) {
    expect(consoleSvg(id, { ...SAMPLE, limits: [limit(93), limit(71)] }, true, picture).length < 131072).toBe(true)
  }
})

test('the companion says the most pressing true thing', async () => {
  expect(companionLine({ ...VITALS, isWorking: true, turnOps: 3 })).toBe('Working on it. 3 operations so far this turn.')
  expect(companionLine({ ...VITALS, hadFault: true })).toContain('faulted')
  expect(companionLine({ ...VITALS, context: 91 })).toContain('/compact')
  expect(
    companionLine({ ...VITALS, limits: [{ kind: 'five_hour', percentUsed: 88, resetsAt: new Date(NOW + 3_600_000).toISOString() }] }),
  ).toBe('You have used 88 percent of your five-hour limit. It resets at 22:17.')
  expect(companionLine({ ...VITALS, lastSeconds: 840 })).toContain('14 minutes')
  expect(companionLine({ ...VITALS, context: 70 })).toContain('70 percent')
  expect(companionLine({ ...VITALS, turns: 0 })).toBe('Good evening. All systems nominal. What are we working on?')
  expect(companionLine(VITALS)).toBe('Good evening. 4 turns in, context at 20 percent. All quiet.')
  // a context about to run out outranks a fault, and working outranks both
  expect(companionLine({ ...VITALS, hadFault: true, context: 95 })).toContain('/compact')
  expect(companionLine({ ...VITALS, hadFault: true, context: 95, isWorking: true })).toBe('Working on it.')
})

test('the readout helpers format the way the console shows them', async () => {
  expect(clockLabel(NOW)).toBe('21:17  FRI 13 NOV')
  expect(uptimeLabel(NOW - 102 * 60_000, NOW)).toBe('01:42')
  expect(uptimeLabel(0, NOW)).toBe('--:--')
  expect(limitLabel('five_hour')).toBe('5H')
  expect(limitLabel('seven_day')).toBe('7D')
  expect(parseLimits('not json')).toEqual([])
  expect(parseLimits('[{"kind":"seven_day","percentUsed":7},{"nope":1}]')).toEqual([{ kind: 'seven_day', percentUsed: 7 }])
  expect(cleanName('  vesper <b>9  ')).toBe('VESPER B9')
  expect(cleanName('!!!')).toBe('JOI')
})

test('every look has colors the desktop will paint', async () => {
  for (const id of PRESET_IDS) {
    expect(LOOKS[id].colors).toBeDefined()
    expect(LOOKS[id].unpainted).toBeUndefined()
  }
})

test('session start sends colors, scene and mode in one call; off sends nothing', async ($, on) => {
  const { sets, stored } = world(on, { preset: 'acid-rain' })

  await $.session.start(START)
  expect(sets.length).toBe(1)
  expect(sets[0]?.backdrop?.scene).toBe('acid-rain')
  expect(sets[0]?.colors).toBeDefined()
  expect(sets[0]?.overrideColorScheme).toBe('dark')

  stored.preset = 'off'
  sets.length = 0
  await $.session.start(START)
  expect(sets.length).toBe(0)
})

test('/theme-mod switches looks, changes the glass, and turns off', async ($, on) => {
  const { sets, calls, stored } = world(on, {}, 'drawn')
  const run = (args: string) =>
    $.command.run({ command: 'theme-mod', args } as never) as Promise<{ text: string }>

  expect((await run('amber-dust')).text).toBe('Look set: Amber Dust.')
  expect(stored.preset).toBe('amber-dust')
  expect(sets.at(-1)?.backdrop?.scene).toBe('amber-dust')

  // solid keeps the colors and drops the scene
  expect((await run('glass solid')).text).toContain('Glass: solid')
  expect(sets.at(-1)?.backdrop).toBeUndefined()
  expect(sets.at(-1)?.colors).toBeDefined()

  expect((await run('glass clear')).text).toBe('Glass: clear.')
  expect(sets.at(-1)?.backdrop?.scene).toBe('amber-dust')

  expect((await run('nope')).text).toContain('No look or option named')
  expect((await run('status')).text).toContain('LOOK   amber-dust')
  expect((await run('off')).text).toContain('Theme off')
  expect(stored.preset).toBe('off')
  expect(calls.at(-1)).toBe('clear')
})

test('a look the app does not draw says why', async ($, on) => {
  world(on, {}, 'undrawn')
  const out = (await $.command.run({ command: 'theme-mod', args: 'neon-noir' } as never)) as { text: string }
  expect(out.text).toContain('no app draws it')
})

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
  expect(source.includes('LAST 2 TURNS · AVG 1')).toBe(true)
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
  expect(await ui.find({ type: 'Text', text: 'Working on it. 1 operation so far this turn.', ...LIVE })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: 'Working on it. 1 operation so far this turn.', ...LIVE })).toBeDefined()
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

test('a faulted tool call is counted and the companion flags it', async ($, on) => {
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
  expect(await ui.find({ type: 'Text', text: /faulted/, ...LIVE })).toBeDefined()
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
  expect(String(((await ui.find({ type: 'Svg' })) as Drawn)?.props.source).includes('LAST 3 TURNS')).toBe(true)
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
  expect(writes).toEqual(['ops'])
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

test('a card reads a few facts off the tool result, and nothing off one it does not know', async () => {
  expect(toolFacts('Bash', { stdout: 'a\nb\nc\n\n', stderr: 'warn\n', interrupted: false })).toEqual(['4 LINES'])
  expect(toolFacts('Bash', { stdout: '', stderr: '', interrupted: false })).toEqual(['NO OUTPUT'])
  expect(toolFacts('PowerShell', { stdout: 'one', stderr: '', interrupted: false })).toEqual(['1 LINE'])
  expect(toolFacts('Bash', { stdout: '', stderr: '', backgroundTaskId: 'b1' })).toEqual(['IN BACKGROUND'])
  expect(toolFacts('Bash', { stdout: 'x', stderr: '', timedOutAfterMs: 120000 })).toEqual(['TIMED OUT', '1 LINE'])
  expect(toolFacts('Read', { type: 'text', file: { numLines: 40, totalLines: 40 } })).toEqual(['40 LINES'])
  expect(toolFacts('Read', { type: 'text', file: { numLines: 40, totalLines: 120 } })).toEqual(['40 OF 120 LINES'])
  expect(toolFacts('Read', { type: 'image', file: {} })).toEqual(['IMAGE'])
  const patch = [{ lines: [' same', '+new', '+newer', '-old'] }, { lines: ['+more'] }]
  expect(toolFacts('Edit', { filePath: 'a.ts', structuredPatch: patch })).toEqual(['+3 −1'])
  expect(toolFacts('Write', { type: 'update', structuredPatch: patch })).toEqual(['+3 −1'])
  expect(toolFacts('Write', { type: 'create', content: 'a\nb\n', structuredPatch: [] })).toEqual(['NEW FILE', '2 LINES'])
  expect(toolFacts('Grep', { mode: 'files_with_matches', numFiles: 3, filenames: [] })).toEqual(['3 FILES'])
  expect(toolFacts('Grep', { mode: 'content', numFiles: 2, numLines: 9 })).toEqual(['9 LINES', '2 FILES'])
  expect(toolFacts('Grep', { mode: 'count', numFiles: 1, numMatches: 1 })).toEqual(['1 MATCH', '1 FILE'])
  expect(toolFacts('Grep', { numFiles: 0, filenames: [] })).toEqual(['NO MATCHES'])
  expect(toolFacts('Glob', { numFiles: 100, truncated: true })).toEqual(['100 FILES+'])
  expect(toolFacts('Glob', { numFiles: 0, truncated: false })).toEqual(['NO FILES'])
  expect(toolFacts('WebFetch', { code: 200, bytes: 5120 })).toEqual(['HTTP 200'])
  // an unknown tool, an error's text, a result still to come, a shape from another build
  expect(toolFacts('mcp__github__create_issue', { id: 7 })).toEqual([])
  expect(toolFacts('Bash', 'command not found')).toEqual([])
  expect(toolFacts('Read', undefined)).toEqual([])
  expect(toolFacts('Read', { type: 'text' })).toEqual([])
  expect(toolFacts('Edit', { structuredPatch: 'nope' })).toEqual([])

  expect(durationLabel(340)).toBe('340ms')
  expect(durationLabel(1234)).toBe('1.2s')
  expect(durationLabel(42_400)).toBe('42s')
  expect(durationLabel(125_000)).toBe('2m 05s')
  expect(toolLabel('mcp__github__create_issue')).toBe('CREATE_ISSUE')
  expect(groupTally(['Read', 'Grep', 'Read', 'Glob', 'Read', 'Grep'])).toBe('3 READ  ·  2 GREP  ·  1 GLOB')
  expect(groupTally(['Read', 'Grep', 'Glob', 'Bash', 'Bash', 'WebFetch'])).toBe('2 BASH  ·  1 READ  ·  1 GREP  ·  +2 MORE')
})

test('a folded run of calls gets one card with the count by tool', async ($, on) => {
  world(on)
  await $.session.start(START)
  const call = (tool: string, isErrored = false, isRunning = false) => ({
    tool, input: {}, isRunning, isErrored, isInterrupted: false,
  })
  const group = (calls: unknown[], isExpanded = false, isActive = false) => ({
    plugin: MOD, component: 'ToolGroup', requestId: 'g1', surface: 'desktop',
    props: { calls, isActive, isExpanded },
  })

  let ui = await $.ui.mount(group([call('Read'), call('Read'), call('Grep')]) as never)
  expect(((await ui.find({ type: 'Box' })) as Drawn)?.props.borderStyle).toBe('round')
  expect(await ui.find({ type: 'Text', text: '◤ 3 OPERATIONS' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  DONE' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  ·  2 READ  ·  1 GREP' })).toBeDefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()

  // failures outrank a call still running
  ui = await $.ui.mount(group([call('Read', true), call('Grep', false, true)], false, true) as never)
  expect(await ui.find({ type: 'Text', text: '  1 FAILED' })).toBeDefined()
  await ui.unmount()
  ui = await $.ui.mount(group([call('Glob', false, true)], false, true) as never)
  expect(await ui.find({ type: 'Text', text: '◤ 1 OPERATION' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '  RUNNING' })).toBeDefined()
  await ui.unmount()

  // unfolded, each call is a row with a card of its own; style off leaves the line alone
  ui = await $.ui.mount(group([call('Read'), call('Grep')], true) as never)
  expect(await ui.find({ type: 'Text', text: /OPERATION/ })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ command: 'theme-mod', args: 'style off' } as never)
  ui = await $.ui.mount(group([call('Read'), call('Grep')]) as never)
  expect(await ui.find({ type: 'Text', text: /OPERATION/ })).toBeUndefined()
  await ui.unmount()
})

test('an interrupted turn gets no stamp', async ($, on) => {
  world(on)
  on('turn.complete', () => ({ text: '' }))
  const done = (await $.turn.complete({
    turnId: 't1', answer: '', durationMs: 5000, isAborted: true, usage: null, reason: 'aborted',
  } as never)) as { text: string }
  expect(done.text).toBe('')
})

test('rows get their tags, keep the app drawing, and style off leaves them alone', async ($, on) => {
  world(on)
  await $.session.start(START)

  const user = {
    plugin: MOD, component: 'UserMessage', requestId: 'u1', surface: 'desktop',
    props: { text: 'hi', origin: { kind: 'composer' }, isExpanded: false },
  }
  const reply = {
    plugin: MOD, component: 'AssistantMessage', requestId: 'a1', surface: 'desktop',
    props: { text: 'hello', isFirstOfReply: true },
  }
  const tool = {
    plugin: MOD, component: 'ToolUse', requestId: 'unknown-call', surface: 'desktop',
    props: { tool: 'mcp__github__create_issue', input: {}, isRunning: true, isErrored: false, isInterrupted: false },
  }

  let ui = await $.ui.mount(user as never)
  expect(await ui.find({ type: 'Text', text: /OPERATOR/ })).toBeDefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()

  ui = await $.ui.mount(reply as never)
  expect(await ui.find({ type: 'Text', text: /CLAUDE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /FABLE-5-2/ })).toBeDefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()

  ui = await $.ui.mount(tool as never)
  expect(await ui.find({ type: 'Text', text: /CREATE_ISSUE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /RUNNING/ })).toBeDefined()
  // a call still running has no time and no result to speak of
  expect(await ui.find({ type: 'Text', text: /  ·  / })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'theme-mod', args: 'style off' } as never)
  for (const target of [user, reply, tool]) {
    ui = await $.ui.mount(target as never)
    expect(await ui.find({ type: 'Text', text: /OPERATOR|CLAUDE|RUNNING/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the question dialog keeps the app dialog under a heading', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({
    plugin: MOD, component: 'AskUserQuestion', requestId: 'q1', surface: 'desktop',
    props: { tool: 'AskUserQuestion', questions: [] },
  } as never)
  expect(await ui.find({ type: 'Text', text: /OPERATOR INPUT REQUIRED/ })).toBeDefined()
  expect(await ui.keepsBeneath()).toBe(true)
  await ui.unmount()
})

test('the working line and the prompt hint keep the app words and gain a lead', async ($, on) => {
  world(on)
  let seen: { word?: string; message?: string | null; suffix?: string; hint?: string } = {}
  on('ui.render', ($, e) => {
    seen = e.props as typeof seen
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const spinner = (word: string, mode: string, message: string | null = null) => ({
    plugin: MOD, component: 'Spinner', requestId: 'main', surface: 'desktop',
    props: { word, message, suffix: '…', mode },
  })

  // the lead says what the turn is doing, and the app's own words follow it
  let ui = await $.ui.mount(spinner('Reading notes.md', 'tool-use') as never)
  expect(seen.word).toBe('OPERATING  ·  Reading notes.md')
  expect(seen.suffix).toContain('0 tool calls')
  await ui.unmount()

  // `Working` says nothing about the step, so the lead stands alone
  ui = await $.ui.mount(spinner('Working', 'thinking') as never)
  expect(seen.word).toBe('REASONING')
  await ui.unmount()

  // an override is the app's to say, and a mode this mod doesn't know gets no lead
  ui = await $.ui.mount(spinner('Writing', 'some-new-mode', 'Compacting conversation') as never)
  expect(seen.word).toBe('Writing')
  expect(seen.message).toBe('Compacting conversation')
  await ui.unmount()

  ui = await $.ui.mount({
    plugin: MOD, component: 'PromptHint', requestId: 'hint', surface: 'desktop',
    props: { isDraft: false, isWorking: false, hint: 'Enter to send' },
  } as never)
  expect(seen.hint).toBe('▸ AWAITING QUERY  ·  Enter to send')
  await ui.unmount()
})

test('the command output draws as a console card', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({
    plugin: MOD, component: 'CommandOutput', requestId: 'c1', surface: 'desktop',
    props: { command: 'theme-mod', args: 'glass clear', text: 'Glass: clear.' },
  } as never)
  expect(await ui.find({ type: 'Text', text: /THEME CONTROL/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Glass: clear.' })).toBeDefined()
  await ui.unmount()
})

test('the control deck switches the look and the glass from its buttons', async ($, on) => {
  const { sets, stored } = world(on, {}, 'drawn')
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start(START)

  const out = (await $.command.run({ command: 'theme-mod', args: 'deck' } as never)) as { text: string }
  expect(out.text).toBe('Control deck opened.')

  const ui = await $.ui.mount({
    plugin: MOD, component: 'Pane', requestId: 'noir-scene', surface: 'desktop',
    props: {
      title: 'Control deck', isFocused: false, bodyColumns: 60, placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 }, view: {},
    },
  } as never)
  expect(await ui.find({ type: 'Svg' })).toBeDefined()

  await ui.press({ key: 'look-acid-rain' })
  expect(stored.preset).toBe('acid-rain')
  expect(sets.at(-1)?.backdrop?.scene).toBe('acid-rain')

  await ui.press({ key: 'glass-solid' })
  expect(stored.glass).toBe('solid')
  expect(sets.at(-1)?.backdrop).toBeUndefined()

  await ui.press({ key: 'rain' })
  expect(stored.rain).toBe(false)
  await ui.press({ key: 'companion' })
  expect(stored['companion.on']).toBe(false)
  await ui.press({ key: 'alerts' })
  expect(stored.alerts).toBe(false)
  await ui.unmount()
})

test('the backdrop draws this mod scene and leaves others alone', async ($, on) => {
  world(on)
  const scene = (id: string, plugin: string) => ({
    plugin: MOD, component: 'Backdrop', requestId: 'backdrop', surface: 'desktop',
    props: { scene: id, plugin, glass: { blur: 12, tint: '#080b12', opacity: 0.68 }, overrideColorScheme: 'dark' },
  })

  for (const id of PRESET_IDS) {
    const ui = await $.ui.mount(scene(id, MOD) as never)
    const svg = (await ui.find({ type: 'Svg' })) as Drawn
    expect(svg?.props.isInteractive).toBe(true)
    // look.md: a bare Svg, sized by the app to its window
    expect(svg?.props.width).toBeUndefined()
    await ui.unmount()
  }

  const theirs = await $.ui.mount(scene('neon-noir', 'someone-else') as never)
  expect(await theirs.find({ type: 'Svg' })).toBeUndefined()
  await theirs.unmount()
})

test('the saved choices come back after /clear', async ($, on) => {
  world(on, { preset: 'acid-rain', band: 'scene', glass: 'clear', companion: 'Vesper' })
  on('classic.SessionStart', () => ({}))

  await $.classic.SessionStart({ source: 'clear' } as never)

  let ui = await $.ui.mount(BAND as never)
  expect(((await ui.find({ type: 'Svg' })) as Drawn)?.props.height).toBe(120)
  await ui.unmount()

  await $.command.run({ command: 'theme-mod', args: 'band console' } as never)
  ui = await $.ui.mount(BAND as never)
  expect(await ui.find({ type: 'Text', text: /VESPER/, ...LIVE })).toBeDefined()
  await ui.unmount()
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
