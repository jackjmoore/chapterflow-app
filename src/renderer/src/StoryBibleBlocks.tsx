import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { createStoryBibleBlockExtensions } from './editorExtensions'
import type {
  StoryBibleBlock,
  StoryBibleBlockKind,
  StoryBibleImageBlock,
  StoryBibleListBlock,
  StoryBibleStatsBlock,
  StoryBibleTextBlock
} from '../../shared/storyBible'
import { DragHandleIcon, TrashIcon, PlusIcon } from './icons'

/** A freshly-created block of the given kind, ready to append to a sheet. */
export function createBlock(kind: StoryBibleBlockKind): StoryBibleBlock {
  const id = crypto.randomUUID()
  switch (kind) {
    case 'text':
      return { id, kind: 'text', label: 'Notes', html: '' }
    case 'image':
      return { id, kind: 'image', label: 'Image', imageId: null, caption: '' }
    case 'list':
      return { id, kind: 'list', label: 'List', style: 'bullet', items: [''] }
    case 'stats':
      return { id, kind: 'stats', label: 'Stats', pairs: [{ id: crypto.randomUUID(), label: '', value: '' }] }
  }
}

interface BlockShellProps {
  label: string
  onLabelChange: (label: string) => void
  onDelete: () => void
  dragging: boolean
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  children: ReactNode
}

/** Common chrome every block kind shares: a drag handle, an editable label,
 *  a delete button, and a bordered body — so a sheet reads as "assembled
 *  from pieces" regardless of what kind each piece is. */
function BlockShell(props: BlockShellProps): JSX.Element {
  const { label, onLabelChange, onDelete, dragging, onDragStart, onDragEnd, children } = props
  return (
    <div className={`story-bible-block ${dragging ? 'is-dragging' : ''}`}>
      <div className="story-bible-block-header">
        <button
          type="button"
          className="story-bible-block-drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </button>
        <input
          type="text"
          className="story-bible-block-label-input"
          value={label}
          placeholder="Label…"
          onChange={(e) => onLabelChange(e.target.value)}
        />
        <button type="button" className="story-bible-block-delete" title="Delete block" onClick={onDelete}>
          <TrashIcon />
        </button>
      </div>
      <div className="story-bible-block-body">{children}</div>
    </div>
  )
}

interface BlockProps<T extends StoryBibleBlock> {
  block: T
  onChange: (block: T) => void
  onDelete: () => void
  dragging: boolean
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
}

export function TextBlockView(props: BlockProps<StoryBibleTextBlock>): JSX.Element {
  const { block, onChange, onDelete, dragging, onDragStart, onDragEnd } = props
  const editor = useEditor({
    extensions: createStoryBibleBlockExtensions(),
    content: block.html,
    onUpdate: ({ editor }) => onChange({ ...block, html: editor.getHTML() })
  })

  return (
    <BlockShell
      label={block.label}
      onLabelChange={(label) => onChange({ ...block, label })}
      onDelete={onDelete}
      dragging={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="story-bible-text-block-content">
        <EditorContent editor={editor} />
      </div>
    </BlockShell>
  )
}

export function ImageBlockView(props: BlockProps<StoryBibleImageBlock>): JSX.Element {
  const { block, onChange, onDelete, dragging, onDragStart, onDragEnd } = props
  const [dataUri, setDataUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!block.imageId) {
      setDataUri(null)
      return
    }
    let cancelled = false
    window.api.getStoryBibleImage(block.imageId).then((uri) => {
      if (!cancelled) setDataUri(uri)
    })
    return () => {
      cancelled = true
    }
  }, [block.imageId])

  async function pickImage(): Promise<void> {
    setLoading(true)
    try {
      const newImageId = await window.api.importStoryBibleImage()
      if (!newImageId) return
      const oldImageId = block.imageId
      onChange({ ...block, imageId: newImageId })
      if (oldImageId) void window.api.deleteStoryBibleImage(oldImageId)
    } finally {
      setLoading(false)
    }
  }

  function removeImage(): void {
    const oldImageId = block.imageId
    onChange({ ...block, imageId: null })
    if (oldImageId) void window.api.deleteStoryBibleImage(oldImageId)
  }

  return (
    <BlockShell
      label={block.label}
      onLabelChange={(label) => onChange({ ...block, label })}
      onDelete={onDelete}
      dragging={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {dataUri ? (
        <div className="story-bible-image-block-attached">
          <img src={dataUri} alt={block.caption || block.label} className="story-bible-image-block-img" />
          <div className="story-bible-image-block-actions">
            <button type="button" onClick={() => void pickImage()} disabled={loading}>
              Replace…
            </button>
            <button type="button" onClick={removeImage}>
              Remove
            </button>
          </div>
          <input
            type="text"
            className="story-bible-image-block-caption"
            placeholder="Caption…"
            value={block.caption}
            onChange={(e) => onChange({ ...block, caption: e.target.value })}
          />
        </div>
      ) : (
        <button type="button" className="story-bible-image-block-attach" onClick={() => void pickImage()} disabled={loading}>
          {loading ? 'Choosing…' : '+ Attach Image'}
        </button>
      )}
    </BlockShell>
  )
}

