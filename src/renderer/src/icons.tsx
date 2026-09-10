import type { ReactNode } from 'react'

/**
 * One icon size and one optical stroke weight for the whole interface.
 *
 * The size is 16 and the weight is 1.4. An icon drawn smaller compensates its
 * stroke by the same ratio, so the line it draws still reads at the same
 * weight — without that, a 12px chevron beside a 16px glyph looks hairline
 * even though both were "1.4". Every stroked icon here goes through this
 * helper, so introducing a second weight means changing one constant.
 */
const ICON_SIZE = 16
const ICON_STROKE = 1.4

function Svg({
  children,
  size = ICON_SIZE,
  className = 'icon',
  grid = ICON_SIZE
}: {
  children: ReactNode
  /** Smaller than 16 only for inline affordances that sit inside a line of
   *  text, such as the binder's disclosure chevron. */
  size?: number
  className?: string
  /** The coordinate grid the paths were drawn on, when it is not 16. */
  grid?: number
}): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={(ICON_STROKE * grid) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/**
 * ChapterFlow's mark: a heron at the waterline — solitary, patient, watchful.
 *
 * A filled silhouette rather than the UI set's 1.4 stroke, deliberately: a
 * brand mark reads as a shape, not a glyph, and the fill is what survives
 * 16px. Draws in currentColor so it wears whatever ink its context does.
 * The same path is rasterized into the OS app icon by
 * scripts/make-app-icon.mjs — change one, regenerate the other.
 */
export const HERON_BODY =
  'M2.5,12 L17,9.8 C19,9.4 23,9 25.5,9.2 L31,10.8 L26.6,12.6 ' +
  'C28.6,15.5 28.2,18 27.4,21 C26.6,24.8 27.2,28.5 31,31.8 ' +
  'C34,34.4 38,35.8 42,36.4 C49,37.5 54.5,40 58,44 ' +
  'C56,45.5 54,46.2 52,46.5 C46,48.5 38,48 33,45.5 ' +
  'C28.5,43 26,39 25.5,34 C25.2,29.5 23.8,24.5 22.4,20.4 ' +
  'C21.6,17.8 22.8,15.4 24.6,13.8 L17.5,12.6 Z'
export const HERON_LEG = 'M42,47.5 L43,53 L41.5,58'
export const HERON_WATER = 'M12,58 L54,58'

export function HeronMarkIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d={HERON_BODY} fill="currentColor" />
      <g stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" fill="none">
        <path d={HERON_LEG} />
        <path d={HERON_WATER} />
      </g>
    </svg>
  )
}

export function AlignLeftIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="10" y2="8" />
      <line x1="2" y1="12" x2="12" y2="12" />
    </Svg>
  )
}

export function AlignCenterIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="4" y1="8" x2="12" y2="8" />
      <line x1="3" y1="12" x2="13" y2="12" />
    </Svg>
  )
}

export function AlignRightIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="6" y1="8" x2="14" y2="8" />
      <line x1="4" y1="12" x2="14" y2="12" />
    </Svg>
  )
}

export function AlignJustifyIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </Svg>
  )
}

export function BulletListIcon(): JSX.Element {
  return (
    <Svg>
      <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <line x1="6" y1="4" x2="14" y2="4" />
      <line x1="6" y1="8" x2="14" y2="8" />
      <line x1="6" y1="12" x2="14" y2="12" />
    </Svg>
  )
}

export function OrderedListIcon(): JSX.Element {
  return (
    <Svg>
      <text x="0.5" y="5.5" fontSize="4.5" fill="currentColor" stroke="none">
        1
      </text>
      <text x="0.5" y="9.5" fontSize="4.5" fill="currentColor" stroke="none">
        2
      </text>
      <text x="0.5" y="13.5" fontSize="4.5" fill="currentColor" stroke="none">
        3
      </text>
      <line x1="6" y1="4" x2="14" y2="4" />
      <line x1="6" y1="8" x2="14" y2="8" />
      <line x1="6" y1="12" x2="14" y2="12" />
    </Svg>
  )
}

