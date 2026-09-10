import { randomUUID } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { deleteDocument, loadDocument, saveDocument } from './documentStore'
import { deleteAllForDocument } from './snapshotStore'
import {
  deleteAllForDocument as deleteAllSpanTagsForDocument,
  rebuildForDocument as rebuildSpanTagsForDocument
} from './spanTagStore'
import { getProjectRoot } from './projectRoot'
import { DEFAULT_STATUSES } from '../shared/statusDefaults'
import { countWords } from '../shared/wordCount'
import {
  DEFAULT_VIEW_STATE,
  DRAFT_FOLDER_ID,
  LEADING_STRUCTURAL_FOLDERS,
  STRUCTURAL_FOLDERS,
  TRAILING_STRUCTURAL_FOLDERS,
  TRASH_FOLDER_ID,
  draftChildren,
  isCustomTopLevelFolder,
  isManuscriptView,
  isStructuralFolderId,
  type BinderNode,
  type BinderState,
  type DocumentNode,
  type FolderNode,
  type OutlinerSort,
  type ActiveView,
  type ManuscriptView,
  type ViewState,
  type WordCountBaseline,
  type StatusDef,
  type TagDef,
  type SavedView
} from '../shared/binder'

function binderPath(): string {
  return join(getProjectRoot(), 'binder.json')
}

interface BinderFile {
  version: 1
  tree: BinderNode[]
  lastOpenDocumentId: string | null
  wordCountBaseline: WordCountBaseline | null
  projectName: string | null
  viewState: ViewState
  statuses: StatusDef[]
  tags: TagDef[]
  savedViews: SavedView[]
  overusedIgnoreList: string[]
  authorName: string | null
  projectWordTarget: number | null
  projectDeadline: string | null
  projectTargetStartDate: string | null
  projectTargetStartCount: number | null
}

/** The five protected root folders, freshly built — every project starts
 *  with them, and legacy projects gain them via ensureStructuralFolders. */
function seededStructuralTree(): BinderNode[] {
  return STRUCTURAL_FOLDERS.map(
    ({ id, name }): FolderNode => ({ id, type: 'folder', name, collapsed: false, children: [] })
  )
}

/**
 * The one-time structural migration, and the permanent self-heal.
 *
 * Given any root list, returns
 *
 *     [Draft, Notes, Matter, ...the writer's own top-level folders, Archive, Trash]
 *
 * with every remaining root node moved into Draft — in its original order,
 * ids and nesting untouched. Pure in-memory pointer moves: nothing per-node,
 * nothing that grows with manuscript size, no document files touched.
 * Idempotent by construction: an already-structured tree comes back unchanged
 * (changed: false), so running it on every load costs a few array scans and
 * re-asserts the structure even against a hand-edited binder.json.
 *
 * The writer's own folders are recognised by their isTopLevel flag, never by
 * position. That distinction is load-bearing: a pre-structure binder.json has
 * ordinary folders at the root that must still be swept into Draft, and
 * position alone cannot tell those apart from a folder deliberately placed
 * beside Draft. Unflagged means sweep, which is precisely the behavior this
 * function had before custom folders existed — so old projects migrate
 * exactly as they always did, and simply gain an empty Archive and Trash.
 */
function ensureStructuralFolders(tree: BinderNode[]): { tree: BinderNode[]; changed: boolean } {
  const byId = new Map<string, FolderNode>()
  const custom: FolderNode[] = []
  const strays: BinderNode[] = []
  for (const node of tree) {
    if (isStructuralFolderId(node.id) && node.type === 'folder') byId.set(node.id, node)
    else if (isCustomTopLevelFolder(node)) custom.push(node)
    else strays.push(node)
  }

  let changed = false
  const build = (defs: { id: string; name: string }[]): FolderNode[] =>
    defs.map(({ id, name }): FolderNode => {
      const existing = byId.get(id)
      if (existing) {
        if (existing.name !== name) {
          existing.name = name
          changed = true
        }
        return existing
      }
      changed = true
      return { id, type: 'folder', name, collapsed: false, children: [] }
    })

  const leading = build(LEADING_STRUCTURAL_FOLDERS)
  const trailing = build(TRAILING_STRUCTURAL_FOLDERS)

  if (strays.length > 0) {
    leading[0].children.push(...strays)
    changed = true
  }

  const next = [...leading, ...custom, ...trailing]
  if (!changed) {
    // Same nodes, same order — compared by identity, which also catches a
    // hand-edited file that merely reshuffled the root.
    changed = !(tree.length === next.length && tree.every((node, i) => node === next[i]))
  }
  return { tree: next, changed }
}

function emptyState(): BinderFile {
  return {
    version: 1,
    tree: seededStructuralTree(),
    lastOpenDocumentId: null,
    wordCountBaseline: null,
    projectName: null,
    viewState: { ...DEFAULT_VIEW_STATE },
    statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
    tags: [],
    savedViews: [],
    overusedIgnoreList: [],
    authorName: null,
    projectWordTarget: null,
    projectDeadline: null,
    projectTargetStartDate: null,
    projectTargetStartCount: null
  }
}