export function ListBlockView(props: BlockProps<StoryBibleListBlock>): JSX.Element {
  const { block, onChange, onDelete, dragging, onDragStart, onDragEnd } = props

  function updateItem(index: number, text: string): void {
    const items = [...block.items]
    items[index] = text
    onChange({ ...block, items })
  }

  function removeItem(index: number): void {
    onChange({ ...block, items: block.items.filter((_, i) => i !== index) })
  }

  function addItem(): void {
    onChange({ ...block, items: [...block.items, ''] })
  }

  return (
    <BlockShell
      label={block.label}
      onLabelChange={(label) => onChange({ ...block, label })}
      onDelete={onDelete}
      dragging={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="story-bible-list-block-style">
        <label>
          <input
            type="radio"
            checked={block.style === 'bullet'}
            onChange={() => onChange({ ...block, style: 'bullet' })}
          />
          Bullet
        </label>
        <label>
          <input
            type="radio"
            checked={block.style === 'numbered'}
            onChange={() => onChange({ ...block, style: 'numbered' })}
          />
          Numbered
        </label>
      </div>
      <div className="story-bible-list-block-items">
        {block.items.map((item, index) => (
          <div key={index} className="story-bible-list-block-row">
            <span className="story-bible-list-block-marker">{block.style === 'bullet' ? '•' : `${index + 1}.`}</span>
            <input type="text" value={item} onChange={(e) => updateItem(index, e.target.value)} />
            <button type="button" className="story-bible-list-block-remove" onClick={() => removeItem(index)} title="Remove item">
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="story-bible-block-add-row" onClick={addItem}>
        <PlusIcon /> Add item
      </button>
    </BlockShell>
  )
}

export function StatsBlockView(props: BlockProps<StoryBibleStatsBlock>): JSX.Element {
  const { block, onChange, onDelete, dragging, onDragStart, onDragEnd } = props

  function updatePair(id: string, field: 'label' | 'value', text: string): void {
    onChange({ ...block, pairs: block.pairs.map((p) => (p.id === id ? { ...p, [field]: text } : p)) })
  }

  function removePair(id: string): void {
    onChange({ ...block, pairs: block.pairs.filter((p) => p.id !== id) })
  }

  function addPair(): void {
    onChange({ ...block, pairs: [...block.pairs, { id: crypto.randomUUID(), label: '', value: '' }] })
  }

  return (
    <BlockShell
      label={block.label}
      onLabelChange={(label) => onChange({ ...block, label })}
      onDelete={onDelete}
      dragging={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="story-bible-stats-block-rows">
        {block.pairs.map((pair) => (
          <div key={pair.id} className="story-bible-stats-block-row">
            <input
              type="text"
              className="story-bible-stats-block-label"
              placeholder="Label"
              value={pair.label}
              onChange={(e) => updatePair(pair.id, 'label', e.target.value)}
            />
            <input
              type="text"
              className="story-bible-stats-block-value"
              placeholder="Value"
              value={pair.value}
              onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
            />
            <button type="button" className="story-bible-list-block-remove" onClick={() => removePair(pair.id)} title="Remove">
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="story-bible-block-add-row" onClick={addPair}>
        <PlusIcon /> Add stat
      </button>
    </BlockShell>
  )
}
