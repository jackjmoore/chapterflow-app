import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { StoryBibleBlock, StoryBibleBlockKind, StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { createBlock, TextBlockView, ImageBlockView, ListBlockView, StatsBlockView } from './StoryBibleBlocks'
import type { MentionStatsSummary } from './mentionUtils'
import { PresenceStrip, appearanceSentence, initialsFor } from './StoryBiblePresence'
import RelationshipsPanel from './RelationshipsPanel'
import type { Relationship } from '../../shared/relationships'
import { ChevronIcon, PlusIcon, TrashIcon, TextBlockIcon, ImageBlockIcon, BulletListIcon, StatsIcon } from './icons'

interface StoryBibleSheetDetailProps {
  item: StoryBibleItem
  types: StoryBibleTypeDef[]
  blocks: StoryBibleBlock[]
  /** The manuscript in reading order, for the presence strip. */
  documents: { id: string; name: string }[]
  /** This item's ordered mention statistics, or null before they arrive. */
  stats: MentionStatsSummary | null
  onBack: () => void
  onRename: (name: string) => void
  onChangeType: (typeId: string) => void
  onChangeSummary: (summary: string) => void
  onChangeAliases: (aliases: string[]) => void
  onDelete: () => void
  onBlocksChange: (blocks: StoryBibleBlock[]) => void
  items: StoryBibleItem[]
  relationships: Relationship[]
  onOpenItem: (id: string) => void
  onAddRelationship: () => void
  onEditRelationship: (relationship: Relationship) => void
  onDeleteRelationship: (relationship: Relationship) => void
}

/** Add/remove chip list for an item's aliases — renaming auto-seeds the old
 *  name here (see storyBibleStore.renameItem), but the list stays freely
 *  editable in case an auto-added alias needs pruning. */
function AliasEditor({ aliases, onChange }: { aliases: string[]; onChange: (aliases: string[]) => void }): JSX.Element {
  const [draft, setDraft] = useState('')

  function addAlias(): void {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...aliases, trimmed])
    setDraft('')
  }

  function removeAlias(alias: string): void {
    onChange(aliases.filter((a) => a !== alias))
  }

  return (
    <div className="story-bible-alias-editor">
      <span className="story-bible-alias-label">Also known as</span>
      <div className="story-bible-alias-chips">
        {aliases.map((alias) => (
          <span key={alias} className="story-bible-alias-chip">
            {alias}
            <button type="button" onClick={() => removeAlias(alias)} title="Remove alias">
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="story-bible-alias-input"
          placeholder="Another name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addAlias()
            }
          }}
          onBlur={addAlias}
        />
      </div>
    </div>
  )
}

/** Read-only mention statistics: one sentence stating the whole picture,
 *  then the per-document breakdown in manuscript order. The numbers arrive
 *  from the section's single bulk read, so a card and a sheet can never
 *  disagree about a count. */
