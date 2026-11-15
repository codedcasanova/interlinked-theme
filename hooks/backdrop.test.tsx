import { expect, mock, test } from 'claude-code/testing'

import { cleanName, clockLabel, companionLine, limitLabel, parseLimits, uptimeLabel } from './companion'
import type { Vitals } from './companion'
import { consoleSvg, tokenLabel, turnsOfRoom } from './console'
import type { ConsoleData } from './console'
import { LOOKS } from './looks'
import { PRESET_IDS, railSvg, sceneSvg } from './scenes'

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

/**
 * The stubs most tests need: a store backed by `stored`, a theme that records
 * each set and answers as `theme` says, a clock, and the session's readouts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function world(on: any, stored: Stored = {}, theme: 'drawn' | 'undrawn' | 'refused' = 'undrawn') {
  const sets: SetCall[] = []
  const calls: string[] = []
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
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 102 * 60_000,
      context: { window: 200000, percent: 43 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 12 }, { kind: 'seven_day', percentUsed: 71.5 }],
    },
  }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
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
  return { sets, calls, stored, wasStarted: () => wasStarted }
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
  expect(await ui.find({ type: 'Text', text: /JOI/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Good evening. 3 turns in, context at 43 percent. All quiet.' })).toBeDefined()
  // the live row: uptime, folder and clock
  expect(await ui.find({ type: 'Text', text: '01:42   ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '21:17  FRI 13 NOV' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '○ STANDBY' })).toBeDefined()
  await ui.unmount()

  const run = (args: string) => $.command.run({ command: 'theme-mod', args } as never)
  await run('band rail')
  expect(stored.band).toBe('rail')
  ui = await $.ui.mount(BAND as never)
  expect(((await ui.find({ type: 'Svg' })) as Drawn)?.props.height).toBe(26)
  expect(await ui.find({ type: 'Text', text: /JOI/ })).toBeUndefined()
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
  expect(await ui.find({ type: 'Text', text: /VESPER/ })).toBeDefined()
  await ui.unmount()

  expect((await run('companion off')).text).toContain('VESPER has stepped out')
  ui = await $.ui.mount(BAND as never)
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
  expect(await ui.find({ type: 'Text', text: 'Working on it. 1 operation so far this turn.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● ACTIVE' })).toBeDefined()
  await ui.unmount()
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
  expect(await ui.find({ type: 'Text', text: /faulted/ })).toBeDefined()
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
    props: { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  expect(((await card.find({ type: 'Box' })) as Drawn)?.props.borderStyle).toBe('round')
  expect(await card.find({ type: 'Text', text: /READ/ })).toBeDefined()
  expect(await card.find({ type: 'Text', text: /#0002/ })).toBeDefined()
  expect(await card.find({ type: 'Text', text: /DONE/ })).toBeDefined()
  expect(await card.keepsBeneath()).toBe(true)
  await card.unmount()
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
  let seen: { suffix?: string; hint?: string } = {}
  on('ui.render', ($, e) => {
    seen = e.props as { suffix?: string; hint?: string }
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  let ui = await $.ui.mount({
    plugin: MOD, component: 'Spinner', requestId: 'main', surface: 'desktop',
    props: { word: 'Reading notes.md', message: null, suffix: '…', mode: 'tool-use' },
  } as never)
  expect(seen.suffix).toContain('0 tool calls')
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
  expect(await ui.find({ type: 'Text', text: /VESPER/ })).toBeDefined()
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
