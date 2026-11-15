// The conversation's rows: tags, tool cards, the working line and the hints.

import { expect, test } from 'claude-code/testing'

import { MOD, world, START } from './test-world'
import type { Drawn } from './test-world'

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

test('the prompt hint says what the line is waiting for', async ($, on) => {
  world(on)
  let hint = ''
  on('ui.render', ($, e) => {
    hint = String((e.props as { hint?: string }).hint)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const at = async (props: { isDraft: boolean; isWorking: boolean; hint: string }) => {
    const ui = await $.ui.mount({ plugin: MOD, component: 'PromptHint', requestId: 'hint', surface: 'desktop', props } as never)
    await ui.unmount()
    return hint
  }
  expect(await at({ isDraft: false, isWorking: false, hint: 'Enter to send' })).toBe('▸ AWAITING QUERY  ·  Enter to send')
  expect(await at({ isDraft: true, isWorking: false, hint: 'Enter to send' })).toBe('▸ QUERY READY  ·  Enter to send')
  expect(await at({ isDraft: true, isWorking: true, hint: 'esc to interrupt' })).toBe('▸ TRANSMITTING  ·  esc to interrupt')
  // an empty hint is the app's to leave empty, and style off leaves the words alone
  expect(await at({ isDraft: false, isWorking: false, hint: '' })).toBe('')
  await $.command.run({ command: 'theme-mod', args: 'style off' } as never)
  expect(await at({ isDraft: false, isWorking: false, hint: 'Enter to send' })).toBe('Enter to send')
})
