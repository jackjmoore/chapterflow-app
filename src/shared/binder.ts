export interface DocumentNode {
  id: string
  type: 'document'
  name: string
  collapsed: boolean
  /** Short editable summary — outliner/corkboard metadata, never part of the document's own content. */
  synopsis: string
  /**
   * Free-text working notes. Distinct from the synopsis: a synopsis says what
   * the document contains, notes are the writer's own remarks about it —
   * reminders, questions, things to check.
   *
   * Binder metadata exactly as synopsis is, and for a load-bearing reason: a
   * Draft document's body is the compile source and the word-count source, so
   * notes kept anywhere near the HTML would silently enter the manuscript and
   * inflate the total. Living here, they structurally cannot.
   */
  notes: string
  /** References a StatusDef.id in the project's `statuses` list, or null for no status. */
  statusId: string | null
  /** References zero or more TagDef.id values in the project's `tags` list. */
  tagIds: string[]
  /** Optional per-document word-count goal. Progress is always computed live against it, never cached. */
  wordTarget: number | null
  /** A manually assigned chapter number, independent of this document's actual
   *  position in the tree — binder-level metadata, like synopsis/status, not
   *  document content. Purely a label: it does not drive ordering, search, or
   *  export. null when unset. */
  chapterNumber: number | null
  children: BinderNode[]
}

export interface FolderNode {
  id: string
  type: 'folder'
  name: string
  collapsed: boolean
  /** Explicitly designates this folder as a Part for the book compile
   *  preset (its direct children become chapters, and it gets a recto
   *  part-title page). Meaningful only on direct children of Draft; the
   *  book planner ignores it anywhere else. Absent means false. */
  isPart?: boolean
  /** Marks this folder as one of the writer's own top-level folders — a
   *  sibling of Draft at the binder root rather than something inside it.
   *
   *  The flag exists because the root cannot be read positionally: a legacy
   *  binder.json (written before the structural folders landed) has ordinary
   *  folders sitting at the root that MUST still migrate into Draft, and
   *  there is nothing about their position that distinguishes them from a
   *  folder the writer deliberately put there. Absent means "sweep me into
   *  Draft", which is exactly the pre-existing migration behavior, so old
   *  projects are untouched by this. Only ever set on root folders; moving
   *  one into a real parent clears it. */
  isTopLevel?: boolean
  children: BinderNode[]
}

export type BinderNode = DocumentNode | FolderNode

/**
 * The five fixed structural folders at the binder root — Draft (the
 * manuscript: the only content that counts toward word targets/progress/pace
 * and the sole manuscript source for compiling), Notes (in-project support
 * material: searchable, never counted, never compiled), Matter (front/back
 * matter: compiled around the Draft, never counted as manuscript words),
 * Archive (finished-with but kept: an ordinary holding folder that is simply
 * outside the manuscript), and Trash (discarded, and the one place in the app
 * where a delete is genuinely unrecoverable).
 *
 * They are identified by these fixed ids, not by name — one cheap identity
 * test for every layer (store guards, UI affordances, word-count scoping,
 * compile). The ids can't collide with randomUUID output, and the folders
 * can't be renamed, deleted, or moved (binderStore refuses; the binder UI
 * doesn't offer). Everything INSIDE them behaves exactly as binder items
 * always have — including Archive and Trash, which take documents by drag,
 * context menu, or import like any other folder.
 *
 * Archive and Trash carry no scoping role of their own. They are outside the
 * manuscript for exactly one reason: they are root siblings of Draft, and
 * every manuscript-facing walk starts at draftChildren(). Nothing had to be
 * taught to skip them.
 */
export const DRAFT_FOLDER_ID = 'structural-draft'
export const NOTES_FOLDER_ID = 'structural-notes'
export const MATTER_FOLDER_ID = 'structural-matter'
export const ARCHIVE_FOLDER_ID = 'structural-archive'
export const TRASH_FOLDER_ID = 'structural-trash'

export type StructuralRole = 'draft' | 'notes' | 'matter' | 'archive' | 'trash'

interface StructuralFolderDef {
  id: string
  role: StructuralRole
  name: string
}

/** Pinned above the writer's own top-level folders: the three that describe
 *  what the project IS. */
export const LEADING_STRUCTURAL_FOLDERS: StructuralFolderDef[] = [
  { id: DRAFT_FOLDER_ID, role: 'draft', name: 'Draft' },
  { id: NOTES_FOLDER_ID, role: 'notes', name: 'Notes' },
  { id: MATTER_FOLDER_ID, role: 'matter', name: 'Matter' }
]

/** Pinned below them: the two that are where things go to stop being worked
 *  on. Bottom of the binder because that is where a writer looks for them,
 *  and because it keeps their own folders adjacent to their manuscript. */
export const TRAILING_STRUCTURAL_FOLDERS: StructuralFolderDef[] = [
  { id: ARCHIVE_FOLDER_ID, role: 'archive', name: 'Archive' },
  { id: TRASH_FOLDER_ID, role: 'trash', name: 'Trash' }
]

export const STRUCTURAL_FOLDERS: StructuralFolderDef[] = [
  ...LEADING_STRUCTURAL_FOLDERS,
  ...TRAILING_STRUCTURAL_FOLDERS
]

const STRUCTURAL_FOLDER_IDS = new Set(STRUCTURAL_FOLDERS.map((f) => f.id))

