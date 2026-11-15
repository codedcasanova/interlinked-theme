// What a tool call's card says beyond its name: how long the call ran and a
// few facts read off the tool's own result, such as lines of output or lines
// added and removed. Pure functions, so they can be tested without drawing.
//
// A result is read through plain shapes, never the tools' own types: with
// many MCP tools connected those types are too deep to check, and a result
// from a later build may carry other fields. Anything unrecognised gives no
// facts, and the card is drawn as before.

type Bag = Record<string, unknown>

const bag = (value: unknown): Bag | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Bag) : undefined
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** `1 LINE`, `48 LINES`. */
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 'S'}`

/** Lines in a block of output, not counting the blank ones it ends with. */
function lineCount(text: string): number {
  const body = text.replace(/\s+$/, '')
  return body === '' ? 0 : body.split('\n').length
}

/** `+12 −3` from a result's patch: the lines an edit added and removed. */
function patchLabel(patch: unknown): string | undefined {
  if (!Array.isArray(patch)) return undefined
  let added = 0
  let removed = 0
  for (const hunk of patch) {
    const lines = bag(hunk)?.lines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return added + removed === 0 ? undefined : `+${added} −${removed}`
}

/** A tool's name for a card: an MCP tool's last part, in caps. */
export const toolLabel = (tool: string) =>
  (tool.startsWith('mcp__') ? tool.split('__').pop() ?? tool : tool).toUpperCase().slice(0, 28)

/** `340ms`, `1.2s`, `42s`, `2m 05s`: how long a call ran, short enough for a card. */
export function durationLabel(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/**
 * A finished call's result in a few words, for its card. Empty for a tool
 * this doesn't know, a result it can't read, and a call that failed: a failed
 * call's output is the error's text, which the app's own row already shows.
 */
export function toolFacts(tool: string, output: unknown): string[] {
  const result = bag(output)
  if (result === undefined) return []

  if (tool === 'Bash' || tool === 'PowerShell') {
    if (str(result.backgroundTaskId) !== '') return ['IN BACKGROUND']
    const facts: string[] = []
    if (num(result.timedOutAfterMs) !== undefined) facts.push('TIMED OUT')
    if (result.isImage === true) return [...facts, 'IMAGE']
    const lines = lineCount(str(result.stdout)) + lineCount(str(result.stderr))
    facts.push(lines === 0 ? 'NO OUTPUT' : count(lines, 'LINE'))
    return facts
  }

  if (tool === 'Read') {
    if (result.type === 'image') return ['IMAGE']
    const file = bag(result.file)
    const read = num(file?.numLines)
    const total = num(file?.totalLines)
    if (result.type !== 'text' || read === undefined) return []
    return [total !== undefined && total > read ? `${read} OF ${count(total, 'LINE')}` : count(read, 'LINE')]
  }

  if (tool === 'Edit' || tool === 'Write') {
    if (tool === 'Write' && result.type === 'create') {
      return ['NEW FILE', count(lineCount(str(result.content)), 'LINE')]
    }
    const patch = patchLabel(result.structuredPatch)
    return patch === undefined ? [] : [patch]
  }

  if (tool === 'Grep') {
    const files = num(result.numFiles)
    const matches = num(result.numMatches)
    const lines = num(result.numLines)
    const facts: string[] = []
    if (matches !== undefined) facts.push(matches === 1 ? '1 MATCH' : `${matches} MATCHES`)
    else if (result.mode === 'content' && lines !== undefined) facts.push(count(lines, 'LINE'))
    if (files !== undefined && (files > 0 || facts.length === 0)) {
      facts.push(files === 0 ? 'NO MATCHES' : count(files, 'FILE'))
    }
    return facts
  }

  if (tool === 'Glob') {
    const files = num(result.numFiles)
    if (files === undefined) return []
    return [files === 0 ? 'NO FILES' : `${count(files, 'FILE')}${result.truncated === true ? '+' : ''}`]
  }

  if (tool === 'WebFetch') {
    const code = num(result.code)
    return code === undefined ? [] : [`HTTP ${code}`]
  }

  return []
}

/**
 * A folded run of calls by tool, most used first: `3 READ  ·  2 GREP`. At
 * most three kinds are named, and the rest are counted.
 */
export function groupTally(tools: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const label = toolLabel(tool)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  // a stable sort keeps first-seen order among equals
  const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const named = kinds.slice(0, 3).map(([label, n]) => `${n} ${label}`)
  const rest = kinds.slice(3).reduce((sum, [, n]) => sum + n, 0)
  return [...named, ...(rest > 0 ? [`+${rest} MORE`] : [])].join('  ·  ')
}
