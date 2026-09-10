import { AlignmentType, HeadingLevel, PageBreak, Paragraph, TableOfContents, TextRun } from 'docx'
import type { BinderNode } from '../../shared/binder'
import { effectiveSceneBreakMark, type ExportFormat, type ExportOptions } from '../../shared/export'
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
import { renderBookPdf } from './bookPdf'
import { getImageDataUris, readImageBytes } from '../documentImageStore'
import { loadDocument } from '../documentStore'
import { DEFAULT_BOOK_TRIM, planBook } from '../../shared/book'
import { applyPersonalDetails, DEFAULT_SCENE_BREAK_MARK } from '../../shared/compile'
import { countWords } from '../../shared/wordCount'
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
    blocksToHtml(blocks, {
      sceneBreakMark: effectiveSceneBreakMark(options),
      stripJustify: manuscript,
      imageSources
    }) + footnotesToHtml(numberFootnotes(blocks))
  )
}

export async function renderDocumentExport(
  html: string,
  format: ExportFormat,
  options: ExportOptions
): Promise<Buffer> {
  const blocks = htmlToBlocks(html)
  const manuscript = options.preset === 'manuscript'
  const sceneBreakMark = effectiveSceneBreakMark(options)
  if (format === 'txt') return Buffer.from(blocksToPlainText(blocks), 'utf-8')
  if (format === 'md') return Buffer.from(blocksToMarkdown(blocks), 'utf-8')
  if (format === 'docx') {
    const footnotes = createFootnoteCollector()
    const images = await resolveDocxImages(blocks)
    const children = blocksToDocxParagraphs(blocks, { manuscript, sceneBreakMark, footnotes, images })
    return sectionsToDocxBuffer([{ children }], options, footnotes)
  }
  const imageSources = await getImageDataUris(imageIdsIn(blocks))
  const body =
    blocksToHtml(blocks, { sceneBreakMark, stripJustify: manuscript, imageSources }) +
    footnotesToHtml(numberFootnotes(blocks))
  return htmlToPdfBuffer(body, options)
}

function projectToPlainText(content: ProjectContent, title: string): string {
  const lines: string[] = [title, '='.repeat(title.length), '', 'Contents', '']
  for (const entry of content.toc) lines.push(`${'  '.repeat(entry.level - 1)}- ${entry.title}`)
  lines.push('', '')
  for (const section of content.sections) {
    // Matter pages carry only their own content — the binder names that label
    // them in the app ("Front Matter", "Title Page") are navigation, not text.
    if (!section.matter) lines.push(section.title, '-'.repeat(section.title.length), '')
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
    if (!section.matter) groups.push(`${'#'.repeat(Math.min(section.level, 6))} ${section.title}`)
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
  const sceneBreakMark = effectiveSceneBreakMark(options)

  // One collector across every section, so footnote numbering runs
  // continuously through the whole manuscript rather than restarting per file.
  const footnotes = createFootnoteCollector()
  const allBlocks = content.sections.flatMap((s) => s.blocks)
  const images = await resolveDocxImages(allBlocks)
  const render = { manuscript, sceneBreakMark, footnotes, images }

  // Leading matter sections are the front matter; anything flagged matter
  // after the first body section is back matter, rendered in place.
  const firstBody = content.sections.findIndex((s) => !s.matter)
  const front = firstBody === -1 ? content.sections : content.sections.slice(0, firstBody)
  const rest = firstBody === -1 ? [] : content.sections.slice(firstBody)

  const children: (Paragraph | TableOfContents)[] = []

  // Front matter first: each document its own page, content only.
  front.forEach((section, index) => {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(...blocksToDocxParagraphs(section.blocks, render))
  })

  // A real title page in the front matter replaces the synthesized title line.
  if (front.length === 0) {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }))
  }
  // The label is deliberately NOT a Heading_1 — the TOC field below collects
  // heading styles 1–3 and would list its own caption.
  children.push(
    new Paragraph({
      pageBreakBefore: front.length > 0,
      indent: { firstLine: 0 },
      children: [new TextRun({ text: 'Contents', bold: true })]
    })
  )
  // A real Word TOC field: hyperlinked entries with page numbers, computed by
  // Word's own layout on open (updateFields) — not a static typed list.
  children.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }))

  // The same document-separation rules the PDF path applies (see
  // projectToPdfHtml): 'page' breaks before every document not directly
  // under its folder heading (and before level-1 headings, and the first
  // body section, which otherwise shares the Contents page); 'divider'
  // pages only level-1 folder headings and separates consecutive documents
  // with the centered scene marker.
  const separation = options.documentSeparation ?? 'page'
  const dividerMark = sceneBreakMark ?? DEFAULT_SCENE_BREAK_MARK
  let previous: (typeof content.sections)[number] | null = null
  for (const section of rest) {
    if (section.matter) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(...blocksToDocxParagraphs(section.blocks, render))
      continue
    }
    const pageBreak =
      separation === 'page'
        ? section.level === 1 || previous === null || previous.isDocument
        : previous === null || (!section.isDocument && section.level === 1)
    if (separation === 'divider' && section.isDocument && previous?.isDocument) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          indent: { firstLine: 0 },
          children: [new TextRun(dividerMark)]
        })
      )
    }
    children.push(
      new Paragraph({
        heading: HEADING_LEVELS[Math.min(section.level, 3) - 1],
        pageBreakBefore: pageBreak,
        keepNext: true,
        children: [new TextRun(section.title)]
      })
    )
    if (section.isDocument) {
      children.push(...blocksToDocxParagraphs(section.blocks, render))
    }
    previous = section
  }

  return sectionsToDocxBuffer([{ children }], options, footnotes)
}

