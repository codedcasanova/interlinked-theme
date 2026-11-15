// What is drawn: the scenes, the console and the companion's figure, as SVG.
// Pure functions, so nothing here needs a session.

import { expect, test } from 'claude-code/testing'

import { consoleSvg, moodOf, textWidth, tokenLabel, turnsOfRoom } from './console'
import type { ConsoleData } from './console'
import { LOOKS } from './looks'
import { PRESETS, PRESET_IDS, railSvg, sceneSvg } from './scenes'
import { SAMPLE, LIMITS } from './test-world'

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
      // nothing runs and nothing links out: a portrait is plain shapes, like the rest
      expect(/<script|\son[a-z]+=|href=/i.test(svg)).toBe(false)
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
  // the limit: used against time gone, when it resets, and how long is left
  expect(svg.includes('>80%<')).toBe(true)
  expect(svg.includes('>· AHEAD OF PACE<')).toBe(true)
  expect(svg.includes('>RESETS 00:30<')).toBe(true)
  expect(svg.includes('>2H 55M LEFT<')).toBe(true)
  // the chart: the turns it covers and the failures in them
  expect(svg.includes('3 TURNS · AVG 7')).toBe(true)
  expect(svg.includes('2 FAILED')).toBe(true)
  // the companion stands in her cell, and can step out. (The picture is
  // named here: a copy of the mod that carries a portrait draws no figure.)
  expect(consoleSvg('neon-noir', SAMPLE, false, '').includes('id="figure"')).toBe(true)
  expect(consoleSvg('neon-noir', { ...SAMPLE, hasCompanion: false }, false, '').includes('id="figure"')).toBe(false)
  // an empty session says so and draws no chart
  const empty = consoleSvg('neon-noir', { ...SAMPLE, limits: [], turns: [], trend: [], parts: [] }, false)
  expect(empty.includes('SHOWS AFTER THE NEXT REPLY')).toBe(true)
  expect(empty.includes('NO TURNS RECORDED YET')).toBe(true)
  expect(tokenLabel(1_200_000)).toBe('1.2M')
  expect(turnsOfRoom([50, 50, 50])).toBeUndefined()
})

test('nothing in the console leaves its cell, however long the readings', async () => {
  // the longest strings each cell can hold
  const worst: ConsoleData = {
    ...SAMPLE,
    context: 100, tokens: 1_000_000,
    parts: [{ name: 'Messages', tokens: 400_000 }, { name: 'Custom agents', tokens: 350_000 }, { name: 'Skills and more', tokens: 250_000 }],
    trend: Array.from({ length: 24 }, (_, i) => 40 + i * 2.6),
    limits: [
      { name: '5-HOUR', percent: 100, elapsed: 0.05, resets: 'WED 23:59', left: '6D 23H' },
      { name: 'SPEND LIMIT', percent: 100, elapsed: 0.05, resets: 'WED 23:59', left: '6D 23H' },
    ],
    turns: Array.from({ length: 24 }, () => ({ calls: 164, failed: 9 })),
  }
  const CELLS = [[106, 332], [352, 550], [570, 742]] as const
  const TEXT = /<text x="([\d.]+)" y="[\d.]+" font-size="([\d.]+)"[^>]*text-anchor="(start|end)"[^>]*?(?: textLength="(\d+)")?[^>]*>([^<]*)</g
  for (const id of PRESET_IDS) {
    for (const data of [SAMPLE, worst]) {
      let count = 0
      for (const [, x, size, anchor, squeezed, body] of consoleSvg(id, data, false, '').matchAll(TEXT)) {
        // a squeezed line is exactly as wide as it was told to be
        const width = squeezed === undefined ? textWidth(body!.replace(/&amp;/g, '&'), Number(size)) : Number(squeezed)
        const from = anchor === 'end' ? Number(x) - width : Number(x)
        const cell = CELLS.find(([left, right]) => from >= left - 0.5 && from <= right)
        expect(cell).toBeDefined()
        expect(from + width <= cell![1] + 0.5).toBe(true)
        count += 1
      }
      expect(count > 12).toBe(true)
    }
  }
  // the cells' closing notes share one baseline, and their headings another
  const svg = consoleSvg('neon-noir', worst, false, '')
  for (const foot of ['CONTEXT OVER THE LAST 24 TURNS', 'RESETS WED 23:59', '24 TURNS · AVG 164']) {
    expect(new RegExp(`y="122"[^>]*>${foot}<`).test(svg)).toBe(true)
  }
  for (const head of ['CONTEXT', 'PLAN LIMITS', 'TOOL CALLS PER TURN']) {
    expect(new RegExp(`y="18"[^>]*>${head}<`).test(svg)).toBe(true)
  }
  // the legend names what fits and stops: the third part is in the bar only
  expect(svg.includes('>AGENTS 35%<')).toBe(true)
  expect(svg.includes('SKILLS')).toBe(false)
  // the small print is 9px at 72 percent or more
  expect(/font-size="8"|fill-opacity="0\.(4|5)\d*"/.test(svg)).toBe(false)
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
  // the portrait stands in the figure's place: nothing is drawn or animated beneath it
  expect(framed.includes('id="figure"')).toBe(false)
  expect(framed.includes('url(#slice)')).toBe(false)
  expect(framed.includes('id="frame"')).toBe(true)
  expect(framed.includes('rx="5" fill="none" stroke="#ff4d5e" stroke-width="2" opacity="1"')).toBe(true)
  expect(draw(42, 30, true, picture).includes('rx="5" fill="none" stroke="#ff3da6" stroke-width="1.2" opacity="0.75"')).toBe(true)
  for (const id of PRESET_IDS) {
    expect(consoleSvg(id, { ...SAMPLE, limits: [limit(93), limit(71)] }, true, picture).length < 131072).toBe(true)
  }
})

test('a gauge has three colors no one could confuse, in every look', async () => {
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
  const apart = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!))
  for (const id of PRESET_IDS) {
    const { calm, warn, alert, you } = PRESETS[id].hud
    // room, filling up, nearly out: far apart from each other
    expect(apart(calm, warn) > 90).toBe(true)
    expect(apart(warn, alert) > 85).toBe(true)
    expect(apart(calm, alert) > 130).toBe(true)
    // and the companion's own tint is not the warning color
    expect(apart(you, warn) > 60).toBe(true)
  }
  // the gauges and the companion's light take them
  const at = (id: 'amber-dust' | 'acid-rain', context: number) =>
    consoleSvg(id, { ...SAMPLE, context, limits: [] }, false, '')
  expect(at('amber-dust', 30).includes('fill="#9bbf4a" fill-opacity="1" filter="url(#lamp)">30%<')).toBe(true)
  expect(at('amber-dust', 70).includes('fill="#ffc247" fill-opacity="1" filter="url(#lamp)">70%<')).toBe(true)
  expect(at('acid-rain', 70).includes('fill="#ff9d2e" fill-opacity="1" filter="url(#lamp)">70%<')).toBe(true)
  expect(at('acid-rain', 70).includes('fill="none" stroke="#ff9d2e"')).toBe(true)
  expect(at('acid-rain', 90).includes('fill="#ff5d6c" fill-opacity="1" filter="url(#lamp)">90%<')).toBe(true)
})

test('every look has colors the desktop will paint', async () => {
  for (const id of PRESET_IDS) {
    expect(LOOKS[id].colors).toBeDefined()
    expect(LOOKS[id].unpainted).toBeUndefined()
  }
})
