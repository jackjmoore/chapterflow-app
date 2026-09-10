import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { BinderNode } from '../../shared/binder'
import type { RankedMatch, RecentSearch, SearchKind, SearchResults, SearchTier } from '../../shared/search'
import type { Match, SearchOptions } from './search/searchCore'
import { collectAllDocuments, replaceAllInHtml, searchProject, type ProjectDocumentResult } from './search/projectSearch'
import { createPortal } from 'react-dom'
import ProjectSearchResults from './search/ProjectSearchResults'
import DocumentSearchResults from './search/DocumentSearchResults'
import { FILTER_GROUPS } from './search/SearchFilters'
import ConfirmModal from './ConfirmModal'
import SearchMatchDock from './search/SearchMatchDock'
import { HistoryIcon, OptionsIcon, SearchIcon } from './icons'
import { usePresence, presenceClass } from './usePresence'

export type Scope = 'document' | 'project'

export interface FindFocusRequest {
  token: number
  /**
   * Null means "open the bar and leave the scope alone".
   *
   * Shortcuts used to dictate scope, and Ctrl+F narrowing to a single document
   * was how the project-wide default got silently overridden: you pressed the
   * habitual key and landed in the one mode where half the interface does not
   * exist. A shortcut now chooses which surface to open, not what to search.
   */
  scope: Scope | null
  showReplace: boolean
}

interface FindBarProps {
  editor: Editor | null
  tree: BinderNode[]
  activeDocumentId: string | null
  focusRequest: FindFocusRequest | null
  onProjectDataChanged: () => void
  /** Takes a ranked result to wherever it lives — a document, a Story Bible
   *  sheet, the Lexicon. Owned by App, which is the only place that knows how
   *  to switch views. */
  onNavigateToResult: (match: RankedMatch) => void | Promise<void>
  /** The view switcher — rendered at the end of the search row so the two
   *  live on one line instead of stacked rows (less chrome thickness). */
  trailingContent?: ReactNode
  /** Raised while the matches are docked beside the manuscript, so App can
   *  stand the side panel down and give the page the whole width. */
  onDockedChange?: (docked: boolean) => void
}

/** Long enough that typing a name does not fire a query per keystroke, short
 *  enough that pausing feels like the results were already there. The query
 *  itself reads a maintained index, so this is about IPC chatter, not cost. */
const SEARCH_DEBOUNCE_MS = 180

const EMPTY_RESULTS: SearchResults = { query: '', matches: [], truncated: false }

/**
 * One search surface.
 *
 * Find, Replace and project search were three menu entries and two disjoint
 * control sets, and choosing a scope swapped the whole interface — which is
 * how a change to the filter row could be invisible to someone who opened the
 * bar with Ctrl+F. The bar now keeps one shape: every control is present in
 * every scope, and the ones that cannot act are disabled rather than removed.
 */
