import type { Node as PMNode } from '@tiptap/pm/model'
import { Transform } from '@tiptap/pm/transform'
import { escapeRegExp } from '../../../shared/textMatch'

export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
}

export interface Match {
  from: number
  to: number
  groups: Array<string | undefined>
}

/**
 * Builds one RegExp from the query + options, composing case-sensitivity,
 * whole-word, and regex mode uniformly so any combination behaves correctly.
 * Returns null for an empty query or an invalid regex pattern.
 */
export function buildSearchRegex(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null

  let pattern = options.useRegex ? query : escapeRegExp(query)
  if (options.wholeWord) pattern = `\\b(?:${pattern})\\b`

  const flags = 'g' + (options.caseSensitive ? '' : 'i')
  try {
    return new RegExp(pattern, flags)
  } catch {
    return null
  }
}

interface TextMap {
  text: string
  positions: number[]
}

function extractTextWithPositions(doc: PMNode): TextMap {
  let text = ''
  const positions: number[] = []

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) positions.push(pos + i)
      text += node.text
    } else if (node.isBlock && text.length > 0 && text[text.length - 1] !== '\n') {
      // Separator so text from adjacent blocks never accidentally concatenates
      // into a false match (e.g. paragraph ending "cat" + next starting "erpillar").
      text += '\n'
      positions.push(pos)
    }
    return true
  })

  return { text, positions }
}

/** Finds every match of `regex` in `doc`'s visible text, mapped back to real document positions. */
export function findMatchesInDoc(doc: PMNode, regex: RegExp): Match[] {
  const { text, positions } = extractTextWithPositions(doc)
  const matches: Match[] = []

  let execResult: RegExpExecArray | null
  regex.lastIndex = 0
  while ((execResult = regex.exec(text))) {
    const matchText = execResult[0]
    if (matchText.length === 0) {
      regex.lastIndex++
      continue
    }
    const startIdx = execResult.index
    const endIdx = startIdx + matchText.length
    matches.push({
      from: positions[startIdx],
      to: positions[endIdx - 1] + 1,
      groups: execResult.slice(1)
    })
  }

  return matches
}

/** Expands $1..$9 and $& backreferences in regex mode; literal text otherwise. */
export function applyReplacementTemplate(
  template: string,
  match: Match,
  matchedText: string,
  useRegex: boolean
): string {
  if (!useRegex) return template
  return template.replace(/\$(\$|&|[1-9])/g, (_full, token: string) => {
    if (token === '$') return '$'
    if (token === '&') return matchedText
    const group = match.groups[Number(token) - 1]
    return group ?? ''
  })
}

/**
 * Replaces every match in `doc` with its templated replacement, returning a
 * new document. Matches are applied highest-position-first so earlier
 * matches' positions never shift out from under later replacements.
 */
export function replaceAllInDoc(
  doc: PMNode,
  matches: Match[],
  replacementTemplate: string,
  useRegex: boolean
): PMNode {
  const tr = new Transform(doc)
  const sorted = [...matches].sort((a, b) => b.from - a.from)
  for (const match of sorted) {
    const matchedText = doc.textBetween(match.from, match.to, '\n', '\n')
    const replacement = applyReplacementTemplate(replacementTemplate, match, matchedText, useRegex)
    if (replacement.length === 0) {
      tr.delete(match.from, match.to)
    } else {
      tr.replaceWith(match.from, match.to, doc.type.schema.text(replacement))
    }
  }
  return tr.doc
}
