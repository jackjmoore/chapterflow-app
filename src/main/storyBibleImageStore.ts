import { randomUUID } from 'crypto'
import { copyFile, mkdir, readFile, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { extname, join } from 'path'
import { BrowserWindow, dialog } from 'electron'
import { getProjectRoot } from './projectRoot'

// Reference photos, not a media library — keeps the base64-over-IPC payload
// (see getImageDataUri) and the on-disk footprint reasonable.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

function imagesDir(): string {
  return join(getProjectRoot(), 'storybible', 'images')
}

function pathFor(imageId: string): string {
  return join(imagesDir(), imageId)
}

/** Opens a native file picker and copies the chosen image into the project
 *  folder — never referenced by its original external path, so the project
 *  stays portable if it moves. Returns the new image's id (its filename,
 *  including extension), or null if the picker was cancelled. */
export async function importImage(event: Electron.IpcMainInvokeEvent): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  }
  const result = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const info = await stat(sourcePath)
  if (info.size > MAX_IMAGE_BYTES) {
    throw new Error('That image is larger than 8MB — pick a smaller file.')
  }

  const ext = extname(sourcePath).toLowerCase() || '.png'
  const imageId = `${randomUUID()}${ext}`
  await mkdir(imagesDir(), { recursive: true })
  await copyFile(sourcePath, pathFor(imageId))
  return imageId
}

/** Reads an image back as a data URI — the renderer's CSP allows `data:`
 *  image sources but not `file:`, and this matches how document content is
 *  already returned directly over IPC rather than as a URL. */
export async function getImageDataUri(imageId: string): Promise<string | null> {
  const filePath = pathFor(imageId)
  if (!existsSync(filePath)) return null
  const buffer = await readFile(filePath)
  const mime = MIME_BY_EXT[extname(imageId).toLowerCase()] ?? 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

export async function deleteImage(imageId: string): Promise<void> {
  try {
    await unlink(pathFor(imageId))
  } catch {
    // already gone — fine
  }
}
