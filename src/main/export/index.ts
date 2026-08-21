import { HeadingLevel, Paragraph, TextRun } from 'docx'
import type { BinderNode } from '../../shared/binder'
import type { ExportFormat, ExportOptions } from '../../shared/export'
import { htmlToBlocks } from './htmlToBlocks'
import { blocksToPlainText } from './toPlainText'
import { blocksToMarkdown } from './toMarkdown'
import {
  blocksToDocxParagraphs,
  createFootnoteCollector,
  sectionsToDocxBuffer,
  HEADING_LEVELS,
  type DocxImage
} from './toDocx'
import { blocksToHtml, escapeHtml, footnotesToHtml } from './blocksToHtml'
import { numberFootnotes } from './footnotes'
import { htmlToPdfBuffer } from './toPdf'
import { buildProjectContent, type ProjectContent } from './projectExport'
import { getImageDataUris, readImageBytes } from '../documentImageStore'
import type { Block } from './htmlToBlocks'

/** Every image id a set of blocks references, in one pass — so the renderers
 *  can resolve them all before the synchronous block walk begins. */
function imageIdsIn(blocks: Block[]): string[] {
  const ids = new Set<string>()
  for (const block of blocks) {
    if (block.kind === 'image' && block.imageId) ids.add(block.imageId)
  }
  return [...ids]
}

async function resolveDocxImages(blocks: Block[]): Promise<Record<string, DocxImage>> {
  const out: Record<string, DocxImage> = {}
  for (const id of imageIdsIn(blocks)) {
    const bytes = await readImageBytes(id)
    if (bytes) out[id] = bytes
  }
  return out
}

export type { ExportFormat }
export { buildPrintableHtml, printHtml } from './toPdf'

export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  txt: 'txt',
  pdf: 'pdf',
  docx: 'docx',
  md: 'md'
}

export const EXPORT_FILTER_NAMES: Record<ExportFormat, string> = {
  txt: 'Plain Text',
  pdf: 'PDF Document',
  docx: 'Word Document',
  md: 'Markdown'
}

/** The preset only ever changes styling inputs — every format still runs the
 *  same htmlToBlocks parse and the same renderer beneath it. */
export async function renderDocumentHtml(html: string, options: ExportOptions): Promise<string> {
  const manuscript = options.preset === 'manuscript'
  const blocks = htmlToBlocks(html)
  const imageSources = await getImageDataUris(imageIdsIn(blocks))
  return (
    blocksToHtml(blocks, { manuscriptSceneBreaks: manuscript, imageSources }) +
    footnotesToHtml(numberFootnotes(blocks))
  )
}

export async function renderDocumentExport(
  html: string,
  format: ExportFormat,
  options: ExportOptions
): Promise<Buffer> {
  const blocks = htmlToBlocks(html)
  const manuscript = options.preset === 'manuscript'
  if (format === 'txt') return Buffer.from(blocksToPlainText(blocks), 'utf-8')
  if (format === 'md') return Buffer.from(blocksToMarkdown(blocks), 'utf-8')
  if (format === 'docx') {
    const footnotes = createFootnoteCollector()
    const images = await resolveDocxImages(blocks)
    const children = blocksToDocxParagraphs(blocks, { manuscript, footnotes, images })
    return sectionsToDocxBuffer([{ children }], options, footnotes)
  }
  const imageSources = await getImageDataUris(imageIdsIn(blocks))
  const body =
    blocksToHtml(blocks, { manuscriptSceneBreaks: manuscript, imageSources }) +
    footnotesToHtml(numberFootnotes(blocks))
  return htmlToPdfBuffer(body, options)
}

