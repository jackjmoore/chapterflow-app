import type { Block } from './htmlToBlocks'
import { numberFootnotes } from './footnotes'

/** Footnote markers become a bracketed number in the text; the notes
 *  themselves are listed at the end (plain text has nowhere else to put
 *  them). Numbering matches every other format. */
function runsText(block: Block, counter: { n: number }): string {
  return block.runs
    .map((r) => {
      if (r.footnote !== undefined) {
        counter.n += 1
        return `[${counter.n}]`
      }
      return r.text
    })
    .join('')
}

export function blocksToPlainText(blocks: Block[]): string {
  const lines: string[] = []
  let orderedIndex = 0
  const counter = { n: 0 }

  for (const block of blocks) {
    if (block.kind !== 'ordered') orderedIndex = 0

    if (block.kind === 'chapterLine') {
      lines.push('* * *')
      continue
    }
    if (block.kind === 'pageBreak' || block.kind === 'chapterBreak') {
      // A form feed is the plain-text page break, and it round-trips through
      // printers and terminals that honor one.
      lines.push('\f')
      continue
    }
    if (block.kind === 'image') {
      lines.push(block.alt ? `[Image: ${block.alt}]` : '[Image]')
      continue
    }

    const text = runsText(block, counter)
    if (block.kind === 'heading') {
      lines.push(text)
    } else if (block.kind === 'blockquote') {
      lines.push(text ? `> ${text}` : '')
    } else if (block.kind === 'bullet') {
      lines.push(`- ${text}`)
    } else if (block.kind === 'ordered') {
      orderedIndex += 1
      lines.push(`${orderedIndex}. ${text}`)
    } else {
      lines.push(text)
    }
  }

  const notes = numberFootnotes(blocks)
  if (notes.length > 0) {
    lines.push('Notes')
    for (const note of notes) lines.push(`[${note.number}] ${note.text}`)
  }

  // Blank line between blocks, not a lone newline. txtToBlocks treats a single
  // newline as a soft wrap *within* one paragraph — correct for reading
  // hard-wrapped .txt files written elsewhere — and only a blank line as a
  // paragraph boundary. Joining with '\n' meant our own export re-imported as
  // one run-on paragraph. The import side is the one that has to cope with
  // arbitrary outside files, so the export side is what conforms.
  return lines.join('\n\n')
}
