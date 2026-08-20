import type { PageSize } from './preferences'

export type ExportFormat = 'txt' | 'pdf' | 'docx' | 'md'
export type ExportScope = 'document' | 'project'

/**
 * How the same content is dressed, not a different export path.
 *
 * 'standard' is the app's own look — the serif page you see in the editor.
 * 'manuscript' is the submission convention agents expect: 12pt Times New
 * Roman, double-spaced, 1-inch margins, a running header, `#` scene breaks.
 * Both run through the identical block model and renderers; only the styling
 * inputs differ.
 */
export type ExportPreset = 'standard' | 'manuscript'

export interface ExportResult {
  saved: boolean
  path?: string
}

/** Everything the renderers need beyond the content itself. */
export interface ExportOptions {
  preset: ExportPreset
  pageSize: PageSize
  marginMm: number
  /** Shown in the manuscript running header alongside the title. */
  authorName: string | null
  /** Document name for a single export, project name for a whole-project one. */
  title: string
}

/** Standard manuscript format fixes margins at one inch regardless of the
 *  project's page-setup margin — that's part of the convention, not a
 *  preference. Page size still follows the user's setting, since A4 vs Letter
 *  is a regional difference rather than a formatting error. */
export const MANUSCRIPT_MARGIN_MM = 25.4

export function effectiveMarginMm(options: ExportOptions): number {
  return options.preset === 'manuscript' ? MANUSCRIPT_MARGIN_MM : options.marginMm
}

/**
 * A paragraph the writer meant as a scene divider: `***`, `* * *`, `#`, `---`.
 * Manuscript format renders all of these as a centered `#`; other presets
 * leave them exactly as typed.
 */
export function isSceneBreakText(text: string): boolean {
  const stripped = text.replace(/\s+/g, '')
  return stripped.length > 0 && stripped.length <= 9 && /^[*#\-_~•]+$/.test(stripped)
}

export const SCENE_BREAK_MARK = '#'
