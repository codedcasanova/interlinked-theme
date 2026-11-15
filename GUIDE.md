# Interlinked: quick guide

## Disclaimer: why Joi's portrait is a drawing

The theme was first built with a real picture as Joi's portrait: a frame from a film, showing a real actress. That picture is **not** in this repository, on purpose.

- **It is not ours to share.** A film frame belongs to the studio that made it. Publishing it here would be handing out someone else's copyrighted work.
- **It shows a real person.** Putting an actress's face on a chatbot companion and distributing it uses her likeness without her say.

So the public version draws its own figure instead: an original hologram, made from scratch for this theme.

You can still give Joi any face you like on your own computer. Run `python tools/make-portrait.py your-picture.png` and reload the theme. Use a picture you have the right to use, and keep it out of anything you publish unless it is yours to share.

Interlinked is an unofficial fan project. It is not affiliated with or endorsed by any film studio or by Anthropic.

## How it works

Everything is controlled by one command, `/theme-mod`, typed in the prompt box of a session in the Claude desktop app's Code tab. Your choices are saved and come back in every session.

## Commands

### See where things stand

| Type this | What happens |
| --- | --- |
| `/theme-mod` | Shows your current settings and the list of commands |

### Change the look

| Type this | What happens |
| --- | --- |
| `/theme-mod neon-noir` | Blue-black night city with cyan and magenta neon. The default |
| `/theme-mod amber-dust` | Scorched orange haze with a blurred sun and drifting dust |
| `/theme-mod acid-rain` | Washed-out green, heavy rain |
| `/theme-mod off` | Turns the whole theme off and returns the app to its normal look |

To turn the theme back on after `off`, type any look, such as `/theme-mod neon-noir`.

### The city behind the conversation

| Type this | What happens |
| --- | --- |
| `/theme-mod glass clear` | The city shows through the panels sharply |
| `/theme-mod glass frost` | The city is blurred behind the panels, so text is easier to read. The default |
| `/theme-mod glass solid` | No city at all. You keep the colors. The lightest on your computer |
| `/theme-mod rain on` | Rain, lights and the hologram move. The default |
| `/theme-mod rain off` | Everything holds still |

### The strip above the prompt box

| Type this | What happens |
| --- | --- |
| `/theme-mod band console` | The command console with gauges and Joi. The default |
| `/theme-mod band rail` | A slim ruler with the counters under it |
| `/theme-mod band scene` | A strip of city skyline |
| `/theme-mod band off` | Nothing above the prompt |

### Joi, the hologram

| Type this | What happens |
| --- | --- |
| `/theme-mod companion on` | Shows her in the console, with her one-line updates |
| `/theme-mod companion off` | Hides her. The gauges stay |
| `/theme-mod companion name Nova` | Renames her. Use any name up to 16 letters |

### The conversation

| Type this | What happens |
| --- | --- |
| `/theme-mod style on` | Adds tags to messages, cards around tool calls, a lead on the working line, and a stamp under each answer. The default |
| `/theme-mod style off` | Leaves the conversation as the app normally draws it |

### The control deck

| Type this | What happens |
| --- | --- |
| `/theme-mod deck` | Opens a side panel with a button for every option above |

## Reading the console

Left to right:

- **Joi.** She says the most important thing about your session in one line, such as a limit running low. The light around her follows the fullest gauge: her own color while there is room, the gauge's warning color from 65 percent, and its alarm color from 85 percent, when she also flickers faster.
- **Context.** How full Claude's memory for this conversation is. The bar shows what is filling it. The line under it shows how it has grown, with an estimate of the turns you have left.
- **Plan limits.** How much of your 5-hour and weekly usage is gone. The small white marker shows how much of that time window has passed. A bar ahead of the marker means you are using it faster than the clock.
- **Tool calls per turn.** One bar for each recent turn. Red means a tool call failed.

Colors mean the same thing everywhere: cyan is fine, amber is filling up, red is nearly out.

While Claude works, the line in the conversation starts with what it is doing: `UPLINK` (sending the request), `REASONING` (thinking), `OPERATING` (running a tool) or `COMPOSING` (writing the reply).

The bottom row counts tool calls, turns, the length of the last turn, failures, and how long the session has run, next to the clock.

The plan limits and the chart are empty in a brand-new session. They fill in after Claude's first reply.

## If something is off

| Problem | Try |
| --- | --- |
| The app feels slow | `/theme-mod glass solid`, or `/theme-mod rain off` |
| Text is hard to read over the city | `/theme-mod glass frost`, or `/theme-mod glass solid` |
| Nothing changed after installing | Start a new session in the Code tab. Type `/status` and check Claude Code is 2.1.325 or later |
| You want it gone for now | `/theme-mod off` |
