import { useMemo, useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import type { TimelineDraft, TimelineEntry } from '../../shared/timeline'
import { collectAllDocuments } from './search/projectSearch'
import { TrashIcon } from './icons'

interface TimelineEntryModalProps {
  /** The entry being edited, or null when adding a new one. */
  existing: TimelineEntry | null
  /** The live Story Bible index — the same array App feeds the editor's
   *  mention detection. Nothing here is copied out of it. */
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  tree: BinderNode[]
  onSave: (draft: TimelineDraft) => Promise<void>
  onClose: () => void
}

const MISSING_DOCUMENT = '__missing__'

function TimelineEntryModal(props: TimelineEntryModalProps): JSX.Element {
  const { existing, items, types, tree, onSave, onClose } = props

  const [description, setDescription] = useState(existing?.description ?? '')
  const [whenText, setWhenText] = useState(existing?.whenText ?? '')
  const [documentId, setDocumentId] = useState<string>(existing?.documentId ?? '')
  // Holds ids, never names — including any that don't currently resolve, so
  // editing an entry whose character was deleted can't quietly drop the link.
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(existing?.itemIds ?? [])
  const [itemFilter, setItemFilter] = useState('')
  const [saving, setSaving] = useState(false)

  const documents = useMemo(() => collectAllDocuments(tree), [tree])
  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types])

  const documentResolves = !documentId || documents.some((d) => d.id === documentId)

  // Selected ids with no Story Bible item behind them any more. They stay
  // selected (and get saved back) unless explicitly removed here.
  const missingItemIds = selectedItemIds.filter((id) => !items.some((item) => item.id === id))

  const query = itemFilter.trim().toLowerCase()
  const visibleItems = query
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.aliases.some((alias) => alias.toLowerCase().includes(query))
      )
    : items

  // Grouped by type, in the type list's own order — the same grouping the
  // Story Bible browse grid uses, so the two read the same way.
  const grouped = types
    .map((type) => ({ type, members: visibleItems.filter((item) => item.typeId === type.id) }))
    .filter((group) => group.members.length > 0)
  const untyped = visibleItems.filter((item) => !typesById.has(item.typeId))

  function toggleItem(id: string): void {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    await onSave({
      description: description.trim() || 'Untitled event',
      whenText: whenText.trim(),
      itemIds: selectedItemIds,
      documentId: documentId || null
    })
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal timeline-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{existing ? 'Edit event' : 'Add an event'}</h2>

        <div className="typography-form">
          <label className="typography-field">
            <span>What happens</span>
            <input
              type="text"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              autoFocus
              placeholder="The fire at the mill"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="typography-field">
            <span>When (in story)</span>
            <input
              type="text"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              placeholder="three days after the fire"
              value={whenText}
              onChange={(e) => setWhenText(e.target.value)}
            />
            <span className="timeline-field-hint">
              Free text — never parsed or sorted on. Drag entries on the board to set their order.
            </span>
          </label>

          <label className="typography-field">
            <span>Scene</span>
            <select
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={documentResolves ? documentId : MISSING_DOCUMENT}
              onChange={(e) => setDocumentId(e.target.value === MISSING_DOCUMENT ? documentId : e.target.value)}
            >
              <option value="">None</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name || 'Untitled'}
                </option>
              ))}
              {/* Keeps a dangling document link selectable rather than
                  silently reassigning it to whatever sits at the top. */}
              {!documentResolves && <option value={MISSING_DOCUMENT}>⚠ This document no longer exists</option>}
            </select>
            {!documentResolves && (
              <button
                type="button"
                className="timeline-inline-clear"
                onClick={() => setDocumentId('')}
              >
                Clear the broken scene link
              </button>
            )}
          </label>
        </div>

        <div className="timeline-picker">
          <div className="timeline-picker-header">
            <span>Story Bible items involved</span>
            <span className="timeline-picker-count">{selectedItemIds.length} linked</span>
          </div>

          {missingItemIds.length > 0 && (
            <div className="timeline-picker-missing">
              {missingItemIds.map((id) => (
                <div key={id} className="timeline-missing-row">
                  <span className="timeline-broken-chip">⚠ Deleted item</span>
                  <button
                    type="button"
                    className="row-delete-visible"
                    title="Remove this broken link"
                    onClick={() => toggleItem(id)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <p className="tag-status-filter-empty">
              No Story Bible items yet — add characters, locations, or objects there first.
            </p>
          ) : (
            <>
              <input
                type="text"
                className="outliner-filter-input timeline-picker-filter"
                placeholder="Filter by name or alias…"
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
              />
              <div className="timeline-picker-list">
                {grouped.length === 0 && untyped.length === 0 && (
                  <p className="tag-status-filter-empty">Nothing matches that.</p>
                )}
                {grouped.map(({ type, members }) => (
                  <div key={type.id} className="timeline-picker-group">
                    <div className="timeline-picker-group-label">{type.name}</div>
                    {members.map((item) => (
                      <label key={item.id} className="timeline-picker-row">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={() => toggleItem(item.id)}
                        />
                        <span className="timeline-picker-swatch" style={{ background: type.color }} />
                        <span className="timeline-picker-name">{item.name || 'Untitled'}</span>
                      </label>
                    ))}
                  </div>
                ))}
                {untyped.length > 0 && (
                  <div className="timeline-picker-group">
                    <div className="timeline-picker-group-label">Uncategorized</div>
                    {untyped.map((item) => (
                      <label key={item.id} className="timeline-picker-row">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={() => toggleItem(item.id)}
                        />
                        <span
                          className="timeline-picker-swatch"
                          style={{ background: 'var(--chrome-text-dim)' }}
                        />
                        <span className="timeline-picker-name">{item.name || 'Untitled'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : existing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TimelineEntryModal
