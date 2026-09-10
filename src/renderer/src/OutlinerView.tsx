import { useEffect, useState } from 'react'
import type { BinderNode, OutlinerColumn, OutlinerSort, StatusDef, TagDef } from '../../shared/binder'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { filterOutlinerTree, flattenForOutliner, sortTree } from './outlinerUtils'
import { RowChips, StatusBadge, resolveStatus, resolveTags, type RowChip } from './StatusTagBadges'
import { resolveMentionChips } from './mentionUtils'
import DocumentBadgeEditor from './DocumentBadgeEditor'
import TagStatusFilter from './TagStatusFilter'

interface OutlinerViewProps {
  tree: BinderNode[]
  wordCounts: Record<string, number>
  sort: OutlinerSort | null
  filter: string
  statuses: StatusDef[]
  tags: TagDef[]
  spanTagRollup: Record<string, string[]>
  storyBibleItems: StoryBibleItem[]
  storyBibleTypes: StoryBibleTypeDef[]
  mentionRollup: Record<string, string[]>
  statusFilter: string[]
  tagFilter: string[]
  activeDocumentId: string | null
  /** Set by the binder's "Reveal in Outliner" context-menu action — scrolls
   *  the named document's row into view and flashes it. */
  revealRequest: { id: string; token: number } | null
  onSort: (column: OutlinerColumn) => void
  onFilterChange: (text: string) => void
  onStatusTagFilterChange: (statusFilter: string[], tagFilter: string[]) => void
  onOpenDocument: (id: string) => void
  onEditTitle: (id: string, name: string) => void
  onEditSynopsis: (id: string, synopsis: string) => void
  onEditNotes: (id: string, notes: string) => void
  onEditStatusId: (id: string, statusId: string | null) => void
  onEditTagIds: (id: string, tagIds: string[]) => void
  onEditWordTarget: (id: string, target: number | null) => void
}

/** Sentence case, never all-caps — DESIGN.md, Tier 1. "Words" rather than
 *  "Word Count" because the header wrapped to two lines at any sane column
 *  width, and the number underneath says what it is. */
const COLUMNS: { id: OutlinerColumn; label: string }[] = [
  { id: 'title', label: 'Title' },
  { id: 'synopsis', label: 'Synopsis' },
  { id: 'notes', label: 'Notes' },
  { id: 'status', label: 'Status' },
  { id: 'wordCount', label: 'Words' }
]