export function IndentIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="7" y1="4" x2="14" y2="4" />
      <line x1="7" y1="8" x2="14" y2="8" />
      <line x1="7" y1="12" x2="14" y2="12" />
      <path d="M2 6 L5 8 L2 10 Z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function OutdentIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="7" y1="4" x2="14" y2="4" />
      <line x1="7" y1="8" x2="14" y2="8" />
      <line x1="7" y1="12" x2="14" y2="12" />
      <path d="M5 6 L2 8 L5 10 Z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function TextColorIcon(): JSX.Element {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16">
      <text x="2" y="12" fontSize="12" fontWeight="700" fill="currentColor">
        A
      </text>
    </svg>
  )
}

export function HighlightIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M9.5 2.5 L13.5 6.5 L7 13 L3 13 L3 9 Z" />
      <line x1="2" y1="14.5" x2="14" y2="14.5" />
    </Svg>
  )
}

export function TagSpanIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M2 2h5.5L14 8.5 8.5 14 2 7.5V2Z" />
      <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function FolderIcon(): JSX.Element {
  return (
    <Svg className="icon tree-icon" size={15}>
      <path d="M1.5 3.5 h4 l1.2 1.5 h7.3 v8 a1 1 0 0 1 -1 1 h-10.5 a1 1 0 0 1 -1 -1 z" />
    </Svg>
  )
}

export function DocumentIcon(): JSX.Element {
  return (
    <Svg className="icon tree-icon" size={15}>
      <path d="M3.5 1.5 h6 l3 3 v10 a1 1 0 0 1 -1 1 h-8 a1 1 0 0 1 -1 -1 v-12 a1 1 0 0 1 1 -1 z" />
      <path d="M9.5 1.5 v3 h3" />
    </Svg>
  )
}

export function ChevronIcon(): JSX.Element {
  return (
    <Svg className="icon chevron-icon" size={12}>
      <path d="M5 3 L11 8 L5 13" />
    </Svg>
  )
}

export function PlusIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </Svg>
  )
}

export function NewFolderIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M1.5 3.5 h4 l1.2 1.5 h7.3 v8 a1 1 0 0 1 -1 1 h-10.5 a1 1 0 0 1 -1 -1 z" />
      <line x1="8" y1="7.5" x2="8" y2="11.5" />
      <line x1="6" y1="9.5" x2="10" y2="9.5" />
    </Svg>
  )
}

export function NewDocumentIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M3.5 1.5 h6 l3 3 v10 a1 1 0 0 1 -1 1 h-8 a1 1 0 0 1 -1 -1 v-12 a1 1 0 0 1 1 -1 z" />
      <path d="M9.5 1.5 v3 h3" />
      <line x1="8" y1="8.5" x2="8" y2="12.5" />
      <line x1="6" y1="10.5" x2="10" y2="10.5" />
    </Svg>
  )
}

export function TrashIcon(): JSX.Element {
  return (
    <Svg size={14}>
      <path d="M3 4.5 h10" />
      <path d="M6 4.5 v-1.5 a1 1 0 0 1 1 -1 h2 a1 1 0 0 1 1 1 v1.5" />
      <path d="M4.5 4.5 l0.6 8.5 a1 1 0 0 0 1 0.9 h3.8 a1 1 0 0 0 1 -0.9 l0.6 -8.5" />
    </Svg>
  )
}

export function UndoIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M4 4 L4 7 L7 7" />
      <path d="M4.3 6.7 A5 5 0 1 1 4.5 11.5" />
    </Svg>
  )
}

export function RedoIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M12 4 L12 7 L9 7" />
      <path d="M11.7 6.7 A5 5 0 1 0 11.5 11.5" />
    </Svg>
  )
}

export function SunIcon(): JSX.Element {
  return (
    <Svg>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5 v1.5 M8 13 v1.5 M1.5 8 h1.5 M13 8 h1.5 M3.3 3.3 l1.1 1.1 M11.6 11.6 l1.1 1.1 M3.3 12.7 l1.1 -1.1 M11.6 4.4 l1.1 -1.1" />
    </Svg>
  )
}

export function MoonIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M13 9.3 A5.5 5.5 0 1 1 6.7 3 A4.3 4.3 0 0 0 13 9.3 Z" />
    </Svg>
  )
}

