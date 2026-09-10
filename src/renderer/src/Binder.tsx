import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import { DRAFT_FOLDER_ID, draftChildren, isStructuralFolderId } from '../../shared/binder'
import type { BinderNode, DocumentNode, StatusDef, TagDef } from '../../shared/binder'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { ChevronIcon, SplitViewIcon, TrashIcon } from './icons'
import { SpanTagRollupChips, TagChips, resolveStatus, resolveTags } from './StatusTagBadges'
import { resolveMentionChips } from './mentionUtils'
import { usePresence, presenceClass } from './usePresence'

type DropMode = 'before' | 'after' | 'inside'

interface DropTarget {
  overId: string
  parentId: string | null
  index: number
  mode: DropMode
}

/** Where the status edge under the pointer is, and whose card to raise. */
interface EdgeHover {
  node: DocumentNode
  left: number
  top: number
}

interface BinderActions {
  onSelect: (id: string | null) => void
  onOpenDocument: (id: string) => void
  /** Clicking any folder — structural or ordinary, at any depth — opens the
   *  merged read-only view of its contents: the same traversal, pagination,
   *  and Flat/3D book rendering the old dedicated draft entry used, now
   *  scoped to whatever folder was clicked. */
  onOpenFolderView: (id: string) => void
  onToggleCollapse: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, targetParentId: string | null, targetIndex: number) => void
  onOpenSplitView: (id: string) => void
  onContextMenu: (node: BinderNode | null, x: number, y: number) => void
  /** A manually assigned chapter number, independent of tree position — see
   *  DocumentNode.chapterNumber. null clears it. */
  onEditChapterNumber: (id: string, value: number | null) => void
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
  /** Live per-document word counts — the same record the Outliner and the
   *  Progress page read, so the binder can never disagree with them. */
  wordCounts: Record<string, number>
}

interface RowProps {
  node: BinderNode
  parentId: string | null
  index: number
  /** Whether this node lives inside Draft — counts are manuscript-only, so
   *  Notes and Matter rows never show one. The Draft folder itself shows the
   *  roll-up of everything it holds. */
  inDraft: boolean
  activeDocumentId: string | null
  selectedId: string | null
  editingId: string | null
  setEditingId: (id: string | null) => void
  dragId: string | null
  /** Whether the node currently being dragged is a folder. Only folders may
   *  land at the binder root, so a document drag must not be offered
   *  before/after positions on a root row that it can never occupy. */
  dragIsFolder: boolean
  setDragId: (id: string | null) => void
  dropTarget: DropTarget | null
  setDropTarget: (t: DropTarget | null) => void
  onDropCommit: () => void
  setEdgeHover: (hover: EdgeHover | null) => void
  actions: BinderActions
  statuses: StatusDef[]
  tags: TagDef[]
  spanTagRollup: Record<string, string[]>
  mentionRollup: Record<string, string[]>
  wordCounts: Record<string, number>
  subtreeWords: Map<string, number>
}

