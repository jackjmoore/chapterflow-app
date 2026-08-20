import type { BinderNode } from '../../shared/binder'
import { loadDocument } from '../documentStore'
import { htmlToBlocks, type Block } from './htmlToBlocks'

export interface ProjectSection {
  title: string
  level: number
  isDocument: boolean
  blocks: Block[]
}

export interface ProjectContent {
  toc: { title: string; level: number }[]
  sections: ProjectSection[]
}

/** Walks the binder tree in order, loading every document's content. Folders
 *  become section-title-only entries (a chapter/section divider) with their
 *  children nested beneath them — chosen over a page-number table of contents
 *  because plain text/Markdown can't represent page numbers, and this keeps
 *  the structure identical across all four export formats. */
export async function buildProjectContent(tree: BinderNode[]): Promise<ProjectContent> {
  const toc: { title: string; level: number }[] = []
  const sections: ProjectSection[] = []

  async function walk(nodes: BinderNode[], depth: number): Promise<void> {
    for (const node of nodes) {
      const level = Math.min(depth + 1, 3)
      toc.push({ title: node.name, level })
      if (node.type === 'document') {
        const html = await loadDocument(node.id)
        sections.push({ title: node.name, level, isDocument: true, blocks: htmlToBlocks(html) })
      } else {
        sections.push({ title: node.name, level, isDocument: false, blocks: [] })
      }
      if (node.children.length) await walk(node.children, depth + 1)
    }
  }

  await walk(tree, 0)
  return { toc, sections }
}
