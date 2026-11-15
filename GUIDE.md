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
| `/theme-mod glass clear` | The city shows through the panels sharply, behind a veil just heavy enough to keep the words readable |
| `/theme-mod glass frost` | The city is blurred behind the panels. The default |
| `/theme-mod glass solid` | No city at all. You keep the colors. The lightest on your computer |
| `/theme-mod motion full` | Rain, lights and the hologram move, and Joi's row ticks. The default |
| `/theme-mod motion calm` | The rain, the dust and the searchlights hold still. Signs, flying craft, the airship and the flames still move |
| `/theme-mod motion off` | Everything holds still |

`/theme-mod rain on` and `rain off` are the older names for `motion full` and `motion off`, and still work.

Each look's glass is as heavy as its city needs for the words to stay readable. Amber Dust is the brightest city, so its `clear` and `frost` are about equally heavy and differ in how sharp the city looks.

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
| `/theme-mod alerts on` | When a plan limit passes 80 percent, books one notification for the moment it resets. The default |
| `/theme-mod alerts off` | Books no notifications, and takes back any already booked |

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
- **Context.** How full Claude's memory for this conversation is. Beside the figure is an estimate of the turns you have left at the current rate. The bar shows what is filling it, with the biggest parts named under it. The line at the bottom shows how it has grown.
- **Plan limits.** How much of your 5-hour and weekly usage is gone. The small white marker shows how much of that time window has passed. A bar ahead of the marker means you are using it faster than the clock, and the words beside the limit's name say so: ahead of pace, on pace or under pace. Under each bar is when it resets and how long is left.
- **Tool calls per turn.** One bar for each recent turn. Red means a tool call failed.

A gauge's color says how full it is, and red always means nearly out:

| Look | Room to work | Filling up (from 65%) | Nearly out (from 85%) |
| --- | --- | --- | --- |
| Neon Noir | cyan | amber | red |
| Amber Dust | olive green | amber | red |
| Acid Rain | green | orange | red |

The gauges hold their figures while a turn runs and take the new ones when it ends, so the console's animation is never interrupted. Joi's line and the counters under the gauges stay live throughout.

Under the gauges, Joi's line is typed out as she says it. At the right of that row is the time to the second and, while Claude works, `TURN` with how long the turn has run so far.

The bottom row counts tool calls, turns, the length of the last turn, failures, and how long the session has run, next to the date. With Joi hidden, or a band other than the console, the bottom row shows the time as well.

With `/theme-mod motion off` Joi's row holds still too: her line appears whole, and the clock moves to the bottom row and shows minutes.

The plan limits and the chart are empty in a brand-new session. They fill in after Claude's first reply.

## Reading the conversation

- **The working line.** While Claude works, the line starts with what it is doing: `UPLINK` (sending the request), `REASONING` (thinking), `OPERATING` (running a tool) or `COMPOSING` (writing the reply).
- **Tool cards.** Each tool call sits in a card. Its top line has the tool, the call's number in the session and its state. Once the call is over it adds how long it ran and what came back: lines of output for a command, lines read from a file, lines added and removed by an edit (`+12 −3`), or files and matches found by a search.
- **Folded calls.** When the app folds several calls into one line, that line gets one card with the count by tool.
- **The stamp.** Under each answer: how long the turn took, how many tool calls it made, and the context used.

`/theme-mod style off` removes all of these.

## The limit-reset notification

When your 5-hour or weekly limit passes 80 percent, Joi books one notification with the app for the moment that limit resets. It arrives as a normal desktop notification, with her name on it, and says the limit is open again. The app holds it, so it arrives even if the session has ended by then.

There is one per limit, never a stream: a newer reading replaces the one already booked. `/theme-mod alerts off` and `/theme-mod off` both take it back. It follows your system's and the app's own notification settings. Only a session in the app books one: a terminal can't hold a notification for later, so a terminal session books none. `/theme-mod` says which kind this session is, on its `ALERTS` line.

## If something is off

| Problem | Try |
| --- | --- |
| The app feels slow | `/theme-mod motion calm`, then `/theme-mod motion off`, then `/theme-mod glass solid` |
| Text is hard to read over the city | `/theme-mod glass frost`, or `/theme-mod glass solid` |
| Nothing changed after installing | Start a new session in the Code tab. Type `/status` and check Claude Code is 2.1.325 or later |
| You don't want notifications from the theme | `/theme-mod alerts off` |
| You want it gone for now | `/theme-mod off` |
