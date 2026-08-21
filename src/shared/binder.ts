export interface DocumentNode {
  id: string
  type: 'document'
  name: string
  collapsed: boolean
  /** Short editable summary — outliner/corkboard metadata, never part of the document's own content. */
  synopsis: string
  /** References a StatusDef.id in the project's `statuses` list, or null for no status. */
  statusId: string | null
  /** References zero or more TagDef.id values in the project's `tags` list. */
  tagIds: string[]
  /** Optional per-document word-count goal. Progress is always computed live against it, never cached. */
  wordTarget: number | null
  children: BinderNode[]
}

export interface FolderNode {
  id: string
  type: 'folder'
  name: string
  collapsed: boolean
  children: BinderNode[]
}

export type BinderNode = DocumentNode | FolderNode

export interface WordCountBaseline {
  date: string
  count: number
}

/** A stage in the project's editable status/stage list (e.g. Draft, Revising, Final). */
export interface StatusDef {
  id: string
  name: string
  color: string
}

/** A user-defined colored tag, independent of status — a document can carry zero or more. */
export interface TagDef {
  id: string
  name: string
  color: string
}

/** A saved status+tag filter combination for the outliner/corkboard, returnable by name later. */
export interface SavedView {
  id: string
  name: string
  statusFilter: string[]
  tagFilter: string[]
}

/** The three ways of looking at the manuscript itself. They share one binder,
 *  one document set, and one selection — switching between them is a sub-mode
 *  change, not a change of destination. */
export type ManuscriptView = 'editor' | 'outliner' | 'corkboard'

/**
 * Primary navigation: what the left-hand rail selects. 'manuscript' covers all
 * three ManuscriptViews; the other three are tools that *reference* manuscript
 * data without being manuscript-editing surfaces, which is exactly the
 * distinction the flat tab row used to hide.
 */
export type RailSection = 'manuscript' | 'storyBible' | 'timeline' | 'submissions' | 'lexicon'

export type ActiveView = ManuscriptView | 'storyBible' | 'timeline' | 'submissions' | 'lexicon'

export const MANUSCRIPT_VIEWS: ManuscriptView[] = ['editor', 'outliner', 'corkboard']

export function isManuscriptView(view: ActiveView): view is ManuscriptView {
  return view === 'editor' || view === 'outliner' || view === 'corkboard'
}

/** The rail section is *derived* from activeView rather than stored alongside
 *  it — two persisted values could drift apart (a saved section that disagrees
 *  with the saved view), and there'd be no principled way to say which won. */
export function railSectionFor(view: ActiveView): RailSection {
  return isManuscriptView(view) ? 'manuscript' : view
}
export type OutlinerColumn = 'title' | 'synopsis' | 'status' | 'wordCount'
export interface OutlinerSort {
  column: OutlinerColumn
  direction: 'asc' | 'desc'
}

/** Which view is showing, plus outliner sort/filter, the shared status/tag
 *  filter (applies to both outliner and corkboard), and split-view state —
 *  session state about how you're currently looking at the project, not
 *  document data itself. Lives alongside lastOpenDocumentId (same tier),
 *  per-project rather than global, so switching projects doesn't drag one
 *  project's sort/filter/split-pane into another. */
export interface ViewState {
  activeView: ActiveView
  /** Which manuscript sub-view to restore when the rail returns to
   *  'manuscript'. Without this, leaving Corkboard for the Story Bible and
   *  coming back would silently reset you to the Editor. */
  manuscriptView: ManuscriptView
  outlinerSort: OutlinerSort | null
  outlinerFilter: string
  statusFilter: string[]
  tagFilter: string[]
  /** The document pinned in the split-view reference pane; null = split view closed. */
  referenceDocumentId: string | null
  splitViewLocked: boolean
  splitViewSyncScroll: boolean
}

export const DEFAULT_VIEW_STATE: ViewState = {
  activeView: 'editor',
  manuscriptView: 'editor',
  outlinerSort: null,
  outlinerFilter: '',
  statusFilter: [],
  tagFilter: [],
  referenceDocumentId: null,
  splitViewLocked: false,
  splitViewSyncScroll: false
}

export interface BinderState {
  tree: BinderNode[]
  lastOpenDocumentId: string | null
  projectName: string | null
  viewState: ViewState
  statuses: StatusDef[]
  tags: TagDef[]
  savedViews: SavedView[]
  /** Words the overused-words checker should never flag — character names,
   *  deliberate motifs. Project-level config, same tier as statuses and tags. */
  overusedIgnoreList: string[]
  /** Used in the manuscript-format running header. Project-level, since it's
   *  a property of this manuscript rather than of the app. */
  authorName: string | null
  projectWordTarget: number | null
  projectDeadline: string | null
  projectTargetStartDate: string | null
  projectTargetStartCount: number | null
}