let state: BinderFile = emptyState()

/** Ensures every document node has synopsis/statusId/tagIds/wordTarget — older
 *  binder.json files (saved before those fields existed, or before status/tags
 *  landed) won't have them, so this backfills defaults in place rather than
 *  letting the outliner/corkboard see `undefined`. The old free-text `status`
 *  field (a placeholder) is dropped rather than migrated — arbitrary text can't
 *  be reliably mapped onto the new stage list. Mutates in place. */
function normalizeTree(nodes: BinderNode[]): void {
  for (const node of nodes) {
    if (node.type === 'document') {
      if (typeof node.synopsis !== 'string') node.synopsis = ''
      // Added after synopsis, and backfilled the same way: a project written
      // before notes existed simply gains an empty one on load. Nothing is
      // migrated and the file is not rewritten until its next real edit.
      if (typeof node.notes !== 'string') node.notes = ''
      const n = node as DocumentNode & { status?: unknown }
      if (typeof n.statusId !== 'string') n.statusId = null
      delete n.status
      if (!Array.isArray(n.tagIds)) n.tagIds = []
      if (typeof n.wordTarget !== 'number') n.wordTarget = null
      if (typeof n.chapterNumber !== 'number') n.chapterNumber = null
    }
    normalizeTree(node.children)
  }
}

function parseStatuses(raw: unknown): StatusDef[] {
  if (!Array.isArray(raw)) return DEFAULT_STATUSES.map((s) => ({ ...s }))
  const out: StatusDef[] = []
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const r = item as Record<string, unknown>
      if (typeof r.id === 'string' && typeof r.name === 'string' && typeof r.color === 'string') {
        out.push({ id: r.id, name: r.name, color: r.color })
      }
    }
  }
  return out
}

function parseTags(raw: unknown): TagDef[] {
  if (!Array.isArray(raw)) return []
  const out: TagDef[] = []
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const r = item as Record<string, unknown>
      if (typeof r.id === 'string' && typeof r.name === 'string' && typeof r.color === 'string') {
        out.push({ id: r.id, name: r.name, color: r.color })
      }
    }
  }
  return out
}

function parseSavedViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return []
  const out: SavedView[] = []
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const r = item as Record<string, unknown>
      if (
        typeof r.id === 'string' &&
        typeof r.name === 'string' &&
        Array.isArray(r.statusFilter) &&
        Array.isArray(r.tagFilter)
      ) {
        out.push({
          id: r.id,
          name: r.name,
          statusFilter: r.statusFilter.filter((x): x is string => typeof x === 'string'),
          tagFilter: r.tagFilter.filter((x): x is string => typeof x === 'string')
        })
      }
    }
  }
  return out
}

function parseViewState(raw: unknown): ViewState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VIEW_STATE }
  const r = raw as Record<string, unknown>
  // Every non-default ActiveView must be listed here or it silently degrades
  // to 'editor' on reload — 'timeline' was missing when the continuity board
  // was added, which is why that view never survived a restart.
  const activeView: ActiveView =
    r.activeView === 'outliner' ||
    r.activeView === 'corkboard' ||
    r.activeView === 'book' ||
    r.activeView === 'storyBible' ||
    r.activeView === 'timeline' ||
    r.activeView === 'compile' ||
    r.activeView === 'submissions' ||
    r.activeView === 'lexicon' ||
    r.activeView === 'progress' ||
    r.activeView === 'appearance'
      ? r.activeView
      : 'editor'
  const manuscriptView: ManuscriptView =
    r.manuscriptView === 'outliner' || r.manuscriptView === 'corkboard' || r.manuscriptView === 'book'
      ? r.manuscriptView
      : // Backfill for projects saved before the rail existed: if the last
        // active view was itself a manuscript view, that's the best guess at
        // which one to restore.
        isManuscriptView(activeView)
        ? activeView
        : 'editor'
  let outlinerSort: OutlinerSort | null = null
  if (r.outlinerSort && typeof r.outlinerSort === 'object') {
    const s = r.outlinerSort as Record<string, unknown>
    if (
      (s.column === 'title' ||
        s.column === 'synopsis' ||
        s.column === 'notes' ||
        s.column === 'status' ||
        s.column === 'wordCount') &&
      (s.direction === 'asc' || s.direction === 'desc')
    ) {
      outlinerSort = { column: s.column, direction: s.direction }
    }
  }
  const outlinerFilter = typeof r.outlinerFilter === 'string' ? r.outlinerFilter : ''
  const statusFilter = Array.isArray(r.statusFilter) ? r.statusFilter.filter((x): x is string => typeof x === 'string') : []
  const tagFilter = Array.isArray(r.tagFilter) ? r.tagFilter.filter((x): x is string => typeof x === 'string') : []
  const referenceDocumentId = typeof r.referenceDocumentId === 'string' ? r.referenceDocumentId : null
  const splitViewLocked = typeof r.splitViewLocked === 'boolean' ? r.splitViewLocked : false
  const splitViewSyncScroll = typeof r.splitViewSyncScroll === 'boolean' ? r.splitViewSyncScroll : false
  return {
    activeView,
    manuscriptView,
    outlinerSort,
    outlinerFilter,
    statusFilter,
    tagFilter,
    referenceDocumentId,
    splitViewLocked,
    splitViewSyncScroll
  }
}

