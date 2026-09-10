import { useEffect, useMemo, useState, type DragEvent } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { countBrokenLinks, findBrokenLinks, type TimelineEntry } from '../../shared/timeline'
import { countBrokenRelationships, type Relationship } from '../../shared/relationships'
import { collectAllDocuments } from './search/projectSearch'
import { resolveMentionChips } from './mentionUtils'
import RelationshipMap from './RelationshipMap'
import { PlusIcon, DragHandleIcon } from './icons'

export type BoardMode = 'chronology' | 'relationships'

interface TimelineViewProps {
  entries: TimelineEntry[]
  /** The live Story Bible index and binder tree. Every name and color on this
   *  board is resolved from these on each render — an entry stores ids only,
   *  so renaming an item upstream shows up here with no timeline write at all. */
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  tree: BinderNode[]
  /** Set by the side panel's jump-list — scrolls that entry into view and
   *  flashes it, the same contract the binder's "Reveal in Outliner/Corkboard"
   *  uses against the outliner and corkboard. */
  revealRequest: { id: string; token: number } | null
  /** Which face of the board is showing. Chronology and the relationship map
   *  are two readings of the same continuity data, so they share the board's
   *  toolbar rather than living in separate rail sections. */
  board: BoardMode
  onBoardChange: (board: BoardMode) => void
  relationships: Relationship[]
  onOpenItem: (id: string) => void
  onAddRelationship: () => void
  onEditRelationship: (relationship: Relationship) => void
  onAdd: () => void
  onEdit: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
  onMove: (id: string, targetIndex: number) => void
  onOpenDocument: (id: string) => void
  onCleanUpBrokenLinks: () => void
}

