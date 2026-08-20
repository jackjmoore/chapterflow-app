import type { Block } from './htmlToBlocks'

function runsText(block: Block): string {
  return block.runs.map((r) => r.text).join('')
}

export function blocksToPlainText(blocks: Block[]): string {
  const lines: string[] = []
  let orderedIndex = 0

  for (const block of blocks) {
    if (block.kind !== 'ordered') orderedIndex = 0

    const text = runsText(block)
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

  return lines.join('\n')
}
