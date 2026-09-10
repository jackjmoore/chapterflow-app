/** One category of content that couldn't be carried into the app's own
 *  formatting model, tallied so an import can always say what it dropped
 *  rather than silently losing it. */
export interface ImportWarning {
  kind: ImportWarningKind
  count: number
}

export type ImportWarningKind =
  | 'trackedChangesAccepted'
  | 'commentsDropped'
  | 'footnotesDropped'
  | 'imagesDropped'
  | 'tablesFlattened'
  | 'hyperlinksFlattened'
  | 'headingsClamped'
  | 'nestedListsFlattened'
  | 'unsupportedFormattingDropped'
  // Added for the Scrivener importer. Annotations are inline notes in the RTF;
  // the encoding fallback fires when a file declares a codepage iconv-lite
  // does not know, so the text may be wrong rather than merely plainer.
  | 'annotationsDropped'
  | 'textEncodingFallback'
  // Scrivener carries per-document metadata this app has no field for, and
  // per-document compile flags its Draft-scoped compile cannot express.
  | 'customMetadataDropped'
  | 'compileFlagsIgnored'

/** Human-readable, past-tense descriptions shown in the post-import summary. */
export const IMPORT_WARNING_LABELS: Record<ImportWarningKind, string> = {
  trackedChangesAccepted:
    'tracked change(s) — insertions were kept and deletions discarded, so you have the final text',
  commentsDropped: 'comment(s) — removed, their text was not imported',
  footnotesDropped: 'footnote/endnote reference(s) — removed, their text was not imported',
  imagesDropped: 'image(s) or embedded object(s) — removed',
  tablesFlattened: 'table(s) — cell text kept as ordinary paragraphs, the grid was not',
  hyperlinksFlattened: 'hyperlink(s) — link text kept, the URL was not',
  headingsClamped: 'heading(s) below level 3 — moved up to Heading 3, the deepest level this app has',
  nestedListsFlattened: 'nested list item(s) — flattened to a single level',
  unsupportedFormattingDropped: 'run(s) with formatting this app has no equivalent for (e.g. strikethrough)',
  annotationsDropped: 'inline annotation(s) dropped',
  textEncodingFallback: 'file(s) whose text encoding could not be identified, so some characters may be wrong',
  customMetadataDropped: 'custom metadata field(s) dropped',
  compileFlagsIgnored: 'document(s) whose Include in Compile setting was not carried across'
}

export interface ImportedDocument {
  id: string
  name: string
}

export interface ImportFailure {
  fileName: string
  reason: string
}

export interface ImportResult {
  canceled: boolean
  documents: ImportedDocument[]
  warnings: ImportWarning[]
  failures: ImportFailure[]
}