/**
 * Set when binder.json exists but could not be read or understood.
 *
 * This guard exists because the failure mode without it is catastrophic and
 * completely silent: a load error leaves `state` at emptyState() (tree: []),
 * and the very next persist() — which any view-state change triggers, several
 * of which fire automatically on startup — overwrites a real project with an
 * empty one. A transient error anywhere in the parse path therefore destroyed
 * the whole binder. When we can't read the file, the only safe thing to do is
 * refuse to write it.
 */
let loadFailed = false

async function readFromDisk(): Promise<void> {
  loadFailed = false
  if (!existsSync(binderPath())) return
  try {
    const raw = await readFile(binderPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.tree)) {
      normalizeTree(parsed.tree)
      const structured = ensureStructuralFolders(parsed.tree)
      state = {
        version: 1,
        tree: structured.tree,
        lastOpenDocumentId: parsed.lastOpenDocumentId ?? null,
        wordCountBaseline: parsed.wordCountBaseline ?? null,
        projectName: typeof parsed.projectName === 'string' ? parsed.projectName : null,
        viewState: parseViewState(parsed.viewState),
        statuses: parseStatuses(parsed.statuses),
        tags: parseTags(parsed.tags),
        savedViews: parseSavedViews(parsed.savedViews),
        overusedIgnoreList: Array.isArray(parsed.overusedIgnoreList)
          ? parsed.overusedIgnoreList.filter((x) => typeof x === 'string')
          : [],
        authorName: typeof parsed.authorName === 'string' ? parsed.authorName : null,
        projectWordTarget: typeof parsed.projectWordTarget === 'number' ? parsed.projectWordTarget : null,
        projectDeadline: typeof parsed.projectDeadline === 'string' ? parsed.projectDeadline : null,
        projectTargetStartDate: typeof parsed.projectTargetStartDate === 'string' ? parsed.projectTargetStartDate : null,
        projectTargetStartCount: typeof parsed.projectTargetStartCount === 'number' ? parsed.projectTargetStartCount : null
      }
      if (structured.changed) {
        // The one-time migration to Draft/Notes/Matter. Keep the exact bytes
        // being replaced as a sidecar (once — never overwritten by later
        // self-heals), then persist the new shape in a single atomic write.
        const sidecar = `${binderPath()}.pre-structure`
        if (!existsSync(sidecar)) {
          await writeFile(sidecar, raw, 'utf-8').catch(() => undefined)
        }
        await persist()
      }
    } else {
      // The file is there but isn't a binder we recognize. Show an empty
      // project rather than crashing, but treat the file as untouchable.
      loadFailed = true
      console.error('binder.json has no usable tree; refusing to overwrite it.')
    }
  } catch (error) {
    loadFailed = true
    console.error('binder.json could not be read; refusing to overwrite it.', error)
  }
}

// Caches the in-flight promise, not a boolean: a plain `loaded` flag set
// before the await lets a second concurrent caller return while `state` is
// still empty. Every caller awaits the same load.
let loadPromise: Promise<void> | null = null

function load(): Promise<void> {
  if (!loadPromise) loadPromise = readFromDisk()
  return loadPromise
}

function persist(): Promise<void> {
  // Never let an unreadable load turn into an erased project — see loadFailed.
  if (loadFailed) {
    console.error('Refusing to write binder.json: the file on disk could not be read.')
    return Promise.resolve()
  }
  return atomicWrite(binderPath(), JSON.stringify(state, null, 2))
}

/** Forces the next read to come from disk — used after a backup restore replaces the file underneath
 *  us, or after switching to a different project folder. Also resets in-memory state to the empty
 *  defaults first: without this, switching to a project root that has no binder.json yet (a genuinely
 *  new location) would silently keep showing the PREVIOUS project's tree, since load() only reads from
 *  disk when the file exists and otherwise leaves `state` untouched. */
export function invalidateCache(): void {
  loadPromise = null
  state = emptyState()
  // The next readFromDisk recomputes this, but clear it here too so a failed
  // load against one project root can't keep writes blocked after switching
  // to a different, perfectly readable one.
  loadFailed = false
}

function findNode(nodes: BinderNode[], id: string): BinderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

function findParentList(
  nodes: BinderNode[],
  id: string
): { list: BinderNode[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { list: nodes, index: i }
    const found = findParentList(nodes[i].children, id)
    if (found) return found
  }
  return null
}

function childrenOf(parentId: string | null): BinderNode[] | null {
  if (parentId === null) return state.tree
  const node = findNode(state.tree, parentId)
  return node ? node.children : null
}