function AppearancesPanel({
  itemName,
  stats
}: {
  itemName: string
  stats: MentionStatsSummary | null
}): JSX.Element {
  const max = Math.max(1, ...(stats?.byChapter ?? []).map((c) => c.count))
  return (
    <div className="story-bible-appearances">
      <span className="story-bible-rail-label">Where it appears</span>
      <p className="story-bible-rail-line">{appearanceSentence(itemName, stats)}</p>
      {stats && stats.byChapter.length > 0 && (
        <div className="story-bible-appearances-chapters">
          {stats.byChapter.map((c) => (
            <div key={c.documentId} className="story-bible-appearances-row">
              <span className="story-bible-appearances-doc-name">{c.documentName}</span>
              <span className="story-bible-appearances-bar-track">
                <span
                  className="story-bible-appearances-bar-fill"
                  style={{ width: `${Math.max(6, (c.count / max) * 100)}%` }}
                />
              </span>
              <span className="story-bible-appearances-count">{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface DropTarget {
  index: number
  beforeBlockId: string
}

const BLOCK_KIND_OPTIONS: { kind: StoryBibleBlockKind; label: string; Icon: () => JSX.Element }[] = [
  { kind: 'text', label: 'Text', Icon: TextBlockIcon },
  { kind: 'image', label: 'Image', Icon: ImageBlockIcon },
  { kind: 'list', label: 'List', Icon: BulletListIcon },
  { kind: 'stats', label: 'Stat / Tracker', Icon: StatsIcon }
]

function StoryBibleSheetDetail(props: StoryBibleSheetDetailProps): JSX.Element {
  const {
    item,
    types,
    blocks,
    documents,
    stats,
    onBack,
    onRename,
    onChangeType,
    onChangeSummary,
    onChangeAliases,
    onDelete,
    onBlocksChange,
    items,
    relationships,
    onOpenItem,
    onAddRelationship,
    onEditRelationship,
    onDeleteRelationship
  } = props
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const typePickerRef = useRef<HTMLDivElement>(null)
  const addPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typePickerOpen && !addPickerOpen) return
    function handlePointerDown(e: MouseEvent): void {
      if (typePickerOpen && typePickerRef.current && !typePickerRef.current.contains(e.target as Node)) {
        setTypePickerOpen(false)
      }
      if (addPickerOpen && addPickerRef.current && !addPickerRef.current.contains(e.target as Node)) {
        setAddPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [typePickerOpen, addPickerOpen])

  const activeType = types.find((t) => t.id === item.typeId) ?? null

  function updateBlock(updated: StoryBibleBlock): void {
    onBlocksChange(blocks.map((b) => (b.id === updated.id ? updated : b)))
  }

  function deleteBlock(id: string): void {
    const block = blocks.find((b) => b.id === id)
    if (block?.kind === 'image' && block.imageId) {
      void window.api.deleteStoryBibleImage(block.imageId)
    }
    onBlocksChange(blocks.filter((b) => b.id !== id))
  }

  function addBlock(kind: StoryBibleBlockKind): void {
    onBlocksChange([...blocks, createBlock(kind)])
    setAddPickerOpen(false)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, overId: string): void {
    if (!dragId || dragId === overId) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const overIndex = blocks.findIndex((b) => b.id === overId)
    const index = ratio < 0.5 ? overIndex : overIndex + 1
    setDropTarget({ index, beforeBlockId: overId })
  }

  function handleDrop(): void {
    if (dragId && dropTarget) {
      const fromIndex = blocks.findIndex((b) => b.id === dragId)
      if (fromIndex !== -1) {
        const next = [...blocks]
        const [moved] = next.splice(fromIndex, 1)
        const insertAt = fromIndex < dropTarget.index ? dropTarget.index - 1 : dropTarget.index
        next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, moved)
        onBlocksChange(next)
      }
    }
    setDragId(null)
    setDropTarget(null)
  }

  return (
    <div className="story-bible-detail">
      <button type="button" className="story-bible-back" onClick={onBack}>
        ‹ Story Bible
      </button>

      {/* The portrait sits beside the identity: name, type, the names it is
          also known by, and its shape across the manuscript. */}
      <div className="story-bible-detail-head">
        <span
          className="story-bible-detail-portrait"
          style={{ '--card-color': activeType?.color ?? 'var(--chrome-text-dim)' } as CSSProperties}
        >
          {initialsFor(item.name)}
        </span>

        <div className="story-bible-detail-id">
          <div className="story-bible-detail-header">
            <input
              key={item.id}
              type="text"
              className="story-bible-detail-name"
              defaultValue={item.name}
              placeholder="Untitled"
              onBlur={(e) => onRename(e.target.value)}
            />

            <div className="story-bible-detail-type" ref={typePickerRef}>
              <button
                type="button"
                className="story-bible-type-pill"
                style={{ backgroundColor: activeType?.color ?? 'var(--chrome-control-bg)' }}
                onClick={() => setTypePickerOpen((v) => !v)}
              >
                {activeType?.name ?? 'Unknown type'}
              </button>
              {typePickerOpen && (
                <div className="story-bible-type-popover">
                  {types.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className="story-bible-type-popover-row"
                      onClick={() => {
                        onChangeType(type.id)
                        setTypePickerOpen(false)
                      }}
                    >
                      <span className="story-bible-type-swatch" style={{ backgroundColor: type.color }} />
                      {type.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="story-bible-detail-delete" title="Delete this entry" onClick={onDelete}>
              <TrashIcon />
            </button>
          </div>

          <textarea
            key={item.id}
            className="story-bible-detail-summary"
            placeholder="One line, shown on this entry's card…"
            defaultValue={item.summary}
            onBlur={(e) => onChangeSummary(e.target.value)}
          />

          <AliasEditor aliases={item.aliases} onChange={onChangeAliases} />

          <PresenceStrip documents={documents} stats={stats} itemName={item.name || 'Untitled'} />
        </div>
      </div>

      <div className="story-bible-detail-body">
        <div className="story-bible-detail-main">
      <div className="story-bible-block-list" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {blocks.map((block) => {
          const dragProps = {
            dragging: dragId === block.id,
            onDragStart: (e: DragEvent<HTMLButtonElement>) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', block.id)
              setDragId(block.id)
            },
            onDragEnd: () => {
              setDragId(null)
              setDropTarget(null)
            }
          }
          return (
            <div
              key={block.id}
              className={dropTarget?.beforeBlockId === block.id ? 'story-bible-block-drop-before' : ''}
              onDragOver={(e) => handleDragOver(e, block.id)}
            >
              {block.kind === 'text' && (
                <TextBlockView block={block} onChange={updateBlock} onDelete={() => deleteBlock(block.id)} {...dragProps} />
              )}
              {block.kind === 'image' && (
                <ImageBlockView block={block} onChange={updateBlock} onDelete={() => deleteBlock(block.id)} {...dragProps} />
              )}
              {block.kind === 'list' && (
                <ListBlockView block={block} onChange={updateBlock} onDelete={() => deleteBlock(block.id)} {...dragProps} />
              )}
              {block.kind === 'stats' && (
                <StatsBlockView block={block} onChange={updateBlock} onDelete={() => deleteBlock(block.id)} {...dragProps} />
              )}
            </div>
          )
        })}
      </div>

          <div className="story-bible-add-block" ref={addPickerRef}>
            <button
              type="button"
              className="story-bible-add-block-button"
              onClick={() => setAddPickerOpen((v) => !v)}
            >
              <PlusIcon /> Add a block <ChevronIcon />
            </button>
            {addPickerOpen && (
              <div className="story-bible-add-block-popover">
                {BLOCK_KIND_OPTIONS.map(({ kind, label, Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    className="story-bible-add-block-option"
                    onClick={() => addBlock(kind)}
                  >
                    <Icon />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* The evidence rail: what the manuscript says about this entry, and
            what it is linked to. Read-only beside the editable blocks. */}
        <div className="story-bible-detail-rail">
          <AppearancesPanel itemName={item.name || 'Untitled'} stats={stats} />

          <RelationshipsPanel
            itemId={item.id}
            relationships={relationships}
            items={items}
            types={types}
            onOpenItem={onOpenItem}
            onAdd={onAddRelationship}
            onEdit={onEditRelationship}
            onDelete={onDeleteRelationship}
          />
        </div>
      </div>
    </div>
  )
}

export default StoryBibleSheetDetail
