import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { BinderNode } from '../../shared/binder'
import type { SearchOptions } from './search/searchCore'
import { collectAllDocuments, replaceAllInHtml, searchProject, type ProjectDocumentResult } from './search/projectSearch'
import ConfirmModal from './ConfirmModal'
import { CaseSensitiveIcon, OptionsIcon, RegexIcon, SearchIcon, WholeWordIcon } from './icons'

export type Scope = 'document' | 'project'

export interface FindFocusRequest {
  token: number
  scope: Scope
  showReplace: boolean
}

interface FindBarProps {
  editor: Editor | null
  tree: BinderNode[]
  activeDocumentId: string | null
  focusRequest: FindFocusRequest | null
  onOpenDocument: (id: string) => Promise<void>
  onProjectDataChanged: () => void
  /** The view switcher — rendered at the end of the search row so the two
   *  live on one line instead of stacked rows (less chrome thickness). */
  trailingContent?: ReactNode
}

function FindBar(props: FindBarProps): JSX.Element {
  const { editor, tree, activeDocumentId, focusRequest, onOpenDocument, onProjectDataChanged, trailingContent } = props

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [scope, setScope] = useState<Scope>('document')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [projectResults, setProjectResults] = useState<ProjectDocumentResult[]>([])
  const [projectRegexValid, setProjectRegexValid] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const optionsContainerRef = useRef<HTMLDivElement>(null)
  const options: SearchOptions = { caseSensitive, wholeWord, useRegex }
  const hasNonDefaultOptions = scope === 'project' || caseSensitive || wholeWord || useRegex

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

  // Menu-driven / keyboard-shortcut requests to focus and configure the bar.
  useEffect(() => {
    if (!focusRequest) return
    setScope(focusRequest.scope)
    setShowReplace(focusRequest.showReplace)
    requestAnimationFrame(() => inputRef.current?.select())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token])

  // Single-document scope: keep the live editor's decorations in sync.
  useEffect(() => {
    if (!editor) return
    if (scope !== 'document') {
      editor.commands.clearSearch()
      return
    }
    editor.commands.setSearchQuery(query, options)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, scope, query, caseSensitive, wholeWord, useRegex, activeDocumentId])

  // Project scope: search every document in the binder.
  useEffect(() => {
    if (scope !== 'project' || !query) {
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
      const { results, isRegexValid } = searchProject(withContent, query, options)
      setProjectResults(results)
      setProjectRegexValid(isRegexValid)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, query, caseSensitive, wholeWord, useRegex, tree, activeDocumentId])

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) editor?.commands.findPrevious()
      else editor?.commands.findNext()
      return
    }
    if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }

  async function handleJumpToDocument(documentId: string): Promise<void> {
    await onOpenDocument(documentId)
    setScope('document')
  }

  function replaceCurrent(): void {
    editor?.chain().replaceCurrentMatch(replacement).focus().run()
  }

  function replaceAllInDocument(): void {
    editor?.chain().replaceAllMatches(replacement).focus().run()
  }

  const totalProjectMatches = projectResults.reduce((sum, r) => sum + r.matches.length, 0)

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

  const matchCount = editor?.storage.findReplace?.matches.length ?? 0
  const currentIndex = editor?.storage.findReplace?.currentIndex ?? -1
  const isRegexValid = scope === 'document' ? (editor?.storage.findReplace?.isRegexValid ?? true) : projectRegexValid

  return (
    <div className="find-bar">
      <div className="find-bar-row">
        {/* The search bar itself is the trigger — focusing or clicking it drops
            down every search control (scope, options, matches, replace)
            beneath it, at the search bar's own width, rather than spreading
            separate buttons across the row. */}
        <div className="find-search" ref={optionsContainerRef}>
          <div className="find-input-wrap" onClick={() => inputRef.current?.focus()}>
            <SearchIcon />
            <input
              ref={inputRef}
              className="find-input"
              type="text"
              placeholder={useRegex ? 'Regular expression…' : scope === 'project' ? 'Search whole project…' : 'Search…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
              {/* Scope, options, match count/nav, and the Replace toggle all
                  live on one aligned bar — nothing stacked into separate rows. */}
              <div className="find-options-bar">
                <div className="find-scope-toggle">
                  <button
                    type="button"
                    className={scope === 'document' ? 'is-active' : ''}
                    onClick={() => setScope('document')}
                  >
                    This Document
                  </button>
                  <button
                    type="button"
                    className={scope === 'project' ? 'is-active' : ''}
                    onClick={() => setScope('project')}
                  >
                    Whole Project
                  </button>
                </div>

                <span className="find-options-divider" />

                <div className="find-options">
                  <button
                    type="button"
                    className={caseSensitive ? 'is-active' : ''}
                    title="Match case"
                    onClick={() => setCaseSensitive((v) => !v)}
                  >
                    <CaseSensitiveIcon />
                  </button>
                  <button
                    type="button"
                    className={wholeWord ? 'is-active' : ''}
                    title="Whole word"
                    onClick={() => setWholeWord((v) => !v)}
                  >
                    <WholeWordIcon />
                  </button>
                  <button
                    type="button"
                    className={useRegex ? 'is-active' : ''}
                    title="Use regular expression"
                    onClick={() => setUseRegex((v) => !v)}
                  >
                    <RegexIcon />
                  </button>
                </div>

                <span className="find-options-divider" />

                {scope === 'document' ? (
                  <>
                    <span className={`find-count ${!isRegexValid ? 'find-count--error' : ''}`}>
                      {!isRegexValid ? 'Invalid regex' : query ? `${matchCount > 0 ? currentIndex + 1 : 0} of ${matchCount}` : ''}
                    </span>
                    <div className="find-nav">
                      <button type="button" title="Previous match" disabled={matchCount === 0} onClick={() => editor?.commands.findPrevious()}>
                        ↑
                      </button>
                      <button type="button" title="Next match" disabled={matchCount === 0} onClick={() => editor?.commands.findNext()}>
                        ↓
                      </button>
                    </div>
                  </>
                ) : (
                  <span className={`find-count ${!isRegexValid ? 'find-count--error' : ''}`}>
                    {!isRegexValid
                      ? 'Invalid regex'
                      : query
                        ? `${totalProjectMatches} in ${projectResults.length} document${projectResults.length === 1 ? '' : 's'}`
                        : ''}
                  </span>
                )}

                <span className="find-options-divider" />

                <button
                  type="button"
                  className={`find-replace-toggle-btn ${showReplace ? 'is-active' : ''}`}
                  onClick={() => setShowReplace((v) => !v)}
                >
                  Replace
                </button>
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
                        if (scope === 'document') replaceCurrent()
                      }
                    }}
                  />
                  {scope === 'document' ? (
                    <>
                      <button type="button" disabled={matchCount === 0} onClick={replaceCurrent}>
                        Replace
                      </button>
                      <button type="button" disabled={matchCount === 0} onClick={replaceAllInDocument}>
                        Replace All
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={totalProjectMatches === 0} onClick={() => setConfirming(true)}>
                      Replace All in Project
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {trailingContent}
      </div>

      {scope === 'project' && projectResults.length > 0 && (
        <div className="find-project-results">
          {projectResults.map((result) => (
            <button
              key={result.documentId}
              type="button"
              className="find-project-result"
              onClick={() => void handleJumpToDocument(result.documentId)}
            >
              <span className="find-project-result-name">
                {result.documentName}
                <span className="find-project-result-count">
                  {result.matches.length} match{result.matches.length === 1 ? '' : 'es'}
                </span>
              </span>
              <span className="find-project-result-snippet">{result.snippet}</span>
            </button>
          ))}
        </div>
      )}

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
