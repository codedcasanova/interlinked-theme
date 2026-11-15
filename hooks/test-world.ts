// What the tests share: sample readings, the stubs a session needs, and the
// shapes they read back. Not a test file itself.

import { mock } from 'claude-code/testing'

import type { Limit, Vitals } from './companion'
import type { ConsoleData } from './console'

export const MOD = 'interlinked-theme'
/** Friday 13 November 2026, 21:17 Pacific. */
export const NOW = 1794633420000

/** A console with every cell filled, as a long session would have it. */
export const SAMPLE: ConsoleData = {
  context: 64, tokens: 642600, window: 1000000, reserve: 33000,
  parts: [{ name: 'Messages', tokens: 578600 }, { name: 'System tools', tokens: 22500 }, { name: 'MCP tools', tokens: 18300 }],
  trend: [40, 46, 52, 58, 64],
  limits: [{ name: '5-HOUR', percent: 80, elapsed: 0.42, resets: '00:30', left: '2H 55M' }],
  turns: [{ calls: 3, failed: 0 }, { calls: 12, failed: 2 }, { calls: 5, failed: 0 }],
  hasCompanion: true,
  ground: '#080b12',
}

export type Stored = Record<string, unknown>
export type SetCall = { backdrop?: { scene?: string; glass?: unknown }; colors?: unknown; overrideColorScheme?: string }
export type Note = { text: string; title?: string; key?: string; at?: number }

/** The plan limits a session reports unless a test says otherwise: neither is running out. */
export const LIMITS: Limit[] = [{ kind: 'five_hour', percentUsed: 12 }, { kind: 'seven_day', percentUsed: 71.5 }]

/**
 * The stubs most tests need: a store backed by `stored`, a theme that records
 * each set and answers as `theme` says, a clock, and the session's readouts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function world(
  on: any,
  stored: Stored = {},
  theme: 'drawn' | 'undrawn' | 'refused' = 'undrawn',
  limits: {
    now: Limit[]
    surfaces?: string[]
    percent?: number
    version?: string
    /** The session answers no usage at all, as an older build might. */
    isUsageDown?: boolean
    /** The transcript is empty. */
    isEmpty?: boolean
  } = { now: LIMITS },
) {
  const sets: SetCall[] = []
  const calls: string[] = []
  const notes: Note[] = []
  const cancels: string[] = []
  const toasts: string[] = []
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
  on('ui.toast', (_: unknown, e: unknown) => {
    toasts.push(typeof e === 'string' ? e : String((e as { text?: string }).text))
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', (_: unknown, e: Note) => {
    notes.push(e)
    return { value: { isSent: true, channel: 'client' } }
  })
  on('ui.cancelNotify', (_: unknown, e: unknown) => {
    cancels.push(typeof e === 'string' ? e : String((e as { key?: string }).key))
    return { value: { isSent: true } }
  })
  on('session.usage', () => limits.isUsageDown ? { deny: 'no usage on this build' } : ({
    value: {
      startedAt: NOW - 102 * 60_000,
      context: { window: 200000, percent: limits.percent ?? 43 },
      rateLimits: limits.now,
    },
  }))
  on('session.model', () => ({ value: 'claude-fable-5-2' }))
  on('session.version', () => ({ value: { version: limits.version ?? '2.1.325' } }))
  on('session.surfaces', () => ({ value: limits.surfaces ?? ['desktop'] }))
  on('session.turns', () => ({ value: 3 }))
  on('session.cwd', () => ({ value: 'C:\\work\\night-shift' }))
  on('session.messages', () => limits.isEmpty ? { value: [] } : ({
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
  return { sets, calls, stored, notes, cancels, toasts, wasStarted: () => wasStarted }
}

export const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const

export const BAND = {
  plugin: MOD,
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'desktop',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

export type Drawn = { props: Record<string, unknown> } | undefined

/** The companion's row is a surface module, keyed `live`: look inside it. */
export const LIVE = { in: 'live' } as const
/** Long enough for the live row to finish typing any line. */
export const TYPED = 4000

/** Moves a drawing's frame clock on. The mounts here are cast, which hides the acts a `Client` adds. */
export const advance = (ui: unknown, ms: number) => (ui as { advance: (ms: number) => Promise<void> }).advance(ms)

/** `$.tool.call` without its input and result types: with many MCP tools connected they are too deep to check. */
export type Loose = { tool: { call: (input: unknown) => Promise<unknown> } }

export const VITALS: Vitals = {
  isWorking: false, turnCalls: 0, hadFailure: false, context: 20, limits: [], lastSeconds: 12, turns: 4, now: NOW,
}
