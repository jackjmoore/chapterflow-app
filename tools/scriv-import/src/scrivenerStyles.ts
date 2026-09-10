import type { Align } from '../../../src/main/export/htmlToBlocks'

/**
 * Scrivener's named styles, and what they mean for the Block model.
 *
 * Scrivener 3 does not put style information in the RTF itself. It marks
 * ranges inline with its own convention —
 *
 *     <$Scr_Ps::0>Chapter 23<!$Scr_Ps::0>
 *
 * — where the number indexes a per-document `content.styles` sidecar holding a
 * comma-separated list of style UUIDs, which `Files/styles.xml` names. All
 * three pieces are needed to learn that a line is a "Title".
 *
 * This matters more than it sounds. In a real 129-document project, this is
 * the ONLY heading information available: \outlinelevel never appears, and the
 * stylesheet destination carries nothing usable. Without it every chapter
 * heading imports as an ordinary paragraph.
 *
 * The markers themselves are plain text as far as RTF is concerned, so nothing
 * in a correct RTF parser strips them — they have to be removed deliberately
 * or every chapter arrives with "<$Scr_Ps::0>" in front of its title.
 */

/** Matches an opening or closing marker of any of Scrivener's marker families. */
export const SCRIVENER_MARKER = /<(!?)\$Scr_(Ps|Cs|H)::(\d+)>/g

export interface MarkerScan {
  /** The text with every marker removed. */
  text: string
  /** Style indices opened by this text, in order. */
  opened: number[]
  /** True when a marker of the \\$Scr_H family opened — a heading range, which
   *  is more specific than the paragraph style wrapping it. */
  sawHeadingMarker: boolean
}

export function stripMarkers(text: string): MarkerScan {
  if (!text.includes('<')) return { text, opened: [], sawHeadingMarker: false }
  const opened: number[] = []
  let sawHeadingMarker = false
  const cleaned = text.replace(SCRIVENER_MARKER, (_all, closing: string, family: string, index: string) => {
    if (!closing) {
      opened.push(Number(index))
      if (family === 'H') sawHeadingMarker = true
    }
    return ''
  })
  return { text: cleaned, opened, sawHeadingMarker }
}

/**
 * index -> style name, for one document.
 *
 * `content.styles` is a comma-separated list of style UUIDs; the Nth entry is
 * what marker index N refers to. Verified against a real project: a document
 * whose sidecar reads "EEC03D91…,8C95B3FE…,D3E912B8…" uses Scr_Ps::0, ::1 and
 * ::2, resolving to Title, Heading 1 and Centered Text.
 */
export function resolveStyleNames(
  contentStyles: string | null,
  namesByUuid: Map<string, string>
): Map<number, string> {
  const out = new Map<number, string>()
  if (!contentStyles) return out
  const ids = contentStyles
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  ids.forEach((id, index) => {
    const name = namesByUuid.get(id)
    if (name) out.set(index, name)
  })
  return out
}

/** UUID -> style name, from Files/styles.xml. Read once per project. */
export function parseStylesXml(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /<Style\b[^>]*\bID\s*=\s*"([^"]+)"[^>]*\bName\s*=\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.set(m[1], m[2])
  return out
}

/** What a named style should become in the Block model. */
export type StyleTreatment =
  | { kind: 'heading'; level: number }
  | { kind: 'blockquote' }
  | { kind: 'paragraph'; align?: Align }
  | { kind: 'unsupported' }

/**
 * The mapping, by name.
 *
 * Names are what a writer sees and edits, so they are matched loosely and
 * case-insensitively rather than by UUID — a project that renamed "Heading 1"
 * still works, and the built-in set below is only the default Scrivener ships.
 * An unrecognised style is not an error: it simply carries no treatment, and
 * the paragraph keeps whatever the RTF said.
 */
export function styleTreatment(name: string | undefined): StyleTreatment | null {
  if (!name) return null
  const n = name.trim().toLowerCase()

  if (n === 'title') return { kind: 'heading', level: 1 }
  const heading = /^heading\s*(\d+)/.exec(n)
  if (heading) return { kind: 'heading', level: Math.min(Number(heading[1]), 3) }
  if (/^(sub)?title$/.test(n)) return { kind: 'heading', level: 2 }

  if (/quote/.test(n) && !/attribution/.test(n)) return { kind: 'blockquote' }
  if (/^cent(er|re)ed/.test(n)) return { kind: 'paragraph', align: 'center' }
  if (/^attribution$/.test(n)) return { kind: 'paragraph', align: 'right' }

  // The editor schema has no code node at all — StarterKit disables both
  // codeBlock and code — so this is a real drop rather than a downgrade.
  if (/^code/.test(n)) return { kind: 'unsupported' }

  // Verse, Caption, Emphasis and anything a writer invented: no block-level
  // meaning the model can hold. Emphasis in particular is a character style
  // and the RTF already carries the italics, so there is nothing to do.
  return null
}
