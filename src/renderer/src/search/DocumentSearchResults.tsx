import { Fragment, type JSX } from 'react'
import type { Editor } from '@tiptap/react'
import type { Match } from './searchCore'
import { DocumentIcon } from '../icons'

/**
 * The matches in the open document, as a list.
 *
 * Deliberately the same rows, the same group header and the same collapse
 * affordance the project results use. Narrowing the scope should change what
 * is searched, not what the interface is: a counter and two arrows was a
 * different tool wearing the same bar, and that difference was what made half
 * the surface appear and disappear as the scope changed.
 *
 * Snippets come from the live ProseMirror document rather than the index,
 * because this list has to include edits made since the last save — which is
 * exactly what the index, by design, does not yet know about.
 */

interface DocumentSearchResultsProps {
  editor: Editor | null
  matches: Match[]
  currentIndex: number
  documentName: string
  collapsed: boolean
  onToggleCollapsed: () => void
  onGoToMatch: (index: number) => void
}

const CONTEXT_RADIUS = 60

interface SnippetParts {
  before: string
  hit: string
  after: string
  leading: boolean
  trailing: boolean
}

function snippetFor(editor: Editor, match: Match): SnippetParts {
  const doc = editor.state.doc
  const from = Math.max(0, match.from - CONTEXT_RADIUS)
  const to = Math.min(doc.content.size, match.to + CONTEXT_RADIUS)
  return {
    before: doc.textBetween(from, match.from, ' ', ' '),
    hit: doc.textBetween(match.from, match.to, ' ', ' '),
    after: doc.textBetween(match.to, to, ' ', ' '),
    leading: from > 0,
    trailing: to < doc.content.size
  }
}

function DocumentSearchResults(props: DocumentSearchResultsProps): JSX.Element {
  const { editor, matches, currentIndex, documentName, collapsed, onToggleCollapsed, onGoToMatch } = props

  return (
    <div className="search-results" role="listbox" aria-label="Matches in this document">
      <div
        className={`search-result-group ${collapsed ? 'is-collapsed' : ''}`}
        data-tier="document"
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <button
          type="button"
          className="search-result-group-label"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          <span className="search-result-group-caret" aria-hidden="true">
            {collapsed ? '▶' : '▼'}
          </span>
          <span className="search-result-group-name">In this document</span>
          <span className="search-result-group-count">{matches.length}</span>
          <span className="search-result-group-state">{collapsed ? 'Hidden' : 'Hide'}</span>
        </button>

        {!collapsed &&
          editor &&
          matches.map((match, index) => {
            const parts = snippetFor(editor, match)
            return (
              <button
                type="button"
                key={`${match.from}-${match.to}`}
                className={`search-result ${index === currentIndex ? 'is-current' : ''}`}
                data-tier="document"
                data-kind="documentMatch"
                onClick={() => onGoToMatch(index)}
              >
                <span className="search-result-icon">
                  <DocumentIcon />
                </span>
                <span className="search-result-body">
                  <span className="search-result-heading">
                    {documentName}
                    <span className="search-result-kind">
                      match {index + 1} of {matches.length}
                    </span>
                  </span>
                  <span className="search-result-detail">
                    {parts.leading && <Fragment>…</Fragment>}
                    {parts.before}
                    <mark className="search-result-hit">{parts.hit}</mark>
                    {parts.after}
                    {parts.trailing && <Fragment>…</Fragment>}
                  </span>
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}

export default DocumentSearchResults
