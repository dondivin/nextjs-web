import React from 'react'

/**
 * Renders a translation value safely as React nodes.
 * Supported markup: **bold**, __em__, {placeholder}.
 * Placeholders are looked up in `tokens`; a token may be a string or a React node
 * (e.g. <span className="js-bookmaker" /> so the engine can update it live).
 */
export type Tokens = Record<string, React.ReactNode>

export function rich(value: string, tokens: Tokens = {}): React.ReactNode {
  const out: React.ReactNode[] = []
  let key = 0
  const re = /\*\*(.+?)\*\*|__(.+?)__/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(value))) {
    if (m.index > last) out.push(...fill(value.slice(last, m.index), tokens, () => key++))
    if (m[1] != null) out.push(<b key={'b' + key++}>{fill(m[1], tokens, () => key++)}</b>)
    else out.push(<em key={'e' + key++}>{fill(m[2], tokens, () => key++)}</em>)
    last = re.lastIndex
  }
  if (last < value.length) out.push(...fill(value.slice(last), tokens, () => key++))
  return out.length === 1 ? out[0] : out
}

function fill(text: string, tokens: Tokens, k: () => number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /\{(\w+)\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = tokens[m[1]]
    if (tok == null) parts.push(m[0])
    else if (typeof tok === 'string' || typeof tok === 'number') parts.push(String(tok))
    else parts.push(<React.Fragment key={'t' + k()}>{tok}</React.Fragment>)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Plain-text interpolation: "Hello {name}" + {name:'Ann'} → "Hello Ann". Markup characters are removed. */
export function plain(value: string, vars: Record<string, string | number> = {}): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\{(\w+)\}/g, (m, n) => (vars[n] != null ? String(vars[n]) : m))
}
