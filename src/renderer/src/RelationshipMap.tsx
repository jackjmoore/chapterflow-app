import { useEffect, useMemo, useState } from 'react'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { isMutual, sideFor, type Relationship } from '../../shared/relationships'
import { PlusIcon } from './icons'

interface RelationshipMapProps {
  relationships: Relationship[]
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  onOpenItem: (id: string) => void
  onEditRelationship: (relationship: Relationship) => void
  onAdd: () => void
}

// Drawn at the size it is displayed at, so the names on it stay the same size
// as the names in the sentences underneath rather than being scaled down.
const WIDTH = 640
const HEIGHT = 360
const CX = WIDTH / 2
const CY = HEIGHT / 2
const NODE_R = 7

interface Node {
  id: string
  name: string
  color: string
  missing: boolean
  x: number
  y: number
}

/**
 * Who is connected to whom, read one entry at a time.
 *
 * The web is laid out on a circle rather than force-directed: it's
 * deterministic (the same web looks the same every time you open it, so you
 * can learn its shape), needs no simulation loop, and for the handful of
 * characters a novel's web actually contains it reads perfectly well.
 *
 * The labels are deliberately *not* on the lines any more. A label floating
 * between two names never said which way it read — "is the mother of" between
 * Eda and Maren is true in exactly one direction — and the stored reverse
 * wording, which is the other half of the fact, had nowhere to appear at all.
 * Choosing a name now dims the rest of the web and writes that entry's links
 * out underneath as sentences, each one phrased outward from the entry you
 * chose, with how it reads back the other way beneath it.
 */