function OutlinerView(props: OutlinerViewProps): JSX.Element {
  const {
    tree,
    wordCounts,
    sort,
    filter,
    statuses,
    tags,
    spanTagRollup,
    storyBibleItems,
    storyBibleTypes,
    mentionRollup,
    statusFilter,
    tagFilter,
    activeDocumentId,
    revealRequest,
    onSort,
    onFilterChange,
    onStatusTagFilterChange,
    onOpenDocument,
    onEditTitle,
    onEditSynopsis,
    onEditNotes,
    onEditStatusId,
    onEditTagIds,
    onEditWordTarget
  } = props

  const filtered = filterOutlinerTree(tree, { text: filter, statusFilter, tagFilter })
  const sorted = sortTree(filtered, sort, wordCounts, statuses)
  const rows = flattenForOutliner(sorted)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (!revealRequest) return
    const el = document.querySelector(`[data-node-id="${revealRequest.id}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('row-reveal-flash')
    const timer = setTimeout(() => el.classList.remove('row-reveal-flash'), 1600)
    return () => clearTimeout(timer)
  }, [revealRequest])

  return (
    <div className="outliner">
      <div className="outliner-toolbar">
        <input
          type="text"
          className="outliner-filter-input"
          placeholder="Filter by title, synopsis or notes…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        <TagStatusFilter
          statuses={statuses}
          tags={tags}
          statusFilter={statusFilter}
          tagFilter={tagFilter}
          onChange={onStatusTagFilterChange}
        />
      </div>

      <div className="outliner-table-wrap">
        <table className="outliner-table">
          {/* Explicit widths, with table-layout: fixed in the stylesheet.
              Without both, the column widths are decided by their content —
              which meant a chapter carrying a dozen Story Bible mentions set
              the width of the whole table and left the synopsis a few
              characters wide. Percentages for the three prose columns so they
              share whatever is left; fixed pixels for the three that hold
              something of known size. */}
          <colgroup>
            <col className="outliner-col-title" />
            <col className="outliner-col-synopsis" />
            <col className="outliner-col-notes" />
            <col className="outliner-col-status" />
            <col className="outliner-col-words" />
            <col className="outliner-col-tags" />
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.id}>
                  <button type="button" className="outliner-sort-button" onClick={() => onSort(col.id)}>
                    {col.label}
                    {sort?.column === col.id && <span className="outliner-sort-arrow">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
              <th>
                <span className="outliner-sort-button outliner-tags-header">Tags</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="outliner-empty">
                  {filter || statusFilter.length > 0 || tagFilter.length > 0 ? 'No documents match your filters.' : 'No documents yet.'}
                </td>
              </tr>
            )}
            {rows.map(({ node, depth }) => (
              <tr key={node.id} data-node-id={node.id} className={node.id === activeDocumentId ? 'is-active-doc' : ''}>
                <td style={{ paddingLeft: `${depth * 20 + 8}px` }}>
                  <div className="outliner-title-cell">
                    {node.type === 'document' ? (
                      editingTitleId === node.id ? (
                        <input
                          autoFocus
                          type="text"
                          className="outliner-title-input"
                          defaultValue={node.name}
                          onBlur={(e) => {
                            onEditTitle(node.id, e.target.value)
                            setEditingTitleId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setEditingTitleId(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="outliner-open-button"
                          title="Click to open in editor, double-click to rename"
                          onClick={() => onOpenDocument(node.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setEditingTitleId(node.id)
                          }}
                        >
                          {node.name || 'Untitled'}
                        </button>
                      )
                    ) : (
                      <span className="outliner-folder-label">{node.name}</span>
                    )}
                  </div>
                </td>
                <td>
                  {node.type === 'document' && (
                    <input
                      key={`${node.id}-synopsis`}
                      type="text"
                      className="outliner-cell-input"
                      placeholder="—"
                      defaultValue={node.synopsis}
                      onBlur={(e) => onEditSynopsis(node.id, e.target.value)}
                    />
                  )}
                </td>
                <td>
                  {node.type === 'document' && (
                    <input
                      key={`${node.id}-notes`}
                      type="text"
                      className="outliner-cell-input"
                      placeholder="—"
                      defaultValue={node.notes}
                      onBlur={(e) => onEditNotes(node.id, e.target.value)}
                    />
                  )}
                </td>
                <td>
                  {node.type === 'document' && (
                    <DocumentBadgeEditor
                      statuses={statuses}
                      tags={tags}
                      statusId={node.statusId}
                      tagIds={node.tagIds}
                      onChangeStatus={(id) => onEditStatusId(node.id, id)}
                      onChangeTags={(ids) => onEditTagIds(node.id, ids)}
                    >
                      {node.statusId ? <StatusBadge status={resolveStatus(statuses, node.statusId)} /> : <span className="outliner-badge-placeholder">Set status…</span>}
                    </DocumentBadgeEditor>
                  )}
                </td>
                <td className="outliner-word-count-cell">
                  {node.type === 'document' &&
                    (() => {
                      const count = wordCounts[node.id] ?? 0
                      const target = node.wordTarget
                      if (editingTargetId === node.id) {
                        return (
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            className="outliner-target-input"
                            defaultValue={target ?? ''}
                            placeholder="Target…"
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              onEditWordTarget(node.id, v ? Math.max(0, Math.round(Number(v))) : null)
                              setEditingTargetId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') setEditingTargetId(null)
                            }}
                          />
                        )
                      }
                      return (
                        <button type="button" className="outliner-word-count-button" onClick={() => setEditingTargetId(node.id)} title="Click to set a word target">
                          {target ? (
                            <>
                              <span>
                                {count.toLocaleString()} / {target.toLocaleString()}
                              </span>
                              <span className="outliner-target-bar">
                                <span
                                  className="outliner-target-bar-fill"
                                  style={{ width: `${Math.min(100, (count / target) * 100)}%` }}
                                />
                              </span>
                            </>
                          ) : (
                            <span>{count.toLocaleString()}</span>
                          )}
                        </button>
                      )
                    })()}
                </td>
                <td>
                  {node.type === 'document' && (
                    <DocumentBadgeEditor
                      statuses={statuses}
                      tags={tags}
                      statusId={node.statusId}
                      tagIds={node.tagIds}
                      onChangeStatus={(id) => onEditStatusId(node.id, id)}
                      onChangeTags={(ids) => onEditTagIds(node.id, ids)}
                    >
                      {(() => {
                        // One capped row rather than three uncapped lists.
                        // Rendering every own-tag, span tag and Story Bible
                        // mention inline is what let a chapter with a dozen
                        // mentions stretch this column past the window and
                        // squeeze the synopsis down to a few characters. Same
                        // pooled, capped treatment the binder rows and
                        // corkboard cards already use.
                        const chips: RowChip[] = [
                          ...resolveTags(tags, node.tagIds).map((t) => ({ ...t, filled: true }) as RowChip),
                          ...resolveTags(tags, spanTagRollup[node.id] ?? []).map(
                            (t) => ({ ...t, filled: false }) as RowChip
                          ),
                          ...resolveMentionChips(
                            storyBibleItems,
                            storyBibleTypes,
                            mentionRollup[node.id] ?? []
                          ).map((t) => ({ ...t, filled: false }) as RowChip)
                        ]
                        return chips.length > 0 ? (
                          <RowChips chips={chips} />
                        ) : (
                          <span className="outliner-badge-placeholder">+ Tags</span>
                        )
                      })()}
                    </DocumentBadgeEditor>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default OutlinerView