export function CaseSensitiveIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M1 11 L4 4 L7 11 M2 8.5 h4" />
      <path d="M9.5 7.2 a2.2 2.2 0 1 1 0 3.6 a2.2 2.2 0 0 1 0 -3.6 Z" />
      <path d="M13.7 6.8 v4.2" />
    </Svg>
  )
}

export function WholeWordIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M1.5 5 a2 2 0 1 1 0 4 a2 2 0 0 1 0 -4 Z" />
      <path d="M5.3 3.5 v6" />
      <path d="M9 5 a2 2 0 1 1 0 4 a2 2 0 0 1 0 -4 Z" />
      <path d="M12.7 3.5 v6" />
      <line x1="1" y1="12.5" x2="14.5" y2="12.5" />
    </Svg>
  )
}

export function RegexIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M4 3 v6" />
      <path d="M1.4 4.5 l5.2 3" />
      <path d="M6.6 4.5 l-5.2 3" />
      <circle cx="12" cy="10.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9.5 9 l5 3 M14.5 9 l-5 3 M12 8 v5" />
    </Svg>
  )
}

export function CloseIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </Svg>
  )
}

export function SearchIcon(): JSX.Element {
  return (
    <Svg>
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.2" y1="10.2" x2="14" y2="14" />
    </Svg>
  )
}

export function OptionsIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
      <circle cx="6" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function EditorViewIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M3.5 1.5 h6 l3 3 v10 a1 1 0 0 1 -1 1 h-8 a1 1 0 0 1 -1 -1 v-12 a1 1 0 0 1 1 -1 z" />
      <path d="M9.5 1.5 v3 h3" />
      <line x1="5" y1="9" x2="11" y2="9" />
      <line x1="5" y1="11.5" x2="11" y2="11.5" />
    </Svg>
  )
}

export function OutlinerViewIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2" y1="3.5" x2="14" y2="3.5" />
      <line x1="4" y1="8" x2="14" y2="8" />
      <line x1="6" y1="12.5" x2="14" y2="12.5" />
    </Svg>
  )
}

export function CorkboardViewIcon(): JSX.Element {
  return (
    <Svg>
      <rect x="1.5" y="1.5" width="5.5" height="6.5" rx="0.6" />
      <rect x="9" y="1.5" width="5.5" height="6.5" rx="0.6" />
      <rect x="1.5" y="9.5" width="5.5" height="5" rx="0.6" />
      <rect x="9" y="9.5" width="5.5" height="5" rx="0.6" />
    </Svg>
  )
}

/* Filled variants for the nav-rail's active state — the same geometry as
   the outline icons, rendered as solid silhouettes. Interior details are
   stroked in the active button's own fill (--chrome-control-active-bg) so
   they read as cutouts rather than picking up a second color. */

export function ManuscriptSectionFilledIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M4.5 2.5 h5 l2.5 2.5 v8 a0.5 0.5 0 0 1 -0.5 0.5 h-7 a0.5 0.5 0 0 1 -0.5 -0.5 z" fill="currentColor" stroke="none" />
      <line x1="6" y1="8" x2="10" y2="8" stroke="var(--chrome-control-active-bg)" />
      <line x1="6" y1="10.5" x2="10" y2="10.5" stroke="var(--chrome-control-active-bg)" />
    </Svg>
  )
}

export function StoryBibleViewFilledIcon(): JSX.Element {
  return (
    <Svg>
      <path
        d="M2.5 3 a1 1 0 0 1 1 -1 h3.5 a1.5 1.5 0 0 1 1 0.4 a1.5 1.5 0 0 1 1 -0.4 h3.5 a1 1 0 0 1 1 1 v9.5 a1 1 0 0 1 -1 1 h-3.5 a1.5 1.5 0 0 0 -1 0.4 a1.5 1.5 0 0 0 -1 -0.4 h-3.5 a1 1 0 0 1 -1 -1 z"
        fill="currentColor"
        stroke="none"
      />
      <line x1="8" y1="2.4" x2="8" y2="13.9" stroke="var(--chrome-control-active-bg)" />
    </Svg>
  )
}

