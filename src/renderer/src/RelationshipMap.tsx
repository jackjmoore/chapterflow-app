import { useMemo } from 'react'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { isMutual, type Relationship } from '../../shared/relationships'
import { PlusIcon } from './icons'

interface RelationshipMapProps {
  relationships: Relationship[]
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  onOpenItem: (id: string) => void
  onEditRelationship: (relationship: Relationship) => void
  onAdd: () => void
}

const WIDTH = 820
const HEIGHT = 560
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
 * A node/link diagram of who is connected to whom.
 *
 * Laid out on a circle rather than force-directed: it's deterministic (the
 * same web looks the same every time you open it, so you can learn its shape),
 * needs no simulation loop, and for the handful of characters a novel's web
 * actually contains it reads perfectly well.
 */
function RelationshipMap(props: RelationshipMapProps): JSX.Element {
  const { relationships, items, types, onOpenItem, onEditRelationship, onAdd } = props

  const { nodes, nodeById } = useMemo(() => {
    const typesById = new Map(types.map((t) => [t.id, t]))
    // Only items that actually participate — an unconnected cast member would
    // just be a dot with nothing to say.
    const ids: string[] = []
    for (const r of relationships) {
      if (r.fromId === r.toId) continue
      for (const id of [r.fromId, r.toId]) if (!ids.includes(id)) ids.push(id)
    }

    const radius = Math.min(215, 90 + ids.length * 16)
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

  if (nodes.length === 0) {
    return (
      <div className="relationship-map-empty">
        <p>
          No relationships yet. Add one to see how your cast connects — siblings, rivals, a mentor and their
          student.
        </p>
        <button type="button" className="submissions-add-button" onClick={onAdd}>
          <PlusIcon /> Add a relationship
        </button>
      </div>
    )
  }

  return (
    <div className="relationship-map">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="relationship-map-svg" role="img" aria-label="Relationship map">
        <defs>
          <marker id="rel-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--chrome-text-dim)" />
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
          const x1 = a.x + ux * (NODE_R + 2)
          const y1 = a.y + uy * (NODE_R + 2)
          const x2 = b.x - ux * (NODE_R + 5)
          const y2 = b.y - uy * (NODE_R + 5)
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          const broken = a.missing || b.missing
          const labelWidth = relationship.label.length * 6.1 + 12

          return (
            <g
              key={relationship.id}
              className={`relationship-edge ${broken ? 'is-broken' : ''}`}
              onClick={() => onEditRelationship(relationship)}
            >
              <title>
                {`${a.name} — ${relationship.label} → ${b.name}` +
                  (mutual ? ' (mutual)' : `\n${b.name} — ${relationship.reverseLabel} → ${a.name}`)}
              </title>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                markerEnd={mutual ? undefined : 'url(#rel-arrow)'}
                strokeDasharray={broken ? '4 3' : undefined}
              />
              <rect x={mx - labelWidth / 2} y={my - 9} width={labelWidth} height={18} rx={9} />
              <text x={mx} y={my + 4} textAnchor="middle">
                {relationship.label}
              </text>
            </g>
          )
        })}

        {nodes.map((node) => (
          <g
            key={node.id}
            className={`relationship-node ${node.missing ? 'is-missing' : ''}`}
            onClick={() => !node.missing && onOpenItem(node.id)}
          >
            <title>{node.missing ? 'This Story Bible item was deleted' : `Open ${node.name}`}</title>
            <circle cx={node.x} cy={node.y} r={NODE_R} fill={node.missing ? 'none' : node.color} />
            <text x={node.x} y={node.y - 14} textAnchor="middle">
              {node.missing ? '⚠ Deleted item' : node.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export default RelationshipMap