/** True for the five protected folders. This is the single test behind every
 *  "can't rename / delete / duplicate / move" guard, so Archive and Trash
 *  inherit Draft's protection by being on this list and nothing more. */
export function isStructuralFolderId(id: string): boolean {
  return STRUCTURAL_FOLDER_IDS.has(id)
}

/** A folder the writer made at the binder root. Deletable, renamable and
 *  draggable, unlike the five above — an ordinary folder that simply lives
 *  outside Draft. */
export function isCustomTopLevelFolder(node: BinderNode): node is FolderNode {
  return node.type === 'folder' && node.isTopLevel === true && !isStructuralFolderId(node.id)
}

/** The writer's own top-level folders, in binder order. */
export function customTopLevelFolders(tree: BinderNode[]): FolderNode[] {
  return tree.filter(isCustomTopLevelFolder)
}

export function trashFolder(tree: BinderNode[]): FolderNode | null {
  const trash = tree.find((node) => node.id === TRASH_FOLDER_ID)
  return trash && trash.type === 'folder' ? trash : null
}

/**
 * The manuscript forest: Draft's children. Every manuscript-facing walk
 * (word totals, View Draft/Book View, export, compile) operates on THIS, not
 * the whole tree — which also keeps heading levels stable: an Act folder
 * stays level 1 rather than Draft becoming a heading above it.
 *
 * Falls back to the whole tree when no Draft folder exists — bare trees in
 * tests, and the moment before a legacy project migrates — so pre-structure
 * behavior is preserved exactly there.
 */
export function draftChildren(tree: BinderNode[]): BinderNode[] {
  const draft = tree.find((node) => node.id === DRAFT_FOLDER_ID)
  return draft ? draft.children : tree
}

export function matterFolder(tree: BinderNode[]): FolderNode | null {
  const matter = tree.find((node) => node.id === MATTER_FOLDER_ID)
  return matter && matter.type === 'folder' ? matter : null
}

/** Whether a node lives inside Draft — the test that decides if the active
 *  document's live count belongs in the project total. Same fallback rule as
 *  draftChildren: without a Draft folder, everything counts (old behavior). */
export function isInDraft(tree: BinderNode[], id: string): boolean {
  const contains = (nodes: BinderNode[]): boolean =>
    nodes.some((node) => node.id === id || contains(node.children))
  const draft = tree.find((node) => node.id === DRAFT_FOLDER_ID)
  return draft ? contains(draft.children) : true
}

/** One entry in the manuscript's reading order: a document (with its id) or
 *  a folder acting as a section divider (id null). */
export interface BinderOutlineEntry {
  /** The document id, or null for a folder. */
  id: string | null
  title: string
  /** Heading depth, 1–3 — nesting deeper than three reads as three. */
  level: number
  isDocument: boolean
}

/**
 * The manuscript in reading order — THE binder walk.
 *
 * Pre-order depth-first over the tree exactly as the binder displays it:
 * every node emits an entry (folders as section dividers with no document),
 * children follow their parent, nothing is sorted or skipped. Both project
 * export and the in-app View Draft consume this one function, so there is a
 * single definition of "binder order" and the two can never disagree about
 * what the manuscript contains or where a section begins.
 */
export function flattenBinderOutline(tree: BinderNode[]): BinderOutlineEntry[] {
  const entries: BinderOutlineEntry[] = []
  function walk(nodes: BinderNode[], depth: number): void {
    for (const node of nodes) {
      const level = Math.min(depth + 1, 3)
      entries.push({
        id: node.type === 'document' ? node.id : null,
        title: node.name,
        level,
        isDocument: node.type === 'document'
      })
      if (node.children.length) walk(node.children, depth + 1)
    }
  }
  walk(tree, 0)
  return entries
}

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

/** The ways of looking at the manuscript itself. They share one binder,
 *  one document set, and one selection — switching between them is a sub-mode
 *  change, not a change of destination. 'book' is the read-only one: the
 *  paginated document rendered as a physical book for spatial review. */
export type ManuscriptView = 'editor' | 'outliner' | 'corkboard' | 'book'

/**
 * Primary navigation: what the left-hand rail selects. 'manuscript' covers all
 * the ManuscriptViews; the other sections are tools that *reference* manuscript
 * data without being manuscript-editing surfaces, which is exactly the
 * distinction the flat tab row used to hide.
 */
export type RailSection = 'manuscript' | 'storyBible' | 'timeline' | 'compile' | 'submissions' | 'lexicon' | 'progress' | 'appearance'

export type ActiveView = ManuscriptView | 'storyBible' | 'timeline' | 'compile' | 'submissions' | 'lexicon' | 'progress' | 'appearance'

export const MANUSCRIPT_VIEWS: ManuscriptView[] = ['editor', 'outliner', 'corkboard', 'book']

export function isManuscriptView(view: ActiveView): view is ManuscriptView {
  return view === 'editor' || view === 'outliner' || view === 'corkboard' || view === 'book'
}

/** The rail section is *derived* from activeView rather than stored alongside
 *  it — two persisted values could drift apart (a saved section that disagrees
 *  with the saved view), and there'd be no principled way to say which won. */
export function railSectionFor(view: ActiveView): RailSection {
  return isManuscriptView(view) ? 'manuscript' : view
}
export type OutlinerColumn = 'title' | 'synopsis' | 'notes' | 'status' | 'wordCount'
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
