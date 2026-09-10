import type { RailSection } from '../../shared/binder'
import {
  ManuscriptSectionIcon,
  ManuscriptSectionFilledIcon,
  StoryBibleViewIcon,
  StoryBibleViewFilledIcon,
  TimelineViewIcon,
  TimelineViewFilledIcon,
  CompileViewIcon,
  CompileViewFilledIcon,
  SubmissionsViewIcon,
  SubmissionsViewFilledIcon,
  LexiconViewIcon,
  LexiconViewFilledIcon,
  StatsIcon,
  StatsFilledIcon,
  AppearanceIcon,
  AppearanceFilledIcon
} from './icons'

interface NavRailProps {
  activeSection: RailSection
  onChange: (section: RailSection) => void
}

interface RailEntry {
  id: RailSection
  label: string
  Icon: () => JSX.Element
  /** The solid variant, shown only while this section is active — the third
   *  of the rail's three states (idle outline, hover outline+tint, active
   *  filled). */
  FilledIcon: () => JSX.Element
}

/**
 * Primary navigation. Manuscript is one destination covering Editor/Outliner/
 * Corkboard (switched within that mode); the others are tools that reference
 * manuscript data rather than being manuscript-editing surfaces.
 */
const SECTIONS: RailEntry[] = [
  { id: 'manuscript', label: 'Manuscript', Icon: ManuscriptSectionIcon, FilledIcon: ManuscriptSectionFilledIcon },
  { id: 'storyBible', label: 'Story Bible', Icon: StoryBibleViewIcon, FilledIcon: StoryBibleViewFilledIcon },
  { id: 'timeline', label: 'Continuity Board', Icon: TimelineViewIcon, FilledIcon: TimelineViewFilledIcon },
  { id: 'lexicon', label: 'Lexicon', Icon: LexiconViewIcon, FilledIcon: LexiconViewFilledIcon },
  // Compile stays immediately before the tracker: compile → submit is the
  // workflow, and the tracker consumes what this section produces.
  { id: 'compile', label: 'Compile', Icon: CompileViewIcon, FilledIcon: CompileViewFilledIcon },
  { id: 'submissions', label: 'Query Tracker', Icon: SubmissionsViewIcon, FilledIcon: SubmissionsViewFilledIcon }
]

/** Anchored to the rail's bottom: dashboards about the work and the
 *  workspace, not destinations inside the manuscript — the placement mirrors
 *  the distinction. */
const BOTTOM_SECTIONS: RailEntry[] = [
  { id: 'progress', label: 'Progress', Icon: StatsIcon, FilledIcon: StatsFilledIcon },
  { id: 'appearance', label: 'Appearance', Icon: AppearanceIcon, FilledIcon: AppearanceFilledIcon }
]

function NavRail(props: NavRailProps): JSX.Element {
  const { activeSection, onChange } = props

  const button = ({ id, label, Icon, FilledIcon }: RailEntry): JSX.Element => {
    const active = activeSection === id
    return (
      <button
        key={id}
        type="button"
        className={`nav-rail-button ${active ? 'is-active' : ''}`}
        aria-label={label}
        aria-current={active}
        onClick={() => onChange(id)}
      >
        <span className="nav-rail-icon">{active ? <FilledIcon /> : <Icon />}</span>
        {/* Always mounted, never conditionally rendered — hover only toggles
            classes on an element that is already in the DOM. That is the whole
            point: a `hovered === id && <span/>` would have no "before" state
            for the transition to run from, which is exactly why the earlier
            round of panel transitions never played. Rendering it for every
            button costs one span each and removes the problem entirely, so no
            presence hook is needed here — see .nav-rail-label in index.css,
            which drives it from CSS :hover using the shared motion tokens.

            aria-hidden because the button is already named by aria-label; the
            visible label would otherwise be announced a second time. The
            native `title` tooltip is deliberately gone — it would have
            surfaced a second, slower copy of this same text on top of it. */}
        <span className="nav-rail-label" aria-hidden="true">
          {label}
        </span>
      </button>
    )
  }

  return (
    <div className="nav-rail">
      {SECTIONS.map(button)}
      <div className="nav-rail-bottom">{BOTTOM_SECTIONS.map(button)}</div>
    </div>
  )
}

export default NavRail