function BinderRow(props: RowProps): JSX.Element {
  const {
    node,
    parentId,
    index,
    inDraft,
    activeDocumentId,
    selectedId,
    editingId,
    setEditingId,
    dragId,
    dragIsFolder,
    setDragId,
    dropTarget,
    setDropTarget,
    onDropCommit,
    setEdgeHover,
    actions,
    statuses,
    tags,
    spanTagRollup,
    mentionRollup,
    wordCounts,
    subtreeWords
  } = props

  const [nameDraft, setNameDraft] = useState(node.name)
  const isFolder = node.type === 'folder'
  // Draft/Notes/Matter/Archive/Trash: fixed rows. No drag, no rename, no
  // delete — only their contents behave like ordinary binder items.
  // binderStore refuses all three operations too; hiding the affordances
  // keeps the UI honest. A custom top-level folder is NOT one of these: it
  // sits at the same level and is otherwise an ordinary row.
  const isStructural = isStructuralFolderId(node.id)
  const atRoot = parentId === null
  const isEditing = editingId === node.id && !isStructural
  const isSelected = selectedId === node.id
  const isActiveDoc = node.type === 'document' && node.id === activeDocumentId
  const isDropHighlight = dropTarget?.overId === node.id
  // Folders always show their expand affordance; a document only grows one
  // once it actually has children — and with the file icons gone, a plain
  // leaf document spends nothing at all on the disclosure column.
  const showChevron = isFolder || node.children.length > 0
  const childPresence = usePresence(node.collapsed ? null : true)

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
    setEdgeHover(null)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    if (!dragId || dragId === node.id) return
    e.preventDefault()
    e.stopPropagation()

    // A structural row's own position is fixed, so the only drop it offers is
    // into itself — which for Archive and Trash is the whole point of them.
    // The same applies to any root row while a document is being dragged: the
    // root takes folders only, so before/after there would be a dead drop.
    if (isStructural || (atRoot && !dragIsFolder)) {
      setDropTarget({ overId: node.id, parentId: node.id, index: node.children.length, mode: 'inside' })
      return
    }

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
    isSelected ? 'is-selected' : '',
    isActiveDoc ? 'is-active-doc' : '',
    isStructural ? 'is-structural' : '',
    isDropHighlight ? `drop-${dropTarget?.mode}` : ''
  ]
    .filter(Boolean)
    .join(' ')

  // The status/tags edge. Rendered whenever the row has anything to say —
  // status colours it; a statusless row with tags gets a neutral bar so its
  // tags stay discoverable. The card itself is raised by the root, outside
  // this scroller.
  const status = node.type === 'document' ? resolveStatus(statuses, node.statusId) : undefined
  const hasEdge =
    node.type === 'document' &&
    (status != null ||
      node.tagIds.length > 0 ||
      (spanTagRollup[node.id]?.length ?? 0) > 0 ||
      (mentionRollup[node.id]?.length ?? 0) > 0)

  // Manuscript words, always visible where they mean something: a document's
  // own count inside Draft; a folder's roll-up (Draft itself included).
  const countsAsDraft = inDraft || node.id === DRAFT_FOLDER_ID
  const wordCount = !countsAsDraft
    ? null
    : node.type === 'document'
      ? (wordCounts[node.id] ?? 0)
      : (subtreeWords.get(node.id) ?? 0)

  return (
    <div className="binder-node">
      <div
        className={rowClasses}
        draggable={!isEditing && !isStructural}
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
          // Documents open in the editor exactly as always; a folder click —
          // any folder, any depth — opens the merged view of its contents.
          if (node.type === 'document') actions.onOpenDocument(node.id)
          else actions.onOpenFolderView(node.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (!isStructural) startEditing()
        }}
        onContextMenu={handleContextMenu}
      >
        {hasEdge && (
          <span
            className="binder-status-edge"
            aria-label={status ? `Status: ${status.name}` : 'Tags'}
            style={{ '--edge-color': status?.color ?? 'var(--chrome-border-strong)' } as CSSProperties}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setEdgeHover({
                node: node as DocumentNode,
                left: rect.right + 6,
                top: Math.min(Math.max(rect.top + rect.height / 2, 48), window.innerHeight - 48)
              })
            }}
            onMouseLeave={() => setEdgeHover(null)}
          />
        )}

        {showChevron && (
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
        )}

        {/* A manual label, not a computed one — deliberately independent of
            this row's actual position in the tree (that position already
            shows via ordering/indent). Document-only: a folder has no
            chapter of its own to number. With the file icons gone this is
            the document's leading mark; the placeholder stays invisible
            until the row is hovered, so unnumbered rows read clean. */}
        {node.type === 'document' && !isEditing && (
          <input
            key={node.chapterNumber ?? 'unset'}
            type="number"
            min={0}
            step={1}
            className="chapter-number-input"
            defaultValue={node.chapterNumber ?? ''}
            placeholder="#"
            title="Chapter number (manual label — does not affect ordering, search, or export)"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              const next = raw ? Math.max(0, Math.round(Number(raw))) : null
              if (next !== node.chapterNumber) actions.onEditChapterNumber(node.id, next)
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                e.currentTarget.value = node.chapterNumber !== null ? String(node.chapterNumber) : ''
                e.currentTarget.blur()
              }
            }}
          />
        )}

        {isEditing ? (
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

        {wordCount != null && !isEditing && (
          <span className="binder-row-count">{wordCount.toLocaleString()}</span>
        )}

        {node.type === 'document' && (
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

        {!isStructural && (
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

      {/* Held open through usePresence for one exit rather than unmounted on
          the click, so the children fade and settle instead of blinking out.
          Per row, so only the folder actually toggled animates — its
          siblings never re-enter. */}
      {showChevron && childPresence.rendered && (
        <div className={`binder-list ${presenceClass(childPresence.visible)}`}>
          {node.children.length === 0 && (
            <div
              className="binder-empty-folder"
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
              parentId={node.id}
              index={childIndex}
              inDraft={countsAsDraft}
              activeDocumentId={activeDocumentId}
              selectedId={selectedId}
              editingId={editingId}
              setEditingId={setEditingId}
              dragId={dragId}
              dragIsFolder={dragIsFolder}
              setDragId={setDragId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDropCommit={onDropCommit}
              setEdgeHover={setEdgeHover}
              actions={actions}
              statuses={statuses}
              tags={tags}
              spanTagRollup={spanTagRollup}
              mentionRollup={mentionRollup}
              wordCounts={wordCounts}
              subtreeWords={subtreeWords}
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
    wordCounts,
    ...actions
  } = props
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edgeHover, setEdgeHover] = useState<EdgeHover | null>(null)

  useEffect(() => {
    if (editRequestId) setEditingId(editRequestId.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequestId?.token])

  // Only folders may sit at the binder root, so rows there offer before/after
  // positions to a folder drag and "into me" to everything else. Resolved
  // once here rather than per row.
  const dragIsFolder = useMemo(() => {
    if (!dragId) return false
    const find = (nodes: BinderNode[]): BinderNode | null => {
      for (const node of nodes) {
        if (node.id === dragId) return node
        const hit = find(node.children)
        if (hit) return hit
      }
      return null
    }
    return find(tree)?.type === 'folder'
  }, [dragId, tree])

  // Folder roll-ups, one walk per tree/counts change. Every folder's entry is
  // the sum of the documents anywhere beneath it — display filters to Draft.
  const subtreeWords = useMemo(() => {
    const totals = new Map<string, number>()
    const walk = (node: BinderNode): number => {
      let sum = node.type === 'document' ? (wordCounts[node.id] ?? 0) : 0
      for (const child of node.children) sum += walk(child)
      if (node.type === 'folder') totals.set(node.id, sum)
      return sum
    }
    for (const node of tree) walk(node)
    return totals
  }, [tree, wordCounts])

  function handleDropCommit(): void {
    if (dragId && dropTarget) {
      actions.onMove(dragId, dropTarget.parentId, dropTarget.index)
    }
    setDragId(null)
    setDropTarget(null)
  }

  // The card the status edge raises: status plus every kind of chip the row
  // used to wear inline — own tags filled, contained span tags and Story
  // Bible mentions outlined. Fixed-position because the binder scrolls, and
  // pointer-inert so it can overlap neighbouring rows without stealing them.
  const edgeCard = edgeHover && (
    <div className="binder-edge-card" style={{ left: edgeHover.left, top: edgeHover.top }}>
      {(() => {
        const status = resolveStatus(statuses, edgeHover.node.statusId)
        const contained = [
          ...resolveTags(tags, spanTagRollup[edgeHover.node.id] ?? []),
          ...resolveMentionChips(storyBibleItems, storyBibleTypes, mentionRollup[edgeHover.node.id] ?? [])
        ]
        return (
          <>
            {status && (
              <div className="binder-edge-card-status">
                <span className="status-dot" style={{ backgroundColor: status.color }} />
                {status.name}
              </div>
            )}
            <TagChips tags={resolveTags(tags, edgeHover.node.tagIds)} />
            <SpanTagRollupChips tags={contained} />
          </>
        )
      })()}
    </div>
  )

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
          // Empty space below the tree means "end of the manuscript" — the
          // root itself permanently holds only the structural folders.
          setDropTarget({
            overId: '__root__',
            parentId: DRAFT_FOLDER_ID,
            index: draftChildren(tree).length,
            mode: 'after'
          })
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
          parentId={null}
          index={index}
          inDraft={false}
          activeDocumentId={activeDocumentId}
          selectedId={selectedId}
          editingId={editingId}
          setEditingId={setEditingId}
          dragId={dragId}
          dragIsFolder={dragIsFolder}
          setDragId={setDragId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          onDropCommit={handleDropCommit}
          setEdgeHover={setEdgeHover}
          actions={actions}
          statuses={statuses}
          tags={tags}
          spanTagRollup={spanTagRollup}
          mentionRollup={mentionRollup}
          wordCounts={wordCounts}
          subtreeWords={subtreeWords}
        />
      ))}
      {edgeCard}
    </div>
  )
}

export default Binder
