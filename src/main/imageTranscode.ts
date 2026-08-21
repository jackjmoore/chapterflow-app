import { BrowserWindow } from 'electron'

/**
 * WebP → PNG.
 *
 * Needed because OOXML has no WebP representation at all: a .docx can hold
 * jpg, png, gif or bmp and nothing else, so a WebP that displays perfectly in
 * the editor and exports fine to PDF would silently vanish from a Word
 * export. Converting once, at import, means the stored file is already a
 * format every export path can carry.
 *
 * The conversion runs through a hidden Chromium window rather than a native
 * image library because Electron's own `nativeImage` cannot decode WebP —
 * verified directly: createFromBuffer() on WebP bytes returns an empty image
 * with a 0×0 size. Chromium's `<img>` decoder handles it, and canvas
 * re-encodes to PNG, so this needs no new dependency and no native module.
 */
export async function transcodeWebpToPng(webp: Buffer): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true }
  })

  try {
    await window.loadURL('data:text/html,<html><body></body></html>')
    const dataUri = `data:image/webp;base64,${webp.toString('base64')}`
    // Drawn at the image's intrinsic size, so the PNG keeps the original
    // pixel dimensions the export's own scaling then works from.
    const pngDataUrl: string = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => reject(new Error('Could not decode that WebP image.'))
        img.src = ${JSON.stringify(dataUri)}
      })
    `)
    return Buffer.from(pngDataUrl.split(',')[1], 'base64')
  } finally {
    // destroy() rather than close(): close() is cancellable and fires the
    // usual lifecycle events, and this window must never outlive the call.
    if (!window.isDestroyed()) window.destroy()
  }
}
