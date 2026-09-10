import { flattenBinderOutline, type BinderNode } from '../../shared/binder'
import { loadDocument } from '../documentStore'
import { htmlToBlocks, type Block } from './htmlToBlocks'

export interface ProjectSection {
  title: string
  level: number
  isDocument: boolean
  blocks: Block[]
  /** Front/back matter document — rendered as its own display page (content
   *  only, no chapter-style heading) and kept out of the Contents list and
   *  the manuscript word count. */
  matter?: boolean
}

export interface ProjectContent {
  toc: { title: string; level: number }[]
  sections: ProjectSection[]
}

/**
 * Loads every document's content in reading order. Folders become
 * section-title-only entries (a chapter/section divider) with their children
 * nested beneath them — chosen over a page-number table of contents because
 * plain text/Markdown can't represent page numbers, and this keeps the
 * structure identical across all four export formats.
 *
 * The order itself comes from flattenBinderOutline — the one shared
 * definition of binder order, also consumed by the in-app View Draft — so
 * what exports and what the draft view shows can never diverge. This module
 * only adds what needs the main process: reading the files and parsing them
 * into export blocks.
 *
 * With `matter: true` the same walk reads a front/back matter forest instead:
 * folder names ("Front Matter") are navigation, not manuscript text, so
 * folders emit no section at all, documents are flagged as matter, and the
 * toc stays empty — the Contents list is the manuscript's alone.
 */
export async function buildProjectContent(
  tree: BinderNode[],
  options: { matter?: boolean; transformHtml?: (html: string) => string } = {}
): Promise<ProjectContent> {
  const outline = flattenBinderOutline(tree)
  const matter = options.matter ?? false
  const transform = options.transformHtml ?? ((html: string): string => html)
  const toc = matter ? [] : outline.map(({ title, level }) => ({ title, level }))
  const sections: ProjectSection[] = []

  for (const entry of outline) {
    if (matter && !entry.isDocument) continue
    const blocks = entry.isDocument && entry.id ? htmlToBlocks(transform(await loadDocument(entry.id))) : []
    sections.push({
      title: entry.title,
      level: entry.level,
      isDocument: entry.isDocument,
      blocks,
      ...(matter ? { matter: true } : {})
    })
  }

  return { toc, sections }
}
