import { useEffect, useRef, useState } from 'react'
import { TRASH_FOLDER_ID, isStructuralFolderId } from '../../shared/binder'
import type { BinderNode, StatusDef, TagDef } from '../../shared/binder'
import type { StoryBibleItem } from '../../shared/storyBible'
import { useFlyoutFit } from './useFlyoutFit'

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
  /** A folder of the writer's own at the binder root, beside Draft. Offered
   *  only on empty binder space, since that is the only place the root
   *  itself is what was right-clicked. */
  onCreateTopLevelFolder: () => void
  /** Opens the confirmation for the permanent delete. Never deletes here —
   *  emptying Trash is the one action in the app with no way back. */
  onEmptyTrash: () => void
  onImportFiles: (parentId: string | null) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onSetStatus: (id: string, statusId: string | null) => void
  onSetTags: (id: string, tagIds: string[]) => void
  onReveal: (id: string, view: 'outliner' | 'corkboard') => void
  onSetManualMention: (documentId: string, itemId: string, present: boolean) => void
  /** True when the node is a folder sitting directly under Draft — the only
   *  place a Part designation means anything to the book compile preset. */
  partEligible: boolean
  onSetIsPart: (id: string, isPart: boolean) => void
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
    onCreateTopLevelFolder,
    onEmptyTrash,
    onImportFiles,
    onRename,
    onDelete,
    onDuplicate,
    onSetStatus,
    onSetTags,
    onReveal,
    onSetManualMention,
    partEligible,
    onSetIsPart
  } = props
  const [pos, setPos] = useState({ left: x, top: y })
  const ref = useRef<HTMLDivElement>(null)
  useFlyoutFit(ref)

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

      {/* Right-clicking empty binder space is the one gesture that means the
          root itself, so it is where a folder beside Draft is made. */}
      {!node && (
        <button type="button" className="menubar-item" onClick={() => act(onCreateTopLevelFolder)}>
          <span className="menubar-item-label">New Top-Level Folder</span>
        </button>
      )}

      {/* Trash takes documents like any other folder, and then offers the one
          thing no other folder does. */}
      {node?.id === TRASH_FOLDER_ID && (
        <>
          <div className="menubar-separator" />
          <button
            type="button"
            className="menubar-item"
            disabled={node.children.length === 0}
            onClick={() => act(onEmptyTrash)}
          >
            <span className="menubar-item-label">Empty Trash…</span>
          </button>
        </>
      )}

      {/* Draft/Notes/Matter/Archive/Trash are fixed: they take new content
          (the items above) but can't be renamed, duplicated, or deleted — the
          store refuses too; the menu simply doesn't offer. */}
      {node && !isStructuralFolderId(node.id) && (
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

          {/* Part designation drives the book compile preset: a Part folder's
              children compile as chapters behind a part-title page. Only
              offered where it means something — top-level Draft folders. */}
          {partEligible && node.type === 'folder' && (
            <button
              type="button"
              className="menubar-item"
              onClick={() => act(() => onSetIsPart(node.id, !node.isPart))}
            >
              <span className="menubar-item-label">{node.isPart ? 'Unmark as Part' : 'Mark as Part'}</span>
            </button>
          )}

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
                      {/* An empty swatch, so None's label lines up with the
                          named statuses rather than sitting a swatch to
                          their left. */}
                      <span className="tag-status-filter-swatch tag-status-filter-swatch--none" />
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
                        <button
                          key={tag.id}
                          type="button"
                          className="menubar-item menubar-item--checkable"
                          onClick={() => toggleTag(tag.id)}
                        >
                          <span className="menubar-item-check">
                            {node.tagIds.includes(tag.id) ? '✓' : ''}
                          </span>
                          <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                          <span className="menubar-item-label">{tag.name}</span>
                        </button>
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
                        <button
                          key={item.id}
                          type="button"
                          className="menubar-item menubar-item--checkable"
                          onClick={() => toggleMention(item.id)}
                        >
                          <span className="menubar-item-check">
                            {(mentionRollup[node.id] ?? []).includes(item.id) ? '✓' : ''}
                          </span>
                          <span className="menubar-item-label">{item.name}</span>
                        </button>
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
