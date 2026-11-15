// The app's own colors for each preset: every surface, word and line of the
// Code tab. Each is built from a few anchors by the design system's own
// `makeColors` (make-colors.js, copied from the plugin-authoring skill and
// left as it is). These are night scenes, so each look is dark only.
//
// Checked offline with makeColors: no line starts "Desktop won't paint this
// theme" for any of the three. The lines that remain are border contrasts a
// few hundredths under the design system's own bar, which still paint.

import type { ThemeColors } from 'claude-code'

import { makeColors } from './make-colors.js'
import type { PresetId } from './scenes'

type Definition = Parameters<typeof makeColors>[0]

const DEFINITIONS: Record<PresetId, Definition> = {
  // Blue-black shadows, warm paper-white type, cyan for what you can press.
  'neon-noir': {
    label: 'Neon Noir',
    only: 'dark',
    contrast: 'more',
    roles: { accent: '#2de2e6', danger: '#ff4d5e', success: '#3ddc97', warning: '#ffb000', pro: '#ff3da6' },
    dark: {
      gray: {
        anchors: {
          'surface-0': '#080b12',
          'surface-1': '#0d121b',
          'surface-2': '#121824',
          'surface-3': '#161d2a',
          'text-primary': '#f1e6d0',
          'text-secondary': '#cdbfa3',
          'text-muted': '#9d927d',
        },
      },
      git: { added: '#3ddc97', removed: '#ff4d5e', modified: '#ffb000' },
    },
  },
  // Scorched umber, bone type, a furnace orange.
  'amber-dust': {
    label: 'Amber Dust',
    only: 'dark',
    contrast: 'more',
    roles: { accent: '#ff8a2a', danger: '#e5484d', success: '#9bbf4a', warning: '#f2c230', pro: '#d97bb0' },
    dark: {
      gray: {
        anchors: {
          'surface-0': '#140c06',
          'surface-1': '#1a1109',
          'surface-2': '#21160c',
          'surface-3': '#261a0f',
          'text-primary': '#f6e3c3',
          'text-secondary': '#d6bd94',
          'text-muted': '#a9916c',
        },
      },
      git: { added: '#9bbf4a', removed: '#e5484d', modified: '#f2c230' },
    },
  },
  // A washed-out green tube: near-black teal, pale mint type.
  'acid-rain': {
    label: 'Acid Rain',
    only: 'dark',
    contrast: 'more',
    roles: { accent: '#35e0a1', danger: '#ff5d6c', success: '#7ddc5a', warning: '#e6d04a', pro: '#5cc8ff' },
    dark: {
      gray: {
        anchors: {
          'surface-0': '#060d0c',
          'surface-1': '#0a1412',
          'surface-2': '#0e1a17',
          'surface-3': '#111f1c',
          'text-primary': '#d6f2e4',
          'text-secondary': '#a5cdbb',
          'text-muted': '#7ba393',
        },
      },
      git: { added: '#7ddc5a', removed: '#ff5d6c', modified: '#e6d04a' },
    },
  },
}

/**
 * How strongly each look's glass veils its city, as the opacity of the page
 * color laid over it: `clear` under a light blur, `frost` under a heavy one.
 *
 * Set by measurement, not by eye. Each city was rendered with its flames at
 * the height of a burn, the glass laid over it, and the look's text colors
 * measured against every pixel of the reading area. These are the lightest
 * veils under which primary text holds 4.5:1 everywhere and muted text holds
 * it over at least 95% of the area. Amber Dust is a bright scene throughout,
 * so its veils are heavier, and its clear and frost differ mostly in blur.
 */
const VEILS: Record<PresetId, { clear: number; frost: number }> = {
  'neon-noir': { clear: 0.6, frost: 0.68 },
  'amber-dust': { clear: 0.75, frost: 0.74 },
  'acid-rain': { clear: 0.6, frost: 0.68 },
}

export type Look = {
  /** The palette, or undefined when makeColors refused the definition. */
  colors: ThemeColors | undefined
  /** The page color, which also tints the glass over the scene. */
  surface: string
  /** The glass's opacity over this look's city, for each strength. */
  veil: { clear: number; frost: number }
  /** The line that would stop Desktop painting this look, if there is one. */
  unpainted: string | undefined
}

function build(id: PresetId): Look {
  const definition = DEFINITIONS[id]
  const surface = definition.dark?.gray?.anchors?.['surface-0'] ?? '#080b12'
  try {
    const { theme, problems } = makeColors(definition)
    return {
      colors: theme,
      surface,
      veil: VEILS[id],
      unpainted: problems.find(line => line.startsWith("Desktop won't paint")),
    }
  } catch (err) {
    // A look without colors still has its scene, band and rows.
    return { colors: undefined, surface, veil: VEILS[id], unpainted: err instanceof Error ? err.message : String(err) }
  }
}

export const LOOKS: Record<PresetId, Look> = {
  'neon-noir': build('neon-noir'),
  'amber-dust': build('amber-dust'),
  'acid-rain': build('acid-rain'),
}
