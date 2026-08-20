import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { RailSection } from '../../shared/binder'
import type { StoryBibleTypeDef } from '../../shared/storyBible'
import { NewDocumentIcon, NewFolderIcon, PlusIcon, PanelCollapseIcon, PanelExpandIcon } from './icons'

/** Width of the collapsed panel: one icon plus breathing room, and nothing
 *  else. Narrow enough to reclaim the space, wide enough that the document /
 *  folder / item icons stay recognizable and clickable. */
export const COLLAPSED_PANEL_WIDTH = 44

interface SidePanelProps {
  section: RailSection
  width: number
  /** Collapsed renders the panel as an icon-only strip rather than hiding it,
   *  so you never lose your place in the current section's navigation. */
  collapsed: boolean
  onExpand: () => void
  /** Manuscript header only — the project name is a manuscript-level fact, so
   *  the other sections show their own static title instead. */
  projectName: string | null
  editingProjectName: boolean
  projectNameDraft: string
  storyBibleTypes: StoryBibleTypeDef[]
  onProjectNameDraftChange: (value: string) => void
  onStartEditProjectName: () => void
  onCommitProjectName: (name: string) => void
  onCancelEditProjectName: () => void
  onCreateDocument: () => void
  onCreateFolder: () => void
  onCreateStoryBibleItem: (typeId: string) => void
  onCollapse: () => void
  onResizeStart: (e: ReactMouseEvent) => void
  /** The section's navigation body, chosen by App. */
  children: ReactNode
}

const SECTION_TITLES: Record<Exclude<RailSection, 'manuscript'>, string> = {
  storyBible: 'Story Bible',
  timeline: 'Continuity Board',
  submissions: 'Query Tracker'
}

/**
 * The panel beside the rail. One width and one collapsed state across every
 * section — only the header actions and the body swap, so switching sections
 * never disturbs the panel's geometry.
 */
function SidePanel(props: SidePanelProps): JSX.Element {
  const {
    section,
    width,
    collapsed,
    onExpand,
    projectName,
    editingProjectName,
    projectNameDraft,
    storyBibleTypes,
    onProjectNameDraftChange,
    onStartEditProjectName,
    onCommitProjectName,
    onCancelEditProjectName,
    onCreateDocument,
    onCreateFolder,
    onCreateStoryBibleItem,
    onCollapse,
    onResizeStart,
    children
  } = props

  const [newItemPickerOpen, setNewItemPickerOpen] = useState(false)
  const newItemPickerRef = useRef<HTMLDivElement>(null)

  // Same dismiss-on-outside-click contract as the browse grid's New… popover.
  useEffect(() => {
    if (!newItemPickerOpen) return
    function handlePointerDown(e: MouseEvent): void {
      if (newItemPickerRef.current && !newItemPickerRef.current.contains(e.target as Node)) {
        setNewItemPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [newItemPickerOpen])

  // Leaving the Story Bible section with the picker open would otherwise bring
  // it back the next time that section is shown.
  useEffect(() => setNewItemPickerOpen(false), [section])

  // Collapsed is a genuinely different shape — an icon strip with one control —
  // rather than the full header with its label and actions squeezed down.
  if (collapsed) {
    return (
      <div className="side-panel is-collapsed" style={{ width: COLLAPSED_PANEL_WIDTH }}>
        <div className="side-panel-header side-panel-header--collapsed">
          <button type="button" title="Expand panel" aria-label="Expand panel" onClick={onExpand}>
            <PanelExpandIcon />
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="side-panel" style={{ width }}>
      <div className="side-panel-header">
        {section === 'manuscript' ? (
          editingProjectName ? (
            <input
              autoFocus
              className="sidebar-title-input"
              value={projectNameDraft}
              onChange={(e) => onProjectNameDraftChange(e.target.value)}
              onBlur={() => onCommitProjectName(projectNameDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') onCancelEditProjectName()
              }}
            />
          ) : (
            <span className="sidebar-title" title="Double-click to rename project" onDoubleClick={onStartEditProjectName}>
              {projectName || 'Untitled Project'}
            </span>
          )
        ) : (
          <span className="sidebar-title side-panel-static-title">{SECTION_TITLES[section]}</span>
        )}

        {section === 'manuscript' && (
          <>
            <button type="button" title="New document" onClick={onCreateDocument}>
              <NewDocumentIcon />
            </button>
            <button type="button" title="New folder" onClick={onCreateFolder}>
              <NewFolderIcon />
            </button>
          </>
        )}

        {section === 'storyBible' && (
          <div className="side-panel-new-item" ref={newItemPickerRef}>
            <button type="button" title="New item" onClick={() => setNewItemPickerOpen((v) => !v)}>
              <PlusIcon />
            </button>
            {newItemPickerOpen && (
              <div className="story-bible-new-item-popover">
                {storyBibleTypes.length === 0 && (
                  <span className="tag-status-filter-empty">No types yet.</span>
                )}
                {storyBibleTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className="story-bible-type-popover-row"
                    onClick={() => {
                      onCreateStoryBibleItem(type.id)
                      setNewItemPickerOpen(false)
                    }}
                  >
                    <span className="story-bible-type-swatch" style={{ background: type.color }} />
                    {type.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button type="button" title="Hide panel" aria-label="Hide panel" onClick={onCollapse}>
          <PanelCollapseIcon />
        </button>
      </div>

      {children}

      <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
    </div>
  )
}

export default SidePanel
