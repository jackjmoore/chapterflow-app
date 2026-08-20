import type { ManuscriptView } from '../../shared/binder'
import { EditorViewIcon, OutlinerViewIcon, CorkboardViewIcon } from './icons'

interface ViewSwitcherProps {
  activeView: ManuscriptView
  onChange: (view: ManuscriptView) => void
}

/** Sub-mode switch *within* the Manuscript rail section — three ways of
 *  looking at the same documents, not three destinations. Story Bible, the
 *  Continuity Board, and the Query Tracker are reached from the rail instead,
 *  because they aren't views of the manuscript at all. */
const VIEWS: { id: ManuscriptView; label: string; Icon: () => JSX.Element }[] = [
  { id: 'editor', label: 'Editor', Icon: EditorViewIcon },
  { id: 'outliner', label: 'Outliner', Icon: OutlinerViewIcon },
  { id: 'corkboard', label: 'Corkboard', Icon: CorkboardViewIcon }
]

function ViewSwitcher(props: ViewSwitcherProps): JSX.Element {
  const { activeView, onChange } = props

  return (
    <div className="view-switcher">
      {VIEWS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`view-switcher-button ${activeView === id ? 'is-active' : ''}`}
          onClick={() => onChange(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

export default ViewSwitcher
