// How readings are stored, read back and worded: the companion's lines, the
// readout labels, a tool card's facts. Pure functions.

import { expect, test } from 'claude-code/testing'

import { cleanName, clockLabel, companionLine, parseLimits, uptimeLabel } from './companion'
import { isOlder, limitRow, once, parseHeld, parseHistory, spanLabel, unitLabel, workingWord } from './readings'
import { durationLabel, groupTally, toolFacts, toolLabel } from './tools'
import { NOW, VITALS } from './test-world'

test('the companion says the most pressing true thing', async () => {
  expect(companionLine({ ...VITALS, isWorking: true, turnCalls: 3 })).toBe('Working on it. 3 tool calls so far this turn.')
  expect(companionLine({ ...VITALS, hadFailure: true })).toContain('failed')
  expect(companionLine({ ...VITALS, context: 91 })).toContain('/compact')
  expect(
    companionLine({ ...VITALS, limits: [{ kind: 'five_hour', percentUsed: 88, resetsAt: new Date(NOW + 3_600_000).toISOString() }] }),
  ).toBe('You have used 88 percent of your five-hour limit. It resets at 22:17.')
  expect(companionLine({ ...VITALS, lastSeconds: 840 })).toContain('14 minutes')
  expect(companionLine({ ...VITALS, context: 70 })).toContain('70 percent')
  expect(companionLine({ ...VITALS, turns: 0 })).toBe('Good evening. All systems nominal. What are we working on?')
  expect(companionLine(VITALS)).toBe('Good evening. 4 turns in, context at 20 percent. All quiet.')
  // a context about to run out outranks a failure, and working outranks both
  expect(companionLine({ ...VITALS, hadFailure: true, context: 95 })).toContain('/compact')
  expect(companionLine({ ...VITALS, hadFailure: true, context: 95, isWorking: true })).toBe('Working on it.')
})

test('the readout helpers format the way the console shows them', async () => {
  expect(clockLabel(NOW)).toBe('21:17  FRI 13 NOV')
  expect(uptimeLabel(NOW - 102 * 60_000, NOW)).toBe('01:42')
  expect(uptimeLabel(0, NOW)).toBe('--:--')
  expect(parseLimits('not json')).toEqual([])
  expect(parseLimits('[{"kind":"seven_day","percentUsed":7},{"nope":1}]')).toEqual([{ kind: 'seven_day', percentUsed: 7 }])
  expect(cleanName('  vesper <b>9  ')).toBe('VESPER B9')
  expect(cleanName('!!!')).toBe('JOI')
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

test('a plan limit is worded for its row, and a span of time for a readout', async () => {
  expect(spanLabel(45 * 60_000)).toBe('45M')
  expect(spanLabel(175 * 60_000)).toBe('2H 55M')
  expect(spanLabel((2 * 1440 + 11 * 60) * 60_000)).toBe('2D 11H')
  expect(spanLabel(-5)).toBe('0M')

  // the five-hour limit, 3 hours from its reset: 40 percent of its window is gone
  const soon = limitRow({ kind: 'five_hour', percentUsed: 80, resetsAt: new Date(NOW + 3 * 3_600_000).toISOString() }, NOW)
  expect(soon.name).toBe('5-HOUR')
  expect(soon.percent).toBe(80)
  expect(Math.abs((soon.elapsed ?? 0) - 0.4) < 1e-9).toBe(true)
  expect(soon.resets).toBe('00:17')
  expect(soon.left).toBe('3H 0M')
  // the weekly limit, more than a day out: the reset names its day
  const week = limitRow({ kind: 'seven_day', percentUsed: 36, resetsAt: new Date(NOW + 60 * 3_600_000).toISOString() }, NOW)
  expect(week.name).toBe('WEEKLY')
  expect(week.resets).toBe('MON 09:17')
  expect(week.left).toBe('2D 12H')
  // a limit this mod has no name for, and one with no reset
  expect(limitRow({ kind: 'spend_limit', percentUsed: 5 }, NOW)).toEqual({
    name: 'SPEND LIMIT', percent: 5, elapsed: null, resets: '', left: '',
  })
  // with no clock there is nothing to count from
  expect(limitRow({ kind: 'five_hour', percentUsed: 80, resetsAt: new Date(NOW).toISOString() }, 0).resets).toBe('')
})

test('stored readings survive being read back, whatever was stored', async () => {
  expect(parseHistory('[{"o":3,"f":1,"c":40},{"o":"x"},7,null]')).toEqual([{ o: 3, f: 1, c: 40 }])
  expect(parseHistory('not json')).toEqual([])
  expect(parseHistory('{"o":1}')).toEqual([])
  const empty = { context: 0, limits: [], detail: { tokens: 0, window: 0, parts: [], reserve: 0 } }
  expect(parseHeld('{}')).toEqual(empty)
  expect(parseHeld('garbage')).toEqual(empty)
  expect(parseHeld('null')).toEqual(empty)
  expect(parseHeld(JSON.stringify({
    context: 43, limits: [{ kind: 'five_hour', percentUsed: 12 }, { nope: 1 }],
    detail: { tokens: 86000, window: 200000, parts: [{ name: 'Messages', tokens: 80000 }, { name: 7 }], reserve: 'x' },
  }))).toEqual({
    context: 43, limits: [{ kind: 'five_hour', percentUsed: 12 }],
    detail: { tokens: 86000, window: 200000, parts: [{ name: 'Messages', tokens: 80000 }], reserve: 0 },
  })

  // a stored string is parsed once, however often it is read
  let parses = 0
  const read = once((text: string) => {
    parses += 1
    return text.length
  })
  expect([read('abc'), read('abc'), read('abcd'), read('abcd')]).toEqual([3, 3, 4, 4])
  expect(parses).toBe(2)
})

test('versions compare part by part, and a model id reads as a unit', async () => {
  expect(isOlder('2.1.99', '2.1.325')).toBe(true)
  expect(isOlder('2.1.325', '2.1.325')).toBe(false)
  expect(isOlder('2.2.0', '2.1.325')).toBe(false)
  expect(isOlder('2.1', '2.1.325')).toBe(true)
  expect(isOlder('2.1.325-beta.2', '2.1.325')).toBe(false)
  expect(unitLabel('claude-fable-5-2[1m]')).toBe('FABLE-5-2')
  expect(workingWord('thinking', 'Working')).toBe('REASONING')
  expect(workingWord('responding', '  ')).toBe('COMPOSING')
  expect(workingWord('tool-use', 'Creating notes.md')).toBe('OPERATING  ·  Creating notes.md')
  expect(workingWord('some-new-mode', 'Creating notes.md')).toBe('Creating notes.md')
})
