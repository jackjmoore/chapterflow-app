import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { TagDef } from '../../shared/binder'
import type { EditorContextMenuPayload } from '../../shared/contextMenu'
import { LOOKUP_LABELS, lookupWordFrom, type LookupKind } from '../../shared/lookup'
import { splitDocContent } from './docSplit'
import { useFlyoutFit } from './useFlyoutFit'

interface EditorContextMenuProps {
  payload: EditorContextMenuPayload
  editor: Editor | null
  tags: TagDef[]
  /** Every binder document, in reading order, for the Link to Document list. */
  documents: { id: string; name: string }[]
  activeDocumentId: string | null
  onAction: (action: string) => void
  onClose: () => void
}

/** The main editor's right-click menu — forwarded here from the main
 *  process (see `context-menu` handling in src/main/index.ts) so OS
 *  spellcheck suggestions can sit alongside app actions in one menu instead
 *  of two stacked ones. Every action below calls the exact same function the
 *  toolbar/menu-bar/shortcut equivalent already calls (`onAction` is
 *  `handleMenuAction`; tagging reuses the same `toggleSpanTag` command
 *  SpanTagToolbarPicker.tsx uses) — nothing here re-implements formatting. */
function EditorContextMenu(props: EditorContextMenuProps): JSX.Element {
  const { payload, editor, tags, documents, activeDocumentId, onAction, onClose } = props
  const [pos, setPos] = useState({ left: payload.x, top: payload.y })
  const ref = useRef<HTMLDivElement>(null)
  useFlyoutFit(ref)

  // Computed once per menu open (the menu is remounted per right-click).
  // Running the real split is what makes the enabled state exact — a cursor
  // at the very start or end of the document genuinely can't split it.
  const canSplit = useMemo(() => {
    if (!editor) return false
    const { state } = editor
    return splitDocContent(state.doc, state.selection.from, state.schema) !== null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const lookupWord = useMemo(() => {
    if (!editor || !payload.hasSelection) return ''
    const { from, to } = editor.state.selection
    return lookupWordFrom(editor.state.doc.textBetween(from, to, ' ', ' '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, payload])

  const linkActive = editor?.isActive('documentLink') ?? false

  useEffect(() => {
    function handlePointerDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Clamp after mount, once the menu's real size is known, so it never
  // overflows off the right/bottom edge of the window.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8)
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8)
    setPos({ left: Math.min(payload.x, maxLeft), top: Math.min(payload.y, maxTop) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function act(action: string): void {
    onAction(action)
    onClose()
  }

  function toggleTag(tagId: string): void {
    editor?.chain().focus().toggleSpanTag(tagId).run()
  }

  // menubar-dropdown--checkable: Bold/Italic/Underline are checkable and
  // Cut/Copy/Paste are not, so without it the labels sit on two left edges.
  return (
    <div
      className="menubar-dropdown context-menu-dropdown menubar-dropdown--checkable"
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {payload.misspelledWord && (
        <>
          {/* Both add the word to this project's own list, which stops the
              editor flagging it. Neither writes to the operating system's
              dictionary, so the word stays unknown to every other app. */}
          <button
            type="button"
            className="menubar-item"
            onClick={() => act(`addToDictionary:${payload.misspelledWord}`)}
          >
            <span className="menubar-item-label">Add to Dictionary</span>
          </button>
          <button
            type="button"
            className="menubar-item"
            onClick={() => act(`defineInLexicon:${payload.misspelledWord}`)}
          >
            <span className="menubar-item-label">Define in Lexicon…</span>
          </button>
          <div className="menubar-separator" />

          {payload.dictionarySuggestions.length === 0 ? (
            <button type="button" className="menubar-item menubar-item--disabled" disabled>
              <span className="menubar-item-label">No suggestions</span>
            </button>
          ) : (
            payload.dictionarySuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="menubar-item"
                onClick={() => {
                  void window.api.replaceMisspelling(suggestion)
                  onClose()
                }}
              >
                <span className="menubar-item-label">{suggestion}</span>
              </button>
            ))
          )}
          <div className="menubar-separator" />
        </>
      )}

      <button type="button" className="menubar-item" onClick={() => act('cut')}>
        <span className="menubar-item-label">Cut</span>
        <span className="menubar-item-shortcut">Ctrl+X</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act('copy')}>
        <span className="menubar-item-label">Copy</span>
        <span className="menubar-item-shortcut">Ctrl+C</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act('paste')}>
        <span className="menubar-item-label">Paste</span>
        <span className="menubar-item-shortcut">Ctrl+V</span>
      </button>

      <div className="menubar-separator" />

      <button
        type="button"
        className="menubar-item menubar-item--checkable"
        onClick={() => act('toggleBold')}
      >
        <span className="menubar-item-check">{editor?.isActive('bold') ? '✓' : ''}</span>
        <span className="menubar-item-label">Bold</span>
        <span className="menubar-item-shortcut">Ctrl+B</span>
      </button>
      <button
        type="button"
        className="menubar-item menubar-item--checkable"
        onClick={() => act('toggleItalic')}
      >
        <span className="menubar-item-check">{editor?.isActive('italic') ? '✓' : ''}</span>
        <span className="menubar-item-label">Italic</span>
        <span className="menubar-item-shortcut">Ctrl+I</span>
      </button>
      <button
        type="button"
        className="menubar-item menubar-item--checkable"
        onClick={() => act('toggleUnderline')}
      >
        <span className="menubar-item-check">{editor?.isActive('underline') ? '✓' : ''}</span>
        <span className="menubar-item-label">Underline</span>
        <span className="menubar-item-shortcut">Ctrl+U</span>
      </button>

      <div
        className={`menubar-item menubar-item--parent ${!payload.hasSelection ? 'menubar-item--disabled' : ''}`}
      >
        <span className="menubar-item-label">Tag Selection</span>
        {payload.hasSelection && <span className="menubar-item-chevron">›</span>}
        {payload.hasSelection && (
          <div className="menubar-flyout">
            <div className="menubar-dropdown">
              {tags.length === 0 ? (
                <span className="tag-status-filter-empty">No tags defined yet.</span>
              ) : (
                tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className="menubar-item menubar-item--checkable"
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span className="menubar-item-check">
                      {editor?.isActive('spanTag', { tagId: tag.id }) ? '✓' : ''}
                    </span>
                    <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                    <span className="menubar-item-label">{tag.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* A manual cross-reference to another document — the writer's own
          arbitrary link, distinct from the Story Bible's automatic
          detection. Applies a mark carrying only the target's id. */}
      <div
        className={`menubar-item menubar-item--parent ${!payload.hasSelection ? 'menubar-item--disabled' : ''}`}
      >
        <span className="menubar-item-label">Link to Document</span>
        {payload.hasSelection && <span className="menubar-item-chevron">›</span>}
        {payload.hasSelection && (
          <div className="menubar-flyout">
            <div className="menubar-dropdown context-menu-doc-list">
              {documents.filter((d) => d.id !== activeDocumentId).length === 0 ? (
                <span className="tag-status-filter-empty">No other documents yet.</span>
              ) : (
                documents
                  .filter((d) => d.id !== activeDocumentId)
                  .map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className="menubar-item"
                      onClick={() => {
                        editor?.chain().focus().setDocumentLink(doc.id).run()
                        onClose()
                      }}
                    >
                      <span className="menubar-item-label">{doc.name || 'Untitled'}</span>
                    </button>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {linkActive && (
        <button
          type="button"
          className="menubar-item"
          onClick={() => {
            editor?.chain().focus().unsetDocumentLink().run()
            onClose()
          }}
        >
          <span className="menubar-item-label">Remove Link</span>
        </button>
      )}

      {/* External reference lookup — the only place the app reaches outside
          itself, and only on an explicit pick of one of these two items. */}
      <div className={`menubar-item menubar-item--parent ${!lookupWord ? 'menubar-item--disabled' : ''}`}>
        <span className="menubar-item-label">{lookupWord ? `Look Up “${lookupWord}”` : 'Look Up'}</span>
        {lookupWord && <span className="menubar-item-chevron">›</span>}
        {lookupWord && (
          <div className="menubar-flyout">
            <div className="menubar-dropdown">
              {(['dictionary', 'thesaurus'] as LookupKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="menubar-item"
                  onClick={() => {
                    void window.api.lookupWord(kind, lookupWord)
                    onClose()
                  }}
                >
                  <span className="menubar-item-label">{LOOKUP_LABELS[kind]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="menubar-separator" />

      {/* Comment and the two structural breaks are here as well as on the
          Insert menu — they're the entries you reach for mid-sentence, where
          travelling to the menu bar loses your place. Every one dispatches
          the same handleMenuAction the menu bar does. */}
      <button
        type="button"
        className={`menubar-item ${!payload.hasSelection ? 'menubar-item--disabled' : ''}`}
        disabled={!payload.hasSelection}
        onClick={() => act('insertComment')}
      >
        <span className="menubar-item-label">Comment…</span>
      </button>

      <button type="button" className="menubar-item" onClick={() => act('insertChapterBreak')}>
        <span className="menubar-item-label">Chapter Break</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act('insertPageBreak')}>
        <span className="menubar-item-label">Page Break</span>
      </button>

      <button
        type="button"
        className={`menubar-item ${!canSplit ? 'menubar-item--disabled' : ''}`}
        disabled={!canSplit}
        title="Everything from the cursor onward becomes a new document right after this one"
        onClick={() => act('splitDocument')}
      >
        <span className="menubar-item-label">Split Document Here</span>
      </button>

      <div className="menubar-separator" />

      <button type="button" className="menubar-item" onClick={() => act('find')}>
        <span className="menubar-item-label">Find…</span>
        <span className="menubar-item-shortcut">Ctrl+F</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act('findReplace')}>
        <span className="menubar-item-label">Replace…</span>
        <span className="menubar-item-shortcut">Ctrl+H</span>
      </button>
    </div>
  )
}

export default EditorContextMenu
