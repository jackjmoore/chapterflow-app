import * as binderStore from './binderStore'
import { saveDocument } from './documentStore'
import { MATTER_FOLDER_ID } from '../shared/binder'
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
const TEMPLATES: Record<
  Exclude<TemplateId, 'blank'>,
  { folder: string; documents: string[]; home?: 'matter' }[]
> = {
  'three-act': [
    { folder: 'Act One', documents: ['Chapter 1', 'Chapter 2'] },
    { folder: 'Act Two', documents: ['Chapter 3', 'Chapter 4', 'Chapter 5'] },
    { folder: 'Act Three', documents: ['Chapter 6', 'Chapter 7'] }
  ],
  nonfiction: [
    // Front/back matter belong in the structural Matter folder now that it
    // exists — the compile panel wraps them around the Draft automatically.
    { folder: 'Front Matter', documents: ['Title Page', 'Preface'], home: 'matter' },
    { folder: 'Chapters', documents: ['Chapter 1'] },
    { folder: 'Back Matter', documents: ['Appendix', 'Index'], home: 'matter' }
  ]
}

/** Adds a template's folder/document structure to the binder — manuscript
 *  sections into Draft (createFolder's null-parent redirect), matter sections
 *  into Matter. Additive rather than destructive — never wipes content. */
export async function applyTemplate(id: TemplateId): Promise<void> {
  if (id === 'blank') return
  for (const section of TEMPLATES[id]) {
    const folder = await binderStore.createFolder(section.home === 'matter' ? MATTER_FOLDER_ID : null, section.folder)
    for (const docName of section.documents) {
      await binderStore.createDocument(folder.id, docName)
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Front/back matter for the compile panel: ordinary folders and documents
 * through the same createFolder/createDocument path the templates use — no
 * new document kind. They're editable in the editor, includable/excludable
 * by compile scope, and exported by the same binder walk as everything else.
 *
 * Documents are seeded with real starter content (the title page from the
 * live project name and author) rather than left empty, partly to be useful
 * and partly so freshly created front matter doesn't immediately trip the
 * pre-compile empty-document check.
 */
export async function createFrontMatter(): Promise<string> {
  const [projectName, authorName] = await Promise.all([
    binderStore.getProjectName(),
    binderStore.getAuthorName()
  ])
  const title = escapeHtml(projectName || 'Untitled')
  const author = authorName ? escapeHtml(authorName) : null

  const folder = await binderStore.createFolder(MATTER_FOLDER_ID, 'Front Matter')
  // First within Matter — compile places Matter's front content before the
  // Draft, and createFolder always appends.
  await binderStore.moveNode(folder.id, MATTER_FOLDER_ID, 0)

  // The book preset's expected order is half title → title → copyright →
  // dedication; the first four front-matter documents become its blind
  // display pages, so the half title is seeded first.
  const halfTitle = await binderStore.createDocument(folder.id, 'Half Title')
  await saveDocument(halfTitle.id, `<p style="text-align: center">${title}</p>`)

  const titlePage = await binderStore.createDocument(folder.id, 'Title Page')
  await saveDocument(
    titlePage.id,
    `<h1 style="text-align: center">${title}</h1>` +
      (author ? `<p style="text-align: center">by ${author}</p>` : '<p style="text-align: center"></p>')
  )

  const copyright = await binderStore.createDocument(folder.id, 'Copyright')
  // The {{name}}/{{contact}}/{{address}} markers stay literal in the editor
  // and resolve to the compile panel's stored personal details at compile
  // time — the details are never baked into this editable prose, so editing
  // them updates every future compile. The markers work in any matter
  // document; they're seeded here because the copyright page is where a
  // book conventionally carries them.
  await saveDocument(
    copyright.id,
    `<p>Copyright © ${new Date().getFullYear()}${author ? ` ${author}` : ''}. All rights reserved.</p>` +
      '<p>No part of this book may be reproduced in any form without written permission from the author.</p>' +
      '<p>{{name}}</p><p>{{address}}</p><p>{{contact}}</p>'
  )

  const dedication = await binderStore.createDocument(folder.id, 'Dedication')
  await saveDocument(dedication.id, '<p style="text-align: center">For </p>')

  return folder.id
}

export async function createBackMatter(): Promise<string> {
  const authorName = await binderStore.getAuthorName()
  const folder = await binderStore.createFolder(MATTER_FOLDER_ID, 'Back Matter')

  // Matter compiles as content-only pages — the binder names are never
  // printed — so pages that should carry a label get it as a real heading in
  // the document itself, where the writer can also change it.
  const about = await binderStore.createDocument(folder.id, 'About the Author')
  await saveDocument(
    about.id,
    '<h2 style="text-align: center">About the Author</h2>' +
      `<p>${authorName ? escapeHtml(authorName) : 'The author'} is — a few sentences about who wrote this book.</p>`
  )

  const acknowledgments = await binderStore.createDocument(folder.id, 'Acknowledgments')
  await saveDocument(
    acknowledgments.id,
    '<h2 style="text-align: center">Acknowledgments</h2><p>With thanks to </p>'
  )

  return folder.id
}
