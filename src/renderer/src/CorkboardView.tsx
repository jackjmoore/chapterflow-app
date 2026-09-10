import { useEffect, useState, type DragEvent } from 'react'
import type { BinderNode, StatusDef, TagDef } from '../../shared/binder'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { MIN_CARD_WIDTH, MAX_CARD_WIDTH, CARD_WIDTH_STEP } from '../../shared/preferences'
import { groupDocumentsForCorkboard, type CorkboardCard } from './corkboardUtils'
import { filterOutlinerTree } from './outlinerUtils'
import { RowChips, StatusBadge, resolveStatus, resolveTags, type RowChip } from './StatusTagBadges'
import { resolveMentionChips } from './mentionUtils'
import DocumentBadgeEditor from './DocumentBadgeEditor'
import TagStatusFilter from './TagStatusFilter'

interface CorkboardViewProps {
  tree: BinderNode[]
  cardWidth: number
  activeDocumentId: string | null
  /** Set by the binder's "Reveal in Corkboard" context-menu action — scrolls
   *  the named document's card into view and flashes it. */
  revealRequest: { id: string; token: number } | null
  wordCounts: Record<string, number>
  statuses: StatusDef[]
  tags: TagDef[]
  spanTagRollup: Record<string, string[]>
  storyBibleItems: StoryBibleItem[]
  storyBibleTypes: StoryBibleTypeDef[]
  mentionRollup: Record<string, string[]>
  statusFilter: string[]
  tagFilter: string[]
  onOpenDocument: (id: string) => void
  onEditTitle: (id: string, name: string) => void
  onEditSynopsis: (id: string, synopsis: string) => void
  onEditNotes: (id: string, notes: string) => void
  onEditStatusId: (id: string, statusId: string | null) => void
  onEditTagIds: (id: string, tagIds: string[]) => void
  onEditWordTarget: (id: string, target: number | null) => void
  onMove: (id: string, targetParentId: string | null, targetIndex: number) => void
  onCardWidthChange: (width: number) => void
  onStatusTagFilterChange: (statusFilter: string[], tagFilter: string[]) => void
}

interface DropTarget {
  parentId: string | null
  index: number
  beforeCardId: string
}

