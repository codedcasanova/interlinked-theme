// /theme-mod and the control deck: looks, glass, motion, and what is saved.

import { expect, test } from 'claude-code/testing'

import type { Limit } from './companion'
import { once } from './readings'
import { PRESET_IDS, sceneSvg } from './scenes'
import { MOD, LIMITS, world, START, BAND, LIVE } from './test-world'
import type { Drawn } from './test-world'

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
  // each look's glass is as heavy as its city needs for the words to stay readable
  expect(sets.at(-1)?.backdrop?.glass).toEqual({ blur: 3, opacity: 0.75, tint: '#140c06' })
  await run('glass frost')
  expect(sets.at(-1)?.backdrop?.glass).toEqual({ blur: 12, opacity: 0.74, tint: '#140c06' })
  await run('neon-noir')
  expect(sets.at(-1)?.backdrop?.glass).toEqual({ blur: 12, opacity: 0.68, tint: '#080b12' })
  await run('glass clear')
  expect(sets.at(-1)?.backdrop?.glass).toEqual({ blur: 3, opacity: 0.6, tint: '#080b12' })
  await run('amber-dust')
  // Amber Dust's sun sits low and to the right, out from under the conversation
  expect(sceneSvg('amber-dust', 'full', false).includes('<circle cx="1498" cy="760" r="170" fill="#ffe0a3" opacity="0.7"')).toBe(true)

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

  await ui.press({ key: 'motion-calm' })
  expect(stored.motion).toBe('calm')
  await ui.press({ key: 'motion-off' })
  expect(stored.motion).toBe('off')
  // the older on-or-off key is kept in step, for a copy of the mod that still reads it
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

test('motion has three levels, and reads what an older version stored', async ($, on) => {
  // calm holds the weather and the searchlights still and keeps the rest moving
  for (const id of PRESET_IDS) {
    const calm = sceneSvg(id, 'full', 'calm')
    expect(calm.includes('patternTransform')).toBe(false)
    expect(calm.includes('type="rotate"')).toBe(false)
    expect(calm.includes('<animateMotion')).toBe(true)
    expect(calm.length < 131072).toBe(true)
    // the older flag still names the two ends
    expect(sceneSvg(id, 'full', true)).toBe(sceneSvg(id, 'full', 'full'))
    expect(sceneSvg(id, 'full', false)).toBe(sceneSvg(id, 'full', 'off'))
    expect(sceneSvg(id, 'full', 'full').includes('type="rotate"')).toBe(true)
  }
  // a rainy look keeps its rain as a still picture
  expect(sceneSvg('neon-noir', 'full', 'full').includes('id="rainFar"')).toBe(true)
  expect(sceneSvg('neon-noir', 'full', 'calm').includes('stroke-linecap="round" opacity="0.22"')).toBe(true)

  const { stored } = world(on, { rain: false })
  on('classic.SessionStart', () => ({}))
  const run = (args: string) => $.command.run({ command: 'theme-mod', args } as never) as Promise<{ text: string }>
  const backdrop = {
    plugin: MOD, component: 'Backdrop', requestId: 'backdrop', surface: 'desktop',
    props: { scene: 'neon-noir', plugin: MOD, glass: { blur: 12, tint: '#080b12', opacity: 0.68 }, overrideColorScheme: 'dark' },
  }
  const drawn = async () => {
    const ui = await $.ui.mount(backdrop as never)
    const svg = (await ui.find({ type: 'Svg' })) as Drawn
    await ui.unmount()
    return svg?.props
  }

  // an older version stored motion as on or off
  await $.session.start(START)
  expect((await run('status')).text).toContain('MOTION off')
  expect((await drawn())?.isInteractive).toBeUndefined()

  expect((await run('motion calm')).text).toContain('Motion calm')
  expect(stored.motion).toBe('calm')
  expect(stored.rain).toBe(true)
  expect((await drawn())?.source).toBe(sceneSvg('neon-noir', 'full', 'calm'))
  expect((await drawn())?.isInteractive).toBe(true)

  // the older command still works, and names the two ends
  await run('rain on')
  expect(stored.motion).toBe('full')
  await run('rain off')
  expect(stored.motion).toBe('off')
  expect((await run('motion sideways')).text).toContain('Usage: /theme-mod motion full|calm|off')

  // the level comes back after /clear
  stored.motion = 'calm'
  await $.classic.SessionStart({ source: 'clear' } as never)
  expect((await run('status')).text).toContain('MOTION calm')
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

test('a band setting from an earlier version is read as the nearest choice', async ($, on) => {
  const { stored } = world(on, { band: false })
  on('classic.SessionStart', () => ({}))
  const status = async () => ((await $.command.run({ command: 'theme-mod', args: 'status' } as never)) as { text: string }).text

  // an earlier version stored the band as on or off, and later as a size
  await $.session.start(START)
  expect(await status()).toContain('BAND   off')
  stored.band = 'large'
  await $.classic.SessionStart({ source: 'clear' } as never)
  expect(await status()).toContain('BAND   console')
  stored.band = 'rail'
  await $.classic.SessionStart({ source: 'clear' } as never)
  expect(await status()).toContain('BAND   rail')
})

test('an older build is told once that the mod was made for a later one', async ($, on) => {
  const session: { now: Limit[]; version?: string } = { now: LIMITS, version: '2.1.200' }
  const { toasts } = world(on, {}, 'undrawn', session)
  await $.session.start(START)
  expect(toasts.filter(text => text.includes('made for Claude Code 2.1.325')).length).toBe(1)

  toasts.length = 0
  session.version = '2.1.325'
  await $.session.start(START)
  expect(toasts.length).toBe(0)
})