function isDescendant(node: BinderNode, id: string): boolean {
  for (const child of node.children) {
    if (child.id === id) return true
    if (isDescendant(child, id)) return true
  }
  return false
}

function collectDocumentIds(node: BinderNode, out: string[]): void {
  if (node.type === 'document') out.push(node.id)
  for (const child of node.children) collectDocumentIds(child, out)
}

function walkDocuments(nodes: BinderNode[], fn: (doc: DocumentNode) => void): void {
  for (const node of nodes) {
    if (node.type === 'document') fn(node)
    walkDocuments(node.children, fn)
  }
}

export async function getState(): Promise<BinderState> {
  await load()
  return {
    tree: state.tree,
    lastOpenDocumentId: state.lastOpenDocumentId,
    projectName: state.projectName,
    viewState: state.viewState,
    statuses: state.statuses,
    tags: state.tags,
    savedViews: state.savedViews,
    overusedIgnoreList: state.overusedIgnoreList,
    authorName: state.authorName,
    projectWordTarget: state.projectWordTarget,
    projectDeadline: state.projectDeadline,
    projectTargetStartDate: state.projectTargetStartDate,
    projectTargetStartCount: state.projectTargetStartCount
  }
}

export async function getProjectName(): Promise<string | null> {
  await load()
  return state.projectName
}

export async function setProjectName(name: string): Promise<void> {
  await load()
  const trimmed = name.trim()
  state.projectName = trimmed ? trimmed : null
  await persist()
}

export async function getAllDocumentIds(): Promise<string[]> {
  await load()
  const ids: string[] = []
  for (const node of state.tree) collectDocumentIds(node, ids)
  return ids
}

/** Document ids inside Draft only — the manuscript. This is what word
 *  totals, daily baselines, and pace measure; getAllDocumentIds above stays
 *  whole-binder for consumers that genuinely mean everything (search,
 *  per-document counts, pickers). */
export async function getDraftDocumentIds(): Promise<string[]> {
  await load()
  const ids: string[] = []
  for (const node of draftChildren(state.tree)) collectDocumentIds(node, ids)
  return ids
}

export async function getWordCountBaseline(): Promise<WordCountBaseline | null> {
  await load()
  return state.wordCountBaseline
}

export async function setWordCountBaseline(baseline: WordCountBaseline): Promise<void> {
  await load()
  state.wordCountBaseline = baseline
  await persist()
}

export async function createDocument(
  parentId: string | null,
  name = 'Untitled'
): Promise<DocumentNode> {
  await load()
  // No parent (or an unresolved one) means Draft, not the root — the root
  // permanently holds exactly the three structural folders. parentId === null
  // is checked explicitly because childrenOf(null) IS the root list.
  const list = (parentId === null ? null : childrenOf(parentId)) ?? childrenOf(DRAFT_FOLDER_ID) ?? state.tree
  const node: DocumentNode = {
    id: randomUUID(),
    type: 'document',
    name,
    collapsed: false,
    synopsis: '',
    notes: '',
    statusId: null,
    tagIds: [],
    wordTarget: null,
    chapterNumber: null,
    children: []
  }
  list.push(node)
  await persist()
  return node
}

export async function createFolder(
  parentId: string | null,
  name = 'New Folder'
): Promise<FolderNode> {
  await load()
  const list = (parentId === null ? null : childrenOf(parentId)) ?? childrenOf(DRAFT_FOLDER_ID) ?? state.tree
  const node: FolderNode = { id: randomUUID(), type: 'folder', name, collapsed: false, children: [] }
  list.push(node)
  await persist()
  return node
}

/**
 * Inserts a whole prepared subtree under `parentId` in ONE persist — the bulk
 * counterpart to createDocument/createFolder, for importers that build a
 * hundreds-of-nodes tree offline.
 *
 * Every one of those two writes the entire binder.json and re-triggers a
 * search reindex, so a 150-item Scrivener binder through them is several
 * hundred full rewrites. This is one.
 *
 * The caller owns the node ids and MUST have written documents/<id>.html for
 * every document node BEFORE calling this. A crash with the binder written and
 * the documents missing leaves a project full of chapters that exist and are
 * empty, which is indistinguishable from data loss; the reverse leaves orphan
 * files, which are discoverable and deletable.
 *
 * Validates everything before mutating anything, and throws rather than
 * partially inserting: a half-applied tree in memory would be committed to
 * disk by the next unrelated persist — an autosave setting lastOpenDocumentId
 * is enough — so the failure would surface later, from innocent code, looking
 * nothing like an import bug.
 *
 * Returns the document ids inserted, in tree order, so the caller can run the
 * same per-document side effects the import:files path does.
 */