export function TimelineViewFilledIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="4" y1="2.5" x2="4" y2="13.5" />
      <circle cx="4" cy="5" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="4" cy="11" r="1.9" fill="currentColor" stroke="none" />
      <line x1="7" y1="5" x2="13.5" y2="5" strokeWidth="2.2" />
      <line x1="7" y1="11" x2="12" y2="11" strokeWidth="2.2" />
    </Svg>
  )
}

export function SubmissionsViewFilledIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M2.5 3.5 a1 1 0 0 1 1 -1 h9 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 h-9 a1 1 0 0 1 -1 -1 z" fill="currentColor" stroke="none" />
      <line x1="5" y1="6" x2="11" y2="6" stroke="var(--chrome-control-active-bg)" />
      <line x1="5" y1="8.5" x2="11" y2="8.5" stroke="var(--chrome-control-active-bg)" />
      <line x1="5" y1="11" x2="8.5" y2="11" stroke="var(--chrome-control-active-bg)" />
    </Svg>
  )
}

export function CompileViewFilledIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M5 3.5 v-0.5 a1 1 0 0 1 1 -1 h6 a1 1 0 0 1 1 1 v7.5 a1 1 0 0 1 -1 1 h-0.5" />
      <path
        d="M2.5 5.5 a1 1 0 0 1 1 -1 h6 a1 1 0 0 1 1 1 v7.5 a1 1 0 0 1 -1 1 h-6 a1 1 0 0 1 -1 -1 z"
        fill="currentColor"
        stroke="none"
      />
      <line x1="4.5" y1="8" x2="8.5" y2="8" stroke="var(--chrome-control-active-bg)" />
      <line x1="4.5" y1="10.5" x2="7" y2="10.5" stroke="var(--chrome-control-active-bg)" />
    </Svg>
  )
}

export function LexiconViewFilledIcon(): JSX.Element {
  return (
    <Svg grid={24}>
      {/* Same optical scale-up as the outline variant, for the same reason. */}
      <g transform="translate(12 12) scale(1.125) translate(-12 -12)" strokeWidth={(1.4 * 24) / 16 / 1.125}>
        <path
          d="M12 6.5C10.5 5.2 8.6 4.6 6 4.6c-.8 0-1.5.05-2 .12v13c.5-.07 1.2-.12 2-.12 2.6 0 4.5.6 6 1.9 1.5-1.3 3.4-1.9 6-1.9.8 0 1.5.05 2 .12v-13c-.5-.07-1.2-.12-2-.12-2.6 0-4.5.6-6 1.9z"
          fill="currentColor"
          stroke="none"
        />
        <path d="M12 6.5v13" stroke="var(--chrome-control-active-bg)" />
      </g>
    </Svg>
  )
}

