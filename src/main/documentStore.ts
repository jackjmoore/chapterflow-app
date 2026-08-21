import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { onDocumentDeleted } from './searchIndex'

function pathFor(id: string): string {
  return join(getProjectRoot(), 'documents', `${id}.html`)
}

export async function loadDocument(id: string): Promise<string> {
  const filePath = pathFor(id)
  if (!existsSync(filePath)) return ''
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export function saveDocument(id: string, html: string): Promise<void> {
  return atomicWrite(pathFor(id), html)
}

export async function deleteDocument(id: string): Promise<void> {
  try {
    await unlink(pathFor(id))
  } catch {
    // already gone, or never had content saved — fine
  }
  // atomicWrite never sees a delete, so this is the one place the search
  // index has to be told directly.
  onDocumentDeleted(id)
}
