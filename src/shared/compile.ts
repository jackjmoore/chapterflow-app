import { flattenBinderOutline, type BinderNode } from './binder'
import type { BookTrim } from './book'
import type { CompileFinding } from './compileValidation'
import type { ExportFormat, ExportPreset } from './export'
import type { PageSize } from './preferences'

/**
 * Which parts of the binder a compile includes.
 *
 * 'selection' stores the checked node ids verbatim — documents AND folders,
 * exactly what the scope tree's checkboxes hold. One uniform rule for both
 * node types: a node is included iff its id is in the set, and excluding a
 * node excludes its entire subtree (the UI keeps the set ancestor-closed, so
 * checking a chapter checks the act above it). Storing the checked set rather
 * than a derived document list is what lets a childless divider folder
 * ("Part II" with no documents yet) survive a partial compile: it is in the
 * set because it was checked, not because content beneath it implies it.
 *
 * These are include-lists, deliberately: a preset saved as "first three
 * chapters" keeps meaning those three documents as the manuscript grows,
 * rather than silently swallowing every chapter added since. Ids that no
 * longer resolve are simply ignored.
 */
export type CompileScope = { mode: 'all' } | { mode: 'selection'; nodeIds: string[] }

/**
 * Prunes the binder tree to a scope, returning a filtered copy (input is
 * never mutated; 'all' returns the tree as-is). The pruned tree then flows
 * through the unchanged export pipeline — flattenBinderOutline stays THE
 * binder walk, and the export engine never learns scope exists.
 */
export function filterTreeByScope(tree: BinderNode[], scope: CompileScope): BinderNode[] {
  if (scope.mode === 'all') return tree
  const included = new Set(scope.nodeIds)
  const prune = (nodes: BinderNode[]): BinderNode[] => {
    const out: BinderNode[] = []
    for (const node of nodes) {
      // Subtree exclusion: children of an excluded node are never considered,
      // even if their own ids are in the set — a stale preset can hold a
      // checked child under an unchecked parent, and the parent must win or
      // the output would contain content under a heading that isn't there.
      if (!included.has(node.id)) continue
      out.push({ ...node, children: prune(node.children) })
    }
    return out
  }
  return prune(tree)
}

/** How a compile's coverage reads in history — computed against the live tree
 *  at compile time and stored on the meta, so the record keeps saying what was
 *  true then even after the binder changes. */
export interface CompileScopeSummary {
  includedDocuments: number
  totalDocuments: number
}

export function summarizeScope(tree: BinderNode[], scope: CompileScope): CompileScopeSummary {
  const countDocuments = (t: BinderNode[]): number =>
    flattenBinderOutline(t).filter((entry) => entry.isDocument).length
  const totalDocuments = countDocuments(tree)
  return {
    includedDocuments:
      scope.mode === 'all' ? totalDocuments : countDocuments(filterTreeByScope(tree, scope)),
    totalDocuments
  }
}

/**
 * One stored compile — the record behind a compiles/<id>/ artifact directory.
 *
 * Immutable once written (the store has no update API): everything here is a
 * fact about the moment of compilation, including the page setup used, so the
 * history can answer "what did I send" without re-deriving anything from
 * settings that may have changed since.
 */
export interface CompiledDraftMeta {
  id: string
  /** ISO timestamp. */
  createdAt: string
  name: string
  format: ExportFormat
  stylePreset: ExportPreset
  scope: CompileScope
  scopeSummary: CompileScopeSummary
  /** The manuscript page setup the compile ran with — the compile-panel
   *  settings, never the editor's live Page Setup. For a book compile these
   *  two are recorded but the layout is governed by bookTrim instead. */
  pageSize: PageSize
  marginMm: number
  /** Book compiles only: the trim the interior was laid out for. */
  bookTrim?: BookTrim
  /** Document body words only — same countWords definition the editor footer
   *  uses, so a compile and the live count can never disagree about a word. */
  wordCount: number
  /** How many validation findings the user compiled past. */
  warningsAccepted: number
  /** The findings themselves, verbatim — so the record can show *what* was
   *  waived, not just that something was. Absent when the compile was clean
   *  (and on compiles made before the validation pass existed). */
  acceptedFindings?: CompileFinding[]
}

