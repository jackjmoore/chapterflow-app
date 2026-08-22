import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import type { RailSection } from '../../shared/binder'
import type { StoryBibleTypeDef } from '../../shared/storyBible'
import { NewDocumentIcon, NewFolderIcon, PlusIcon, PanelCollapseIcon, PanelExpandIcon } from './icons'
import { useFadePresence } from './useFadePresence'

/** Width of the collapsed rail. This is reserved, in-flow width — the rail is
 *  a flex sibling of the editor, never an overlay on top of it. At narrow
 *  window widths a manuscript page fills its pane with only its own padding to
 *  spare, so a floating rail would sit on live text exactly when collapsing
 *  matters most. Nothing in the collapsed state may be positioned, negatively
 *  margined, or shrunk out of this box. */
export const COLLAPSED_PANEL_WIDTH = 44

/** Hovering across the rail on the way somewhere else shouldn't summon the
 *  flyout, and clipping a corner on the way back into it shouldn't dismiss it. */
const FLYOUT_OPEN_DELAY_MS = 120
/** How long the flyout takes to fade in or out, once scheduleFlyout has
 *  already decided to open or close it — this is a separate, much shorter
 *  delay from FLYOUT_OPEN_DELAY_MS/FLYOUT_CLOSE_DELAY_MS above, which are
 *  hover-intent timers deciding *whether* to open at all. This one just
 *  softens the resulting appear/disappear once that decision is made. */
const FLYOUT_FADE_MS = 120
const FLYOUT_CLOSE_DELAY_MS = 200

/** The flyout's own width — independent of the resizable sidebarWidth it
 *  replaces. It shows names only, not the full binder's other UI, so it's
 *  sized as a compact popover rather than inheriting the full panel's width. */
const FLYOUT_WIDTH = 220

/** Matches .editor-footer's own fixed height in index.css — the footer never
 *  wraps or resizes, so this is safe to hardcode rather than measure. */
const FOOTER_HEIGHT = 30

interface SidePanelProps {
  section: RailSection
  width: number
  /** Collapsed renders the panel as a minimap rail rather than hiding it, so
   *  you never lose your place in the current section's navigation. */
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
  /** True only while an actual paper page is on screen (manuscript section,
   *  editor sub-view, a document open) — collapsed then blends into the
   *  page's own margin color; otherwise it reads as ordinary chrome, since
   *  Outliner, Corkboard, and the other sections' panels aren't paper. */
  isPagedView: boolean
  /** The real, measured height of the toolbar above the editor — 0 when no
   *  toolbar is showing. Used to size the collapsed rail's top zone so it
   *  matches the toolbar's color across its actual height, not a guess. */
  toolbarHeight: number
  /** The section's navigation reduced to the collapsed rail's width. */
  railBody: ReactNode
  /** The section's navigation reduced to a compact, names-only list for the
   *  hover flyout — no search box, no create buttons, no row actions. Takes
   *  the callback that dismisses the flyout, so opening something from it
   *  closes it the way clicking through a menu does. */
  flyoutBody: (close: () => void) => ReactNode
  /** The section's full navigation, for the expanded panel. */
  children: ReactNode
}

const SECTION_TITLES: Record<Exclude<RailSection, 'manuscript'>, string> = {
  storyBible: 'Story Bible',
  timeline: 'Continuity Board',
  submissions: 'Query Tracker',
  lexicon: 'Lexicon'
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
    isPagedView,
    toolbarHeight,
    railBody,
    flyoutBody,
    children
  } = props

  const [newItemPickerOpen, setNewItemPickerOpen] = useState(false)
  const newItemPickerRef = useRef<HTMLDivElement>(null)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const flyoutTimerRef = useRef<number | null>(null)
  // See useFadePresence: keeps the flyout mounted for one fade after
  // flyoutOpen goes false, instead of the instant removal a plain
  // "flyoutOpen && (...)" gives.
  const flyoutFade = useFadePresence(flyoutOpen ? true : null, FLYOUT_FADE_MS)

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

  const clearFlyoutTimer = useCallback((): void => {
    if (flyoutTimerRef.current !== null) {
      window.clearTimeout(flyoutTimerRef.current)
      flyoutTimerRef.current = null
    }
  }, [])

  const closeFlyout = useCallback((): void => {
    clearFlyoutTimer()
    setFlyoutOpen(false)
  }, [clearFlyoutTimer])

  function scheduleFlyout(open: boolean): void {
    clearFlyoutTimer()
    flyoutTimerRef.current = window.setTimeout(
      () => {
        flyoutTimerRef.current = null
        setFlyoutOpen(open)
      },
      open ? FLYOUT_OPEN_DELAY_MS : FLYOUT_CLOSE_DELAY_MS
    )
  }

  useEffect(() => clearFlyoutTimer, [clearFlyoutTimer])

  // Expanding, or switching sections, leaves a flyout with nothing behind it.
  useEffect(() => {
    if (!collapsed) closeFlyout()
  }, [collapsed, closeFlyout])

  useEffect(() => closeFlyout(), [section, closeFlyout])

  useEffect(() => {
    if (!flyoutOpen) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeFlyout()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flyoutOpen, closeFlyout])

  const headerActions = (
    <>
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
    </>
  )

  const headerTitle =
    section === 'manuscript' ? (
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
    )

  // Collapsed is a genuinely different shape — a minimap rail with one control
  // — rather than the full header with its label and actions squeezed down.
  // The flyout is an absolutely positioned child, so it is out of flow: the
  // rail's reserved width is identical whether or not it is open. It carries
  // no header of its own — no title, no create buttons — because it's a
  // compact names-only popover, not a second copy of the full panel.
  if (collapsed) {
    // The header doubles as the rail's top zone, stretched to the toolbar's
    // real measured height in page-margin mode so it reads as a continuation
    // of the toolbar rather than a separately-sized strip above it. One
    // number, copied directly onto this box — no second measurement of the
    // header's own height to subtract, which is what let the two drift out
    // of sync. align-items: center (already on .side-panel-header) keeps the
    // button centered in whatever height that turns out to be. Natural
    // (unset) height otherwise, exactly like every other tool section's rail.
    const collapsedHeaderHeight = isPagedView && toolbarHeight > 0 ? toolbarHeight : undefined

    return (
      <div
        className={`side-panel is-collapsed${isPagedView ? ' is-paged' : ''}`}
        style={{ width: COLLAPSED_PANEL_WIDTH }}
        onMouseEnter={() => scheduleFlyout(true)}
        onMouseLeave={() => scheduleFlyout(false)}
      >
        <div
          className="side-panel-header side-panel-header--collapsed"
          style={{ height: collapsedHeaderHeight }}
        >
          <button type="button" title="Expand panel" aria-label="Expand panel" onClick={onExpand}>
            <PanelExpandIcon />
          </button>
        </div>

        {railBody}

        {/* Matches the footer's own fixed height, so the rail's page-margin
            zone spans exactly the page's own visible extent — no more, no
            less — and the minimap centers on that same extent. */}
        {isPagedView && (
          <div className="side-panel-rail-spacer side-panel-rail-spacer--footer" style={{ height: FOOTER_HEIGHT }} />
        )}

        {flyoutFade.rendered && (
          <div
            className={`side-panel-flyout ${flyoutFade.visible ? 'is-visible' : ''}`}
            style={{ width: FLYOUT_WIDTH }}
            onMouseEnter={clearFlyoutTimer}
            onFocus={clearFlyoutTimer}
          >
            {flyoutBody(closeFlyout)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="side-panel" style={{ width }}>
      <div className="side-panel-header">
        {headerTitle}
        {headerActions}

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
