import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { getSheet, deleteSheet } from './storyBibleSheetStore'
import { deleteImage } from './storyBibleImageStore'
import { DEFAULT_STORY_BIBLE_TYPES } from '../shared/storyBibleTypeDefaults'
import type { StoryBibleItem, StoryBibleTypeDef, StoryBibleState } from '../shared/storyBible'

function indexPath(): string {
  return join(getProjectRoot(), 'storybible', 'index.json')
}

interface StoryBibleIndexFile {
  version: 1
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
}

function emptyState(): StoryBibleIndexFile {
  return { version: 1, items: [], types: DEFAULT_STORY_BIBLE_TYPES.map((t) => ({ ...t })) }
}

let state: StoryBibleIndexFile = emptyState()

/** Same guard as binderStore.loadFailed, for the same reason: without it a
 *  load error leaves `state` empty and the next persist() erases every item on
 *  disk. If we can't read the index, we don't write it. */
let loadFailed = false

async function readFromDisk(): Promise<void> {
  loadFailed = false
  if (!existsSync(indexPath())) return
  try {
    const parsed = JSON.parse(await readFile(indexPath(), 'utf-8'))
    if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.types)) {
      // Backfill: items saved before `aliases` existed won't have it.
      for (const item of parsed.items) {
        if (!Array.isArray(item.aliases)) item.aliases = []
      }
      state = { version: 1, items: parsed.items, types: parsed.types }
    } else {
      loadFailed = true
      console.error('storybible/index.json is unrecognizable; refusing to overwrite it.')
    }
  } catch (error) {
    loadFailed = true
    console.error('storybible/index.json could not be read; refusing to overwrite it.', error)
  }
}

// Caches the in-flight promise, not a boolean: a plain `loaded` flag set
// before the await lets a second concurrent caller (e.g. the mention rollup
// racing the index fetch on startup) return while `state` is still empty.
// Every caller awaits the same load.
let loadPromise: Promise<void> | null = null

function load(): Promise<void> {
  if (!loadPromise) loadPromise = readFromDisk()
  return loadPromise
}

function persist(): Promise<void> {
  if (loadFailed) {
    console.error('Refusing to write storybible/index.json: the file on disk could not be read.')
    return Promise.resolve()
  }
  return atomicWrite(indexPath(), JSON.stringify(state, null, 2))
}

/** Forces the next read to come from disk — used after a backup restore or
 *  a switch to a different project folder, mirroring binderStore's own
 *  invalidateCache (see that file's comment for why resetting state matters,
 *  not just the `loaded` flag). */
export function invalidateCache(): void {
  loadPromise = null
  state = emptyState()
  loadFailed = false
}

export async function getState(): Promise<StoryBibleState> {
  await load()
  return { items: state.items, types: state.types }
}

/** Sync, like binderStore.getNode — relies on the renderer already having
 *  fetched getState() at least once this session before any UI that could
 *  call this (e.g. the delete-confirm handler) is reachable. */
export function getItem(id: string): StoryBibleItem | null {
  return state.items.find((item) => item.id === id) ?? null
}

export async function createItem(typeId: string, name = 'Untitled'): Promise<StoryBibleItem> {
  await load()
  const now = new Date().toISOString()
  const item: StoryBibleItem = { id: randomUUID(), typeId, name, aliases: [], summary: '', createdAt: now, updatedAt: now }
  state.items.push(item)
  await persist()
  return item
}

/** Renaming auto-tracks the old name as an alias (deduped, case-insensitive)
 *  so chapters already written under it keep matching — see
 *  StoryBibleItem.aliases. */
export async function renameItem(id: string, name: string): Promise<void> {
  await load()
  const item = state.items.find((i) => i.id === id)
  if (!item) return
  const trimmed = name.trim()
  if (!trimmed) return
  const oldName = item.name
  if (oldName && oldName.toLowerCase() !== trimmed.toLowerCase()) {
    const exists = item.aliases.some((a) => a.toLowerCase() === oldName.toLowerCase())
    if (!exists) item.aliases.push(oldName)
  }
  item.name = trimmed
  item.updatedAt = new Date().toISOString()
  await persist()
}

export async function setItemAliases(id: string, aliases: string[]): Promise<void> {
  await load()
  const item = state.items.find((i) => i.id === id)
  if (!item) return
  item.aliases = aliases.map((a) => a.trim()).filter(Boolean)
  item.updatedAt = new Date().toISOString()
  await persist()
}

export async function setItemType(id: string, typeId: string): Promise<void> {
  await load()
  const item = state.items.find((i) => i.id === id)
  if (!item) return
  item.typeId = typeId
  item.updatedAt = new Date().toISOString()
  await persist()
}

export async function setItemSummary(id: string, summary: string): Promise<void> {
  await load()
  const item = state.items.find((i) => i.id === id)
  if (!item) return
  item.summary = summary
  item.updatedAt = new Date().toISOString()
  await persist()
}

/** Replaces the whole type list. Items referencing a removed type just keep
 *  their (now-dangling) typeId — the browse grid resolves it with a
 *  fallback label, the same way status/tag chips already handle a
 *  since-deleted status/tag elsewhere in the app. */
export async function setTypes(types: StoryBibleTypeDef[]): Promise<void> {
  await load()
  state.types = types
  await persist()
}

/** Deletes an item, its sheet, and every image its sheet referenced —
 *  mirroring binderStore.deleteNode's cascade to the document/snapshot/
 *  span-tag stores, so nothing is left orphaned on disk. */
export async function deleteItem(id: string): Promise<void> {
  await load()
  const index = state.items.findIndex((i) => i.id === id)
  if (index === -1) return

  const sheet = await getSheet(id)
  const imageIds = sheet.blocks
    .filter((block) => block.kind === 'image' && block.imageId)
    .map((block) => (block as { imageId: string }).imageId)
  await Promise.all(imageIds.map((imageId) => deleteImage(imageId)))
  await deleteSheet(id)

  state.items.splice(index, 1)
  await persist()
}