/**
 * The manuscript page setup: per-project compile configuration, stored in the
 * project's compile.json — a genuinely separate surface from the editor's
 * Page Setup (a global preference driving the live paginated view). Seeded
 * once from that global setting the first time a project touches the compile
 * panel, then never synchronized: changing one must never move the other.
 */
/** The scene-break markers the workbench offers. The setting itself is a
 *  plain string, so a hand-edited compile.json can hold any short marker. */
export const SCENE_BREAK_MARK_CHOICES = ['* * *', '***', '#'] as const
export const DEFAULT_SCENE_BREAK_MARK = '* * *'

/**
 * How consecutive Draft documents are separated in paged output — one
 * project-level formatting choice, applied uniformly to every document
 * boundary in every style. 'page' (the default, the standard convention):
 * each document begins on a new page. 'divider': documents run on
 * continuously, separated by the project's scene-break marker instead of a
 * page break, for writers who would rather not spend a full page on short
 * documents. Purely formatting — it never changes what is a chapter, what
 * the Contents lists, or any other structure. Plain text and Markdown have
 * no pages and ignore it.
 */
export type DocumentSeparation = 'page' | 'divider'
export const DEFAULT_DOCUMENT_SEPARATION: DocumentSeparation = 'page'

/**
 * The writer's personal details for the compiled output's matter pages —
 * stored here as their own fields, never baked into document prose. Matter
 * documents reference them with {{name}}, {{contact}} and {{address}}
 * markers, and compile substitutes the current values at render time, so
 * editing the details updates every future compile without re-editing the
 * matter documents.
 */
export interface PersonalDetails {
  name: string
  contact: string
  address: string
}

export const EMPTY_PERSONAL_DETAILS: PersonalDetails = { name: '', contact: '', address: '' }

const DETAIL_TOKEN = /\{\{\s*(name|contact|address)\s*\}\}/g

function escapeDetailHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Substitutes {{name}}/{{contact}}/{{address}} markers in a matter
 *  document's HTML with the stored details (escaped). A multi-line value
 *  substitutes as separate paragraphs — the export block parser has no
 *  line-break concept inside a paragraph, so closing and reopening the
 *  paragraph is what actually keeps an address on its own lines. An unset
 *  detail substitutes as nothing. */
export function applyPersonalDetails(html: string, details: PersonalDetails): string {
  return html.replace(DETAIL_TOKEN, (_match, field: keyof PersonalDetails) =>
    escapeDetailHtml(details[field] ?? '').replace(/\r?\n/g, '</p><p>')
  )
}

export interface CompileSettings {
  pageSize: PageSize
  marginMm: number
  /** Workbench defaults — what the format/preset pickers show next time. */
  format: ExportFormat
  stylePreset: ExportPreset
  /** The one marker every typed scene divider compiles to in standard and
   *  book styles, decided once per project. Manuscript ignores it, uses `#`. */
  sceneBreakMark: string
  /** Book preset: trim size (fixed mirrored margins derive from it). */
  bookTrim: BookTrim
  /** Book preset: whether the compiled interior renders a Contents page. */
  bookIncludeContents: boolean
  /** How consecutive documents are separated in paged output, every style,
   *  every document uniformly — see DocumentSeparation. */
  documentSeparation: DocumentSeparation
  /** See PersonalDetails — the stored fields the {{name}}/{{contact}}/
   *  {{address}} markers in matter documents resolve to at compile time. */
  personalDetails: PersonalDetails
  /** The binder folders this project designated as its front/back matter,
   *  created through the compile panel. Ordinary folders — editable,
   *  scopeable, exported by the same walk — the designation only lets the
   *  panel show they exist and future formatting decisions find them. Null
   *  until created; kept (not scrubbed) if the folder is later deleted, the
   *  same leave-the-record-alone rule references follow everywhere else. */
  frontMatterFolderId: string | null
  backMatterFolderId: string | null
}

/**
 * A saved compile configuration: scope + format + style under one name
 * ("Query Package" = first three chapters as manuscript docx), so a repeated
 * compile is one click, not a re-selection. The scope stores checked node
 * ids, so a preset keeps meaning those documents as the manuscript grows —
 * see CompileScope. Page setup is deliberately NOT part of a preset: it is
 * one-per-project (the manuscript's physical format), not per-output.
 */
export interface CompilePreset {
  id: string
  name: string
  scope: CompileScope
  format: ExportFormat
  stylePreset: ExportPreset
}
