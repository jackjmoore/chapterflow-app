import * as binderStore from '../binderStore'
import * as storyBibleStore from '../storyBibleStore'
import * as timelineStore from '../timelineStore'
import * as mentionStore from '../mentionStore'
import { loadDocument } from '../documentStore'
import { htmlToBlocks } from '../export/htmlToBlocks'
import { blocksToPlainText } from '../export/toPlainText'
import { numberFootnotes } from '../export/footnotes'
import { peekCompileSettings } from '../compileSettingsStore'
import { planBook } from '../../shared/book'
import { filterTreeByScope, type CompileScope } from '../../shared/compile'
import {
  chapterNumberFindings,
  type CompileFinding,
  type CompileValidationReport
} from '../../shared/compileValidation'
import { findBrokenLinks } from '../../shared/timeline'
import { draftChildren, matterFolder } from '../../shared/binder'
import type { BinderNode, DocumentNode } from '../../shared/binder'
import type { ExportPreset } from '../../shared/export'

/** Every document node in reading order — the same pre-order walk the
 *  outline uses, kept here because validation needs the full nodes
 *  (chapterNumber), not just titles. */
function collectDocuments(tree: BinderNode[]): DocumentNode[] {
  const docs: DocumentNode[] = []
  const walk = (nodes: BinderNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'document') docs.push(node)
      walk(node.children)
    }
  }
  walk(tree)
  return docs
}

/**
 * The pre-compile check, over exactly what the compile would include: the
 * scoped tree, the same content reduction the exporters run. Called by the
 * compile:validate IPC handler (the workbench's Run Checks) and consulted
 * before compile:run's render by the renderer's own flow — never silently.
 *
 * Findings are assembled project-level first, then structure, then
 * per-document content, then references — the order the pre-flight list
 * reads best in, not severity (everything here is a warning).
 */