export async function insertSubtree(parentId: string | null, nodes: BinderNode[]): Promise<string[]> {
  await load()

  // persist() already refuses to write when the load failed, but this mutates
  // state.tree first — so without this the UI would show the whole import,
  // nothing would reach disk, and the caller would be told it worked.
  if (loadFailed) {
    throw new Error('Refusing to insert into a binder.json that could not be read.')
  }

  // ---- validate, completely, before touching anything ----
  const existingIds = new Set<string>()
  const collectIds = (list: BinderNode[]): void => {
    for (const node of list) {
      existingIds.add(node.id)
      collectIds(node.children)
    }
  }
  collectIds(state.tree)

  const incoming = new Set<string>()
  const validate = (list: BinderNode[]): void => {
    for (const node of list) {
      // Read before the narrowing, or TypeScript has already reduced `node`
      // to never by the time the message needs it.
      const kind = (node as { type?: unknown }).type
      if (kind !== 'document' && kind !== 'folder') {
        throw new Error(`Cannot insert a node of unknown type "${String(kind)}".`)
      }
      if (!Array.isArray(node.children)) {
        // Every recursive walk in this file assumes children is an array; one
        // undefined makes the project unopenable until binder.json is edited
        // by hand.
        throw new Error(`Node "${node.id}" has no children array.`)
      }
      if (isStructuralFolderId(node.id)) {
        // ensureStructuralFolders keys the protected folders by id and keeps
        // only the last of a collision, so this would delete a real folder and
        // everything under it on the next load.
        throw new Error(`Cannot insert a node using the protected id "${node.id}".`)
      }
      if (existingIds.has(node.id) || incoming.has(node.id)) {
        // Never silently reassign: the caller has already written
        // documents/<id>.html under this id, so a new id orphans the content.
        throw new Error(`Duplicate node id "${node.id}".`)
      }
      incoming.add(node.id)
      validate(node.children)
    }
  }
  validate(nodes)

  // ---- then mutate ----
  // Same resolution createDocument uses: null, or an id that no longer
  // resolves, means Draft. Never the root — an unflagged root node is swept
  // into Draft by the next load's self-heal, so the tree the writer saw right
  // after importing would differ from the tree after a restart.
  const destination = (parentId === null ? null : childrenOf(parentId)) ?? childrenOf(DRAFT_FOLDER_ID) ?? state.tree

  const statusIds = new Set(state.statuses.map((s) => s.id))
  const tagIds = new Set(state.tags.map((t) => t.id))
  const documentIds: string[] = []
  const clean = (list: BinderNode[]): void => {
    for (const node of list) {
      if (node.type === 'document') {
        documentIds.push(node.id)
        // A reference to a status or tag that does not exist is not corrupting,
        // but it vanishes the first time the writer edits either list, which
        // reads as data loss. Same rule setStatuses/setTags already enforce.
        if (node.statusId && !statusIds.has(node.statusId)) node.statusId = null
        if (Array.isArray(node.tagIds)) node.tagIds = node.tagIds.filter((id) => tagIds.has(id))
      } else {
        // Inert inside Draft, but it would promote this folder to the root the
        // first time someone dragged it out.
        delete node.isTopLevel
      }
      clean(node.children)
    }
  }
  clean(nodes)
  normalizeTree(nodes)
  destination.push(...nodes)

  await persist()
  return documentIds
}

/**
 * A folder of the writer's own at the binder root, beside Draft rather than
 * inside it — for material that belongs to the project without belonging to
 * the manuscript, and that Notes/Matter/Archive don't describe.
 *
 * Unlike the five protected folders this one is completely ordinary: it can
 * be renamed, dragged, and deleted. It lands between Matter and Archive,
 * where every other custom folder lives, because the root's shape is fixed
 * either side of that band.
 */
export async function createTopLevelFolder(name = 'New Folder'): Promise<FolderNode> {
  await load()
  const node: FolderNode = {
    id: randomUUID(),
    type: 'folder',
    name,
    collapsed: false,
    isTopLevel: true,
    children: []
  }
  state.tree.splice(Math.max(0, state.tree.length - TRAILING_STRUCTURAL_FOLDERS.length), 0, node)
  await persist()
  return node
}

/**
 * Places a freshly made node relative to whatever is selected in the binder,
 * for the toolbar/menu "new document" and "new folder" actions — distinct
 * from createDocument/createFolder above, which always nest inside a given
 * parent (what a bulk import into a chosen folder wants, and the only thing
 * those two are still used for).
 *
 * A folder is a container: selecting one and pressing "new document" nests
 * inside it, same as before, and expanding it makes the new child visible. A
 * document is not a container in that sense — a "sub-document" is a real,
 * intentional feature (nested documents show in the binder), but landing
 * there by DEFAULT just because a document happened to be selected is not:
 * it silently demoted whatever chapter was selected into a parent. So a
 * document target instead places the new node as a SIBLING, immediately
 * after it in the same list — same level, same parent, no auto-expand
 * needed since a visible sibling was already showing.
 */
function insertNear(node: BinderNode, targetId: string | null): void {
  const target = targetId ? findNode(state.tree, targetId) : null

  if (target?.type === 'folder') {
    target.children.push(node)
    target.collapsed = false
    return
  }

  if (target?.type === 'document') {
    const located = findParentList(state.tree, target.id)
    if (located) {
      located.list.splice(located.index + 1, 0, node)
      return
    }
  }

  // Nothing selected, or the selected id no longer exists: same fallback
  // createDocument/createFolder use for an unresolved parent — into Draft,
  // never the root.
  ;(childrenOf(DRAFT_FOLDER_ID) ?? state.tree).push(node)
}

