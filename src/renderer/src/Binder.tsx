import { useEffect, useState, type DragEvent, type MouseEvent } from 'react'
import type { BinderNode, StatusDef, TagDef } from '../../shared/binder'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { ChevronIcon, DocumentIcon, FolderIcon, SplitViewIcon, TrashIcon } from './icons'
import { StatusBadge, TagChips, SpanTagRollupChips, resolveStatus, resolveTags } from './StatusTagBadges'
import { resolveMentionChips } from './mentionUtils'

type DropMode = 'before' | 'after' | 'inside'

interface DropTarget {
  overId: string
  parentId: string | null
  index: number
  mode: DropMode
}

interface BinderActions {
  onSelect: (id: string | null) => void
  onOpenDocument: (id: string) => void
  onToggleCollapse: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, targetParentId: string | null, targetIndex: number) => void
  onOpenSplitView: (id: string) => void
  onContextMenu: (node: BinderNode | null, x: number, y: number) => void
}

interface BinderProps extends BinderActions {
  tree: BinderNode[]
  activeDocumentId: string | null
  selectedId: string | null
  editRequestId: { id: string; token: number } | null
  statuses: StatusDef[]
  tags: TagDef[]
  spanTagRollup: Record<string, string[]>
  storyBibleItems: StoryBibleItem[]
  storyBibleTypes: StoryBibleTypeDef[]
  mentionRollup: Record<string, string[]>
  /** Icon-only rail mode: names, badges, and row actions are suppressed. */
  collapsed: boolean
}

interface RowProps {
  node: BinderNode
  depth: number
  parentId: string | null
  index: number
  activeDocumentId: string | null
  selectedId: string | null
  editingId: string | null
  setEditingId: (id: string | null) => void
  dragId: string | null
  setDragId: (id: string | null) => void
  dropTarget: DropTarget | null
  setDropTarget: (t: DropTarget | null) => void
  onDropCommit: () => void
  actions: BinderActions
  statuses: StatusDef[]
  tags: TagDef[]
  spanTagRollup: Record<string, string[]>
  storyBibleItems: StoryBibleItem[]
  storyBibleTypes: StoryBibleTypeDef[]
  mentionRollup: Record<string, string[]>
  /** Icon-only rail mode: names, badges, and row actions are suppressed. */
  collapsed: boolean
}