function projectToPlainText(content: ProjectContent, title: string): string {
  const lines: string[] = [title, '='.repeat(title.length), '', 'Contents', '']
  for (const entry of content.toc) lines.push(`${'  '.repeat(entry.level - 1)}- ${entry.title}`)
  lines.push('', '')
  for (const section of content.sections) {
    lines.push(section.title, '-'.repeat(section.title.length), '')
    if (section.isDocument) {
      const body = blocksToPlainText(section.blocks)
      if (body) lines.push(body)
    }
    lines.push('')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n\n')
}

function projectToMarkdown(content: ProjectContent, title: string): string {
  const groups: string[] = [`# ${title}`]
  const tocLines = content.toc.map((e) => `${'  '.repeat(e.level - 1)}- ${e.title}`)
  groups.push(`## Contents\n\n${tocLines.join('\n')}`)
  for (const section of content.sections) {
    groups.push(`${'#'.repeat(Math.min(section.level, 6))} ${section.title}`)
    if (section.isDocument) {
      const body = blocksToMarkdown(section.blocks)
      if (body) groups.push(body)
    }
  }
  return groups.join('\n\n')
}

async function projectToDocxBuffer(
  content: ProjectContent,
  title: string,
  options: ExportOptions
): Promise<Buffer> {
  const manuscript = options.preset === 'manuscript'
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] }),
    ...content.toc.map(
      (e) => new Paragraph({ indent: { left: (e.level - 1) * 360 }, children: [new TextRun(e.title)] })
    )
  ]

  // One collector across every section, so footnote numbering runs
  // continuously through the whole manuscript rather than restarting per file.
  const footnotes = createFootnoteCollector()
  const allBlocks = content.sections.flatMap((s) => s.blocks)
  const images = await resolveDocxImages(allBlocks)

  let firstSection = true
  for (const section of content.sections) {
    children.push(
      new Paragraph({
        heading: HEADING_LEVELS[Math.min(section.level, 3) - 1],
        pageBreakBefore: section.level === 1 && !firstSection,
        children: [new TextRun(section.title)]
      })
    )
    firstSection = false
    if (section.isDocument) {
      children.push(...blocksToDocxParagraphs(section.blocks, { manuscript, footnotes, images }))
    }
  }

  return sectionsToDocxBuffer([{ children }], options, footnotes)
}

export function projectToPdfHtml(
  content: ProjectContent,
  title: string,
  options: ExportOptions,
  imageSources: Record<string, string> = {}
): string {
  const manuscript = options.preset === 'manuscript'
  const tocItems = content.toc
    .map((e) => {
      const cls = e.level === 1 ? 'chf-toc-folder' : 'chf-toc-doc'
      return `<li class="${cls}" style="padding-left:${(e.level - 1) * 1.2}em">${escapeHtml(e.title)}</li>`
    })
    .join('')
  let html = `<div class="chf-toc"><h1>${escapeHtml(title)}</h1><h2>Contents</h2><ul>${tocItems}</ul></div>`
  for (const section of content.sections) {
    const tag = `h${Math.min(section.level, 3)}`
    const cls = section.level === 1 ? ' class="chf-section-title"' : ''
    html += `<${tag}${cls}>${escapeHtml(section.title)}</${tag}>`
    if (section.isDocument) {
      html += blocksToHtml(section.blocks, { manuscriptSceneBreaks: manuscript, imageSources })
    }
  }
  // Endnotes for the whole project, numbered continuously in section order —
  // matching how the docx path numbers its real footnotes.
  html += footnotesToHtml(numberFootnotes(content.sections.flatMap((s) => s.blocks)))
  return html
}

export async function renderProjectHtml(tree: BinderNode[], options: ExportOptions): Promise<string> {
  const content = await buildProjectContent(tree)
  const imageSources = await getImageDataUris(imageIdsIn(content.sections.flatMap((s) => s.blocks)))
  return projectToPdfHtml(content, options.title, options, imageSources)
}

export async function renderProjectExport(
  tree: BinderNode[],
  projectName: string | null,
  format: ExportFormat,
  options: ExportOptions
): Promise<Buffer> {
  const content = await buildProjectContent(tree)
  const title = projectName || 'Untitled Project'
  if (format === 'txt') return Buffer.from(projectToPlainText(content, title), 'utf-8')
  if (format === 'md') return Buffer.from(projectToMarkdown(content, title), 'utf-8')
  if (format === 'docx') return projectToDocxBuffer(content, title, options)
  const imageSources = await getImageDataUris(imageIdsIn(content.sections.flatMap((s) => s.blocks)))
  return htmlToPdfBuffer(projectToPdfHtml(content, title, options, imageSources), options)
}