export async function createDocumentNear(targetId: string | null, name = 'Untitled'): Promise<DocumentNode> {
  await load()
  const node: DocumentNode = {
    id: randomUUID(),
    type: 'document',
    name,
    collapsed: false,
    synopsis: '',
    notes: '',
    statusId: null,
    tagIds: [],
    wordTarget: null,
    chapterNumber: null,
    children: []
  }
  insertNear(node, targetId)
  await persist()
  return node
}

export async function createFolderNear(targetId: string | null, name = 'New Folder'): Promise<FolderNode> {
  await load()
  const node: FolderNode = { id: randomUUID(), type: 'folder', name, collapsed: false, children: [] }
  insertNear(node, targetId)
  await persist()
  return node
}

export async function rename(id: string, name: string): Promise<void> {
  // The structural folders' names ARE their identity in the UI — refused
  // here so every entry point (context menu, inline edit, future callers)
  // is covered by one guard.
  if (isStructuralFolderId(id)) return
  await load()
  const node = findNode(state.tree, id)
  if (!node) return
  const trimmed = name.trim()
  if (trimmed) node.name = trimmed
  await persist()
}

/** Recursively clones a node with fresh ids for itself and every descendant.
 *  Only the top-level clone's name gets the " Copy" suffix. */
function cloneWithNewIds(node: BinderNode, isTop: boolean): BinderNode {
  const id = randomUUID()
  const name = isTop ? `${node.name} Copy` : node.name
  const children = node.children.map((child) => cloneWithNewIds(child, false))
  if (node.type === 'document') {
    return { ...node, id, name, tagIds: [...node.tagIds], children }
  }
  return { ...node, id, name, children }
}

/** Walks an original subtree and its just-cloned counterpart in lockstep,
 *  collecting [oldDocumentId, newDocumentId] pairs so document content and
 *  span-tag indexes can be copied over to the new ids. */
function collectDocumentIdPairs(original: BinderNode, clone: BinderNode, out: Array<[string, string]>): void {
  if (original.type === 'document' && clone.type === 'document') {
    out.push([original.id, clone.id])
  }
  for (let i = 0; i < original.children.length; i++) {
    collectDocumentIdPairs(original.children[i], clone.children[i], out)
  }
}

/** Duplicates a node (and its whole subtree) as a sibling right after the
 *  original, with fresh ids throughout and copied document content. */
export async function duplicateNode(id: string): Promise<BinderNode> {
  if (isStructuralFolderId(id)) throw new Error('Draft, Notes, Matter, Archive, and Trash are fixed folders.')
  await load()
  const located = findParentList(state.tree, id)
  if (!located) throw new Error('Node not found')

  const original = located.list[located.index]
  const clone = cloneWithNewIds(original, true)
  located.list.splice(located.index + 1, 0, clone)
  await persist()

  const documentIdPairs: Array<[string, string]> = []
  collectDocumentIdPairs(original, clone, documentIdPairs)
  for (const [oldId, newId] of documentIdPairs) {
    const html = await loadDocument(oldId)
    await saveDocument(newId, html)
    await rebuildSpanTagsForDocument(newId, html)
  }

  return clone
}

/** Free-text working notes. Same tier and same storage as the synopsis — see
 *  DocumentNode.notes for why they are metadata rather than content. */
export async function setNotes(id: string, notes: string): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'document') return
  node.notes = notes
  await persist()
}

export async function setSynopsis(id: string, synopsis: string): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'document') return
  node.synopsis = synopsis
  await persist()
}

export async function setStatusId(id: string, statusId: string | null): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'document') return
  node.statusId = statusId
  await persist()
}

export async function setTagIds(id: string, tagIds: string[]): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'document') return
  node.tagIds = tagIds
  await persist()
}

export async function setWordTarget(id: string, target: number | null): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'document') return
  node.wordTarget = target
  await persist()
}

export async function setChapterNumber(id: string, chapterNumber: number | null): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'document') return
  node.chapterNumber = chapterNumber
  await persist()
}

/** Designates a folder as a Part for the book compile preset. Stored as
 *  folder metadata like collapsed; the book planner only honors it on
 *  direct children of Draft, but the flag itself is just data. */
export async function setFolderIsPart(id: string, isPart: boolean): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node || node.type !== 'folder' || isStructuralFolderId(id)) return
  if (isPart) node.isPart = true
  else delete node.isPart
  await persist()
}

export async function getStatuses(): Promise<StatusDef[]> {
  await load()
  return state.statuses
}

/** Replaces the whole stage list. Any document referencing a stage that no
 *  longer exists has its statusId cleared, so nothing points at a dangling id. */
