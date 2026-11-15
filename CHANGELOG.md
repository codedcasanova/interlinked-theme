# Changelog

## 1.1.0

Made on Claude Code 2.1.325 with Claude Desktop 5.11492.5, on Windows.

### New

- **The working line says what Claude is doing.** It leads with `UPLINK`, `REASONING`, `OPERATING` or `COMPOSING`, and keeps the app's own words after it.
- **Joi has moods.** The light around her takes the color of the fullest gauge, and she flickers faster as it nears full.
- **Tool cards say what happened.** A finished call adds how long it ran and what came back: lines of output, lines read, lines added and removed, files and matches found. A run of calls the app folds into one line gets one card.
- **Joi's row is live.** Her line is typed out, beside a clock that counts seconds and a timer for the running turn.
- **A notification when a limit resets.** When a plan limit passes 80 percent, one notification is booked for the moment it resets. `/theme-mod alerts on|off`.
- **Three motion levels.** `/theme-mod motion full|calm|off`. `calm` holds the rain, the dust and the searchlights still and keeps the rest moving. `rain on|off` still works.

### Changed

- **The console holds its figures during a turn** and takes the new ones when it ends. A reading mid-turn used to change the drawing, which restarted its animation. Joi's row and the counters stay live.
- **The console's layout.** One grid for its three cells, larger small print, and no text past its cell: the limit's long line is split up, and the legend names what fits.
- **Glass is as heavy as each city needs.** Clear glass is more opaque (0.60, from 0.42), where primary text holds 4.5:1 everywhere. Amber Dust has heavier glass, and its sun sits low on the right, out from under the conversation.
- **Gauge colors are distinct in every look.** Amber Dust is olive, amber and red; Acid Rain is green, orange and red. Neon Noir is unchanged.
- **Words.** The companion says "tool calls" and "failed", as the readouts do.

### Less work

- A usage reading takes its figures from the event and writes only what changed. It used to fetch usage, the model and the folder, and write six values each time.
- A tool call makes one state write, started while the tool runs. It made two before the tool could start.
- With a portrait, the drawn figure is left out. It used to animate underneath.
- The flare stacks' glow is a gradient with no blur filter.
- With the theme off, the mod's timer and readings do nothing.

### Under the hood

- Failures the mod carries on from are noted in the debug log (`claude --debug`), not swallowed.
- On a build older than 2.1.325, a toast says so once.
- Tests are split by subject into five files, 38 in all.

## 1.0.0

The first release: the app's colors, the moving city, the command console, the companion, the restyled conversation and the control deck, in three looks.