export async function validateCompileScope(
  scope: CompileScope,
  stylePreset: ExportPreset
): Promise<CompileValidationReport> {
  const state = await binderStore.getState()
  // Exactly what the compile would include: the scoped Draft forest plus any
  // included Matter content. Chapter numbering runs over the manuscript
  // sequence only — a title page never joins the chapter count.
  const scopedDraftDocs = collectDocuments(filterTreeByScope(draftChildren(state.tree), scope))
  const matter = matterFolder(state.tree)
  const scopedMatterDocs = matter
    ? collectDocuments(filterTreeByScope([matter], scope)[0]?.children ?? [])
    : []
  const scopedDocs = [...scopedDraftDocs, ...scopedMatterDocs]
  const docName = (id: string): string =>
    scopedDocs.find((d) => d.id === id)?.name || 'Untitled'
  const findings: CompileFinding[] = []

  // -- Front-matter facts the output depends on ----------------------------
  if (!state.projectName?.trim()) {
    findings.push({
      kind: 'untitled-project',
      message: 'The project has no name — the compiled title and file name will read “Untitled Project”.'
    })
  }
  // Only manuscript format puts the author in a running header, so only
  // there is its absence a formatting problem rather than a preference.
  if (stylePreset === 'manuscript' && !state.authorName?.trim()) {
    findings.push({
      kind: 'missing-author',
      message:
        'No author name is set — manuscript format expects it in the running header on every page. Set it in Page Setup.'
    })
  }

  // -- Chapter numbering over the scoped manuscript sequence ---------------
  findings.push(
    ...chapterNumberFindings(
      scopedDraftDocs.map((d) => ({ id: d.id, name: d.name || 'Untitled', chapterNumber: d.chapterNumber }))
    )
  )

  // -- Book structure: what the planner flattens, and the front matter the
  //    interior expects. Same planBook the compile itself will run.
  if (stylePreset === 'book') {
    const settings = await peekCompileSettings()
    const scopedDraft = filterTreeByScope(draftChildren(state.tree), scope)
    const scopedMatter = matter ? (filterTreeByScope([matter], scope)[0]?.children ?? []) : []
    const matterBack = scopedMatter.filter((node) => node.id === settings.backMatterFolderId)
    const matterFront = scopedMatter.filter((node) => node.id !== settings.backMatterFolderId)
    const plan = planBook(scopedDraft, matterFront, matterBack)
    for (const warning of plan.warnings) {
      findings.push({ kind: 'book-structure', message: warning })
    }
    if (plan.frontDisplayIds.length === 0) {
      findings.push({
        kind: 'book-front-matter',
        message:
          'There is no front matter in scope — the book will open directly on Chapter 1, with no title page. The compile panel can create front matter.'
      })
    } else if (plan.frontDisplayIds.length < 4) {
      findings.push({
        kind: 'book-front-matter',
        message:
          'The front matter has fewer than four pages — book format expects half title, title, copyright, and dedication, in that order. Front matter created before the book preset lacks the half title.'
      })
    }
  }

  // -- Per-document content, via the exporters' own reduction --------------
  // htmlToBlocks → plain text is exactly what decides whether the compiled
  // output has anything in this section, so "empty" here means what export
  // would actually emit — not a guess from the raw HTML.
  const scopedDraftIds = new Set(scopedDraftDocs.map((d) => d.id))
  for (const doc of scopedDocs) {
    const blocks = htmlToBlocks(await loadDocument(doc.id))
    // Book chapters come from binder structure; an inserted chapter break
    // inside a document only forces a plain page break there.
    if (stylePreset === 'book' && scopedDraftIds.has(doc.id) && blocks.some((b) => b.kind === 'chapterBreak')) {
      findings.push({
        kind: 'book-structure',
        documentId: doc.id,
        message: `“${doc.name || 'Untitled'}” contains an inserted chapter break — in book format it acts as a plain page break. Splitting the document in the binder makes it a real chapter.`
      })
    }
    if (!blocksToPlainText(blocks).trim()) {
      findings.push({
        kind: 'empty-document',
        documentId: doc.id,
        message: `“${doc.name || 'Untitled'}” has no content — it will compile as an empty section.`
      })
    }
    // A footnote's text lives on its inline node, so a note can't dangle —
    // the real failure mode is a marker whose note was never written.
    for (const note of numberFootnotes(blocks)) {
      if (!note.text.trim()) {
        findings.push({
          kind: 'empty-footnote',
          documentId: doc.id,
          message: `“${doc.name || 'Untitled'}” has an empty footnote (marker ${note.number}) — it will print a number with no note.`
        })
      }
    }
  }

  // -- References from in-scope documents to things since deleted ----------
  const [storyBible, timeline, mentions] = await Promise.all([
    storyBibleStore.getState(),
    timelineStore.getState(),
    mentionStore.listMentions()
  ])
  const validItemIds = new Set(storyBible.items.map((item) => item.id))
  const allDocumentIds = new Set(collectDocuments(state.tree).map((d) => d.id))
  const scopedIds = new Set(scopedDocs.map((d) => d.id))

  for (const entry of timeline.entries) {
    if (!entry.documentId || !scopedIds.has(entry.documentId)) continue
    const broken = findBrokenLinks(entry, validItemIds, allDocumentIds)
    if (broken.itemIds.length === 0) continue
    findings.push({
      kind: 'timeline-broken-link',
      documentId: entry.documentId,
      message: `A continuity entry pinned to “${docName(entry.documentId)}” links ${
        broken.itemIds.length === 1 ? 'a Story Bible item' : `${broken.itemIds.length} Story Bible items`
      } that no longer exist${broken.itemIds.length === 1 ? 's' : ''}.`
    })
  }

  // Mention records are pruned when an item is deleted, so danglers are rare
  // — but a backup restore can resurrect them, and the sweep is cheap.
  const seenDanglers = new Set<string>()
  for (const mention of mentions) {
    if (!scopedIds.has(mention.documentId) || validItemIds.has(mention.itemId)) continue
    if (seenDanglers.has(mention.documentId)) continue
    seenDanglers.add(mention.documentId)
    findings.push({
      kind: 'dangling-mention',
      documentId: mention.documentId,
      message: `“${docName(mention.documentId)}” is marked as mentioning a Story Bible item that no longer exists.`
    })
  }

  return { findings, checkedDocuments: scopedDocs.length }
}
