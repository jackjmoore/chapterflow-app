import type { RailSection } from '../../shared/binder'
import {
  ManuscriptSectionIcon,
  StoryBibleViewIcon,
  TimelineViewIcon,
  SubmissionsViewIcon,
  LexiconViewIcon
} from './icons'

interface NavRailProps {
  activeSection: RailSection
  onChange: (section: RailSection) => void
}

/**
 * Primary navigation. Manuscript is one destination covering Editor/Outliner/
 * Corkboard (switched within that mode); the other three are tools that
 * reference manuscript data rather than being manuscript-editing surfaces.
 */
const SECTIONS: { id: RailSection; label: string; Icon: () => JSX.Element }[] = [
  { id: 'manuscript', label: 'Manuscript', Icon: ManuscriptSectionIcon },
  { id: 'storyBible', label: 'Story Bible', Icon: StoryBibleViewIcon },
  { id: 'timeline', label: 'Continuity Board', Icon: TimelineViewIcon },
  { id: 'submissions', label: 'Query Tracker', Icon: SubmissionsViewIcon },
  { id: 'lexicon', label: 'Lexicon', Icon: LexiconViewIcon }
]

function NavRail(props: NavRailProps): JSX.Element {
  const { activeSection, onChange } = props

  return (
    <div className="nav-rail">
      {SECTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-rail-button ${activeSection === id ? 'is-active' : ''}`}
          title={label}
          aria-label={label}
          aria-current={activeSection === id}
          onClick={() => onChange(id)}
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}

export default NavRail