export function projectToPdfHtml(
  content: ProjectContent,
  title: string,
  options: ExportOptions,
  imageSources: Record<string, string> = {}
): string {
  const blockOptions = {
    sceneBreakMark: effectiveSceneBreakMark(options),
    stripJustify: options.preset === 'manuscript',
    imageSources
  }

  const firstBody = content.sections.findIndex((s) => !s.matter)
  const front = firstBody === -1 ? content.sections : content.sections.slice(0, firstBody)
  const rest = firstBody === -1 ? [] : content.sections.slice(firstBody)

  // Front matter before the Contents — a title page after a Contents page
  // would read backwards. Each matter document is its own page, content only.
  let html = ''
  for (const section of front) {
    html += `<section class="chf-matter">${blocksToHtml(section.blocks, blockOptions)}</section>`
  }

  // Contents entries link to their section headings by id; the ids also feed
  // the PDF outline printToPDF builds. Index i here is section i of the
  // manuscript below, because toc and body sections come from the same walk.
  const tocItems = content.toc
    .map((e, index) => {
      const cls = e.level === 1 ? 'chf-toc-folder' : 'chf-toc-doc'
      return `<li class="${cls}" style="padding-left:${(e.level - 1) * 1.2}em"><a href="#chf-sec-${index}">${escapeHtml(e.title)}</a></li>`
    })
    .join('')
  // A real title page in the front matter replaces the synthesized title line.
  const titleLine = front.length > 0 ? '' : `<h1>${escapeHtml(title)}</h1>`
  html += `<div class="chf-toc">${titleLine}<h2>Contents</h2><ul>${tocItems}</ul></div>`

  // Document separation, applied uniformly at every document boundary:
  // 'page' starts every document on a fresh page (one directly after its
  // folder's heading shares that heading's page); 'divider' lets documents
  // run on with the scene marker between consecutive documents, while
  // level-1 folder headings — structure, not documents — still page.
  const separation = options.documentSeparation ?? 'page'
  const dividerMark = effectiveSceneBreakMark(options) ?? DEFAULT_SCENE_BREAK_MARK
  let bodyIndex = 0
  let previous: (typeof rest)[number] | null = null
  for (const section of rest) {
    if (section.matter) {
      html += `<section class="chf-matter">${blocksToHtml(section.blocks, blockOptions)}</section>`
      continue
    }
    const classes: string[] = []
    if (section.level === 1) classes.push('chf-section-title')
    if (separation === 'page') {
      if (section.level > 1 && (previous === null || previous.isDocument)) classes.push('chf-doc-page')
    } else {
      if (section.level === 1 && section.isDocument) classes.push('chf-flow')
      if (section.isDocument && previous?.isDocument) {
        html += `<p class="chf-scene-break">${escapeHtml(dividerMark)}</p>`
      }
    }
    const tag = `h${Math.min(section.level, 3)}`
    const cls = classes.length > 0 ? ` class="${classes.join(' ')}"` : ''
    html += `<${tag}${cls} id="chf-sec-${bodyIndex}">${escapeHtml(section.title)}</${tag}>`
    bodyIndex += 1
    if (section.isDocument) {
      html += blocksToHtml(section.blocks, blockOptions)
    }
    previous = section
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

export interface ProjectCompileRender {
  /** The bytes to store as the compile's output.<ext> artifact. */
  output: Buffer
  /** The same assembled body the PDF path renders, images inlined as data
   *  URIs — stored as the compile's frozen in-app view. */
  viewHtml: string
  /** Document body words only, by the shared countWords definition. */
  wordCount: number
}

/**
 * One traversal serving both artifacts a compile stores: the output in the
 * requested format, plus the viewer HTML. Exactly renderProjectExport's
 * pipeline (same buildProjectContent walk, same per-format renderers) — this
 * exists only so the compile path doesn't run that pipeline twice to get two
 * renderings of the same content, which could also let them diverge if a
 * document saved between the passes.
 *
 * `matter` carries the front/back matter forests, rendered around the
 * manuscript as display pages: no chapter-style headings for their binder
 * names, no Contents entries, and no part in the word count.
 */
export async function renderProjectCompile(
  tree: BinderNode[],
  projectName: string | null,
  format: ExportFormat,
  options: ExportOptions,
  matter: { front: BinderNode[]; back: BinderNode[] } = { front: [], back: [] }
): Promise<ProjectCompileRender> {
  // Matter documents are the one place personal-details markers resolve —
  // the stored fields substitute into {{name}}/{{contact}}/{{address}} at
  // render time, so editing the details updates every future compile.
  const matterHtml = (html: string): string =>
    options.personalDetails ? applyPersonalDetails(html, options.personalDetails) : html

  // The book preset is a different pipeline entirely (see bookPdf.ts) — the
  // plan/segment/assemble path, PDF only.
  if (options.preset === 'book') {
    if (format !== 'pdf') throw new Error('The book style compiles to PDF only.')
    const plan = planBook(tree, matter.front, matter.back)
    const chapterIds = new Set(
      plan.body.flatMap((e) => (e.kind === 'part' ? e.chapters : [e])).map((c) => c.documentId)
    )
    const allIds = [...plan.frontDisplayIds, ...plan.frontTextIds, ...chapterIds, ...plan.backIds]
    const blocksById = new Map<string, Block[]>()
    for (const id of allIds) {
      if (blocksById.has(id)) continue
      const html = await loadDocument(id)
      blocksById.set(id, htmlToBlocks(chapterIds.has(id) ? html : matterHtml(html)))
    }
    const imageSources = await getImageDataUris(imageIdsIn([...blocksById.values()].flat()))
    const render = await renderBookPdf(plan, async (id) => blocksById.get(id) ?? [], {
      trim: options.bookTrim ?? DEFAULT_BOOK_TRIM,
      title: projectName || 'Untitled Project',
      authorName: options.authorName,
      sceneBreakMark: options.sceneBreakMark ?? DEFAULT_SCENE_BREAK_MARK,
      includeContents: options.bookIncludeContents ?? true,
      separation: options.documentSeparation ?? 'page',
      imageSources
    })
    return { output: render.output, viewHtml: render.viewHtml, wordCount: render.wordCount }
  }

  const [frontContent, draftContent, backContent] = await Promise.all([
    buildProjectContent(matter.front, { matter: true, transformHtml: matterHtml }),
    buildProjectContent(tree),
    buildProjectContent(matter.back, { matter: true, transformHtml: matterHtml })
  ])
  const content: ProjectContent = {
    toc: draftContent.toc,
    sections: [...frontContent.sections, ...draftContent.sections, ...backContent.sections]
  }
  const title = projectName || 'Untitled Project'
  const imageSources = await getImageDataUris(imageIdsIn(content.sections.flatMap((s) => s.blocks)))
  const viewHtml = projectToPdfHtml(content, title, options, imageSources)
  const wordCount = countWords(
    content.sections
      .filter((section) => section.isDocument && !section.matter)
      .map((section) => blocksToPlainText(section.blocks))
      .join(' ')
  )

  let output: Buffer
  if (format === 'txt') output = Buffer.from(projectToPlainText(content, title), 'utf-8')
  else if (format === 'md') output = Buffer.from(projectToMarkdown(content, title), 'utf-8')
  else if (format === 'docx') output = await projectToDocxBuffer(content, title, options)
  else output = await htmlToPdfBuffer(viewHtml, options)

  return { output, viewHtml, wordCount }
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