export async function setStatuses(statuses: StatusDef[]): Promise<void> {
  await load()
  state.statuses = statuses
  const validIds = new Set(statuses.map((s) => s.id))
  walkDocuments(state.tree, (doc) => {
    if (doc.statusId && !validIds.has(doc.statusId)) doc.statusId = null
  })
  await persist()
}

export async function getTags(): Promise<TagDef[]> {
  await load()
  return state.tags
}

/** Replaces the whole tag palette. Any document holding a tag that no longer
 *  exists has it stripped from tagIds, so nothing points at a dangling id. */
export async function setTags(tags: TagDef[]): Promise<void> {
  await load()
  state.tags = tags
  const validIds = new Set(tags.map((t) => t.id))
  walkDocuments(state.tree, (doc) => {
    doc.tagIds = doc.tagIds.filter((t) => validIds.has(t))
  })
  await persist()
}

export async function getSavedViews(): Promise<SavedView[]> {
  await load()
  return state.savedViews
}

export async function setSavedViews(views: SavedView[]): Promise<void> {
  await load()
  state.savedViews = views
  await persist()
}

/** Captures today + the current total project word count the first time a
 *  target/deadline is configured — the fixed reference point pace is measured
 *  against ("actual average words/day since tracking began"). Left alone on
 *  later edits to the number/date so tweaking the goal doesn't reset pace history. */
async function ensureTargetStartCaptured(): Promise<void> {
  if (state.projectTargetStartDate != null) return
  const ids: string[] = []
  for (const node of state.tree) collectDocumentIds(node, ids)
  let total = 0
  for (const id of ids) total += countWords(await loadDocument(id))
  const now = new Date()
  state.projectTargetStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  state.projectTargetStartCount = total
}

/** Replaces the overused-words ignore list. Stored trimmed and de-duplicated
 *  case-insensitively, since the checker matches that way too. */
export async function setOverusedIgnoreList(words: string[]): Promise<void> {
  await load()
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of words) {
    const word = raw.trim()
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(word)
  }
  state.overusedIgnoreList = cleaned
  await persist()
}

export async function getAuthorName(): Promise<string | null> {
  await load()
  return state.authorName
}

export async function setAuthorName(name: string | null): Promise<void> {
  await load()
  const trimmed = name?.trim()
  state.authorName = trimmed ? trimmed : null
  await persist()
}

export async function setProjectWordTarget(target: number | null): Promise<void> {
  await load()
  state.projectWordTarget = target
  if (target != null) await ensureTargetStartCaptured()
  await persist()
}

export async function setProjectDeadline(deadline: string | null): Promise<void> {
  await load()
  state.projectDeadline = deadline
  if (deadline != null) await ensureTargetStartCaptured()
  await persist()
}

/**
 * Explicitly repoints pace tracking: measure from this date, with this many
 * words already on the books.
 *
 * The count comes with the date deliberately — moving the start without
 * re-baselining the count would silently change every actual-pace figure.
 * The renderer derives the count from the session history at that date, so
 * both halves stay consistent. Null date clears both, returning to the
 * automatic first-target capture.
 */
export async function setProjectTargetStart(date: string | null, count: number | null): Promise<void> {
  await load()
  state.projectTargetStartDate = date
  state.projectTargetStartCount = date == null ? null : count
  await persist()
}

export async function setCollapsed(id: string, collapsed: boolean): Promise<void> {
  await load()
  const node = findNode(state.tree, id)
  if (!node) return
  node.collapsed = collapsed
  await persist()
}

export async function setLastOpenDocument(id: string | null): Promise<void> {
  await load()
  state.lastOpenDocumentId = id
  await persist()
}

export async function getViewState(): Promise<ViewState> {
  await load()
  return state.viewState
}

export async function setActiveView(view: ActiveView): Promise<void> {
  await load()
  state.viewState.activeView = view
  await persist()
}

/** Remembers which manuscript sub-view the rail should restore. Written
 *  alongside setActiveView whenever the active view is one of the three. */
export async function setManuscriptView(view: ManuscriptView): Promise<void> {
  await load()
  state.viewState.manuscriptView = view
  await persist()
}

export async function setOutlinerSort(sort: OutlinerSort | null): Promise<void> {
  await load()
  state.viewState.outlinerSort = sort
  await persist()
}

export async function setOutlinerFilter(filter: string): Promise<void> {
  await load()
  state.viewState.outlinerFilter = filter
  await persist()
}

export async function setStatusFilter(statusIds: string[]): Promise<void> {
  await load()
  state.viewState.statusFilter = statusIds
  await persist()
}

export async function setTagFilter(tagIds: string[]): Promise<void> {
  await load()
  state.viewState.tagFilter = tagIds
  await persist()
}

export async function setReferenceDocumentId(id: string | null): Promise<void> {
  await load()
  state.viewState.referenceDocumentId = id
  await persist()
}

export async function setSplitViewLocked(locked: boolean): Promise<void> {
  await load()
  state.viewState.splitViewLocked = locked
  await persist()
}

export async function setSplitViewSyncScroll(sync: boolean): Promise<void> {
  await load()
  state.viewState.splitViewSyncScroll = sync
  await persist()
}