export function StatsFilledIcon(): JSX.Element {
  return (
    <Svg>
      <rect x="2" y="7.5" width="2.6" height="6" rx="1" fill="currentColor" stroke="none" />
      <rect x="6.7" y="3.5" width="2.6" height="10" rx="1" fill="currentColor" stroke="none" />
      <rect x="11.4" y="9.5" width="2.6" height="4" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function AppearanceFilledIcon(): JSX.Element {
  return (
    <Svg>
      <path
        d="M8 2 a6 6 0 1 0 0 12 c1.2 0 1.6 -0.8 1.2 -1.7 c-0.4 -0.9 0 -1.8 1.1 -1.8 h1.6 a2.1 2.1 0 0 0 2.1 -2.3 A6 6 0 0 0 8 2 z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx="5.2" cy="6.2" r="0.9" fill="var(--chrome-control-active-bg)" stroke="none" />
      <circle cx="8.3" cy="4.8" r="0.9" fill="var(--chrome-control-active-bg)" stroke="none" />
      <circle cx="11.2" cy="6.4" r="0.9" fill="var(--chrome-control-active-bg)" stroke="none" />
      <circle cx="5" cy="9.6" r="0.9" fill="var(--chrome-control-active-bg)" stroke="none" />
    </Svg>
  )
}

export function AppearanceIcon(): JSX.Element {
  return (
    <Svg>
      {/* A painter's palette: the appearance dashboard. */}
      <path d="M8 2 a6 6 0 1 0 0 12 c1.2 0 1.6 -0.8 1.2 -1.7 c-0.4 -0.9 0 -1.8 1.1 -1.8 h1.6 a2.1 2.1 0 0 0 2.1 -2.3 A6 6 0 0 0 8 2 z" />
      <circle cx="5.2" cy="6.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8.3" cy="4.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="11.2" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5" cy="9.6" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function DraftViewIcon(): JSX.Element {
  return (
    <Svg>
      {/* A continuous scroll of text: one tall page, lines running through. */}
      <path d="M4 1.5 h8 a1 1 0 0 1 1 1 v11 a1 1 0 0 1 -1 1 h-8 a1 1 0 0 1 -1 -1 v-11 a1 1 0 0 1 1 -1 z" />
      <line x1="5.5" y1="4.5" x2="10.5" y2="4.5" />
      <line x1="5.5" y1="7" x2="10.5" y2="7" />
      <line x1="5.5" y1="9.5" x2="10.5" y2="9.5" />
      <line x1="5.5" y1="12" x2="8.5" y2="12" />
    </Svg>
  )
}

export function BookViewIcon(): JSX.Element {
  return (
    <Svg>
      {/* An open book: two page leaves meeting at a spine. */}
      <path d="M8 3.5 C6.5 2.3 4.2 2 2 2.4 v10 c2.2 -0.4 4.5 -0.1 6 1.1" />
      <path d="M8 3.5 C9.5 2.3 11.8 2 14 2.4 v10 c-2.2 -0.4 -4.5 -0.1 -6 1.1" />
      <line x1="8" y1="3.5" x2="8" y2="14.5" />
    </Svg>
  )
}

export function StatsIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="3" y1="13" x2="3" y2="8" />
      <line x1="8" y1="13" x2="8" y2="4" />
      <line x1="13" y1="13" x2="13" y2="10" />
    </Svg>
  )
}

export function SplitViewIcon(): JSX.Element {
  return (
    <Svg>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <line x1="8" y1="2.5" x2="8" y2="13.5" />
    </Svg>
  )
}

export function LockIcon({ open = false }: { open?: boolean }): JSX.Element {
  return (
    <Svg>
      <rect x="3" y="7.5" width="10" height="7" rx="1.2" />
      {open ? <path d="M5 7.5 V5 a3 3 0 0 1 5.5 -1.7" /> : <path d="M5 7.5 V5 a3 3 0 0 1 6 0 v2.5" />}
    </Svg>
  )
}

export function SyncScrollIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M5.5 3 L2.5 5.5 L5.5 8" />
      <path d="M2.5 5.5 H9" />
      <path d="M10.5 8 L13.5 10.5 L10.5 13" />
      <path d="M13.5 10.5 H7" />
    </Svg>
  )
}

export function SubmissionsViewIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M2.5 3.5 a1 1 0 0 1 1 -1 h9 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 h-9 a1 1 0 0 1 -1 -1 z" />
      <line x1="5" y1="6" x2="11" y2="6" />
      <line x1="5" y1="8.5" x2="11" y2="8.5" />
      <line x1="5" y1="11" x2="8.5" y2="11" />
    </Svg>
  )
}

/** Compile: a finished page atop the stack it was assembled from. */
export function CompileViewIcon(): JSX.Element {
  return (
    <Svg>
      {/* Back sheet, peeking out behind the front one. */}
      <path d="M5 3.5 v-0.5 a1 1 0 0 1 1 -1 h6 a1 1 0 0 1 1 1 v7.5 a1 1 0 0 1 -1 1 h-0.5" />
      {/* Front sheet. */}
      <path d="M2.5 5.5 a1 1 0 0 1 1 -1 h6 a1 1 0 0 1 1 1 v7.5 a1 1 0 0 1 -1 1 h-6 a1 1 0 0 1 -1 -1 z" />
      <line x1="4.5" y1="8" x2="8.5" y2="8" />
      <line x1="4.5" y1="10.5" x2="7" y2="10.5" />
    </Svg>
  )
}

