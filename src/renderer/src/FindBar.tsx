import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { BinderNode } from '../../shared/binder'
import type { RankedMatch, RecentSearch, SearchKind, SearchResults, SearchTier } from '../../shared/search'
import type { Match, SearchOptions } from './search/searchCore'
import { collectAllDocuments, replaceAllInHtml, searchProject, type ProjectDocumentResult } from './search/projectSearch'
import ProjectSearchResults from './search/ProjectSearchResults'
import DocumentSearchResults from './search/DocumentSearchResults'
import SearchFilters from './search/SearchFilters'
import ConfirmModal from './ConfirmModal'
import { CaseSensitiveIcon, HistoryIcon, OptionsIcon, RegexIcon, SearchIcon, WholeWordIcon } from './icons'

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
  const { editor, tree, activeDocumentId, focusRequest, onProjectDataChanged, onNavigateToResult, trailingContent } =
    props

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
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

  const inputRef = useRef<HTMLInputElement>(null)
  const optionsContainerRef = useRef<HTMLDivElement>(null)
  const options: SearchOptions = { caseSensitive, wholeWord, useRegex }
  const isProject = scope === 'project'

  const documentName = useMemo(() => {
    if (!activeDocumentId) return 'This document'
    return collectAllDocuments(tree).find((d) => d.id === activeDocumentId)?.name ?? 'This document'
  }, [tree, activeDocumentId])

  /**
   * Whether the query is being read as literal characters rather than as
   * words. Case, whole word and regex only mean anything then — ranked project
   * search matches whole words by rule and has no use for them. Replace is
   * always literal, in either scope.
   */
  const isLiteralMatching = !isProject || showReplace
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
    setShowReplace(focusRequest.showReplace)
    setOptionsOpen(true)
    requestAnimationFrame(() => inputRef.current?.select())
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
    if (!isProject || !showReplace || !query) {
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
  }, [isProject, showReplace, query, caseSensitive, wholeWord, useRegex, tree, activeDocumentId])

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
      if (e.shiftKey) editor?.commands.findPrevious()
      else editor?.commands.findNext()
      return
    }
    if (e.key === 'Escape') {
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
    }
  }

  const matchCount = (editor?.storage.findReplace?.matches.length ?? 0) as number
  const currentIndex = (editor?.storage.findReplace?.currentIndex ?? -1) as number
  const documentMatches = (editor?.storage.findReplace?.matches ?? []) as Match[]
  const totalProjectMatches = projectResults.reduce((sum, r) => sum + r.matches.length, 0)

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
    ? (!showReplace || projectRegexValid)
    : (editor?.storage.findReplace?.isRegexValid ?? true)

  function countLabel(): string {
    if (!isRegexValid) return 'Invalid regex'
    if (!query.trim()) return ''
    if (isProject) {
      if (showReplace) return `${totalProjectMatches} to replace`
      if (searching) return 'Searching…'
      if (results.matches.length === 0) return 'No results'
      return `${results.matches.length}${results.truncated ? '+' : ''} result${results.matches.length === 1 ? '' : 's'}`
    }
    return `${matchCount > 0 ? currentIndex + 1 : 0} of ${matchCount}`
  }

  /** Why a control is greyed out, said plainly on hover. Controls are never
   *  removed as the scope changes — the bar keeps its shape, and whatever
   *  cannot act simply cannot be pressed. */
  const literalHint = 'Applies to Find and Replace, which match characters — project search matches whole words'
  const filterHint = 'Applies when searching the whole project'
  const navHint = 'Applies when searching this document'

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
              setOptionsOpen(true)
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
                setOptionsOpen(true)
              }}
              onKeyDown={handleInputKeyDown}
              onFocus={() => setOptionsOpen(true)}
            />
            {hasNonDefaultOptions && <span className="find-options-dot" />}
            <span className="find-options-hint">
              <OptionsIcon />
            </span>
          </div>

          {optionsOpen && (
            <div className="find-options-popover">
              <div className="find-options-bar">
                {/* First on the row, directly above the field it opens. */}
                <button
                  type="button"
                  className={`find-replace-toggle-btn ${showReplace ? 'is-active' : ''}`}
                  title="Find and replace (Ctrl+H)"
                  onClick={() => setShowReplace((v) => !v)}
                >
                  Replace
                </button>

                <div className="find-scope-toggle">
                  <button type="button" className={!isProject ? 'is-active' : ''} onClick={() => setScope('document')}>
                    This Document
                  </button>
                  <button
                    type="button"
                    className={isProject ? 'is-active' : ''}
                    title="Search the whole project (Ctrl+Shift+F)"
                    onClick={() => setScope('project')}
                  >
                    Whole Project
                  </button>
                </div>

                <div className="find-options">
                  <button
                    type="button"
                    className={caseSensitive && isLiteralMatching ? 'is-active' : ''}
                    disabled={!isLiteralMatching}
                    title={isLiteralMatching ? 'Match case' : literalHint}
                    onClick={() => setCaseSensitive((v) => !v)}
                  >
                    <CaseSensitiveIcon />
                  </button>
                  <button
                    type="button"
                    className={wholeWord && isLiteralMatching ? 'is-active' : ''}
                    disabled={!isLiteralMatching}
                    title={isLiteralMatching ? 'Whole word' : literalHint}
                    onClick={() => setWholeWord((v) => !v)}
                  >
                    <WholeWordIcon />
                  </button>
                  <button
                    type="button"
                    className={useRegex && isLiteralMatching ? 'is-active' : ''}
                    disabled={!isLiteralMatching}
                    title={isLiteralMatching ? 'Use regular expression' : literalHint}
                    onClick={() => setUseRegex((v) => !v)}
                  >
                    <RegexIcon />
                  </button>
                </div>

                <SearchFilters
                  selected={kindFilter}
                  onChange={setKindFilter}
                  disabled={!isProject}
                  disabledHint={filterHint}
                />

                <div className="find-matches">
                  <span className={`find-count ${!isRegexValid ? 'find-count--error' : ''}`}>{countLabel()}</span>
                  <div className="find-nav">
                    <button
                      type="button"
                      title={isProject ? navHint : 'Previous match'}
                      disabled={isProject || matchCount === 0}
                      onClick={() => editor?.commands.findPrevious()}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title={isProject ? navHint : 'Next match'}
                      disabled={isProject || matchCount === 0}
                      onClick={() => editor?.commands.findNext()}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>

              {showReplace && (
                <div className="find-replace-row">
                  <input
                    className="find-input find-replace-input"
                    type="text"
                    placeholder={useRegex ? 'Replace with (supports $1, $&)…' : 'Replace with…'}
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
                    disabled={isProject || matchCount === 0}
                    title={isProject ? 'One at a time applies when searching this document' : undefined}
                    onClick={replaceCurrent}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    disabled={isProject ? totalProjectMatches === 0 : matchCount === 0}
                    onClick={replaceAll}
                  >
                    {isProject ? `Replace All in Project (${totalProjectMatches})` : 'Replace All'}
                  </button>
                </div>
              )}

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
                  {kindFilter ? ' with the current filters.' : '.'}
                </div>
              )}

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
                  }}
                />
              )}

              {!isProject && !!query.trim() && matchCount === 0 && isRegexValid && (
                <div className="search-history-empty">Nothing in this document matched “{query.trim()}”.</div>
              )}
            </div>
          )}
        </div>

        {trailingContent}
      </div>

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
