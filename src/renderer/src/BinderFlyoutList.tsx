import type { BinderNode } from '../../shared/binder'
import { ChevronIcon, DocumentIcon, FolderIcon } from './icons'

interface BinderFlyoutListProps {
  tree: BinderNode[]
  activeDocumentId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenDocument: (id: string) => void
  onToggleCollapse: (id: string) => void
}

interface RowProps {
  node: BinderNode
  depth: number
  activeDocumentId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenDocument: (id: string) => void
  onToggleCollapse: (id: string) => void
}

/** A single row: chevron, icon, name. Nothing else — no badges, no drag
 *  handle, no delete or split-view button, no rename. This is a temporary
 *  reveal of where things are, not a second copy of the binder's editing UI. */
function BinderFlyoutRow(props: RowProps): JSX.Element {
  const { node, depth, activeDocumentId, selectedId, onSelect, onOpenDocument, onToggleCollapse } = props
  const isFolder = node.type === 'folder'
  const isActive = node.type === 'document' && node.id === activeDocumentId
  const isSelected = selectedId === node.id
  const showChevron = isFolder || node.children.length > 0

  const rowClasses = ['binder-flyout-row', isSelected ? 'is-selected' : '', isActive ? 'is-active-doc' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="binder-node">
      <div
        className={rowClasses}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          onSelect(node.id)
          if (node.type === 'document') onOpenDocument(node.id)
        }}
      >
        {showChevron ? (
          <button
            type="button"
            className="chevron-button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse(node.id)
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
        <span className="node-name">{node.name || 'Untitled'}</span>
      </div>

      {showChevron && !node.collapsed && (
        <div className="binder-list">
          {node.children.map((child) => (
            <BinderFlyoutRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeDocumentId={activeDocumentId}
              selectedId={selectedId}
              onSelect={onSelect}
              onOpenDocument={onOpenDocument}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The hover flyout's manuscript content: full document and folder names in
 * tree order, compact enough to read as a temporary popover rather than a
 * second full-width binder. Clicking a document opens it, same as the full
 * binder — everything else the full binder can do (rename, delete, drag to
 * reorder, badges) lives only in the expanded panel.
 */
function BinderFlyoutList(props: BinderFlyoutListProps): JSX.Element {
  const { tree, activeDocumentId, selectedId, onSelect, onOpenDocument, onToggleCollapse } = props

  return (
    <div className="binder-flyout-list">
      {tree.length === 0 && <div className="binder-empty">No documents yet</div>}
      {tree.map((node) => (
        <BinderFlyoutRow
          key={node.id}
          node={node}
          depth={0}
          activeDocumentId={activeDocumentId}
          selectedId={selectedId}
          onSelect={onSelect}
          onOpenDocument={onOpenDocument}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </div>
  )
}

export default BinderFlyoutList