function TimelineView(props: TimelineViewProps): JSX.Element {
  const {
    entries,
    items,
    types,
    tree,
    revealRequest,
    board,
    onBoardChange,
    relationships,
    onOpenItem,
    onAddRelationship,
    onEditRelationship,
    onAdd,
    onEdit,
    onDelete,
    onMove,
    onOpenDocument,
    onCleanUpBrokenLinks
  } = props
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!revealRequest) return
    const el = document.querySelector(`[data-timeline-entry-id="${revealRequest.id}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('row-reveal-flash')
    const timer = setTimeout(() => el.classList.remove('row-reveal-flash'), 1600)
    return () => clearTimeout(timer)
  }, [revealRequest])

  const documentsById = useMemo(
    () => new Map(collectAllDocuments(tree).map((d) => [d.id, d.name])),
    [tree]
  )
  const validItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items])
  const validDocumentIds = useMemo(() => new Set(documentsById.keys()), [documentsById])

  // One count covering both kinds of dead reference the board can show, since
  // the cleanup action fixes both.
  const totalBroken =
    entries.reduce((sum, entry) => sum + countBrokenLinks(findBrokenLinks(entry, validItemIds, validDocumentIds)), 0) +
    countBrokenRelationships(relationships, validItemIds)

  function handleDragOver(e: DragEvent<HTMLDivElement>, index: number): void {
    if (!dragId) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const after = (e.clientY - rect.top) / rect.height > 0.5
    setDropIndex(after ? index + 1 : index)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    if (dragId && dropIndex !== null) {
      const from = entries.findIndex((entry) => entry.id === dragId)
      // The drop index counts positions in the current list; once the dragged
      // entry is spliced out, everything after it shifts back by one.
      const target = from !== -1 && from < dropIndex ? dropIndex - 1 : dropIndex
      if (from !== target) onMove(dragId, target)
    }
    clearDrag()
  }

  function clearDrag(): void {
    setDragId(null)
    setDropIndex(null)
  }

  return (
    <div className="timeline" onDragEnd={clearDrag}>
      <div className="outliner-toolbar">
        <div className="span-tag-browser-filter-row board-mode-switch">
          <button
            type="button"
            className={board === 'chronology' ? 'span-tag-filter-pill is-active' : 'span-tag-filter-pill'}
            onClick={() => onBoardChange('chronology')}
          >
            Chronology
          </button>
          <button
            type="button"
            className={board === 'relationships' ? 'span-tag-filter-pill is-active' : 'span-tag-filter-pill'}
            onClick={() => onBoardChange('relationships')}
          >
            Relationships
          </button>
        </div>

        {board === 'chronology' ? (
          <button type="button" className="submissions-add-button" onClick={onAdd}>
            <PlusIcon /> Add an event
          </button>
        ) : (
          <button type="button" className="submissions-add-button" onClick={onAddRelationship}>
            <PlusIcon /> Add a relationship
          </button>
        )}

        <span className="submissions-count">
          {board === 'chronology'
            ? `${entries.length} ${entries.length === 1 ? 'event' : 'events'}`
            : `${relationships.length} ${relationships.length === 1 ? 'relationship' : 'relationships'}`}
        </span>
      </div>

      {/* Dead references are kept rather than scrubbed, so the board says so
          once, here, instead of leaving the reason to be inferred from a
          scattering of warning chips. */}
      {totalBroken > 0 && (
        <div className="timeline-broken-banner">
          <span>
            {totalBroken === 1
              ? 'One link points at something that has been deleted. It is kept here so that restoring a backup brings it back, rather than being quietly dropped.'
              : `${totalBroken} links point at things that have been deleted. They are kept here so that restoring a backup brings them back, rather than being quietly dropped.`}
          </span>
          <span className="timeline-broken-spacer" />
          <button
            type="button"
            className="timeline-cleanup-button"
            title="Removes dead links from events, and relationships whose item was deleted."
            onClick={onCleanUpBrokenLinks}
          >
            Clean up {totalBroken === 1 ? 'the broken link' : `${totalBroken} broken links`}
          </button>
        </div>
      )}

      {board === 'relationships' && (
        <RelationshipMap
          relationships={relationships}
          items={items}
          types={types}
          onOpenItem={onOpenItem}
          onEditRelationship={onEditRelationship}
          onAdd={onAddRelationship}
        />
      )}

      {board === 'chronology' && (
      <div className="timeline-scroll" onDrop={handleDrop} onDragOver={(e) => dragId && e.preventDefault()}>
        {entries.length === 0 ? (
          <div className="timeline-empty">
            <p>
              Nothing has been added to the chronology yet. An event records what happens and when it happens
              in the story, and it can name the Story Bible entries involved and the scene it takes place in.
            </p>
            <button type="button" className="submissions-add-button" onClick={onAdd}>
              <PlusIcon /> Add an event
            </button>
          </div>
        ) : (
          <div className="timeline-list">
            {entries.map((entry, index) => {
              const broken = findBrokenLinks(entry, validItemIds, validDocumentIds)
              const chips = resolveMentionChips(items, types, entry.itemIds)
              const documentName = entry.documentId ? documentsById.get(entry.documentId) : undefined
              const documentBroken = !!broken.documentId

              return (
                <div
                  key={entry.id}
                  data-timeline-entry-id={entry.id}
                  className={`timeline-row ${dragId === entry.id ? 'is-dragging' : ''} ${
                    dropIndex === index ? 'drop-before' : ''
                  } ${dropIndex === index + 1 && index === entries.length - 1 ? 'drop-after' : ''}`}
                  onDragOver={(e) => handleDragOver(e, index)}
                >
                  <div
                    className="timeline-drag-handle"
                    draggable
                    title="Drag to reorder"
                    onDragStart={() => setDragId(entry.id)}
                  >
                    <DragHandleIcon />
                  </div>

                  {/* The in-story date gets a column of its own, so the board
                      reads down its dates as well as its events. */}
                  <div className="timeline-when">
                    {entry.whenText || <span className="timeline-when-unset">No date given</span>}
                  </div>

                  <div className="timeline-rail">
                    <span className="timeline-dot" />
                    <span className="timeline-index">{index + 1}</span>
                  </div>

                  <div className="timeline-body">
                    <span className="timeline-description">{entry.description || 'Untitled event'}</span>

                    <div className="timeline-card-meta">
                      {chips.map((chip) => (
                        <span
                          key={chip.id}
                          className="timeline-item-chip"
                          style={{ borderColor: chip.color, color: chip.color }}
                        >
                          {chip.name || 'Untitled'}
                        </span>
                      ))}
                      {/* A reference whose Story Bible item is gone. Shown, not
                          swallowed — and it comes back if a backup restores
                          the item, because the id was never scrubbed. */}
                      {broken.itemIds.map((id) => (
                        <span key={id} className="timeline-broken-chip" title="This Story Bible item was deleted">
                          Deleted item
                        </span>
                      ))}

                      {entry.documentId &&
                        (documentBroken ? (
                          <span className="timeline-broken-chip" title="This scene was deleted">
                            Deleted scene
                          </span>
                        ) : (
                          <span className="timeline-scene-chip">Scene: {documentName || 'Untitled'}</span>
                        ))}
                    </div>

                    <div className="timeline-row-actions">
                      <button type="button" className="outliner-open-button" onClick={() => onEdit(entry)}>
                        Edit
                      </button>
                      {entry.documentId && !documentBroken && (
                        <button
                          type="button"
                          className="outliner-open-button"
                          onClick={() => onOpenDocument(entry.documentId as string)}
                        >
                          Open the scene
                        </button>
                      )}
                      <button
                        type="button"
                        className="outliner-open-button timeline-delete-action"
                        onClick={() => onDelete(entry)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}
    </div>
  )
}

export default TimelineView
