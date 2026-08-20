import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { TagDef } from '../../shared/binder'
import type { EditorContextMenuPayload } from '../../shared/contextMenu'

interface EditorContextMenuProps {
  payload: EditorContextMenuPayload
  editor: Editor | null
  tags: TagDef[]
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
  const { payload, editor, tags, onAction, onClose } = props
  const [pos, setPos] = useState({ left: payload.x, top: payload.y })
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div
      className="menubar-dropdown context-menu-dropdown"
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {payload.misspelledWord && (
        <>
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
      </button>
      <button type="button" className="menubar-item" onClick={() => act('copy')}>
        <span className="menubar-item-label">Copy</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act('paste')}>
        <span className="menubar-item-label">Paste</span>
      </button>

      <div className="menubar-separator" />

      <button
        type="button"
        className="menubar-item menubar-item--checkable"
        onClick={() => act('toggleBold')}
      >
        <span className="menubar-item-check">{editor?.isActive('bold') ? '✓' : ''}</span>
        <span className="menubar-item-label">Bold</span>
      </button>
      <button
        type="button"
        className="menubar-item menubar-item--checkable"
        onClick={() => act('toggleItalic')}
      >
        <span className="menubar-item-check">{editor?.isActive('italic') ? '✓' : ''}</span>
        <span className="menubar-item-label">Italic</span>
      </button>
      <button
        type="button"
        className="menubar-item menubar-item--checkable"
        onClick={() => act('toggleUnderline')}
      >
        <span className="menubar-item-check">{editor?.isActive('underline') ? '✓' : ''}</span>
        <span className="menubar-item-label">Underline</span>
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
                  <label key={tag.id} className="tag-status-filter-row">
                    <input
                      type="checkbox"
                      checked={editor?.isActive('spanTag', { tagId: tag.id }) ?? false}
                      onChange={() => toggleTag(tag.id)}
                    />
                    <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                    <span>{tag.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="menubar-separator" />

      <button type="button" className="menubar-item" onClick={() => act('find')}>
        <span className="menubar-item-label">Find…</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act('findReplace')}>
        <span className="menubar-item-label">Replace…</span>
      </button>
    </div>
  )
}

export default EditorContextMenu
