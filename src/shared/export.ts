import type { PageSize } from './preferences'

export type ExportFormat = 'txt' | 'pdf' | 'docx' | 'md'
export type ExportScope = 'document' | 'project'

/**
 * How the same content is dressed — and, for 'book', a different pipeline.
 *
 * 'standard' is the app's own look — the serif page you see in the editor.
 * 'manuscript' is the submission convention agents expect: 12pt Times New
 * Roman, double-spaced, 1-inch margins, a running header, `#` scene breaks.
 * Those two run through the identical block model and renderers; only the
 * styling inputs differ. 'book' is the print/POD interior: PDF-only,
 * compile-only, rendered by the segmented pipeline in main/export/bookPdf.ts
 * (see SPEC.md) because Chromium cannot express its folio rules directly.
 */
export type ExportPreset = 'standard' | 'manuscript' | 'book'

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
  /** The project's scene-break marker (a compile setting). Standard and
   *  book output normalize typed dividers to this; manuscript format always
   *  uses the conventional `#`. Absent means leave dividers as typed. */
  sceneBreakMark?: string
  /** Book preset only: the trim size and whether to render a Contents page.
   *  Carried here so the compile handler's settings reach the renderer
   *  without a second options type. Ignored by the other presets. */
  bookTrim?: import('./book').BookTrim
  bookIncludeContents?: boolean
  /** How consecutive Draft documents share pages — every style, uniformly.
   *  Absent means 'page'. See DocumentSeparation in shared/compile. */
  documentSeparation?: import('./compile').DocumentSeparation
  /** Substituted into matter documents' {{name}}/{{contact}}/{{address}}
   *  markers at render time. Absent means no substitution. */
  personalDetails?: import('./compile').PersonalDetails
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

/** The marker a preset actually renders scene breaks as: manuscript format is
 *  fixed to `#` by convention; standard uses the project's compile setting. */
export function effectiveSceneBreakMark(options: ExportOptions): string | undefined {
  return options.preset === 'manuscript' ? SCENE_BREAK_MARK : options.sceneBreakMark
}
