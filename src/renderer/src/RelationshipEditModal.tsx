import { useMemo, useState } from 'react'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import type { Relationship, RelationshipDraft } from '../../shared/relationships'

interface RelationshipEditModalProps {
  existing: Relationship | null
  /** Pre-selects one end — used when adding from a character's own sheet. */
  initialFromId?: string | null
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  onSave: (draft: RelationshipDraft) => Promise<void>
  onClose: () => void
}

/** Characters first, then the remaining types in their own order. Item types
 *  are user-editable, so this sorts rather than filters — linking a character
 *  to a place or a faction stays possible. */
function groupItems(
  items: StoryBibleItem[],
  types: StoryBibleTypeDef[]
): { label: string; members: StoryBibleItem[] }[] {
  const knownIds = new Set(types.map((t) => t.id))
  const ordered = [...types].sort((a, b) => {
    const score = (t: StoryBibleTypeDef): number => (/character/i.test(t.name) ? 0 : 1)
    return score(a) - score(b)
  })
  const groups = ordered
    .map((type) => ({ label: type.name, members: items.filter((i) => i.typeId === type.id) }))
    .filter((g) => g.members.length > 0)
  const orphaned = items.filter((i) => !knownIds.has(i.typeId))
  if (orphaned.length) groups.push({ label: 'Uncategorized', members: orphaned })
  return groups
}

function RelationshipEditModal(props: RelationshipEditModalProps): JSX.Element {
  const { existing, initialFromId, items, types, onSave, onClose } = props

  const groups = useMemo(() => groupItems(items, types), [items, types])
  const firstId = groups[0]?.members[0]?.id ?? ''

  const [fromId, setFromId] = useState(existing?.fromId ?? initialFromId ?? firstId)
  const [toId, setToId] = useState(existing?.toId ?? '')
  const [label, setLabel] = useState(existing?.label ?? '')
  // Mutual is the common case ("siblings"), so it's the default; ticking
  // directional reveals the second wording.
  const [directional, setDirectional] = useState(existing ? existing.reverseLabel !== null : false)
  const [reverseLabel, setReverseLabel] = useState(existing?.reverseLabel ?? '')
  const [saving, setSaving] = useState(false)

  const nameOf = (id: string): string => items.find((i) => i.id === id)?.name || 'Untitled'
  const valid = fromId && toId && fromId !== toId && label.trim().length > 0

  async function handleSave(): Promise<void> {
    if (!valid) return
    setSaving(true)
    await onSave({
      fromId,
      toId,
      label: label.trim(),
      reverseLabel: directional ? reverseLabel.trim() || label.trim() : null
    })
    setSaving(false)
  }

  function itemSelect(value: string, onChange: (v: string) => void, placeholder: string): JSX.Element {
    return (
      <select
        className="typography-field-input"
        style={{ marginBottom: 0 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || 'Untitled'}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal relationship-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{existing ? 'Edit relationship' : 'Add a relationship'}</h2>

        <div className="typography-form">
          <label className="typography-field">
            <span>From</span>
            {itemSelect(fromId, setFromId, 'Choose an item…')}
          </label>

          <label className="typography-field">
            <span>{directional ? 'Is the…' : 'Relationship'}</span>
            <input
              type="text"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              autoFocus
              placeholder={directional ? 'mentor of' : 'siblings'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          <label className="typography-field">
            <span>To</span>
            {itemSelect(toId, setToId, 'Choose an item…')}
          </label>

          <label className="typography-field relationship-direction-toggle">
            <input
              type="checkbox"
              checked={directional}
              onChange={(e) => setDirectional(e.target.checked)}
            />
            <span>Reads differently in each direction</span>
          </label>

          {directional && (
            <label className="typography-field">
              <span>…and in reverse</span>
              <input
                type="text"
                className="typography-field-input"
                style={{ marginBottom: 0 }}
                placeholder="student of"
                value={reverseLabel}
                onChange={(e) => setReverseLabel(e.target.value)}
              />
            </label>
          )}
        </div>

        {/* Reads the relationship back in plain English so the direction is
            unambiguous before it's saved. */}
        {fromId && toId && fromId !== toId && label.trim() && (
          <div className="relationship-preview">
            <div>
              <strong>{nameOf(fromId)}</strong> — {label.trim()} → <strong>{nameOf(toId)}</strong>
            </div>
            <div>
              <strong>{nameOf(toId)}</strong> — {(directional ? reverseLabel.trim() || label.trim() : label.trim())} →{' '}
              <strong>{nameOf(fromId)}</strong>
            </div>
          </div>
        )}

        {fromId && toId && fromId === toId && (
          <p className="relationship-warning">Pick two different items.</p>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            onClick={() => void handleSave()}
            disabled={saving || !valid}
          >
            {saving ? 'Saving…' : existing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RelationshipEditModal
