import { randomUUID } from 'crypto'
import { basename } from 'path'
import type { BinderNode, DocumentNode, FolderNode, StatusDef, TagDef } from '../../../shared/binder'
import { DRAFT_FOLDER_ID, NOTES_FOLDER_ID, TRASH_FOLDER_ID } from '../../../shared/binder'
import type { ImportWarningKind } from '../../../shared/import'
import { blocksToHtml } from '../../export/blocksToHtml'
import { openProject, type ProjectSource } from './projectSource'
import { rtfToBlocks } from './rtfToBlocks'
import { parseStylesXml, resolveStyleNames } from './scrivenerStyles'
import { collectTextNodes, documentPaths, scrivxToTree, type ScrivNode } from './scrivxToTree'
import { isPartSectionType, mapPalettes, readMetadataSettings } from './metadata'
import { readSnapshots } from './snapshots'

/**
 * Reading a whole Scrivener project into the shape this app stores.
 *
 * Produces everything an import needs and writes nothing: the caller owns the
 * order in which it lands, which matters — see the note on documents-first in
 * the IPC handler.
 */

export interface PreparedDocument {
  id: string
  html: string
  /** Earlier versions, oldest first, carrying their original dates. */
  snapshots: PreparedSnapshot[]
}

export interface PreparedSnapshot {
  html: string
  /** ISO 8601, from Scrivener's own record — never the moment of import. */
  timestamp: string
  title: string | null
}

export interface PreparedProject {
  title: string | null
  /** Ready to hand to binderStore.insertSubtree, one entry per destination. */
  placements: { parentId: string; nodes: BinderNode[] }[]
  /** Custom top-level folders, which insertSubtree cannot create. */
  topLevelFolders: { name: string; nodes: BinderNode[] }[]
  documents: PreparedDocument[]
  /** Total snapshots across every document, for the import report. */
  snapshotCount: number
  statuses: StatusDef[]
  tags: TagDef[]
  warnings: Partial<Record<ImportWarningKind, number>>
  /** Things the writer should be told about that are not losses. */
  notes: string[]
  failures: { fileName: string; reason: string }[]
}

const tally = (
  into: Partial<Record<ImportWarningKind, number>>,
  kind: ImportWarningKind,
  n = 1
): void => {
  into[kind] = (into[kind] ?? 0) + n
}

/** Scrivener 2 kept content at Files/Docs/<integer>.rtf. Refused rather than
 *  half-imported: the layout differs enough that a partial read would produce
 *  a plausible-looking project missing most of its text. */
