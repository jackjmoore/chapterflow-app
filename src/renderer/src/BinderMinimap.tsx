import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BinderNode } from '../../shared/binder'

/** A document reads as a tick hanging under its folder rather than a rule of
 *  its own — folders take the track's full width instead, expressed relative
 *  to the row rather than in pixels: the rail's usable width is its own width
 *  less a border and padding, and hardcoding that here would silently clip
 *  the day either changes. Wide enough to read clearly at a glance, even
 *  nested — folders still win the width comparison outright since they span
 *  the full track regardless of depth. */
const DOCUMENT_WIDTH = 15
/** Width floor for a document nested deep enough that indent would otherwise
 *  eat the bar down to nothing. */
const DOCUMENT_MIN_WIDTH = 9
/** Nesting shows as a ragged left edge. Capped at two levels — past that the
 *  indent eats more of a document bar than the hierarchy is worth. */
const INDENT_PER_DEPTH = 4
const MAX_INDENT_DEPTH = 2
/** One node, one slot. Height encodes position in the tree, never word count:
 *  proportional bars render a 200-word scene as a sub-pixel sliver beside a
 *  5,000-word chapter. */
const SLOT_HEIGHT = 10
/** Below this the bars stop being distinguishable, so the block scrolls
 *  instead of compressing further. */
const MIN_SLOT_HEIGHT = 5
/** Documents stay a thin tick; folders are visibly heavier — more than double
 *  the weight — so the column reads as chapters-with-scenes at a glance,
 *  never as a uniform strip of ticks. */
const DOCUMENT_BAR_HEIGHT = 2
const FOLDER_BAR_HEIGHT = 6

/** The minimap is a fixed-height block, not a rail that grows with the
 *  manuscript — a 5-document project and a 500-document one occupy the same
 *  footprint on screen. This is the target; it only shrinks below this when
 *  the pane itself is shorter. */
const TARGET_BLOCK_HEIGHT = 320
/** Floor for very short windows — below this the block stops shrinking and
 *  lets its own internal scroll take over instead. */
const MIN_BLOCK_HEIGHT = 96

interface MinimapRow {
  node: BinderNode
  depth: number
  /** A collapsed folder hiding the open document: the folder's own bar has to
   *  carry the 'you are here' marker, or it vanishes from the rail entirely. */
  containsActive: boolean
}

interface BinderMinimapProps {
  tree: BinderNode[]
  activeDocumentId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenDocument: (id: string) => void
}

function subtreeHasDocument(nodes: BinderNode[], id: string): boolean {
  for (const node of nodes) {
    if (node.id === id) return true
    if (subtreeHasDocument(node.children, id)) return true
  }
  return false
}

/** The same visible set the expanded binder would show — a folder collapsed
 *  there is collapsed here, so the rail and the flyout never disagree. */
function flattenVisible(
  nodes: BinderNode[],
  activeDocumentId: string | null,
  depth = 0
): MinimapRow[] {
  const rows: MinimapRow[] = []
  for (const node of nodes) {
    const hidesActive =
      node.collapsed && activeDocumentId !== null && subtreeHasDocument(node.children, activeDocumentId)
    rows.push({ node, depth, containsActive: hidesActive })
    if (!node.collapsed) rows.push(...flattenVisible(node.children, activeDocumentId, depth + 1))
  }
  return rows
}

/**
 * The collapsed binder: every document and folder as a thin bar, in tree
 * order, as a fixed-size block centered in the rail's own reserved width.
 *
 * The rail is a flex sibling of the editor and stays one — nothing here is
 * positioned or transformed, so the column can never end up sitting on top of
 * manuscript text at narrow window widths.
 *
 * Large-project handling: the block's on-screen height never grows with the
 * document count. Slots first compress — proportionally, down to a 5px floor
 * — to keep the whole tree visible within the fixed block; a project too
 * large even for that (past a few dozen chapters' worth) has the block
 * scroll internally instead, with the open document kept in view.
 */
function BinderMinimap(props: BinderMinimapProps): JSX.Element {
  const { tree, activeDocumentId, selectedId, onSelect, onOpenDocument } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [wrapHeight, setWrapHeight] = useState(0)

  const rows = flattenVisible(tree, activeDocumentId)

  // The block's height is capped by the space actually available, not driven
  // by it — TARGET_BLOCK_HEIGHT wins on any pane tall enough to hold it.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setWrapHeight(entry.contentRect.height)
    })
    observer.observe(el)
    setWrapHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  const blockHeight =
    wrapHeight === 0
      ? TARGET_BLOCK_HEIGHT
      : Math.max(MIN_BLOCK_HEIGHT, Math.min(TARGET_BLOCK_HEIGHT, wrapHeight))

  const slotHeight =
    rows.length === 0 ? SLOT_HEIGHT : Math.max(MIN_SLOT_HEIGHT, Math.min(SLOT_HEIGHT, blockHeight / rows.length))
  const scale = Math.min(1, slotHeight / SLOT_HEIGHT)
  const contentHeight = rows.length * slotHeight
  // Compression keeps the whole tree inside the block up to this point; past
  // it the block scrolls rather than compressing bars into illegibility.
  const needsScroll = contentHeight > blockHeight + 0.5

  // Once scrolling takes over, the open document has to be brought back into
  // view itself rather than assumed visible.
  useEffect(() => {
    if (needsScroll) activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeDocumentId, needsScroll, slotHeight])

  return (
    <div className="binder-minimap-wrap" ref={wrapRef}>
      <div
        className={`binder-minimap ${needsScroll ? 'is-scrollable' : ''}`}
        style={{ height: `${blockHeight}px` }}
      >
        {rows.map(({ node, depth, containsActive }) => {
          const isFolder = node.type === 'folder'
          const isActive = node.type === 'document' && node.id === activeDocumentId
          const isSelected = node.id === selectedId
          const indent = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PER_DEPTH
          // Folders span the full track and sit heavier: the eye parses the
          // column into chapters first, then the documents hanging under them.
          const fullWidth = isFolder || isActive
          const baseHeight = fullWidth ? FOLDER_BAR_HEIGHT : DOCUMENT_BAR_HEIGHT

          const barClasses = [
            'binder-minimap-bar',
            isFolder ? 'is-folder' : 'is-document',
            isActive ? 'is-active' : '',
            isSelected && !isActive ? 'is-selected' : '',
            containsActive ? 'contains-active' : ''
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={node.id}
              type="button"
              ref={isActive ? activeRef : undefined}
              className="binder-minimap-row"
              style={{ height: `${slotHeight}px` }}
              title={node.name || 'Untitled'}
              aria-label={node.name || 'Untitled'}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                onSelect(node.id)
                if (node.type === 'document') onOpenDocument(node.id)
              }}
            >
              <span
                className={barClasses}
                style={{
                  marginLeft: `${indent}px`,
                  width: fullWidth
                    ? `calc(100% - ${indent}px)`
                    : `${Math.max(DOCUMENT_MIN_WIDTH, DOCUMENT_WIDTH - indent)}px`,
                  height: `${Math.max(2, Math.round(baseHeight * scale))}px`
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default BinderMinimap
