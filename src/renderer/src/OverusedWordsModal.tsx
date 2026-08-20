import { useEffect, useMemo, useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import {
  analyzeDocuments,
  findTermOccurrences,
  snippetAround,
  DEFAULT_ANALYZE_OPTIONS,
  type ScannedDocument,
  type TermStat
} from '../../shared/wordFrequency'
import { CloseIcon, TrashIcon } from './icons'

export interface OverusedOccurrence {
  documentId: string
  documentName: string
  /** Which occurrence within that document — the jump steps the find bar
   *  forward this many times after seeding the search. */
  indexInDocument: number
  snippet: string
}

interface OverusedWordsModalProps {
  /** Every document's plain text, already gathered by App (the active
   *  document's text comes from the live editor so unsaved edits count). */
  documents: ScannedDocument[]
  tree: BinderNode[]
  activeDocumentId: string | null
  ignoreList: string[]
  onSaveIgnoreList: (words: string[]) => void
  onJump: (occurrence: OverusedOccurrence, term: string) => void
  onClose: () => void
}

type Scope = 'document' | 'project'

function OverusedWordsModal(props: OverusedWordsModalProps): JSX.Element {
  const { documents, activeDocumentId, ignoreList, onSaveIgnoreList, onJump, onClose } = props

  const [scope, setScope] = useState<Scope>(activeDocumentId ? 'document' : 'project')
  const [minCount, setMinCount] = useState(DEFAULT_ANALYZE_OPTIONS.minCount)
  const [includePhrases, setIncludePhrases] = useState(true)
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null)
  const [showIgnoreEditor, setShowIgnoreEditor] = useState(false)
  const [ignoreDraft, setIgnoreDraft] = useState('')

  // Scoping to the open document is the common case while revising a scene;
  // the whole project catches habits that only show up at length.
  const scanned = useMemo(
    () => (scope === 'document' ? documents.filter((d) => d.id === activeDocumentId) : documents),
    [scope, documents, activeDocumentId]
  )

  const { terms, totalWords } = useMemo(
    () => analyzeDocuments(scanned, { ...DEFAULT_ANALYZE_OPTIONS, minCount, includePhrases, ignore: ignoreList }),
    [scanned, minCount, includePhrases, ignoreList]
  )

  // A term that stops being reported (ignored, or the threshold moved) must
  // not leave a stale occurrence list open beneath it.
  useEffect(() => {
    if (expandedTerm && !terms.some((t) => t.term === expandedTerm)) setExpandedTerm(null)
  }, [terms, expandedTerm])

  const nameById = useMemo(() => new Map(documents.map((d) => [d.id, d.name])), [documents])

  function occurrencesFor(term: string): OverusedOccurrence[] {
    const out: OverusedOccurrence[] = []
    for (const doc of scanned) {
      const hits = findTermOccurrences(doc.text, term)
      hits.forEach((hit, index) => {
        out.push({
          documentId: doc.id,
          documentName: nameById.get(doc.id) || 'Untitled',
          indexInDocument: index,
          snippet: snippetAround(doc.text, hit.start, hit.end)
        })
      })
    }
    return out
  }

  function ignoreTerm(term: string): void {
    onSaveIgnoreList([...ignoreList, term])
  }

  function removeIgnored(word: string): void {
    onSaveIgnoreList(ignoreList.filter((w) => w !== word))
  }

  function addIgnoreDraft(): void {
    // Comma- or newline-separated, so a list of character names can be pasted.
    const additions = ignoreDraft.split(/[,\n]/).map((w) => w.trim()).filter(Boolean)
    if (additions.length) onSaveIgnoreList([...ignoreList, ...additions])
    setIgnoreDraft('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal overused-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">Overused Words</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="overused-controls">
          <div className="span-tag-browser-filter-row">
            <button
              type="button"
              className={scope === 'document' ? 'span-tag-filter-pill is-active' : 'span-tag-filter-pill'}
              disabled={!activeDocumentId}
              title={activeDocumentId ? undefined : 'No document is open'}
              onClick={() => setScope('document')}
            >
              This document
            </button>
            <button
              type="button"
              className={scope === 'project' ? 'span-tag-filter-pill is-active' : 'span-tag-filter-pill'}
              onClick={() => setScope('project')}
            >
              Whole project
            </button>
          </div>

          <label className="overused-control">
            <span>Flag at</span>
            <input
              type="number"
              min={2}
              max={99}
              className="overused-min-input"
              value={minCount}
              onChange={(e) => setMinCount(Math.max(2, Number(e.target.value) || 2))}
            />
            <span>+ uses</span>
          </label>

          <label className="overused-control">
            <input type="checkbox" checked={includePhrases} onChange={(e) => setIncludePhrases(e.target.checked)} />
            <span>Include phrases</span>
          </label>

          <button
            type="button"
            className="story-bible-manage-types-button"
            onClick={() => setShowIgnoreEditor((v) => !v)}
          >
            Ignore list ({ignoreList.length})
          </button>
        </div>

        {showIgnoreEditor && (
          <div className="overused-ignore-editor">
            <p className="modal-message">
              Words here are never flagged, and phrases containing them are skipped too — character names,
              deliberate motifs.
            </p>
            <div className="overused-ignore-add">
              <input
                type="text"
                className="typography-field-input"
                style={{ marginBottom: 0 }}
                placeholder="Add words, separated by commas…"
                value={ignoreDraft}
                onChange={(e) => setIgnoreDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addIgnoreDraft()
                  }
                }}
              />
              <button type="button" className="modal-confirm" onClick={addIgnoreDraft}>
                Add
              </button>
            </div>
            <div className="overused-ignore-chips">
              {ignoreList.length === 0 && <span className="tag-status-filter-empty">Nothing ignored yet.</span>}
              {ignoreList.map((word) => (
                <span key={word} className="overused-ignore-chip">
                  {word}
                  <button type="button" title={`Stop ignoring "${word}"`} onClick={() => removeIgnored(word)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="overused-summary">
          {scanned.length === 0
            ? 'Nothing to scan.'
            : `${terms.length} ${terms.length === 1 ? 'result' : 'results'} across ${totalWords.toLocaleString()} words` +
              (scope === 'project' ? ` in ${scanned.length} ${scanned.length === 1 ? 'document' : 'documents'}` : '')}
        </p>

        {terms.length === 0 ? (
          <p className="backups-empty">
            Nothing repeats that often. Lower the threshold to widen the net.
          </p>
        ) : (
          <div className="backups-list overused-list">
            {terms.map((stat: TermStat) => {
              const isOpen = expandedTerm === stat.term
              return (
                <div key={stat.term} className="overused-entry">
                  <div className="overused-row">
                    <button
                      type="button"
                      className="overused-row-main"
                      onClick={() => setExpandedTerm(isOpen ? null : stat.term)}
                    >
                      <span className={`overused-term ${stat.wordCount > 1 ? 'is-phrase' : ''}`}>{stat.term}</span>
                      <span className="overused-count">{stat.count}×</span>
                      <span className="overused-rate">{stat.per1000.toFixed(1)} per 1k</span>
                    </button>
                    <button
                      type="button"
                      className="overused-ignore-button"
                      title={`Never flag "${stat.term}"`}
                      onClick={() => ignoreTerm(stat.term)}
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="overused-occurrences">
                      {occurrencesFor(stat.term).map((occ, i) => (
                        <button
                          key={`${occ.documentId}-${occ.indexInDocument}-${i}`}
                          type="button"
                          className="overused-occurrence"
                          onClick={() => onJump(occ, stat.term)}
                        >
                          <span className="overused-occurrence-doc">{occ.documentName}</span>
                          <span className="overused-occurrence-snippet">{occ.snippet}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default OverusedWordsModal
