import { useEffect, useRef, useState } from 'react'
import type { BinderNode, StatusDef, TagDef } from '../../shared/binder'
import type { StoryBibleItem } from '../../shared/storyBible'

interface BinderContextMenuProps {
  /** The right-clicked node, or null when the right-click landed on empty
   *  binder space (in which case only "New Document/Folder at root" apply). */
  node: BinderNode | null
  x: number
  y: number
  statuses: StatusDef[]
  tags: TagDef[]
  storyBibleItems: StoryBibleItem[]
  mentionRollup: Record<string, string[]>
  onClose: () => void
  onCreateDocument: (parentId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onImportFiles: (parentId: string | null) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onSetStatus: (id: string, statusId: string | null) => void
  onSetTags: (id: string, tagIds: string[]) => void
  onReveal: (id: string, view: 'outliner' | 'corkboard') => void
  onSetManualMention: (documentId: string, itemId: string, present: boolean) => void
}

/** The binder's right-click menu — every item calls the same handler its
 *  toolbar/menu-bar equivalent already calls (New Document/Folder, Rename,
 *  Delete, Set Status, Add/Remove Tags). Duplicate and Reveal in
 *  Outliner/Corkboard are the two genuinely new pieces of behavior this menu
 *  introduces (see binderStore.duplicateNode and App.tsx's handleReveal). */
function BinderContextMenu(props: BinderContextMenuProps): JSX.Element {
  const {
    node,
    x,
    y,
    statuses,
    tags,
    storyBibleItems,
    mentionRollup,
    onClose,
    onCreateDocument,
    onCreateFolder,
    onImportFiles,
    onRename,
    onDelete,
    onDuplicate,
    onSetStatus,
    onSetTags,
    onReveal,
    onSetManualMention
  } = props
  const [pos, setPos] = useState({ left: x, top: y })
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

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8)
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8)
    setPos({ left: Math.min(x, maxLeft), top: Math.min(y, maxTop) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDocument = node?.type === 'document'

  function act(fn: () => void): void {
    fn()
    onClose()
  }

  function toggleTag(id: string): void {
    if (!node || node.type !== 'document') return
    const next = node.tagIds.includes(id) ? node.tagIds.filter((t) => t !== id) : [...node.tagIds, id]
    onSetTags(node.id, next)
  }

  function toggleMention(itemId: string): void {
    if (!node) return
    const current = mentionRollup[node.id] ?? []
    onSetManualMention(node.id, itemId, !current.includes(itemId))
  }

  return (
    <div
      className="menubar-dropdown context-menu-dropdown"
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="menubar-item" onClick={() => act(() => onCreateDocument(node?.id ?? null))}>
        <span className="menubar-item-label">New Document</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act(() => onCreateFolder(node?.id ?? null))}>
        <span className="menubar-item-label">New Folder</span>
      </button>
      <button type="button" className="menubar-item" onClick={() => act(() => onImportFiles(node?.id ?? null))}>
        <span className="menubar-item-label">Import Files Here…</span>
      </button>

      {node && (
        <>
          <div className="menubar-separator" />

          <button type="button" className="menubar-item" onClick={() => act(() => onRename(node.id))}>
            <span className="menubar-item-label">Rename</span>
          </button>
          <button type="button" className="menubar-item" onClick={() => act(() => onDuplicate(node.id))}>
            <span className="menubar-item-label">Duplicate</span>
          </button>
          <button type="button" className="menubar-item" onClick={() => act(() => onDelete(node.id))}>
            <span className="menubar-item-label">Delete</span>
          </button>

          {isDocument && node.type === 'document' && (
            <>
              <div className="menubar-separator" />

              <div className="menubar-item menubar-item--parent">
                <span className="menubar-item-label">Set Status</span>
                <span className="menubar-item-chevron">›</span>
                <div className="menubar-flyout">
                  <div className="menubar-dropdown">
                    <button
                      type="button"
                      className="menubar-item menubar-item--checkable"
                      onClick={() => act(() => onSetStatus(node.id, null))}
                    >
                      <span className="menubar-item-check">{node.statusId === null ? '✓' : ''}</span>
                      <span className="menubar-item-label">None</span>
                    </button>
                    {statuses.map((status) => (
                      <button
                        key={status.id}
                        type="button"
                        className="menubar-item menubar-item--checkable"
                        onClick={() => act(() => onSetStatus(node.id, status.id))}
                      >
                        <span className="menubar-item-check">{node.statusId === status.id ? '✓' : ''}</span>
                        <span className="tag-status-filter-swatch" style={{ backgroundColor: status.color }} />
                        <span className="menubar-item-label">{status.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="menubar-item menubar-item--parent">
                <span className="menubar-item-label">Add/Remove Tags</span>
                <span className="menubar-item-chevron">›</span>
                <div className="menubar-flyout">
                  <div className="menubar-dropdown">
                    {tags.length === 0 ? (
                      <span className="tag-status-filter-empty">No tags defined yet.</span>
                    ) : (
                      tags.map((tag) => (
                        <label key={tag.id} className="tag-status-filter-row">
                          <input
                            type="checkbox"
                            checked={node.tagIds.includes(tag.id)}
                            onChange={() => toggleTag(tag.id)}
                          />
                          <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                          <span>{tag.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="menubar-item menubar-item--parent">
                <span className="menubar-item-label">Story Bible Mentions</span>
                <span className="menubar-item-chevron">›</span>
                <div className="menubar-flyout">
                  <div className="menubar-dropdown">
                    {storyBibleItems.length === 0 ? (
                      <span className="tag-status-filter-empty">No Story Bible items yet.</span>
                    ) : (
                      storyBibleItems.map((item) => (
                        <label key={item.id} className="tag-status-filter-row">
                          <input
                            type="checkbox"
                            checked={(mentionRollup[node.id] ?? []).includes(item.id)}
                            onChange={() => toggleMention(item.id)}
                          />
                          <span>{item.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="menubar-separator" />

              <button type="button" className="menubar-item" onClick={() => act(() => onReveal(node.id, 'outliner'))}>
                <span className="menubar-item-label">Reveal in Outliner</span>
              </button>
              <button type="button" className="menubar-item" onClick={() => act(() => onReveal(node.id, 'corkboard'))}>
                <span className="menubar-item-label">Reveal in Corkboard</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default BinderContextMenu
