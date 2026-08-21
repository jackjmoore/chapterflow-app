import { randomUUID } from 'crypto'
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { extname, join } from 'path'
import { BrowserWindow, dialog } from 'electron'
import { getProjectRoot } from './projectRoot'
import { transcodeWebpToPng } from './imageTranscode'

// Same contract as storyBibleImageStore: images are copied into the project
// folder and referenced by id, never by their original external path, so a
// project stays portable when it moves. Kept as its own store (and its own
// folder) rather than sharing that one because these belong to the manuscript
// — they get exported into the PDF/docx, and deleting a Story Bible sheet
// must never take a manuscript illustration with it.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

function imagesDir(): string {
  return join(getProjectRoot(), 'documents', 'images')
}

function pathFor(imageId: string): string {
  return join(imagesDir(), imageId)
}

/** Opens a native picker and copies the chosen image into the project.
 *  Returns the new image's id (its filename, including extension), or null
 *  if the picker was cancelled. */
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
  await mkdir(imagesDir(), { recursive: true })

  // WebP is converted to PNG here, once, rather than at every export: Word
  // documents cannot hold WebP at all, so storing the original would leave an
  // image that displays in the editor and in PDF but silently disappears from
  // a .docx. Deliberately invisible — the picker accepts WebP and it simply
  // works everywhere afterwards.
  if (ext === '.webp') {
    const imageId = `${randomUUID()}.png`
    const png = await transcodeWebpToPng(await readFile(sourcePath))
    await writeFile(pathFor(imageId), png)
    return imageId
  }

  const imageId = `${randomUUID()}${ext}`
  await copyFile(sourcePath, pathFor(imageId))
  return imageId
}

/** Reads an image back as a data URI — the renderer's CSP allows `data:`
 *  image sources but not `file:`. */
export async function getImageDataUri(imageId: string): Promise<string | null> {
  const filePath = pathFor(imageId)
  if (!existsSync(filePath)) return null
  const buffer = await readFile(filePath)
  const mime = MIME_BY_EXT[extname(imageId).toLowerCase()] ?? 'application/octet-stream'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/** Raw bytes plus mime — what the docx renderer needs, since ImageRun takes a
 *  buffer rather than a data URI.
 *
 *  Images imported before WebP transcoding existed are still stored as .webp
 *  on disk, and Word cannot hold those. Rather than migrate the files (which
 *  would mean rewriting the image id inside every document's saved HTML, since
 *  the id *is* the filename), they're converted here, in memory, on the way
 *  into an export. Costs one conversion per export for those older files and
 *  nothing at all for new ones, and no stored data has to be rewritten. */
export async function readImageBytes(
  imageId: string
): Promise<{ data: Buffer; mime: string } | null> {
  const filePath = pathFor(imageId)
  if (!existsSync(filePath)) return null
  const data = await readFile(filePath)
  const mime = MIME_BY_EXT[extname(imageId).toLowerCase()] ?? 'application/octet-stream'
  if (mime === 'image/webp') {
    try {
      return { data: await transcodeWebpToPng(data), mime: 'image/png' }
    } catch {
      // An unreadable legacy file degrades to a skipped image, exactly as
      // before — never to a failed export of the whole manuscript.
      return null
    }
  }
  return { data, mime }
}

/** Resolves many ids at once — one IPC round trip when a document opens,
 *  rather than one per image. */
export async function getImageDataUris(imageIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of imageIds) {
    const uri = await getImageDataUri(id)
    if (uri) out[id] = uri
  }
  return out
}

export async function deleteImage(imageId: string): Promise<void> {
  try {
    await unlink(pathFor(imageId))
  } catch {
    // already gone — fine
  }
}