function CorkboardView(props: CorkboardViewProps): JSX.Element {
  const {
    tree,
    cardWidth,
    activeDocumentId,
    revealRequest,
    wordCounts,
    statuses,
    tags,
    spanTagRollup,
    storyBibleItems,
    storyBibleTypes,
    mentionRollup,
    statusFilter,
    tagFilter,
    onOpenDocument,
    onEditTitle,
    onEditSynopsis,
    onEditNotes,
    onEditStatusId,
    onEditTagIds,
    onEditWordTarget,
    onMove,
    onCardWidthChange,
    onStatusTagFilterChange
  } = props
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  /** Cards currently showing their notes rather than their synopsis. Per-view
   *  state, deliberately not persisted: which side of a card you last looked
   *  at is not a property of the project. */
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set())

  const filtered = filterOutlinerTree(tree, { statusFilter, tagFilter })
  const groups = groupDocumentsForCorkboard(filtered)

  useEffect(() => {
    if (!revealRequest) return
    const el = document.querySelector(`[data-node-id="${revealRequest.id}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('row-reveal-flash')
    const timer = setTimeout(() => el.classList.remove('row-reveal-flash'), 1600)
    return () => clearTimeout(timer)
  }, [revealRequest])

  function handleDragOver(e: DragEvent<HTMLDivElement>, group: { parentId: string | null }, card: CorkboardCard): void {
    if (!dragId || dragId === card.node.id) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const index = ratio < 0.5 ? card.realIndex : card.realIndex + 1
    setDropTarget({ parentId: group.parentId, index, beforeCardId: card.node.id })
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    if (dragId && dropTarget) onMove(dragId, dropTarget.parentId, dropTarget.index)
    setDragId(null)
    setDropTarget(null)
  }

  return (
    <div className="corkboard">
      <div className="corkboard-toolbar">
        <span className="corkboard-size-label">Card size</span>
        <button
          type="button"
          className="corkboard-size-button"
          disabled={cardWidth <= MIN_CARD_WIDTH}
          onClick={() => onCardWidthChange(cardWidth - CARD_WIDTH_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="corkboard-size-button"
          disabled={cardWidth >= MAX_CARD_WIDTH}
          onClick={() => onCardWidthChange(cardWidth + CARD_WIDTH_STEP)}
        >
          +
        </button>
        <TagStatusFilter
          statuses={statuses}
          tags={tags}
          statusFilter={statusFilter}
          tagFilter={tagFilter}
          onChange={onStatusTagFilterChange}
        />
      </div>

      <div className="corkboard-scroll">
        {groups.length === 0 && <div className="corkboard-empty">No documents yet.</div>}
        {groups.map((group) => (
          <div key={group.parentId ?? '__root__'} className="corkboard-group">
            {group.parentName && <div className="corkboard-group-label">{group.parentName}</div>}
            <div className="corkboard-grid" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
              {group.cards.map((card) => (
                <div
                  key={card.node.id}
                  data-node-id={card.node.id}
                  className={[
                    'corkboard-card',
                    card.node.id === activeDocumentId ? 'is-active-doc' : '',
                    dropTarget?.beforeCardId === card.node.id ? 'drop-before' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ width: `${cardWidth}px` }}
                  draggable={editingTitleId !== card.node.id}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', card.node.id)
                    setDragId(card.node.id)
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setDropTarget(null)
                  }}
                  onDragOver={(e) => handleDragOver(e, group, card)}
                  onDrop={handleDrop}
                  onClick={() => onOpenDocument(card.node.id)}
                >
                  {editingTitleId === card.node.id ? (
                    <input
                      autoFocus
                      type="text"
                      className="corkboard-title-input"
                      defaultValue={card.node.name}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        onEditTitle(card.node.id, e.target.value)
                        setEditingTitleId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditingTitleId(null)
                      }}
                    />
                  ) : (
                    <div
                      className="corkboard-card-title"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditingTitleId(card.node.id)
                      }}
                    >
                      {card.node.name || 'Untitled'}
                    </div>
                  )}
                  <div className="corkboard-card-badges" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <DocumentBadgeEditor
                      statuses={statuses}
                      tags={tags}
                      statusId={card.node.statusId}
                      tagIds={card.node.tagIds}
                      onChangeStatus={(id) => onEditStatusId(card.node.id, id)}
                      onChangeTags={(ids) => onEditTagIds(card.node.id, ids)}
                    >
                      {card.node.statusId ? (
                        <StatusBadge status={resolveStatus(statuses, card.node.statusId)} />
                      ) : (
                        <span className="outliner-badge-placeholder">Set status…</span>
                      )}
                    </DocumentBadgeEditor>
                    {/* Same capped list as the binder rows — one chip at most,
                        the rest a count, all three chip kinds pooled. Tags are
                        still edited through the status popover above. */}
                    <RowChips
                      chips={[
                        ...resolveTags(tags, card.node.tagIds).map((t) => ({ ...t, filled: true }) as RowChip),
                        ...resolveTags(tags, spanTagRollup[card.node.id] ?? []).map(
                          (t) => ({ ...t, filled: false }) as RowChip
                        ),
                        ...resolveMentionChips(
                          storyBibleItems,
                          storyBibleTypes,
                          mentionRollup[card.node.id] ?? []
                        ).map((t) => ({ ...t, filled: false }) as RowChip)
                      ]}
                    />
                  </div>
                  {/* The back of the card. An index card has two sides, and
                      this view is built on that metaphor already — showing
                      synopsis and notes at once would halve both for a field
                      many projects never use, so they share the one space.
                      The flip control is always present, not revealed only
                      when notes exist: a feature nobody can find is not
                      progressive disclosure. */}
                  {flipped.has(card.node.id) ? (
                    <textarea
                      key={`${card.node.id}-notes`}
                      className="corkboard-card-synopsis corkboard-card-notes"
                      placeholder="Notes…"
                      defaultValue={card.node.notes}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onBlur={(e) => onEditNotes(card.node.id, e.target.value)}
                    />
                  ) : (
                    <textarea
                      key={`${card.node.id}-synopsis`}
                      className="corkboard-card-synopsis"
                      placeholder="Synopsis…"
                      defaultValue={card.node.synopsis}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onBlur={(e) => onEditSynopsis(card.node.id, e.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className="corkboard-card-flip"
                    aria-pressed={flipped.has(card.node.id)}
                    title={flipped.has(card.node.id) ? 'Show the synopsis' : 'Show the notes'}
                    onClick={(e) => {
                      e.stopPropagation()
                      setFlipped((current) => {
                        const next = new Set(current)
                        if (next.has(card.node.id)) next.delete(card.node.id)
                        else next.add(card.node.id)
                        return next
                      })
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {flipped.has(card.node.id) ? 'Synopsis' : 'Notes'}
                    {/* A filled mark when there is something on the other
                        side, so a glance across the board says which cards
                        carry notes without flipping any of them. */}
                    {!flipped.has(card.node.id) && card.node.notes.trim() !== '' && (
                      <span className="corkboard-card-flip-mark" aria-label="has notes" />
                    )}
                  </button>
                  {editingTargetId === card.node.id ? (
                    <input
                      autoFocus
                      type="number"
                      min={0}
                      className="outliner-target-input"
                      defaultValue={card.node.wordTarget ?? ''}
                      placeholder="Target…"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        onEditWordTarget(card.node.id, v ? Math.max(0, Math.round(Number(v))) : null)
                        setEditingTargetId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditingTargetId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="corkboard-card-wordcount"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingTargetId(card.node.id)
                      }}
                      title="Click to set a word target"
                    >
                      {card.node.wordTarget ? (
                        <>
                          <span>
                            {(wordCounts[card.node.id] ?? 0).toLocaleString()} / {card.node.wordTarget.toLocaleString()}
                          </span>
                          <span className="outliner-target-bar">
                            <span
                              className="outliner-target-bar-fill"
                              style={{ width: `${Math.min(100, ((wordCounts[card.node.id] ?? 0) / card.node.wordTarget) * 100)}%` }}
                            />
                          </span>
                        </>
                      ) : (
                        <span>{(wordCounts[card.node.id] ?? 0).toLocaleString()} words</span>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CorkboardView