/** Deletes a node. Recursively deletes every document's content underneath it
 *  too. Returns the deleted document ids so callers (index.ts) can cascade
 *  into stores this one deliberately doesn't import — see mentionStore. */
export async function deleteNode(id: string): Promise<string[]> {
  if (isStructuralFolderId(id)) return []
  await load()
  const located = findParentList(state.tree, id)
  if (!located) return []
  const [node] = located.list.splice(located.index, 1)

  const documentIds: string[] = []
  collectDocumentIds(node, documentIds)
  await Promise.all(documentIds.map((docId) => deleteDocument(docId)))
  await Promise.all(documentIds.map((docId) => deleteAllForDocument(docId)))
  await Promise.all(documentIds.map((docId) => deleteAllSpanTagsForDocument(docId)))

  if (state.lastOpenDocumentId && documentIds.includes(state.lastOpenDocumentId)) {
    state.lastOpenDocumentId = null
  }
  if (state.viewState.referenceDocumentId && documentIds.includes(state.viewState.referenceDocumentId)) {
    state.viewState.referenceDocumentId = null
  }

  await persist()
  return documentIds
}

/**
 * Moves a node to be a child of `targetParentId` at `targetIndex`, where
 * targetIndex is the insertion point within the destination's current
 * (pre-move) children array — the same-list shift-by-one is handled here.
 *
 * `targetParentId === null` means the binder root, which takes folders only,
 * and only into the band between Matter and Archive. A document at the root
 * would sit outside every folder the app scopes by — counted by nothing,
 * compiled into nothing, belonging to nothing — so it is refused rather than
 * quietly relocated.
 */
export async function moveNode(
  id: string,
  targetParentId: string | null,
  targetIndex: number
): Promise<void> {
  // The five structural folders are fixed in place.
  if (isStructuralFolderId(id)) return
  await load()
  if (id === targetParentId) return

  const located = findParentList(state.tree, id)
  if (!located) return

  const node = located.list[located.index]

  // Promotion to the root: a folder dragged out beside Draft becomes one of
  // the writer's own top-level folders, and is flagged as such so the next
  // load's self-heal leaves it there instead of sweeping it into Draft.
  if (targetParentId === null) {
    if (node.type !== 'folder') return
    const wasAtRoot = located.list === state.tree
    located.list.splice(located.index, 1)
    node.isTopLevel = true
    const lowest = LEADING_STRUCTURAL_FOLDERS.length
    const highest = Math.max(lowest, state.tree.length - TRAILING_STRUCTURAL_FOLDERS.length)
    const adjusted = wasAtRoot && located.index < targetIndex ? targetIndex - 1 : targetIndex
    state.tree.splice(Math.max(lowest, Math.min(adjusted, highest)), 0, node)
    await persist()
    return
  }

  if (isDescendant(node, targetParentId)) return

  const destination = childrenOf(targetParentId)
  if (!destination) return

  located.list.splice(located.index, 1)
  // Demotion: inside a real parent it is an ordinary folder again, so the
  // flag has to go with it or the self-heal would yank it back to the root.
  if (node.type === 'folder') delete node.isTopLevel
  const adjustedIndex =
    located.list === destination && located.index < targetIndex ? targetIndex - 1 : targetIndex
  const clampedIndex = Math.max(0, Math.min(adjustedIndex, destination.length))
  destination.splice(clampedIndex, 0, node)

  await persist()
}

/**
 * Permanently deletes everything inside Trash. Trash itself remains.
 *
 * This is the one deliberate hole in the app's safety net. Every other
 * destructive path in ChapterFlow leaves snapshots behind to recover from;
 * this one deletes the snapshots too, along with the documents and their span
 * tag indexes. Nothing survives it and nothing can be restored afterwards,
 * which is why its only caller puts an explicit confirmation in front of it.
 *
 * Returns the deleted document ids so index.ts can cascade into the stores
 * this one deliberately doesn't import, exactly as deleteNode does.
 */
export async function emptyTrash(): Promise<string[]> {
  await load()
  const trash = state.tree.find((node) => node.id === TRASH_FOLDER_ID)
  if (!trash || trash.type !== 'folder' || trash.children.length === 0) return []

  const documentIds: string[] = []
  for (const child of trash.children) collectDocumentIds(child, documentIds)
  trash.children = []

  await Promise.all(documentIds.map((docId) => deleteDocument(docId)))
  await Promise.all(documentIds.map((docId) => deleteAllForDocument(docId)))
  await Promise.all(documentIds.map((docId) => deleteAllSpanTagsForDocument(docId)))

  if (state.lastOpenDocumentId && documentIds.includes(state.lastOpenDocumentId)) {
    state.lastOpenDocumentId = null
  }
  if (state.viewState.referenceDocumentId && documentIds.includes(state.viewState.referenceDocumentId)) {
    state.viewState.referenceDocumentId = null
  }

  await persist()
  return documentIds
}

export function getNode(id: string): BinderNode | null {
  return findNode(state.tree, id)
}
