import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { onSheetDeleted } from './searchIndex'
import type { StoryBibleBlock, StoryBibleSheet } from '../shared/storyBible'

function pathFor(itemId: string): string {
  return join(getProjectRoot(), 'storybible', 'sheets', `${itemId}.json`)
}

export async function getSheet(itemId: string): Promise<StoryBibleSheet> {
  const filePath = pathFor(itemId)
  if (!existsSync(filePath)) return { itemId, blocks: [] }
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8'))
    if (parsed && Array.isArray(parsed.blocks)) return { itemId, blocks: parsed.blocks as StoryBibleBlock[] }
  } catch {
    // corrupt or unreadable — treat as an empty sheet rather than crash
  }
  return { itemId, blocks: [] }
}

export function saveSheet(itemId: string, blocks: StoryBibleBlock[]): Promise<void> {
  return atomicWrite(pathFor(itemId), JSON.stringify({ version: 1, itemId, blocks }, null, 2))
}

export async function deleteSheet(itemId: string): Promise<void> {
  try {
    await unlink(pathFor(itemId))
  } catch {
    // already gone, or never had content — fine
  }
  // atomicWrite never sees a delete, so this is the one place the search index
  // has to be told directly — the same arrangement documentStore.deleteDocument
  // has with onDocumentDeleted, and for the same reason.
  onSheetDeleted(itemId)
}
