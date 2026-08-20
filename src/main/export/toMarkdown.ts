import type { Block, Run } from './htmlToBlocks'

function escapeMd(text: string): string {
  return text.replace(/([*_`#])/g, '\\$1')
}

function runToMd(run: Run): string {
  let text = escapeMd(run.text)
  if (run.bold && run.italic) text = `***${text}***`
  else if (run.bold) text = `**${text}**`
  else if (run.italic) text = `*${text}*`
  if (run.underline) text = `<u>${text}</u>`
  return text
}

function runsToMd(block: Block): string {
  return block.runs.map(runToMd).join('')
}

export function blocksToMarkdown(blocks: Block[]): string {
  const groups: string[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (block.kind === 'bullet' || block.kind === 'ordered') {
      const lines: string[] = []
      let n = 0
      while (i < blocks.length && blocks[i].kind === block.kind) {
        n += 1
        const text = runsToMd(blocks[i])
        lines.push(block.kind === 'bullet' ? `- ${text}` : `${n}. ${text}`)
        i += 1
      }
      groups.push(lines.join('\n'))
      continue
    }

    const text = runsToMd(block)
    if (block.kind === 'heading') {
      groups.push(`${'#'.repeat(block.level ?? 1)} ${text}`)
    } else if (block.kind === 'blockquote') {
      groups.push(`> ${text}`)
    } else {
      groups.push(text)
    }
    i += 1
  }

  return groups.join('\n\n')
}
