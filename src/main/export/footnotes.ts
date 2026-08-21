import type { Block } from './htmlToBlocks'

export interface NumberedFootnote {
  number: number
  text: string
}

/**
 * Assigns running numbers to every footnote marker in document order.
 *
 * The single numbering authority for all four export renderers, so a note is
 * "3" in the PDF, the docx, the markdown, and the plain text alike. Numbering
 * is derived here rather than stored on the node, which is what makes
 * deleting a note renumber the rest automatically.
 */
export function numberFootnotes(blocks: Block[]): NumberedFootnote[] {
  const out: NumberedFootnote[] = []
  for (const block of blocks) {
    for (const run of block.runs) {
      if (run.footnote === undefined) continue
      out.push({ number: out.length + 1, text: run.footnote })
    }
  }
  return out
}

/**
 * Walks blocks and runs together with the running footnote number, so a
 * renderer can emit its marker without tracking the counter itself.
 * `onRun` receives the footnote's number for marker runs, and null otherwise.
 */
export function forEachRun(
  blocks: Block[],
  onRun: (run: Block['runs'][number], footnoteNumber: number | null, block: Block) => void
): void {
  let counter = 0
  for (const block of blocks) {
    for (const run of block.runs) {
      if (run.footnote !== undefined) {
        counter += 1
        onRun(run, counter, block)
      } else {
        onRun(run, null, block)
      }
    }
  }
}
