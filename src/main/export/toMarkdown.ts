import type { Block, Run } from './htmlToBlocks'
import { numberFootnotes } from './footnotes'

function escapeMd(text: string): string {
  return text.replace(/([*_`#])/g, '\\$1')
}

function runToMd(run: Run, footnoteNumber: number | null): string {
  // Pandoc/GFM-style footnote reference; the definitions are appended at the
  // end of the document by blocksToMarkdown.
  if (run.footnote !== undefined) return `[^${footnoteNumber ?? 0}]`
  let text = escapeMd(run.text)
  if (run.bold && run.italic) text = `***${text}***`
  else if (run.bold) text = `**${text}**`
  else if (run.italic) text = `*${text}*`
  if (run.underline) text = `<u>${text}</u>`
  return text
}

export function blocksToMarkdown(blocks: Block[]): string {
  const groups: string[] = []
  // Numbering runs across the whole document, so it's tracked out here rather
  // than per block — same order numberFootnotes() produces.
  let footnoteCounter = 0
  const runsToMd = (block: Block): string =>
    block.runs
      .map((run) => {
        if (run.footnote !== undefined) {
          footnoteCounter += 1
          return runToMd(run, footnoteCounter)
        }
        return runToMd(run, null)
      })
      .join('')

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

    if (block.kind === 'chapterLine') {
      groups.push('---')
      i += 1
      continue
    }

    if (block.kind === 'pageBreak' || block.kind === 'chapterBreak') {
      // Markdown has no page concept; the HTML comment is the convention
      // Pandoc and friends recognize when converting onward to a paged format.
      groups.push('<!-- pagebreak -->')
      i += 1
      continue
    }

    if (block.kind === 'image') {
      // Referenced by the id under documents/images, so the link resolves
      // against the project folder the file sits in.
      const alt = (block.alt ?? '').replace(/[[\]]/g, '')
      groups.push(`![${alt}](images/${block.imageId ?? ''})`)
      i += 1
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

  const notes = numberFootnotes(blocks)
  if (notes.length > 0) {
    groups.push(notes.map((note) => `[^${note.number}]: ${note.text}`).join('\n'))
  }

  return groups.join('\n\n')
}