function FindBar(props: FindBarProps): JSX.Element {
  const {
    editor,
    tree,
    activeDocumentId,
    focusRequest,
    onProjectDataChanged,
    onNavigateToResult,
    trailingContent,
    onDockedChange
  } = props

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  // Project-wide is the default: the common question is "where is this in my
  // book", not "where is this on this screen".
  const [scope, setScope] = useState<Scope>('project')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [projectResults, setProjectResults] = useState<ProjectDocumentResult[]>([])
  const [projectRegexValid, setProjectRegexValid] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [searching, setSearching] = useState(false)
  const [kindFilter, setKindFilter] = useState<Set<SearchKind> | null>(null)
  const [history, setHistory] = useState<RecentSearch[]>([])
  const [collapsedTiers, setCollapsedTiers] = useState<Set<SearchTier>>(new Set())
  const [documentGroupCollapsed, setDocumentGroupCollapsed] = useState(false)
  /** Matches docked beside the manuscript rather than listed in the drop-down,
   *  so the page is uncovered while they are walked through. */
  const [dockOpen, setDockOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const optionsContainerRef = useRef<HTMLDivElement>(null)
  const options: SearchOptions = { caseSensitive, wholeWord, useRegex }
  const isProject = scope === 'project'

  const documentName = useMemo(() => {
    if (!activeDocumentId) return 'This document'
    return collectAllDocuments(tree).find((d) => d.id === activeDocumentId)?.name ?? 'This document'
  }, [tree, activeDocumentId])

  /**
   * Replace is *shown* always — it was behind a toggle nobody found — but it is
   * only *armed* once a replacement has actually been typed. Arming is what
   * turns project matching literal and what starts the document-by-document
   * scan replacing needs, so an idle replace box costs nothing.
   */
  const replaceArmed = replacement.trim().length > 0

  /**
   * Whether the query is being read as literal characters rather than as
   * words. Case, whole word and regex only mean anything then — ranked project
   * search matches whole words by rule and has no use for them. Replace is
   * always literal, in either scope.
   */
  const isLiteralMatching = !isProject || replaceArmed
  const hasNonDefaultOptions = isProject ? kindFilter !== null : caseSensitive || wholeWord || useRegex

  // Options popover: close on outside click / Escape, like other popovers in the app.
  useEffect(() => {
    if (!optionsOpen) return
    function handlePointerDown(e: MouseEvent): void {
      if (optionsContainerRef.current && !optionsContainerRef.current.contains(e.target as Node)) {
        setOptionsOpen(false)
      }
    }
    function handleKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') setOptionsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [optionsOpen])

  // Menu-driven / keyboard-shortcut requests to open the bar.
  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest.scope) setScope(focusRequest.scope)
    setDockOpen(false)
    setOptionsOpen(true)
    // Replace is always on screen now, so the shortcut that used to reveal it
    // puts the cursor in it instead — which is what pressing it meant anyway.
    requestAnimationFrame(() => {
      if (focusRequest.showReplace) replaceInputRef.current?.select()
      else inputRef.current?.select()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token])

  // The live editor's decorations follow the query whenever matching is
  // literal — which now includes project scope with Replace open, since that
  // is about to change this document too.
  useEffect(() => {
    if (!editor) return
    if (!isLiteralMatching) {
      editor.commands.clearSearch()
      return
    }
    editor.commands.setSearchQuery(query, options)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isLiteralMatching, query, caseSensitive, wholeWord, useRegex, activeDocumentId])

  // Recent searches, loaded whenever the drop-down opens so they reflect
  // searches made since the app started.
  useEffect(() => {
    if (!optionsOpen) return
    void window.api.listSearchHistory().then(setHistory)
  }, [optionsOpen])

  // Project scope: ranked results from the maintained index. Nothing is
  // scanned or parsed here — this is a read of an already-current structure.
  useEffect(() => {
    if (!isProject || !query.trim()) {
      setResults(EMPTY_RESULTS)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const next = await window.api.searchRanked(query, kindFilter ? { kinds: [...kindFilter] } : undefined)
      // A slow response for a query the writer has already moved past would
      // otherwise overwrite the results for what they are typing now.
      if (cancelled) return
      setResults(next)
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isProject, query, kindFilter])

  // Replacing across the project still needs the document-by-document scan:
  // the index holds character offsets in plain text, not positions in a
  // ProseMirror document, so it cannot drive a replacement — and regex replace
  // has no meaning against it either. Only armed once Replace is open, so
  // ordinary searching never pays for it.
  useEffect(() => {
    if (!isProject || !replaceArmed || !query) {
      setProjectResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const docs = collectAllDocuments(tree)
      const withContent = await Promise.all(
        docs.map(async (d) => ({
          id: d.id,
          name: d.name,
          html: d.id === activeDocumentId && editor ? editor.getHTML() : await window.api.loadDocument(d.id)
        }))
      )
      if (cancelled) return
      const { results: found, isRegexValid } = searchProject(withContent, query, options)
      setProjectResults(found)
      setProjectRegexValid(isRegexValid)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProject, replaceArmed, query, caseSensitive, wholeWord, useRegex, tree, activeDocumentId])

  /** Recording happens on a committed search, not per keystroke — otherwise
   *  the history would fill with every prefix of every word ever typed. */
  async function rememberSearch(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    setHistory(await window.api.recordSearchHistory(trimmed))
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      void rememberSearch(query)
      if (isProject) return
      // Enter starts the walk: the matches dock beside the manuscript and the
      // drop-down gets out of the way, rather than stepping behind a panel
      // that covers the page it is stepping through.
      if (matchCount > 0) {
        setDockOpen(true)
        setOptionsOpen(false)
      }
      if (e.shiftKey) editor?.commands.findPrevious()
      else editor?.commands.findNext()
      return
    }
    if (e.key === 'Escape') {
      if (docked) {
        closeDock()
        return
      }
      setQuery('')
      inputRef.current?.blur()
    }
  }

  async function handleNavigate(match: RankedMatch): Promise<void> {
    await rememberSearch(query)
    setOptionsOpen(false)
    await onNavigateToResult(match)

    // A result that lives in a document hands over to the in-document search
    // once that document is open: the index knows character offsets into plain
    // text, which are not ProseMirror positions, and Find already walks a
    // document's matches correctly. Narrowing the scope is now the whole
    // handover — the same bar, the same query, the matches listed underneath.
    // Whole-word is turned on because that is how the result was found.
    if (match.entry.documentId) {
      setWholeWord(true)
      setScope('document')
      // The handover lands in the walk, with the document's matches docked
      // beside the page rather than listed over it.
      setDockOpen(true)
    }
  }

  const matchCount = (editor?.storage.findReplace?.matches.length ?? 0) as number
  const currentIndex = (editor?.storage.findReplace?.currentIndex ?? -1) as number
  const documentMatches = (editor?.storage.findReplace?.matches ?? []) as Match[]
  const totalProjectMatches = projectResults.reduce((sum, r) => sum + r.matches.length, 0)

  /** The matches are docked only while there is something to walk: this
   *  document, a live query, and at least one match in it. */
  const docked = dockOpen && !isProject && !!query.trim() && matchCount > 0

  /** Both conditions the popover used to be gated on, folded into one
   *  presence value — docking while it is open closes it the same way an
   *  outside click does, and it plays the same exit either way. */
  const optionsPresence = usePresence(optionsOpen && !docked ? true : null)

  useEffect(() => {
    onDockedChange?.(docked)
  }, [docked, onDockedChange])

  // Anything that empties the match list puts the page back on its own.
  useEffect(() => {
    if (dockOpen && (isProject || !query.trim())) setDockOpen(false)
  }, [dockOpen, isProject, query])

  /**
   * How many results each filter group holds.
   *
   * Counted from the last *unfiltered* answer, never from the filtered one:
   * narrowing to one kind drives every other kind's count to zero, and a rail
   * that then greyed those kinds out would trap the reader inside the filter
   * they had just chosen.
   */
  const unfilteredCounts = useRef(new Map<string, number>())
  const countsByGroup = useMemo(() => {
    if (kindFilter !== null) return unfilteredCounts.current
    const counts = new Map<string, number>()
    for (const group of FILTER_GROUPS) counts.set(group.label, 0)
    for (const match of results.matches) {
      const group = FILTER_GROUPS.find((g) => g.kinds.includes(match.entry.kind))
      if (group) counts.set(group.label, (counts.get(group.label) ?? 0) + 1)
    }
    unfilteredCounts.current = counts
    return counts
  }, [results, kindFilter])

  /** Steps through this document's matches; the editor owns the position, so
   *  the bar only asks it to move. */
  function stepMatch(direction: 1 | -1): void {
    if (!editor || matchCount === 0) return
    if (direction === 1) editor.commands.findNext()
    else editor.commands.findPrevious()
  }

  /** Leaves the query in place but hands the page back. */
  function closeDock(): void {
    setDockOpen(false)
    setOptionsOpen(false)
  }

  function replaceCurrent(): void {
    editor?.chain().replaceCurrentMatch(replacement).focus().run()
  }

  function replaceAll(): void {
    if (isProject) {
      setConfirming(true)
      return
    }
    editor?.chain().replaceAllMatches(replacement).focus().run()
  }

  async function confirmProjectReplaceAll(): Promise<void> {
    setConfirming(false)
    for (const result of projectResults) {
      if (result.documentId === activeDocumentId && editor) {
        editor.commands.setSearchQuery(query, options)
        editor.commands.replaceAllMatches(replacement)
      } else {
        const html = await window.api.loadDocument(result.documentId)
        const newHtml = replaceAllInHtml(html, result.matches, replacement, useRegex)
        await window.api.saveDocument(result.documentId, newHtml)
      }
    }
    setProjectResults([])
    onProjectDataChanged()
  }

  const isRegexValid = isProject
    ? (!replaceArmed || projectRegexValid)
    : (editor?.storage.findReplace?.isRegexValid ?? true)

  function countLabel(): string {
    if (!isRegexValid) return 'Invalid regex'
    if (!query.trim()) return ''
    if (isProject) {
      if (replaceArmed) return `${totalProjectMatches} to replace`
      if (searching) return 'Searching…'
      if (results.matches.length === 0) return 'No results'
      return `${results.matches.length}${results.truncated ? '+' : ''} result${results.matches.length === 1 ? '' : 's'}`
    }
    return `${matchCount > 0 ? currentIndex + 1 : 0} of ${matchCount}`
  }

  /** Why a control is greyed out, said plainly on hover. Controls are never
   *  removed as the scope changes — the bar keeps its shape, and whatever
   *  cannot act simply cannot be pressed. */
  const literalHint = 'These apply to finding and replacing characters. Project search matches whole words.'
  const filterHint = 'This applies when searching the whole project.'

  const dockSlot = typeof document === 'undefined' ? null : document.getElementById('search-dock-slot')

  return (
    <div className="find-bar">
      <div className="find-bar-row">
        <div className="find-search" ref={optionsContainerRef}>
          {/* Opening the drop-down is tied to the box being used, not to it
              receiving focus: navigating to a result closes the drop-down but
              leaves the box focused, and focusing an already-focused element
              fires no event — so typing the next query would show nothing. */}
          <div
            className="find-input-wrap"
            onClick={() => {
              inputRef.current?.focus()
              if (!docked) setOptionsOpen(true)
            }}
          >
            <SearchIcon />
            <input
              ref={inputRef}
              className="find-input"
              type="text"
              placeholder={
                useRegex && isLiteralMatching
                  ? 'Regular expression…'
                  : isProject
                    ? 'Search the whole project…'
                    : 'Find in this document…'
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                // A new query is a new search, not a continuing walk: the
                // docked matches belong to the query that has just been
                // replaced, so they stand down and the list comes back.
                setDockOpen(false)
                setOptionsOpen(true)
              }}
              onKeyDown={handleInputKeyDown}
              onFocus={() => {
                if (!docked) setOptionsOpen(true)
              }}
            />

            {/* While the matches are docked the field carries the walk: where
                you are, the two steps, and both ways out. */}
            {docked ? (
              <span className="find-navigator">
                <span className="find-navigator-count">
                  Match {currentIndex + 1} of {matchCount}
                </span>
                <button
                  type="button"
                  className="find-navigator-step"
                  title="Previous match (Shift+Enter)"
                  onClick={(e) => {
                    e.stopPropagation()
                    stepMatch(-1)
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="find-navigator-step"
                  title="Next match (Enter)"
                  onClick={(e) => {
                    e.stopPropagation()
                    stepMatch(1)
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="find-navigator-text"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDockOpen(false)
                    setOptionsOpen(true)
                  }}
                >
                  All results
                </button>
                <button
                  type="button"
                  className="find-navigator-text"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeDock()
                  }}
                >
                  Done
                </button>
              </span>
            ) : (
              <>
                {/* The scope is stated in the field, so the bar says what it
                    will search without anything being opened. */}
                <button
                  type="button"
                  className="find-scope-pill"
                  title="Choose what is searched"
                  onClick={(e) => {
                    e.stopPropagation()
                    setScope(isProject ? 'document' : 'project')
                  }}
                >
                  {isProject ? 'The whole project' : documentName}
                </button>
                {hasNonDefaultOptions && <span className="find-options-dot" />}
              </>
            )}
            <span className="find-options-hint">
              <OptionsIcon />
            </span>
          </div>

          {optionsPresence.rendered && (
            <div className={`find-options-popover ${presenceClass(optionsPresence.visible)}`}>
              <div className="find-panel">
                {/* The rail: where the matches are, and the way to narrow to
                    one kind. Counted from the results themselves, so a kind
                    with nothing stays visible and says so. */}
                <div className="find-rail">
                  <div className="find-rail-label">Look in</div>
                  <button
                    type="button"
                    className={`find-rail-item ${kindFilter === null ? 'is-active' : ''}`}
                    onClick={() => setKindFilter(null)}
                  >
                    <span className="nm">Everything</span>
                    <span className="n">{isProject ? results.matches.length : matchCount}</span>
                  </button>
                  {FILTER_GROUPS.map((group) => {
                    const count = countsByGroup.get(group.label) ?? 0
                    const active =
                      !!kindFilter && group.kinds.every((k) => kindFilter.has(k)) && kindFilter.size === group.kinds.length
                    return (
                      <button
                        key={group.label}
                        type="button"
                        className={`find-rail-item ${active ? 'is-active' : ''} ${count === 0 ? 'is-empty' : ''}`}
                        disabled={!isProject}
                        title={!isProject ? filterHint : undefined}
                        onClick={() => setKindFilter(new Set(group.kinds))}
                      >
                        <span className="nm">{group.label}</span>
                        <span className="n">{isProject ? count : 0}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="find-results-pane">
                  {/* An empty search box is the natural place for the searches
                      already made — nothing else useful can be shown there. */}
                  {!query.trim() && (
                    <div className="search-history">
                      <div className="search-history-label">
                        Recent searches
                        {history.length > 0 && (
                          <button
                            type="button"
                            className="search-history-clear"
                            onClick={() => void window.api.clearSearchHistory().then(() => setHistory([]))}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {history.length === 0 ? (
                        <div className="search-history-empty">Searches you make will be listed here.</div>
                      ) : (
                        history.map((item) => (
                          <button
                            type="button"
                            key={`${item.query}-${item.at}`}
                            className="search-history-item"
                            onClick={() => {
                              setQuery(item.query)
                              inputRef.current?.focus()
                            }}
                          >
                            <HistoryIcon />
                            {item.query}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {isProject && !!query.trim() && results.matches.length > 0 && (
                    <ProjectSearchResults
                      results={results}
                      onNavigate={(m) => void handleNavigate(m)}
                      collapsedTiers={collapsedTiers}
                      onToggleTier={(tier) =>
                        setCollapsedTiers((previous) => {
                          const next = new Set(previous)
                          if (next.has(tier)) next.delete(tier)
                          else next.add(tier)
                          return next
                        })
                      }
                    />
                  )}

                  {isProject && !!query.trim() && !searching && results.matches.length === 0 && (
                    <div className="search-history-empty">
                      Nothing matched “{query.trim()}”
                      {kindFilter
                        ? '. Try another kind in the list beside this one, or search everything again.'
                        : '. Check the spelling, or try a shorter word.'}
                    </div>
                  )}

                  {/* In this document the list keeps the shape the project
                      results have; choosing a row is the way into the walk. */}
                  {!isProject && !!query.trim() && matchCount > 0 && (
                    <DocumentSearchResults
                      editor={editor}
                      matches={documentMatches}
                      currentIndex={currentIndex}
                      documentName={documentName}
                      collapsed={documentGroupCollapsed}
                      onToggleCollapsed={() => setDocumentGroupCollapsed((v) => !v)}
                      onGoToMatch={(index) => {
                        void rememberSearch(query)
                        editor?.chain().goToMatch(index).focus().run()
                        // Choosing a match is the handover: the list moves
                        // beside the page rather than staying on top of it.
                        setDockOpen(true)
                        setOptionsOpen(false)
                      }}
                    />
                  )}

                  {!isProject && !!query.trim() && matchCount === 0 && isRegexValid && (
                    <div className="search-history-empty">Nothing in this document matched “{query.trim()}”.</div>
                  )}
                </div>
              </div>

              {/* Replace is always here rather than behind a toggle, and says
                  plainly how far it reaches. It only arms once something has
                  been typed into it. */}
              <div className="find-replace-strip">
                <div className="find-replace-row">
                  <input
                    ref={replaceInputRef}
                    className="find-input find-replace-input"
                    type="text"
                    placeholder={useRegex ? 'Replace matches with (supports $1, $&)…' : 'Replace matches with…'}
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (!isProject) replaceCurrent()
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isProject || matchCount === 0 || !replaceArmed}
                    title={isProject ? 'One at a time applies when searching this document' : undefined}
                    onClick={replaceCurrent}
                  >
                    Replace this one
                  </button>
                  <button
                    type="button"
                    disabled={!replaceArmed || (isProject ? totalProjectMatches === 0 : matchCount === 0)}
                    onClick={replaceAll}
                  >
                    {/* The project figure is only known once replacing is
                        armed, so it is not claimed before then. */}
                    {replaceArmed ? `Replace all ${isProject ? totalProjectMatches : matchCount}` : 'Replace all'}
                  </button>
                </div>
                <p className="find-replace-note">
                  {isProject
                    ? 'Replacing changes the manuscript only. Story Bible entries, comments, and tracking records are left as they are.'
                    : `Replacing changes ${documentName} only.`}
                  {replaceArmed && isProject && (
                    <span className="find-replace-warn"> One press of Ctrl+Z will not undo all of it.</span>
                  )}
                </p>
              </div>

              <div className="find-foot">
                <div className="find-options">
                  <button
                    type="button"
                    className={caseSensitive && isLiteralMatching ? 'is-active' : ''}
                    disabled={!isLiteralMatching}
                    title={isLiteralMatching ? 'Match case' : literalHint}
                    onClick={() => setCaseSensitive((v) => !v)}
                  >
                    Match case
                  </button>
                  <button
                    type="button"
                    className={wholeWord && isLiteralMatching ? 'is-active' : ''}
                    disabled={!isLiteralMatching}
                    title={isLiteralMatching ? 'Whole words' : literalHint}
                    onClick={() => setWholeWord((v) => !v)}
                  >
                    Whole words
                  </button>
                  <button
                    type="button"
                    className={useRegex && isLiteralMatching ? 'is-active' : ''}
                    disabled={!isLiteralMatching}
                    title={isLiteralMatching ? 'Regular expression' : literalHint}
                    onClick={() => setUseRegex((v) => !v)}
                  >
                    Regular expression
                  </button>
                </div>
                <span className="find-foot-spacer" />
                <span className={`find-count ${!isRegexValid ? 'find-count--error' : ''}`}>{countLabel()}</span>
                {!isProject && matchCount > 0 && <span className="find-foot-hint">Enter walks the matches</span>}
              </div>
            </div>
          )}
        </div>

        {trailingContent}
      </div>

      {/* The dock stands in the side panel's place, so the manuscript keeps
          the rest of the window while the matches are walked. */}
      {docked && dockSlot
        ? createPortal(
            <SearchMatchDock
              editor={editor}
              matches={documentMatches}
              currentIndex={currentIndex}
              documentName={documentName}
              query={query}
              replacement={replacement}
              onReplacementChange={setReplacement}
              onGoToMatch={(index) => editor?.chain().goToMatch(index).focus().run()}
              onReplaceCurrent={replaceCurrent}
              onReplaceAll={replaceAll}
              onClose={closeDock}
            />,
            dockSlot
          )
        : null}

      {confirming && (
        <ConfirmModal
          title="Replace across the whole project?"
          message={`This will replace ${totalProjectMatches} match${totalProjectMatches === 1 ? '' : 'es'} in ${projectResults.length} document${projectResults.length === 1 ? '' : 's'}. This affects multiple files and cannot be undone with a single Ctrl+Z.`}
          confirmLabel="Replace All"
          onConfirm={() => void confirmProjectReplaceAll()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

export default FindBar
