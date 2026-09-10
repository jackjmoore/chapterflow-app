import { Fragment, useEffect, useRef, type JSX } from 'react'
import type { Editor } from '@tiptap/react'
import type { Match } from './searchCore'
import { snippetFor } from './DocumentSearchResults'

interface SearchMatchDockProps {
  editor: Editor | null
  matches: Match[]
  currentIndex: number
  documentName: string
  query: string
  replacement: string
  onReplacementChange: (value: string) => void
  onGoToMatch: (index: number) => void
  onReplaceCurrent: () => void
  onReplaceAll: () => void
  onClose: () => void
}

/**
 * The matches in the open document, stood beside the manuscript instead of
 * over it.
 *
 * The drop-down answers "what did I find"; this answers "let me walk through
 * them", which is a different job and cannot be done from behind a panel that
 * covers the page. It takes the side panel's place while it is open, so the
 * manuscript keeps the whole of the rest of the window, and it carries the
 * same replace strip the drop-down has so the two never disagree about what
 * replacing would do.
 */
function SearchMatchDock(props: SearchMatchDockProps): JSX.Element {
  const {
    editor,
    matches,
    currentIndex,
    documentName,
    query,
    replacement,
    onReplacementChange,
    onGoToMatch,
    onReplaceCurrent,
    onReplaceAll,
    onClose
  } = props

  const currentRef = useRef<HTMLButtonElement>(null)

  // The list follows the editor: stepping through matches with the keyboard
  // must not leave the selected row somewhere off-screen.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentIndex])

  return (
    <div className="search-dock">
      <div className="search-dock-header">
        <span className="search-dock-title">
          {matches.length} {matches.length === 1 ? 'match' : 'matches'}
        </span>
        <span className="search-dock-sub">in {documentName}</span>
        <button type="button" className="search-dock-close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="search-dock-list" role="listbox" aria-label={`Matches for ${query}`}>
        {editor &&
          matches.map((match, index) => {
            const parts = snippetFor(editor, match)
            const isCurrent = index === currentIndex
            return (
              <button
                type="button"
                key={`${match.from}-${match.to}`}
                ref={isCurrent ? currentRef : undefined}
                className={`search-dock-match ${isCurrent ? 'is-current' : ''}`}
                aria-selected={isCurrent}
                onClick={() => onGoToMatch(index)}
              >
                <span className="search-dock-match-number">{index + 1}</span>
                <span className="search-dock-match-snippet">
                  {parts.leading && <Fragment>…</Fragment>}
                  {parts.before}
                  <mark>{parts.hit}</mark>
                  {parts.after}
                  {parts.trailing && <Fragment>…</Fragment>}
                </span>
              </button>
            )
          })}
      </div>

      <div className="search-dock-replace">
        <div className="search-dock-replace-row">
          <input
            className="outliner-filter-input search-dock-replace-input"
            type="text"
            placeholder="Replace with…"
            value={replacement}
            onChange={(e) => onReplacementChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onReplaceCurrent()
              }
            }}
          />
          <button
            type="button"
            className="outliner-open-button"
            disabled={!replacement.trim() || matches.length === 0}
            onClick={onReplaceCurrent}
          >
            This one
          </button>
          <button
            type="button"
            className="outliner-open-button"
            disabled={!replacement.trim() || matches.length === 0}
            onClick={onReplaceAll}
          >
            All {matches.length}
          </button>
        </div>
        <p className="search-dock-replace-note">Replacing changes this document only.</p>
      </div>
    </div>
  )
}

export default SearchMatchDock
