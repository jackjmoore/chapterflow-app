import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
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
  isManuscriptView,
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

function emptyState(): BinderFile {
  return {
    version: 1,
    tree: [],
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
      const n = node as DocumentNode & { status?: unknown }
      if (typeof n.statusId !== 'string') n.statusId = null
      delete n.status
      if (!Array.isArray(n.tagIds)) n.tagIds = []
      if (typeof n.wordTarget !== 'number') n.wordTarget = null
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
    r.activeView === 'storyBible' ||
    r.activeView === 'timeline' ||
    r.activeView === 'submissions'
      ? r.activeView
      : 'editor'
  const manuscriptView: ManuscriptView =
    r.manuscriptView === 'outliner' || r.manuscriptView === 'corkboard'
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
      (s.column === 'title' || s.column === 'synopsis' || s.column === 'status' || s.column === 'wordCount') &&
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
      state = {
        version: 1,
        tree: parsed.tree,
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
  const list = childrenOf(parentId) ?? state.tree
  const node: DocumentNode = {
    id: randomUUID(),
    type: 'document',
    name,
    collapsed: false,
    synopsis: '',
    statusId: null,
    tagIds: [],
    wordTarget: null,
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
  const list = childrenOf(parentId) ?? state.tree
  const node: FolderNode = { id: randomUUID(), type: 'folder', name, collapsed: false, children: [] }
  list.push(node)
  await persist()
  return node
}

export async function rename(id: string, name: string): Promise<void> {
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
 */
export async function moveNode(
  id: string,
  targetParentId: string | null,
  targetIndex: number
): Promise<void> {
  await load()
  if (id === targetParentId) return

  const located = findParentList(state.tree, id)
  if (!located) return

  const node = located.list[located.index]
  if (targetParentId && isDescendant(node, targetParentId)) return

  const destination = childrenOf(targetParentId)
  if (!destination) return

  located.list.splice(located.index, 1)
  const adjustedIndex =
    located.list === destination && located.index < targetIndex ? targetIndex - 1 : targetIndex
  const clampedIndex = Math.max(0, Math.min(adjustedIndex, destination.length))
  destination.splice(clampedIndex, 0, node)

  await persist()
}

export function getNode(id: string): BinderNode | null {
  return findNode(state.tree, id)
}
