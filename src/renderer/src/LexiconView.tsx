import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LexiconEntry, SuppressedWord } from '../../shared/lexicon'
import { normalizeWord, wordsIn } from '../../shared/lexicon'
import type { StoryBibleItem } from '../../shared/storyBible'

interface LexiconViewProps {
  entries: LexiconEntry[]
  /** The project's whole suppression list, with the source that asked for each
   *  word. The Lexicon owns only half of it; the other half is Story Bible
   *  names, and this page is the only place that can say so. */
  suppressed: SuppressedWord[]
  /** For the display form of a suppressed word. The store keeps words
   *  lower-cased for matching, so "halloway" has to be read back to
   *  "Halloway" from the name that registered it. */
  storyBibleItems: StoryBibleItem[]
  /** Set when something elsewhere asks to show one entry — a search result, or
   *  a Lexicon hover card in the editor. Scrolls it into view and flashes it. */
  revealRequest: { id: string; token: number } | null
  onAdd: (word: string) => Promise<void>
  onUpdate: (id: string, changes: Partial<Pick<LexiconEntry, 'word' | 'meaning' | 'pronunciation'>>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** How far below the top of the view a jumped-to letter sits. */
const JUMP_GAP = 16

/** Where a word files. Anything not starting with a letter groups under the
 *  first letter it does contain, and words with none at all go last. */
function letterOf(word: string): string {
  const match = word.toUpperCase().match(/[A-Z]/)
  return match ? match[0] : '#'
}

/**
 * The Lexicon as a glossary.
 *
 * It is a reference more than a form: words set in the page's serif with their
 * pronunciation beside them and the meaning beneath, filed under a letter, in
 * a column the width of something you would actually read. Editing is behind
 * a hover action rather than permanently on screen, but it is still the same
 * commit-as-you-type fields underneath — nothing here has a save button.
 *
 * The alphabet across the top is the way to move: hovering a letter takes the
 * page to it, and a letter with no words under it does nothing at all. It is
 * deliberately not a row of buttons.
 */
function LexiconView(props: LexiconViewProps): JSX.Element {
  const { entries, suppressed, storyBibleItems, revealRequest, onAdd, onUpdate, onDelete } = props
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [currentLetter, setCurrentLetter] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const query = filter.trim().toLowerCase()
  const visible = query
    ? entries.filter(
        (e) =>
          e.word.toLowerCase().includes(query) ||
          e.meaning.toLowerCase().includes(query) ||
          e.pronunciation.toLowerCase().includes(query)
      )
    : entries

  /** Alphabetical, which is the only order a glossary can be in. */
  const groups = useMemo(() => {
    const byLetter = new Map<string, LexiconEntry[]>()
    for (const entry of [...visible].sort((a, b) => a.word.localeCompare(b.word))) {
      const letter = letterOf(entry.word)
      const list = byLetter.get(letter)
      if (list) list.push(entry)
      else byLetter.set(letter, [entry])
    }
    return [...byLetter.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  const lettersPresent = useMemo(() => new Set(groups.map(([letter]) => letter)), [groups])

  /**
   * The Story Bible's half of the suppression list, listed as the names that
   * caused it rather than as the words it actually holds.
   *
   * Suppression works per word, because that is the only granularity a
   * spellchecker reports at, so "Kestrel Point" is on the list as "kestrel"
   * and "point". Printing those is accurate and useless: the reader is shown
   * "Old", "Point" and "the" as though they were names. The names are what
   * this section is explaining, so the names are what it shows.
   */
  const storyBibleNames = useMemo(() => {
    const sourcesByWord = new Map(suppressed.map((entry) => [entry.word, entry.sources]))
    const seen = new Set<string>()
    const out: { phrase: string; alsoLexicon: boolean }[] = []
    for (const item of storyBibleItems) {
      for (const phrase of [item.name, ...item.aliases]) {
        const trimmed = phrase.trim()
        if (!trimmed || seen.has(trimmed.toLowerCase())) continue
        const words = wordsIn(trimmed)
        if (words.length === 0) continue
        // Only what is genuinely on the list: a name added but not yet
        // registered has no business being described as suppressed.
        if (!words.some((word) => sourcesByWord.get(normalizeWord(word))?.includes('storyBible'))) continue
        seen.add(trimmed.toLowerCase())
        out.push({
          phrase: trimmed,
          // Marked only when the whole name is also a lexicon entry, which is
          // true of the alias "Wren" but not of "Wren Halloway".
          alsoLexicon: words.every((word) => sourcesByWord.get(normalizeWord(word))?.includes('lexicon'))
        })
      }
    }
    return out.sort((a, b) => a.phrase.localeCompare(b.phrase))
  }, [suppressed, storyBibleItems])

  /** Words the Story Bible put on the list that the Lexicon has not. Saying
   *  "more words" about a word already counted as a lexicon entry would be
   *  counting it twice. */
  const extraWordCount = useMemo(
    () =>
      suppressed.filter((entry) => entry.sources.includes('storyBible') && !entry.sources.includes('lexicon'))
        .length,
    [suppressed]
  )

  useEffect(() => {
    if (!revealRequest) return
    const row = rowRefs.current[revealRequest.id]
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    row.classList.add('is-revealed')
    const timer = setTimeout(() => row.classList.remove('is-revealed'), 1200)
    return () => clearTimeout(timer)
  }, [revealRequest])

  /**
   * Without trailing space the last letters cannot reach the top of the view,
   * so hovering Y would leave you looking at W and the strip would mark W as
   * where you are. Enough room is added under the page for the final group to
   * sit at the top like any other.
   */
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    // Measured with the stylesheet's own padding, then replaced by it — so
    // the base has to come back out of the measurement and back into the
    // total, or the page ends up exactly one page-padding short.
    scroll.style.paddingBottom = ''
    const base = parseFloat(getComputedStyle(scroll).paddingBottom) || 0
    const groupEls = scroll.querySelectorAll('.lexicon-group')
    const last = groupEls[groupEls.length - 1]
    if (!last) return
    const lastTop = last.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
    const contentBelow = scroll.scrollHeight - lastTop - base
    // JUMP_GAP more than a full view, so the last letter lands where every
    // other letter lands rather than as far as the scroll happens to reach.
    const needed = Math.max(base, scroll.clientHeight - contentBelow + JUMP_GAP)
    scroll.style.paddingBottom = `${Math.round(needed)}px`
  }, [groups, storyBibleNames])

  /** Which letter is at the top, so the strip reads as a position as well as
   *  a way of moving. */
  function updateCurrentLetter(): void {
    const scroll = scrollRef.current
    if (!scroll) return
    const top = scroll.getBoundingClientRect().top
    let letter: string | null = null
    scroll.querySelectorAll('.lexicon-group').forEach((group) => {
      if (group.getBoundingClientRect().top - top <= 24) {
        letter = (group as HTMLElement).dataset.letter ?? null
      }
    })
    setCurrentLetter(letter ?? (groups[0]?.[0] ?? null))
  }

  useEffect(() => {
    updateCurrentLetter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  /** Hover, not click, and instant rather than smoothed: sweeping the strip
   *  should flip through the glossary, not queue up animations. */
  function jumpTo(letter: string): void {
    const scroll = scrollRef.current
    if (!scroll) return
    const group = scroll.querySelector(`.lexicon-group[data-letter="${letter}"]`)
    if (!group) return
    scroll.scrollTop += group.getBoundingClientRect().top - scroll.getBoundingClientRect().top - JUMP_GAP
  }

  async function commitNew(): Promise<void> {
    const word = draft.trim()
    if (!word) return
    setDraft('')
    await onAdd(word)
  }

  function renderEntry(entry: LexiconEntry): JSX.Element {
    const editing = editingId === entry.id
    return (
      <div
        key={entry.id}
        className={`lexicon-entry ${editing ? 'is-editing' : ''}`}
        ref={(el) => {
          rowRefs.current[entry.id] = el
        }}
      >
        {editing ? (
          <>
            {/* The same commit-as-you-type fields the page has always had.
                Opening them changes what is on screen, not when it saves. */}
            <div className="lexicon-edit-row">
              <input
                className="lexicon-edit-word"
                value={entry.word}
                autoFocus
                aria-label="Word"
                onChange={(e) => void onUpdate(entry.id, { word: e.target.value })}
              />
              <input
                className="lexicon-edit-pron"
                value={entry.pronunciation}
                placeholder="Pronunciation"
                aria-label="Pronunciation"
                onChange={(e) => void onUpdate(entry.id, { pronunciation: e.target.value })}
              />
              <button type="button" className="outliner-open-button" onClick={() => setEditingId(null)}>
                Done
              </button>
            </div>
            <textarea
              className="lexicon-edit-meaning"
              value={entry.meaning}
              placeholder="What it means"
              aria-label="Meaning"
              onChange={(e) => void onUpdate(entry.id, { meaning: e.target.value })}
            />
          </>
        ) : (
          <>
            <div className="lexicon-entry-head">
              <span className="lexicon-word">{entry.word || 'Untitled'}</span>
              {entry.pronunciation && <span className="lexicon-pron">{entry.pronunciation}</span>}
              <span className="lexicon-entry-actions">
                <button type="button" className="outliner-open-button" onClick={() => setEditingId(entry.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="outliner-open-button lexicon-delete-action"
                  title="Delete this entry, which lets the editor mark the word as a misspelling again"
                  onClick={() => void onDelete(entry.id)}
                >
                  Delete
                </button>
              </span>
            </div>
            <div className="lexicon-meaning">
              {entry.meaning || <span className="lexicon-unset">No meaning written down yet.</span>}
            </div>
          </>
        )}
      </div>
    )
  }

  const lead =
    entries.length === 1
      ? 'One word in this project’s lexicon.'
      : `${entries.length} words in this project’s lexicon.`

  return (
    <div className="lexicon-view">
      <div className="outliner-toolbar">
        <input
          type="text"
          className="lexicon-add-input"
          placeholder="Add a word…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitNew()
          }}
        />
        <button type="button" className="submissions-add-button" onClick={() => void commitNew()}>
          Add
        </button>
        {entries.length > 0 && (
          <input
            type="text"
            className="lexicon-filter-input"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        <span className="submissions-count">
          {entries.length === 0 ? 'No words' : `${entries.length} ${entries.length === 1 ? 'word' : 'words'}`}
        </span>
      </div>

      {/* Deliberately not buttons. Hovering a letter takes the page there, and
          a letter with nothing under it is inert rather than a control that
          does nothing when pressed. Drawn only when there is something to
          jump to. */}
      {groups.length > 0 && (
        <div className="lexicon-alphabet" aria-hidden="true">
          {ALPHABET.map((letter) => {
            const present = lettersPresent.has(letter)
            return (
              <span
                key={letter}
                className={`lexicon-alphabet-letter ${present ? '' : 'is-empty'} ${
                  present && currentLetter === letter ? 'is-current' : ''
                }`}
                data-letter={letter}
                onMouseEnter={present ? () => jumpTo(letter) : undefined}
              >
                {letter}
              </span>
            )
          })}
        </div>
      )}

      <div className="lexicon-scroll" ref={scrollRef} onScroll={updateCurrentLetter}>
        <div className="lexicon-measure">
          {entries.length === 0 ? (
            <div className="lexicon-empty">
              <p>
                No words have been added yet. Add one above, or right-click a word the editor has marked as a
                mistake and choose “Define in Lexicon”.
              </p>
            </div>
          ) : (
            <>
              <p className="lexicon-lead">{lead}</p>
              <p className="lexicon-sub">
                The editor leaves these alone instead of marking them as spelling mistakes. That applies
                inside ChapterFlow only, and never touches the system dictionary.
                {extraWordCount > 0 && (
                  <>
                    {' '}
                    {extraWordCount === 1 ? 'One more word is' : `${extraWordCount} more words are`} left alone
                    because a Story Bible name uses {extraWordCount === 1 ? 'it' : 'them'}.
                  </>
                )}
              </p>

              {groups.length === 0 && <p className="lexicon-unset">Nothing matches that.</p>}

              {groups.map(([letter, list]) => (
                <div key={letter} className="lexicon-group" data-letter={letter}>
                  <div className="lexicon-group-letter">{letter}</div>
                  <div>{list.map(renderEntry)}</div>
                </div>
              ))}

              {storyBibleNames.length > 0 && (
                <>
                  <div className="lexicon-section-head">
                    <span className="lexicon-section-name">From the Story Bible</span>
                    <span className="lexicon-section-note">
                      Every word in these names is left alone too. Removing the name is what lets the editor
                      mark those words again.
                    </span>
                  </div>
                  <div className="lexicon-names">
                    {storyBibleNames.map((name) => (
                      <span
                        key={name.phrase}
                        className={`lexicon-name-chip ${name.alsoLexicon ? 'is-both' : ''}`}
                      >
                        {name.phrase}
                        {name.alsoLexicon && ' · also a lexicon entry'}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default LexiconView