function isScrivener2(files: string[]): boolean {
  return files.some((f) => /^Files\/Docs\//i.test(f)) && !files.some((f) => /^Files\/Data\//i.test(f))
}

export async function prepareProject(sourcePath: string): Promise<PreparedProject> {
  const source: ProjectSource = await openProject(sourcePath, basename(sourcePath))
  const files = await source.list()

  if (isScrivener2(files)) {
    throw new Error(
      'This looks like a Scrivener 2 project. Only Scrivener 3 projects can be imported — ' +
        'open it in Scrivener 3 first, which will convert it.'
    )
  }

  const manifestPath = files.find((f) => f.toLowerCase().endsWith('.scrivx'))
  if (!manifestPath) {
    throw new Error('No .scrivx file was found. Is this a Scrivener project folder?')
  }

  const xml = await source.readText(manifestPath)
  const project = scrivxToTree(xml)
  const settings = readMetadataSettings(xml)

  const warnings: Partial<Record<ImportWarningKind, number>> = {}
  const notes: string[] = []
  const failures: { fileName: string; reason: string }[] = []
  const documents: PreparedDocument[] = []

  if (settings.customFieldNames.length > 0) {
    tally(warnings, 'customMetadataDropped', settings.customFieldNames.length)
    notes.push(
      `Custom metadata is not imported. The fields left behind were: ${settings.customFieldNames.join(', ')}.`
    )
  }

  // Every keyword in the project, so the tag palette can be built in one pass.
  const allKeywords: string[] = []
  const gatherKeywords = (nodes: ScrivNode[]): void => {
    for (const node of nodes) {
      allKeywords.push(...node.keywords)
      gatherKeywords(node.children)
    }
  }
  gatherKeywords(project.roots)
  const palettes = mapPalettes(settings, allKeywords)

  // The project-wide style table, which is the only heading signal Scrivener
  // gives: \outlinelevel is absent from real projects.
  const stylesPath = files.find((f) => /^Files\/styles\.xml$/i.test(f))
  const styleNamesByUuid = stylesPath
    ? parseStylesXml(await source.readText(stylesPath))
    : new Map<string, string>()

  let compileFlagged = 0
  let snapshotCount = 0

  /** One Scrivener item becomes one binder node, recursively. */
  async function convert(node: ScrivNode, insideDraft: boolean, depth: number): Promise<BinderNode | null> {
    const paths = documentPaths(node.uuid)
    const hasContent = await source.exists(paths.content)
    const id = randomUUID()

    if (node.includeInCompile === false) compileFlagged++

    const children: BinderNode[] = []
    for (const child of node.children) {
      const converted = await convert(child, insideDraft, depth + 1)
      if (converted) children.push(converted)
    }

    // A folder with body text is imported as a document with children —
    // FolderNode carries no synopsis, so importing it as a folder would drop
    // one silently.
    const isDocument = node.kind === 'text' || hasContent

    if (isDocument) {
      let html = ''
      if (hasContent) {
        try {
          const styleNames = (await source.exists(paths.styles))
            ? resolveStyleNames(await source.readText(paths.styles), styleNamesByUuid)
            : new Map<number, string>()
          const parsed = await rtfToBlocks(await source.read(paths.content), { styleNames })
          html = blocksToHtml(parsed.blocks, { paragraphWrappedNodes: true })
          for (const [kind, count] of Object.entries(parsed.warnings)) {
            tally(warnings, kind as ImportWarningKind, count as number)
          }
        } catch (error) {
          failures.push({ fileName: `${node.title || node.uuid} (content.rtf)`, reason: (error as Error).message })
        }
      }
      // Earlier versions of this document. Each is RTF with the same inline
      // style markers as the body, so it needs the same style resolution —
      // otherwise every snapshot of a chapter opens with "<$Scr_Ps::0>".
      const snapshots: PreparedSnapshot[] = []
      for (const snapshot of await readSnapshots(source, node.uuid, files)) {
        try {
          const styleNames = snapshot.styleIds
            ? resolveStyleNames(snapshot.styleIds, styleNamesByUuid)
            : new Map<number, string>()
          const parsed = await rtfToBlocks(await source.read(snapshot.contentPath), { styleNames })
          snapshots.push({
            html: blocksToHtml(parsed.blocks, { paragraphWrappedNodes: true }),
            timestamp: snapshot.timestamp,
            title: snapshot.title
          })
        } catch (error) {
          failures.push({
            fileName: `${node.title || node.uuid} (snapshot ${snapshot.timestamp})`,
            reason: (error as Error).message
          })
        }
      }
      snapshotCount += snapshots.length

      documents.push({ id, html, snapshots })

      const synopsis = (await source.exists(paths.synopsis))
        ? (await source.readText(paths.synopsis)).trim()
        : ''

      // notes.rtf carries formatting the notes field cannot hold, so it is
      // flattened. Never appended to the body: a Draft document's body is the
      // compile source and the word-count source.
      let docNotes = ''
      if (await source.exists(paths.notes)) {
        try {
          const parsed = await rtfToBlocks(await source.read(paths.notes))
          docNotes = parsed.blocks
            .map((b) => b.runs.map((r) => r.text).join(''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        } catch {
          // A notes file that will not parse is not worth failing an import for.
        }
      }

      const tagIds: string[] = []
      const labelTag = node.labelId ? palettes.tagByLabelId.get(node.labelId) : undefined
      if (labelTag) tagIds.push(labelTag)
      for (const keyword of node.keywords) {
        const tagId = palettes.tagByKeyword.get(keyword.trim().toLowerCase())
        if (tagId && !tagIds.includes(tagId)) tagIds.push(tagId)
      }

      const document: DocumentNode = {
        id,
        type: 'document',
        name: node.title || 'Untitled',
        collapsed: false,
        synopsis,
        notes: docNotes,
        statusId: (node.statusId ? palettes.statusById.get(node.statusId) : undefined) ?? null,
        tagIds,
        wordTarget: null,
        chapterNumber: null,
        children
      }
      return document
    }

    const folder: FolderNode = {
      id,
      type: 'folder',
      name: node.title || 'Untitled',
      collapsed: false,
      children
    }
    // Only meaningful on a folder directly under Draft, which is also the only
    // place the book compile preset reads it.
    if (insideDraft && depth === 0 && isPartSectionType(node.sectionTypeId, settings.sectionTypes)) {
      folder.isPart = true
    }
    return folder
  }

  const placements: { parentId: string; nodes: BinderNode[] }[] = []
  const topLevelFolders: { name: string; nodes: BinderNode[] }[] = []
  const PROTECTED_NAMES = new Set(['draft', 'notes', 'matter', 'archive', 'trash'])

  for (const root of project.roots) {
    const insideDraft = root.kind === 'draft'
    const converted: BinderNode[] = []
    for (const child of root.children) {
      const node = await convert(child, insideDraft, 0)
      if (node) converted.push(node)
    }

    if (root.kind === 'draft') placements.push({ parentId: DRAFT_FOLDER_ID, nodes: converted })
    else if (root.kind === 'research') placements.push({ parentId: NOTES_FOLDER_ID, nodes: converted })
    else if (root.kind === 'trash') placements.push({ parentId: TRASH_FOLDER_ID, nodes: converted })
    else if (root.kind === 'text') {
      // A document at the binder root. moveNode refuses one and
      // ensureStructuralFolders would sweep it into Draft, which would put a
      // non-manuscript document into the manuscript — so it gets a folder of
      // its own to live in.
      const self = await convert(root, false, 0)
      topLevelFolders.push({ name: root.title || 'Untitled', nodes: self ? [self] : [] })
      notes.push(
        `"${root.title}" is a document at the top level of the Scrivener binder. ` +
          'It has been given a folder of its own, because this app does not allow a document there.'
      )
      continue
    } else {
      topLevelFolders.push({ name: root.title || 'Untitled', nodes: converted })
      if (PROTECTED_NAMES.has((root.title || '').trim().toLowerCase())) {
        notes.push(
          `"${root.title}" has the same name as one of this app's own folders. ` +
            'It has been imported as a separate folder of your own rather than merged into it.'
        )
      }
    }
  }

  if (compileFlagged > 0) {
    tally(warnings, 'compileFlagsIgnored', compileFlagged)
  }

  for (const problem of project.problems) notes.push(problem)

  return {
    title: project.title,
    placements,
    topLevelFolders,
    documents,
    snapshotCount,
    statuses: palettes.statuses,
    tags: palettes.tags,
    warnings,
    notes,
    failures
  }
}

/** Text items in the binder, for reporting counts before anything is written. */
export function countTextItems(roots: ScrivNode[]): number {
  return collectTextNodes(roots).length
}
