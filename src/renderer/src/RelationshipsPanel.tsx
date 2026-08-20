import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { sidesFor, type Relationship } from '../../shared/relationships'
import { PlusIcon, TrashIcon } from './icons'

interface RelationshipsPanelProps {
  itemId: string
  relationships: Relationship[]
  /** The live Story Bible index — every name below is resolved from this on
   *  each render, which is why renaming an item updates this list with no
   *  write to the relationship store. */
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  onOpenItem: (id: string) => void
  onAdd: () => void
  onEdit: (relationship: Relationship) => void
  onDelete: (relationship: Relationship) => void
}

/** Read from this item's own side: the sheet for a student shows "student of
 *  Marla", while Marla's sheet shows "mentor of" the same person — one stored
 *  record, two readings. */
function RelationshipsPanel(props: RelationshipsPanelProps): JSX.Element {
  const { itemId, relationships, items, types, onOpenItem, onAdd, onEdit, onDelete } = props

  const sides = sidesFor(relationships, itemId)
  const typesById = new Map(types.map((t) => [t.id, t]))

  return (
    <div className="story-bible-relationships">
      <div className="story-bible-appearances-header">
        <span className="story-bible-appearances-title">Relationships</span>
        <button type="button" className="relationship-add-button" onClick={onAdd}>
          <PlusIcon /> Add
        </button>
      </div>

      {sides.length === 0 ? (
        <p className="relationship-empty">No relationships yet.</p>
      ) : (
        <div className="relationship-rows">
          {sides.map((side) => {
            const other = items.find((i) => i.id === side.otherId) ?? null
            const color = other ? typesById.get(other.typeId)?.color ?? 'var(--chrome-text-dim)' : null
            return (
              <div key={side.relationship.id} className="relationship-row">
                <span className="relationship-label">
                  {side.label}
                  {!side.mutual && (
                    <span className="relationship-direction" title={side.outgoing ? 'Points outward' : 'Points inward'}>
                      {side.outgoing ? '→' : '←'}
                    </span>
                  )}
                </span>

                {other ? (
                  <button
                    type="button"
                    className="relationship-target"
                    onClick={() => onOpenItem(other.id)}
                    title={`Open ${other.name || 'Untitled'}`}
                  >
                    <span className="panel-nav-dot" style={{ background: color ?? undefined }} />
                    {other.name || 'Untitled'}
                  </button>
                ) : (
                  // The id is kept on disk, so this comes back if a backup
                  // restores the item — see relationshipStore.
                  <span className="timeline-broken-chip" title="This Story Bible item was deleted">
                    ⚠ Deleted item
                  </span>
                )}

                <div className="relationship-row-actions">
                  <button type="button" className="outliner-open-button" onClick={() => onEdit(side.relationship)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="row-delete-visible"
                    title="Delete relationship"
                    onClick={() => onDelete(side.relationship)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default RelationshipsPanel
