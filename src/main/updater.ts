import { BrowserWindow, ipcMain, app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../shared/update'

const { autoUpdater } = electronUpdater

/**
 * Update checking via electron-updater against GitHub Releases.
 *
 * Two deliberate constraints:
 *
 * 1. Nothing happens without the user asking. autoDownload and
 *    autoInstallOnAppQuit are both off, so finding an update only produces a
 *    notification — the download is a separate explicit choice, and so is
 *    restarting to apply it. An update never lands mid-sentence.
 *
 * 2. This only ever replaces the application. Manuscripts live in the user's
 *    own project folder (Documents/ChapterFlow by default, or wherever Open
 *    Project pointed), preferences and backups live under userData, and the
 *    installer writes to neither. Uninstall keeps userData too — see
 *    deleteAppDataOnUninstall in electron-builder.yml.
 */

let statusWindow: BrowserWindow | null = null
let lastStatus: UpdateStatus = { state: 'idle', version: app.getVersion() }

/**
 * electron-updater's errors arrive as a wall of HTTP headers and cookies.
 * None of that is actionable, so it is reduced to the one sentence a person
 * can do something about.
 */
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/404/.test(raw)) {
    return 'No releases found. The update source may not exist yet, or has no published release.'
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network/i.test(raw)) {
    return 'Could not reach the update server. Check your connection and try again.'
  }
  // Anything else: first line only, so a stack or header dump can't take over.
  return raw.split('\n')[0].slice(0, 200)
}

function push(status: UpdateStatus): void {
  lastStatus = status
  statusWindow?.webContents.send('update:status', status)
}

export function initUpdater(window: BrowserWindow): void {
  statusWindow = window

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // Routed to the renderer rather than a console nobody sees.
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => push({ state: 'checking', version: app.getVersion() }))

  autoUpdater.on('update-available', (info) =>
    push({
      state: 'available',
      version: app.getVersion(),
      newVersion: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
      releaseDate: info.releaseDate ?? null
    })
  )

  autoUpdater.on('update-not-available', () =>
    push({ state: 'up-to-date', version: app.getVersion(), checkedAt: new Date().toISOString() })
  )

  autoUpdater.on('download-progress', (progress) =>
    push({ state: 'downloading', version: app.getVersion(), percent: Math.round(progress.percent) })
  )

  autoUpdater.on('update-downloaded', (info) =>
    push({ state: 'ready', version: app.getVersion(), newVersion: info.version })
  )

  autoUpdater.on('error', (error) =>
    push({
      state: 'error',
      version: app.getVersion(),
      message: readableError(error)
    })
  )

  ipcMain.handle('update:getStatus', () => lastStatus)

  ipcMain.handle('update:check', async () => {
    // A dev run has no update metadata to compare against, and electron-updater
    // throws rather than returning — reported plainly instead of surfacing a
    // stack trace the user can do nothing about.
    if (!app.isPackaged) {
      push({
        state: 'error',
        version: app.getVersion(),
        message: 'Update checking only works in an installed build.'
      })
      return lastStatus
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      push({
        state: 'error',
        version: app.getVersion(),
        message: readableError(error)
      })
    }
    return lastStatus
  })

  /** Explicit download — never triggered by the check itself. */
  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      push({
        state: 'error',
        version: app.getVersion(),
        message: readableError(error)
      })
    }
    return lastStatus
  })

  /**
   * Restart and apply. Only reachable from a button the user presses after
   * being told an update is ready, and only after the renderer has flushed
   * pending edits — the same guarantee a normal quit gives.
   */
  ipcMain.handle('update:installNow', () => {
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })

  ipcMain.handle('update:getVersion', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    packaged: app.isPackaged
  }))
}