export function StoryBibleViewIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M2.5 3 a1 1 0 0 1 1 -1 h3.5 a1.5 1.5 0 0 1 1 0.4 a1.5 1.5 0 0 1 1 -0.4 h3.5 a1 1 0 0 1 1 1 v9.5 a1 1 0 0 1 -1 1 h-3.5 a1.5 1.5 0 0 0 -1 0.4 a1.5 1.5 0 0 0 -1 -0.4 h-3.5 a1 1 0 0 1 -1 -1 z" />
      <line x1="8" y1="2.4" x2="8" y2="13.9" />
    </Svg>
  )
}

/** Rail icon for the Manuscript section — a stack of pages, standing for all
 *  three manuscript views rather than any one of them. */
export function ManuscriptSectionIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M4.5 2.5 h5 l2.5 2.5 v8 a0.5 0.5 0 0 1 -0.5 0.5 h-7 a0.5 0.5 0 0 1 -0.5 -0.5 z" />
      <path d="M9.5 2.5 v2.5 h2.5" />
      <line x1="6" y1="8" x2="10" y2="8" />
      <line x1="6" y1="10.5" x2="10" y2="10.5" />
    </Svg>
  )
}

/** Chevrons for collapsing / re-opening the side panel. */
export function PanelCollapseIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M9.5 4 L5.5 8 L9.5 12" />
    </Svg>
  )
}

export function PanelExpandIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M6.5 4 L10.5 8 L6.5 12" />
    </Svg>
  )
}

export function TimelineViewIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="4" y1="2.5" x2="4" y2="13.5" />
      <circle cx="4" cy="5" r="1.4" />
      <circle cx="4" cy="11" r="1.4" />
      <line x1="7" y1="5" x2="13.5" y2="5" />
      <line x1="7" y1="11" x2="12" y2="11" />
    </Svg>
  )
}

export function DragHandleIcon(): JSX.Element {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="6" cy="4" r="1.1" />
      <circle cx="10" cy="4" r="1.1" />
      <circle cx="6" cy="8" r="1.1" />
      <circle cx="10" cy="8" r="1.1" />
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="10" cy="12" r="1.1" />
    </svg>
  )
}

export function ImageBlockIcon(): JSX.Element {
  return (
    <Svg>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <circle cx="5.5" cy="6" r="1.2" />
      <path d="M2 12 l4 -4 l2.5 2.5 l2 -2 l3.5 3.5" />
    </Svg>
  )
}

export function TextBlockIcon(): JSX.Element {
  return (
    <Svg>
      <line x1="2.5" y1="3.5" x2="13.5" y2="3.5" />
      <line x1="2.5" y1="7" x2="13.5" y2="7" />
      <line x1="2.5" y1="10.5" x2="9.5" y2="10.5" />
      <line x1="2.5" y1="14" x2="11" y2="14" />
    </Svg>
  )
}

/** Lexicon — an open book, distinct from the Story Bible's bookmark.
 *  Drawn on a 24 grid with proportionally wider margins than the 16-grid
 *  set, so the inner scale-up restores optical parity with its rail
 *  neighbours; the group stroke-width pre-divides the scale so the rendered
 *  line stays at the set's one weight. */
const LEXICON_SCALE = 'translate(12 12) scale(1.125) translate(-12 -12)'
const LEXICON_STROKE = (1.4 * 24) / 16 / 1.125

export function LexiconViewIcon(): JSX.Element {
  return (
    <Svg grid={24}>
      <g transform={LEXICON_SCALE} strokeWidth={LEXICON_STROKE}>
        <path d="M12 6.5C10.5 5.2 8.6 4.6 6 4.6c-.8 0-1.5.05-2 .12v13c.5-.07 1.2-.12 2-.12 2.6 0 4.5.6 6 1.9" />
        <path d="M12 6.5c1.5-1.3 3.4-1.9 6-1.9.8 0 1.5.05 2 .12v13c-.5-.07-1.2-.12-2-.12-2.6 0-4.5.6-6 1.9" />
        <path d="M12 6.5v13" />
      </g>
    </Svg>
  )
}

export function CommentIcon(): JSX.Element {
  return (
    <Svg>
      <path d="M2.5 3.5h11v7.5h-6.5l-3 2.5v-2.5h-1.5z" />
    </Svg>
  )
}

export function HistoryIcon(): JSX.Element {
  return (
    <Svg>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4.8v3.4l2.2 1.4" />
    </Svg>
  )
}