function RelationshipMap(props: RelationshipMapProps): JSX.Element {
  const { relationships, items, types, onOpenItem, onEditRelationship, onAdd } = props
  const [focusId, setFocusId] = useState<string | null>(null)

  const { nodes, nodeById } = useMemo(() => {
    const typesById = new Map(types.map((t) => [t.id, t]))
    // Only items that actually participate — an unconnected cast member would
    // just be a dot with nothing to say.
    const ids: string[] = []
    for (const r of relationships) {
      if (r.fromId === r.toId) continue
      for (const id of [r.fromId, r.toId]) if (!ids.includes(id)) ids.push(id)
    }

    const radius = Math.min(135, 70 + ids.length * 12)
    const built: Node[] = ids.map((id, index) => {
      const angle = (index / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2
      const item = items.find((i) => i.id === id) ?? null
      return {
        id,
        name: item ? item.name || 'Untitled' : 'Deleted item',
        color: item ? typesById.get(item.typeId)?.color ?? '#8a8a8a' : 'var(--chrome-text-dim)',
        missing: !item,
        x: CX + Math.cos(angle) * radius,
        y: CY + Math.sin(angle) * radius
      }
    })
    return { nodes: built, nodeById: new Map(built.map((n) => [n.id, n])) }
  }, [relationships, items, types])

  const edges = relationships.filter((r) => r.fromId !== r.toId && nodeById.has(r.fromId) && nodeById.has(r.toId))

  // The board opens on somebody rather than on nothing, and recovers if the
  // entry being read is deleted or unlinked while it is open.
  const focus = focusId && nodeById.has(focusId) ? focusId : (nodes[0]?.id ?? null)
  useEffect(() => {
    if (focusId && !nodeById.has(focusId)) setFocusId(null)
  }, [focusId, nodeById])

  if (nodes.length === 0) {
    return (
      <div className="relationship-map-empty">
        <p>
          Nothing has been linked yet. Add a relationship to record how two Story Bible entries stand to each
          other, and it will show on both of their sheets.
        </p>
        <button type="button" className="submissions-add-button" onClick={onAdd}>
          <PlusIcon /> Add a relationship
        </button>
      </div>
    )
  }

  const focusNode = focus ? nodeById.get(focus) ?? null : null
  const mine = edges.filter((r) => r.fromId === focus || r.toId === focus)
  const connected = new Set<string>([focus ?? '', ...mine.flatMap((r) => [r.fromId, r.toId])])

  return (
    <div className="relationship-board">
      <p className="relationship-focus-head">
        Reading the links for <b>{focusNode?.name ?? 'this entry'}</b>. Choose another name on the web, or from
        the list beneath it, to read that one instead.
      </p>

      <div className="relationship-map">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="relationship-map-svg"
          role="img"
          aria-label={`How ${focusNode?.name ?? 'the cast'} is linked`}
        >
          <defs>
            <marker id="rel-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--chrome-text-dim)" />
            </marker>
            <marker id="rel-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--chrome-accent)" />
            </marker>
          </defs>

          {edges.map((relationship) => {
            const a = nodeById.get(relationship.fromId)!
            const b = nodeById.get(relationship.toId)!
            const mutual = isMutual(relationship)
            // Stop the line short of the node so an arrowhead lands on the rim
            // rather than under the circle.
            const dx = b.x - a.x
            const dy = b.y - a.y
            const len = Math.hypot(dx, dy) || 1
            const ux = dx / len
            const uy = dy / len
            const broken = a.missing || b.missing
            const involved = relationship.fromId === focus || relationship.toId === focus

            return (
              <line
                key={relationship.id}
                className={`relationship-edge ${involved ? 'is-lit' : 'is-dim'} ${broken ? 'is-broken' : ''}`}
                x1={a.x + ux * (NODE_R + 2)}
                y1={a.y + uy * (NODE_R + 2)}
                x2={b.x - ux * (NODE_R + 5)}
                y2={b.y - uy * (NODE_R + 5)}
                markerEnd={mutual ? undefined : involved ? 'url(#rel-arrow-lit)' : 'url(#rel-arrow)'}
                strokeDasharray={broken ? '4 3' : undefined}
              />
            )
          })}

          {nodes.map((node) => (
            <g
              key={node.id}
              className={`relationship-node ${node.missing ? 'is-missing' : ''} ${
                connected.has(node.id) ? '' : 'is-dim'
              } ${node.id === focus ? 'is-focus' : ''}`}
              onClick={() => setFocusId(node.id)}
            >
              <title>{node.missing ? 'This Story Bible item was deleted' : `Read the links for ${node.name}`}</title>
              <circle cx={node.x} cy={node.y} r={NODE_R} fill={node.missing ? 'none' : node.color} />
              <text x={node.x} y={node.y - 14} textAnchor="middle">
                {node.missing ? 'Deleted item' : node.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="relationship-picker">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`relationship-picker-chip ${node.id === focus ? 'is-active' : ''}`}
            onClick={() => setFocusId(node.id)}
          >
            {node.name}
          </button>
        ))}
      </div>

      <div className="relationship-readings">
        {mine.length === 0 ? (
          <p className="relationship-reading-note">Nothing has been linked to this entry yet.</p>
        ) : (
          mine.map((relationship) => {
            // sideFor is the same reading the Story Bible sheet uses, so the
            // rule about which wording belongs to which end lives in one place
            // rather than being restated here.
            const near = sideFor(relationship, focus as string)!
            const other = nodeById.get(near.otherId)!
            const far = sideFor(relationship, near.otherId)!
            const wording = near.label
            const back = isMutual(relationship)
              ? `It reads the same both ways: ${other.name} ${far.label} ${focusNode?.name ?? ''}.`
              : `Read from ${other.name}: ${other.name} ${far.label} ${focusNode?.name ?? ''}.`

            return (
              <div key={relationship.id} className="relationship-reading">
                <span className="relationship-reading-line">
                  <span className="relationship-reading-self">{focusNode?.name}</span> {wording}{' '}
                  <button
                    type="button"
                    className="relationship-reading-other"
                    onClick={() => setFocusId(other.id)}
                  >
                    {other.name}
                  </button>
                  .
                </span>
                <span className="relationship-reading-back">{back}</span>
                <button
                  type="button"
                  className="outliner-open-button relationship-reading-edit"
                  onClick={() => onEditRelationship(relationship)}
                >
                  Edit
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Adding is already in the board's toolbar, so the only action here is
          the one that leaves for the entry's own sheet. */}
      {focusNode && !focusNode.missing && (
        <div className="relationship-board-actions">
          <button type="button" className="outliner-open-button" onClick={() => onOpenItem(focusNode.id)}>
            Open {focusNode.name} in the Story Bible
          </button>
        </div>
      )}
    </div>
  )
}

export default RelationshipMap
