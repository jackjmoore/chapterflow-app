import { useEffect, useMemo, useState } from 'react'
import type { ParsedWordlist, ScrivenerWordlistScan } from '../../shared/scrivenerImport'

interface ScrivenerImportModalProps {
  onClose: () => void
  /** Reloads the Lexicon after words land, so the view is not stale. */
  onImported: (added: number) => void
}

/**
 * Import from Scrivener.
 *
 * Two independent things arrive under one action, and the checkboxes say so:
 * a .scriv project, and the machine-wide personal dictionary. Either can be
 * taken without the other — the dictionary belongs to no single project, so
 * wanting it says nothing about wanting a manuscript.
 *
 * The dictionary is shown in full before anything is written, with every word
 * deselectable. That is not politeness: one file is shared by every Scrivener
 * project on the computer, so it reliably contains names from manuscripts that
 * have nothing to do with this one, spellings the writer simply prefers, and
 * — in practice — the occasional typo they once told Scrivener to accept.
 */
function ScrivenerImportModal(props: ScrivenerImportModalProps): JSX.Element {
  const { onClose, onImported } = props

  const [wantProject, setWantProject] = useState(false)
  const [wantDictionary, setWantDictionary] = useState(true)

  const [scan, setScan] = useState<ScrivenerWordlistScan | null>(null)
  const [chosen, setChosen] = useState<ParsedWordlist | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    void window.api.scanScrivenerWordlists().then((next) => {
      setScan(next)
      // Only auto-select when there is no question which file is meant.
      if (!next.ambiguous && next.candidates.length === 1) setChosen(next.candidates[0])
    })
  }, [])

  const words = chosen?.words ?? []
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? words.filter((w) => w.toLowerCase().includes(q)) : words
  }, [words, filter])

  const selectedCount = words.length - excluded.size

  function toggle(word: string): void {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  /** Applies to what is on screen, so it composes with the filter rather than
   *  quietly acting on words the writer cannot see. */
  function setAllVisible(selected: boolean): void {
    setExcluded((current) => {
      const next = new Set(current)
      for (const word of visible) {
        if (selected) next.delete(word)
        else next.add(word)
      }
      return next
    })
  }

  async function pickManually(): Promise<void> {
    const picked = await window.api.pickScrivenerWordlist()
    if (picked.canceled) return
    if (picked.error) {
      setResult(`That file could not be read: ${picked.error}`)
      return
    }
    if (picked.parsed) {
      setChosen(picked.parsed)
      setExcluded(new Set())
    }
  }

  /**
   * Importing a project replaces the whole window: a new project root means
   * every renderer store is stale, and a reload is how this app has always
   * resynchronised after a root change.
   */
  async function importProject(): Promise<void> {
    setBusy(true)
    const outcome = await window.api.importScrivenerProject()
    setBusy(false)
    if (!outcome.imported) {
      if (outcome.reason && outcome.reason !== 'exists') setResult(outcome.reason)
      return
    }
    sessionStorage.setItem('chapterflow:openEditorOnLoad', '1')
    window.location.reload()
  }

  async function confirm(): Promise<void> {
    if (wantProject) {
      await importProject()
      return
    }
    if (!wantDictionary || !chosen) return
    const toImport = words.filter((w) => !excluded.has(w))
    if (toImport.length === 0) return
    setBusy(true)
    const outcome = await window.api.importScrivenerWords(toImport)
    setBusy(false)
    const parts = [`Added ${outcome.added} ${outcome.added === 1 ? 'word' : 'words'} to the Lexicon.`]
    if (outcome.alreadyPresent > 0) {
      parts.push(`${outcome.alreadyPresent} were already there.`)
    }
    setResult(parts.join(' '))
    onImported(outcome.added)
  }

  const nothingFound = scan !== null && scan.candidates.length === 0 && chosen === null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal scrivener-import-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Import from Scrivener</h2>
        <p className="modal-message">
          Choose what to bring across. These are independent of each other — the personal
          dictionary is shared by every Scrivener project on this computer, so you can take it
          without importing a manuscript.
        </p>

        <label className="scrivener-import-option">
          <input type="checkbox" checked={wantProject} onChange={(e) => setWantProject(e.target.checked)} />
          <span>
            <strong>Project structure and manuscript</strong>
            <span className="scrivener-import-note">
              The binder, its folders and every document’s text, as a new ChapterFlow project. Your
              Scrivener project is only read from, never changed.
            </span>
          </span>
        </label>

        <label className="scrivener-import-option">
          <input
            type="checkbox"
            checked={wantDictionary}
            onChange={(e) => setWantDictionary(e.target.checked)}
          />
          <span>
            <strong>Personal dictionary</strong>
            <span className="scrivener-import-note">
              The words you have told Scrivener to stop flagging. They become Lexicon entries here,
              which is what stops this app flagging them too.
            </span>
          </span>
        </label>

        {wantDictionary && (
          <div className="scrivener-import-body">
            {scan === null && <p className="scrivener-import-status">Looking for your word list…</p>}

            {scan?.ambiguous && (
              <div className="scrivener-import-ambiguous">
                <strong>Both known word lists exist on this computer.</strong> Nothing documents
                which one Scrivener treats as current, so this is not guessed. Choose the one you
                want:
                {scan.candidates.map((candidate) => (
                  <button
                    key={candidate.location?.path ?? '?'}
                    type="button"
                    className={`scrivener-import-choice ${chosen === candidate ? 'is-chosen' : ''}`}
                    onClick={() => {
                      setChosen(candidate)
                      setExcluded(new Set())
                    }}
                  >
                    {candidate.location?.label}
                    <span className="scrivener-import-note">
                      {candidate.error
                        ? `could not be read — ${candidate.error}`
                        : `${candidate.words.length} words`}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {nothingFound && (
              <div className="scrivener-import-status">
                <p>No word list was found. Both known locations were checked:</p>
                <ul className="scrivener-import-paths">
                  {scan?.searched.map((s) => (
                    <li key={s.path}>{s.label}</li>
                  ))}
                </ul>
                <button type="button" className="modal-cancel" onClick={() => void pickManually()}>
                  Choose the file myself…
                </button>
              </div>
            )}

            {chosen && chosen.empty && (
              <p className="scrivener-import-status">
                That file was read but held no words. Nothing will be imported.
              </p>
            )}

            {chosen && !chosen.empty && (
              <>
                <div className="scrivener-import-summary">
                  <span>
                    <strong>{selectedCount}</strong> of {words.length} words selected
                    {chosen.location ? ` from ${chosen.location.label}` : ''}
                    {chosen.duplicates > 0 ? ` · ${chosen.duplicates} duplicates merged` : ''}
                  </span>
                  <span className="scrivener-import-actions">
                    <button type="button" onClick={() => setAllVisible(true)}>
                      Select all
                    </button>
                    <button type="button" onClick={() => setAllVisible(false)}>
                      Select none
                    </button>
                  </span>
                </div>

                <input
                  type="text"
                  className="scrivener-import-filter"
                  placeholder="Filter these words…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />

                <div className="scrivener-import-words">
                  {visible.length === 0 && <span className="scrivener-import-note">No word matches that.</span>}
                  {visible.map((word) => (
                    <label key={word} className="scrivener-import-word">
                      <input
                        type="checkbox"
                        checked={!excluded.has(word)}
                        onChange={() => toggle(word)}
                      />
                      <span>{word}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {result && <p className="scrivener-import-result">{result}</p>}

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="modal-confirm"
            disabled={
              busy ||
              result !== null ||
              (!wantProject && (!wantDictionary || !chosen || chosen.empty || selectedCount === 0))
            }
            onClick={() => void confirm()}
          >
            {busy
              ? 'Importing…'
              : wantProject
                ? 'Choose a project…'
                : selectedCount > 0
                  ? `Import ${selectedCount} ${selectedCount === 1 ? 'word' : 'words'}`
                  : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ScrivenerImportModal
