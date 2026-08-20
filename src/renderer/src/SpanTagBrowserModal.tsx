import { useMemo, useState } from 'react'
import type { BinderNode, TagDef } from '../../shared/binder'
import type { SpanTagRecord } from '../../shared/spanTags'
import { findNode } from './binderUtils'
import { CloseIcon } from './icons'

interface SpanTagBrowserModalProps {
  spans: SpanTagRecord[]
  tags: TagDef[]
  tree: BinderNode[]
  onJump: (documentId: string, spanId: string) => void
  onClose: () => void
}

function SpanTagBrowserModal(props: SpanTagBrowserModalProps): JSX.Element {
  const { spans, tags, tree, onJump, onClose } = props
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const visible = useMemo(
    () => (tagFilter ? spans.filter((s) => s.tagId === tagFilter) : spans),
    [spans, tagFilter]
  )

  function tagFor(tagId: string): TagDef | undefined {
    return tags.find((t) => t.id === tagId)
  }

  function documentNameFor(documentId: string): string {
    const node = findNode(tree, documentId)
    return node?.name || 'Untitled'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal span-tag-browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">Tagged Spans</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="span-tag-browser-filter-row">
          <button
            type="button"
            className={tagFilter === null ? 'span-tag-filter-pill is-active' : 'span-tag-filter-pill'}
            onClick={() => setTagFilter(null)}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={tagFilter === tag.id ? 'span-tag-filter-pill is-active' : 'span-tag-filter-pill'}
              style={tagFilter === tag.id ? { borderColor: tag.color, color: tag.color } : undefined}
              onClick={() => setTagFilter(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="backups-empty">
            {spans.length === 0 ? 'No tagged spans yet — select text in a document and tag it.' : 'No spans with this tag.'}
          </p>
        ) : (
          <div className="backups-list span-tag-browser-list">
            {visible.map((span) => {
              const tag = tagFor(span.tagId)
              return (
                <button
                  key={span.id}
                  type="button"
                  className="span-tag-browser-row"
                  onClick={() => onJump(span.documentId, span.id)}
                >
                  <span className="span-tag-browser-row-tag" style={{ backgroundColor: tag?.color ?? '#888' }}>
                    {tag?.name ?? 'Unknown tag'}
                  </span>
                  <span className="span-tag-browser-row-doc">{documentNameFor(span.documentId)}</span>
                  <span className="span-tag-browser-row-snippet">{span.snippet}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default SpanTagBrowserModal
