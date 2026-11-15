/** The preset showing now, or 'off' when the person turned the theme off. */
export type Current = 'neon-noir' | 'amber-dust' | 'acid-rain' | 'off'

/**
 * What the band above the prompt draws: the command console (gauges, the
 * companion and live readouts), the slim instrument rail, the skyline
 * viewport, or nothing.
 */
export type Band = 'console' | 'rail' | 'scene' | 'off'

/**
 * How much of the city shows through the app's panels: `clear` and `frost`
 * are two strengths of glass over the moving scene, and `solid` keeps the
 * colors and leaves the scene out.
 */
export type Glass = 'clear' | 'frost' | 'solid'

/**
 * How much moves: `full` is everything; `calm` holds the rain, the dust and
 * the searchlights still, the three that redraw the whole window on every
 * frame, and keeps the signs, the craft, the airship and the flames; `off`
 * holds everything still.
 */
export type Motion = 'full' | 'calm' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'interlinked-theme': {
      current: Current
      band: Band
      glass: Glass
      motion: Motion
      /** Readout tags and cards on the conversation's rows. */
      isStyled: boolean
      /** Tool calls seen this session. */
      toolCalls: number
      /** The session's count of tool calls when the turn running now, or the last one, began. */
      turnBase: number
      /** Tool calls that failed this session. */
      failures: number
      /** Whether a tool call failed in the turn running now, or the last one. */
      hadFailure: boolean
      /** Turns of the main conversation seen this session. */
      turns: number
      /** When the turn running now began, in epoch ms; 0 while no turn runs. */
      turnStartedAt: number
      /** How long the last turn ran, in seconds. */
      lastSeconds: number
      /** How full the context window is, 0 to 100. */
      contextPercent: number
      /** The plan limits as JSON: a list of { kind, percentUsed, resetsAt? }. */
      limitsJson: string
      /** When the session started, in epoch ms; 0 when unknown. */
      startedAt: number
      /** The wall clock, in whole minutes since the epoch: the band's tick. */
      minute: number
      /** The session's model id. */
      model: string
      /** The last part of the session's working directory. */
      folder: string
      /** The hologram companion's name. */
      companion: string
      isCompanionOn: boolean
      /** Whether the companion books a notification for the reset of a limit that is running out. */
      isAlertsOn: boolean
      /** The last turns as JSON: a list of { o: tool calls, f: failed, c: context after }. */
      historyJson: string
      /**
       * What the console's drawing shows, as JSON: { context, limits, detail }.
       * Held from one turn's end to the next, so the drawing isn't rebuilt mid-turn.
       */
      consoleJson: string
    }
  }
}
