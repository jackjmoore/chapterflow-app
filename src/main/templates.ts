import * as binderStore from './binderStore'
import type { TemplateId } from '../shared/templates'

/**
 * Three-Act Structure:
 *   Act One    > Chapter 1, Chapter 2
 *   Act Two    > Chapter 3, Chapter 4, Chapter 5
 *   Act Three  > Chapter 6, Chapter 7
 * (Act Two deliberately gets the most placeholder chapters, matching the
 * usual proportions of the structure.)
 *
 * Blank Nonfiction:
 *   Front Matter > Title Page, Preface
 *   Chapters     > Chapter 1
 *   Back Matter  > Appendix, Index
 */
const TEMPLATES: Record<Exclude<TemplateId, 'blank'>, { folder: string; documents: string[] }[]> = {
  'three-act': [
    { folder: 'Act One', documents: ['Chapter 1', 'Chapter 2'] },
    { folder: 'Act Two', documents: ['Chapter 3', 'Chapter 4', 'Chapter 5'] },
    { folder: 'Act Three', documents: ['Chapter 6', 'Chapter 7'] }
  ],
  nonfiction: [
    { folder: 'Front Matter', documents: ['Title Page', 'Preface'] },
    { folder: 'Chapters', documents: ['Chapter 1'] },
    { folder: 'Back Matter', documents: ['Appendix', 'Index'] }
  ]
}

/** Adds a template's folder/document structure to the root of the binder tree.
 *  Additive rather than destructive — never wipes existing content. */
export async function applyTemplate(id: TemplateId): Promise<void> {
  if (id === 'blank') return
  for (const section of TEMPLATES[id]) {
    const folder = await binderStore.createFolder(null, section.folder)
    for (const docName of section.documents) {
      await binderStore.createDocument(folder.id, docName)
    }
  }
}