function BinderRow(props: RowProps): JSX.Element {
  const {
    node,
    depth,
    parentId,
    index,
    activeDocumentId,
    selectedId,
    editingId,
    setEditingId,
    dragId,
    setDragId,
    dropTarget,
    setDropTarget,
    onDropCommit,
    actions,
    statuses,
    tags,
    spanTagRollup,
    storyBibleItems,
    storyBibleTypes,
    mentionRollup,
    collapsed
  } = props

  const [nameDraft, setNameDraft] = useState(node.name)
  const isFolder = node.type === 'folder'
  const isEditing = editingId === node.id
  const isSelected = selectedId === node.id
  const isActiveDoc = node.type === 'document' && node.id === activeDocumentId
  const isDropHighlight = dropTarget?.overId === node.id
  // Folders always show their expand affordance; a document only grows one
  // once it actually has children, so plain leaf documents stay uncluttered.
  const showChevron = isFolder || node.children.length > 0

  useEffect(() => {
    if (isEditing) setNameDraft(node.name)
  }, [isEditing, node.name])

  function startEditing(): void {
    setNameDraft(node.name)
    setEditingId(node.id)
  }

  function commitEditing(): void {
    setEditingId(null)
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== node.name) actions.onRename(node.id, trimmed)
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>): void {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
    setDragId(node.id)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    if (!dragId || dragId === node.id) return
    e.preventDefault()
    e.stopPropagation()

    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height

    if (ratio > 0.25 && ratio < 0.75) {
      setDropTarget({ overId: node.id, parentId: node.id, index: node.children.length, mode: 'inside' })
    } else if (ratio <= 0.5) {
      setDropTarget({ overId: node.id, parentId, index, mode: 'before' })
    } else {
      setDropTarget({ overId: node.id, parentId, index: index + 1, mode: 'after' })
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    e.stopPropagation()
    onDropCommit()
  }

  async function handleDelete(e: MouseEvent): Promise<void> {
    e.stopPropagation()
    await actions.onDelete(node.id)
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    actions.onSelect(node.id)
    actions.onContextMenu(node, e.clientX, e.clientY)
  }

  const rowClasses = [
    'binder-row',
    collapsed ? 'is-icon-only' : '',
    isSelected ? 'is-selected' : '',
    isActiveDoc ? 'is-active-doc' : '',
    isDropHighlight ? `drop-${dropTarget?.mode}` : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="binder-node">
      <div
        className={rowClasses}
        // Indentation is meaningless without names to indent — the icon rail
        // is a flat column, and the tooltip carries the name instead.
        style={collapsed ? undefined : { paddingLeft: `${8 + depth * 16}px` }}
        title={collapsed ? node.name || 'Untitled' : undefined}
        draggable={!isEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={() => {
          setDragId(null)
          setDropTarget(null)
        }}
        onClick={(e) => {
          e.stopPropagation()
          actions.onSelect(node.id)
          if (node.type === 'document') actions.onOpenDocument(node.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          startEditing()
        }}
        onContextMenu={handleContextMenu}
      >
        {collapsed ? null : showChevron ? (
          <button
            type="button"
            className="chevron-button"
            onClick={(e) => {
              e.stopPropagation()
              actions.onSelect(node.id)
              actions.onToggleCollapse(node.id)
            }}
            title={node.collapsed ? 'Expand' : 'Collapse'}
          >
            <span className={`chevron ${node.collapsed ? '' : 'expanded'}`}>
              <ChevronIcon />
            </span>
          </button>
        ) : (
          <span className="chevron-spacer" />
        )}

        <span className="node-icon">{isFolder ? <FolderIcon /> : <DocumentIcon />}</span>

        {collapsed ? null : isEditing ? (
          <input
            className="rename-input"
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEditing()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setEditingId(null)
              }
            }}
          />
        ) : (
          <span className="node-name">{node.name}</span>
        )}

        {node.type === 'document' && !isEditing && !collapsed && (
          <span className="binder-row-badges">
            <StatusBadge status={resolveStatus(statuses, node.statusId)} />
            <TagChips tags={resolveTags(tags, node.tagIds)} />
            <SpanTagRollupChips tags={resolveTags(tags, spanTagRollup[node.id] ?? [])} />
            <SpanTagRollupChips tags={resolveMentionChips(storyBibleItems, storyBibleTypes, mentionRollup[node.id] ?? [])} />
          </span>
        )}

        {node.type === 'document' && !collapsed && (
          <button
            type="button"
            className="row-split"
            title="Open in split view"
            onClick={(e) => {
              e.stopPropagation()
              actions.onOpenSplitView(node.id)
            }}
          >
            <SplitViewIcon />
          </button>
        )}

        {!collapsed && (
          <button
            type="button"
            className="row-delete"
            title={isFolder ? 'Delete folder' : 'Delete document'}
            onClick={handleDelete}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {showChevron && !node.collapsed && (
        <div className="binder-list">
          {node.children.length === 0 && !collapsed && (
            <div
              className="binder-empty-folder"
              style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
              onDragOver={(e) => {
                if (!dragId || dragId === node.id) return
                e.preventDefault()
                e.stopPropagation()
                setDropTarget({ overId: node.id, parentId: node.id, index: 0, mode: 'inside' })
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDropCommit()
              }}
            >
              Empty
            </div>
          )}
          {node.children.map((child, childIndex) => (
            <BinderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              parentId={node.id}
              index={childIndex}
              activeDocumentId={activeDocumentId}
              selectedId={selectedId}
              editingId={editingId}
              setEditingId={setEditingId}
              dragId={dragId}
              setDragId={setDragId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDropCommit={onDropCommit}
              actions={actions}
              statuses={statuses}
              tags={tags}
              spanTagRollup={spanTagRollup}
              storyBibleItems={storyBibleItems}
              storyBibleTypes={storyBibleTypes}
              mentionRollup={mentionRollup}
              collapsed={collapsed}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Binder(props: BinderProps): JSX.Element {
  const {
    tree,
    activeDocumentId,
    selectedId,
    editRequestId,
    statuses,
    tags,
    spanTagRollup,
    storyBibleItems,
    storyBibleTypes,
    mentionRollup,
    collapsed,
    ...actions
  } = props
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (editRequestId) setEditingId(editRequestId.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequestId?.token])

  function handleDropCommit(): void {
    if (dragId && dropTarget) {
      actions.onMove(dragId, dropTarget.parentId, dropTarget.index)
    }
    setDragId(null)
    setDropTarget(null)
  }

  return (
    <div
      className="binder-list binder-root"
      onClick={() => actions.onSelect(null)}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        actions.onSelect(null)
        actions.onContextMenu(null, e.clientX, e.clientY)
      }}
      onDragOver={(e) => {
        if (e.target === e.currentTarget && dragId) {
          e.preventDefault()
          setDropTarget({ overId: '__root__', parentId: null, index: tree.length, mode: 'after' })
        }
      }}
      onDrop={(e) => {
        if (e.target === e.currentTarget) handleDropCommit()
      }}
    >
      {tree.length === 0 && <div className="binder-empty">No documents yet</div>}
      {tree.map((node, index) => (
        <BinderRow
          key={node.id}
          node={node}
          depth={0}
          parentId={null}
          index={index}
          activeDocumentId={activeDocumentId}
          selectedId={selectedId}
          editingId={editingId}
          setEditingId={setEditingId}
          dragId={dragId}
          setDragId={setDragId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          onDropCommit={handleDropCommit}
          actions={actions}
          statuses={statuses}
          tags={tags}
          spanTagRollup={spanTagRollup}
          storyBibleItems={storyBibleItems}
          storyBibleTypes={storyBibleTypes}
          mentionRollup={mentionRollup}
          collapsed={collapsed}
        />
      ))}
    </div>
  )
}

export default Binder
