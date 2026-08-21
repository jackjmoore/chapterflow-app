import { useEffect, useRef, useState } from 'react'
import type { LexiconEntry } from '../../shared/lexicon'
import { TrashIcon } from './icons'

interface LexiconViewProps {
  entries: LexiconEntry[]
  /** Which entry the nav list asked to show, so clicking there scrolls here. */
  revealRequest: { id: string; token: number } | null
  onAdd: (word: string) => Promise<void>
  onUpdate: (id: string, changes: Partial<Pick<LexiconEntry, 'word' | 'meaning' | 'pronunciation'>>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

/**
 * The project's Lexicon: words the spellchecker doesn't know, each with an
 * optional meaning and pronunciation.
 *
 * Nothing here is automatic — entries exist because the writer added them,
 * from this page or from "Define in Lexicon" in the editor. Every entry also
 * stops its word being flagged, but that suppression lives in the project's
 * own word list, never in the operating system's dictionary.
 */
function LexiconView(props: LexiconViewProps): JSX.Element {
  const { entries, revealRequest, onAdd, onUpdate, onDelete } = props
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!revealRequest) return
    const row = rowRefs.current[revealRequest.id]
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    row.classList.add('is-revealed')
    const timer = setTimeout(() => row.classList.remove('is-revealed'), 1200)
    return () => clearTimeout(timer)
  }, [revealRequest])

  const query = filter.trim().toLowerCase()
  const visible = query
    ? entries.filter(
        (e) =>
          e.word.toLowerCase().includes(query) ||
          e.meaning.toLowerCase().includes(query) ||
          e.pronunciation.toLowerCase().includes(query)
      )
    : entries

  async function commitNew(): Promise<void> {
    const word = draft.trim()
    if (!word) return
    setDraft('')
    await onAdd(word)
  }

  return (
    <div className="lexicon-view">
      <div className="lexicon-header">
        <h1 className="lexicon-title">Lexicon</h1>
        <p className="lexicon-intro">
          Words this project knows. Each one stops being marked as a spelling mistake in the editor — inside
          ChapterFlow only, never in your system dictionary.
        </p>
        <div className="lexicon-add">
          <input
            type="text"
            className="typography-field-input"
            placeholder="Add a word…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitNew()
            }}
          />
          <button type="button" className="modal-confirm modal-confirm--primary" onClick={() => void commitNew()}>
            Add
          </button>
        </div>
        {entries.length > 0 && (
          <input
            type="text"
            className="panel-nav-filter lexicon-filter"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </div>

      <div className="lexicon-list">
        {entries.length === 0 && (
          <p className="panel-nav-empty">
            No words yet. Add one above, or right-click a word in the editor and choose “Define in Lexicon”.
          </p>
        )}
        {entries.length > 0 && visible.length === 0 && <p className="panel-nav-empty">Nothing matches that.</p>}

        {visible.map((entry) => (
          <div
            key={entry.id}
            className="lexicon-row"
            ref={(el) => {
              rowRefs.current[entry.id] = el
            }}
          >
            <input
              className="lexicon-word"
              value={entry.word}
              onChange={(e) => void onUpdate(entry.id, { word: e.target.value })}
              aria-label="Word"
            />
            <input
              className="lexicon-field"
              placeholder="Pronunciation"
              value={entry.pronunciation}
              onChange={(e) => void onUpdate(entry.id, { pronunciation: e.target.value })}
              aria-label="Pronunciation"
            />
            <textarea
              className="lexicon-field lexicon-meaning"
              placeholder="Meaning"
              value={entry.meaning}
              onChange={(e) => void onUpdate(entry.id, { meaning: e.target.value })}
              aria-label="Meaning"
            />
            <button
              type="button"
              className="row-delete lexicon-delete"
              title="Delete entry — the word can be flagged as a misspelling again"
              onClick={() => void onDelete(entry.id)}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LexiconView
