import { app, shell, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from '../../resources/icon.png?asset'
import * as binderStore from './binderStore'
import * as documentStore from './documentStore'
import * as wordCountStore from './wordCountStore'
import * as preferencesStore from './preferencesStore'
import * as backupStore from './backupStore'
import * as snapshotStore from './snapshotStore'
import * as spanTagStore from './spanTagStore'
import * as commentStore from './commentStore'
import * as lexiconStore from './lexiconStore'
import * as suppressedWordStore from './suppressedWordStore'
import * as searchIndex from './searchIndex'
import * as lifetimeStore from './lifetimeStore'
import * as searchRank from './searchRank'
import * as searchHistoryStore from './searchHistoryStore'
import * as documentImageStore from './documentImageStore'
import * as storyBibleStore from './storyBibleStore'
import * as storyBibleSheetStore from './storyBibleSheetStore'
import * as storyBibleImageStore from './storyBibleImageStore'
import * as mentionStore from './mentionStore'
import * as submissionStore from './submissionStore'
import * as compileStore from './compileStore'
import * as compileSettingsStore from './compileSettingsStore'
import * as timelineStore from './timelineStore'
import * as relationshipStore from './relationshipStore'
import * as sessionStore from './sessionStore'
import * as sprintStore from './sprintStore'
import { getProjectRoot, setProjectRoot, projectExistsAt } from './projectRoot'
import type { Theme, TypographyDefaults, PageSize, PageViewMode } from '../shared/preferences'
import { draftChildren, matterFolder } from '../shared/binder'
import * as scrivenerWordlist from './import/scrivenerWordlist'
import * as scrivenerImport from './import/scrivener'
import type { ScrivenerProjectImportResult } from '../shared/scrivenerImport'
import type { ActiveView, BinderNode, ManuscriptView, OutlinerSort, StatusDef, TagDef, SavedView } from '../shared/binder'
import type { ItemMentionStat, StoryBibleBlock, StoryBibleTypeDef } from '../shared/storyBible'
import type { CommentRecord } from '../shared/comments'
import type { LexiconEntry } from '../shared/lexicon'
import type { SearchQueryOptions } from '../shared/search'
import type { ExportFormat } from '../shared/export'
import type { TemplateId } from '../shared/templates'
import type { ToolbarSectionId } from '../shared/toolbarSections'
import type { LayoutPreset } from '../shared/layoutPresets'
import type { CustomTheme } from '../shared/customThemes'
import {
  renderDocumentExport,
  renderProjectExport,
  renderProjectCompile,
  renderDocumentHtml,
  renderProjectHtml,
  printHtml,
  buildPrintableHtml,
  EXPORT_EXTENSIONS,
  EXPORT_FILTER_NAMES
} from './export'
import type { ExportOptions, ExportPreset } from '../shared/export'
import { filterTreeByScope, summarizeScope } from '../shared/compile'
import type { CompilePreset, CompileScope, CompileSettings } from '../shared/compile'
import { validateCompileScope } from './compile/validate'
import type { CompileFinding } from '../shared/compileValidation'
import { isLookupKind, lookupUrl, type LookupKind } from '../shared/lookup'
import { parseImportFile, IMPORT_EXTENSIONS } from './import'
import type { ImportFailure, ImportResult, ImportWarningKind, ImportedDocument } from '../shared/import'
import type { SubmissionStatus } from '../shared/submissions'
import type { TimelineDraft } from '../shared/timeline'
import type { RelationshipDraft } from '../shared/relationships'
import { sessionsToCsv, type OpenSession } from '../shared/sessions'
import type { Sprint } from '../shared/sprints'
import { applyTemplate, createFrontMatter, createBackMatter } from './templates'
import { initUpdater } from './updater'

const QUIT_FLUSH_TIMEOUT_MS = 2500

const TITLE_BAR_COLORS: Record<Theme, { color: string; symbolColor: string }> = {
  dark: { color: '#1c1a17', symbolColor: '#e8e3d9' },
  light: { color: '#f5f1e8', symbolColor: '#2b2620' }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled'
}

/** Fires a full project mention rescan in the background (not awaited by the
 *  triggering IPC handler — see mentionStore.rescanProject's own comment on
 *  why this can be slow) and pushes a notification once it's done so the
 *  renderer can refresh its mention rollup, mirroring the existing
 *  `app:before-quit`-style main -> renderer push pattern. */
function triggerMentionRescan(event: Electron.IpcMainInvokeEvent): void {
  const window = BrowserWindow.fromWebContents(event.sender)
  void mentionStore.rescanProject().then(() => window?.webContents.send('storyBible:mentionsUpdated'))
}

/**
 * Assembles the styling inputs every render needs. Page size and margins come
 * from the project's page setup — the same values driving the editor's page
 * count — so export, print, and preview finally agree; before this they were
 * hardcoded to Letter with fixed margins in the PDF path.
 */
async function buildExportOptions(preset: ExportPreset, title: string): Promise<ExportOptions> {
  // The book preset exists only in the compile section: its folio sequences
  // and recto/verso seating cohere for a whole project, not a menu export.
  if (preset === 'book') throw new Error('The book style compiles from the Compile section only.')
  const [pageSize, marginMm, authorName, compileSettings] = await Promise.all([
    preferencesStore.getPageSize(),
    preferencesStore.getPageMarginMm(),
    binderStore.getAuthorName(),
    // peek, not get: reading the scene-break marker here must not seed
    // compile.json — that stays tied to entering the compile section.
    compileSettingsStore.peekCompileSettings()
  ])
  return {
    preset,
    pageSize,
    marginMm,
    authorName,
    title,
    sceneBreakMark: compileSettings.sceneBreakMark,
    documentSeparation: compileSettings.documentSeparation
  }
}

/** Shared by both export IPC handlers: prompts for a save location (never
 *  writes anywhere the user didn't pick), renders the export, writes it. */
async function runExport(
  event: Electron.IpcMainInvokeEvent,
  suggestedName: string,
  format: ExportFormat,
  render: () => Promise<Buffer>
): Promise<{ saved: boolean; path?: string }> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const extension = EXPORT_EXTENSIONS[format]
  const result = window
    ? await dialog.showSaveDialog(window, {
        defaultPath: `${sanitizeFilename(suggestedName)}.${extension}`,
        filters: [{ name: EXPORT_FILTER_NAMES[format], extensions: [extension] }]
      })
    : await dialog.showSaveDialog({
        defaultPath: `${sanitizeFilename(suggestedName)}.${extension}`,
        filters: [{ name: EXPORT_FILTER_NAMES[format], extensions: [extension] }]
      })

  if (result.canceled || !result.filePath) return { saved: false }

  const buffer = await render()
  await writeFile(result.filePath, buffer)
  return { saved: true, path: result.filePath }
}

async function createWindow(): Promise<void> {
  const theme = await preferencesStore.getTheme()

  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    autoHideMenuBar: false,
    // The heron (scripts/make-app-icon.mjs). Packaged Windows takes the exe's
    // embedded build/icon.ico; this covers the dev window and Linux.
    icon: appIcon,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...TITLE_BAR_COLORS[theme], height: 32 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      spellcheck: true
    }
  })

  // No native application menu: titleBarStyle: 'hidden' means Windows never
  // renders one anyway (confirmed empirically — its accelerators silently
  // never fire). The custom MenuBar in the renderer is the only menu UI.
  Menu.setApplicationMenu(null)

  // Tracks whether the main editor (as opposed to the split-view editor, or
  // no editor) currently has focus — see the context-menu handler below.
  let editorFocused = false
  ipcMain.on('editor:setFocused', (_event, focused: boolean) => {
    editorFocused = focused
  })

  ipcMain.handle('editor:replaceMisspelling', (event, suggestion: string) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.replaceMisspelling(suggestion)
  })

  // OS spellcheck: Chromium's own checker (System locale, no custom
  // dictionary) already draws the red squiggles once spellcheck: true is set
  // above — this just supplies the right-click suggestions menu, since
  // Electron doesn't show one automatically.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    // The main editor (a contenteditable ProseMirror region, so
    // formControlType === 'none' — distinct from real <input>/<textarea>
    // elements like the binder rename field or find bar) gets one merged
    // menu drawn entirely in the renderer instead: spellcheck suggestions
    // forwarded here, plus Cut/Copy/Paste/Bold/Tag/Find. Not calling
    // .popup() below fully suppresses any native menu for this case — every
    // other editable surface (including the split-view editor, which never
    // reports editorFocused) falls through to the unchanged code beneath.
    if (params.isEditable && params.formControlType === 'none' && editorFocused) {
      mainWindow.webContents.send('editor-context-menu', {
        x: params.x,
        y: params.y,
        misspelledWord: params.misspelledWord,
        dictionarySuggestions: params.dictionarySuggestions.slice(0, 6),
        hasSelection: !!params.selectionText
      })
      return
    }

    const items: MenuItemConstructorOptions[] = []

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length === 0) {
        items.push({ label: 'No suggestions', enabled: false })
      } else {
        for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
          items.push({ label: suggestion, click: () => mainWindow.webContents.replaceMisspelling(suggestion) })
        }
      }
      // Adds to this project's own word list — deliberately NOT
      // session.addWordToSpellCheckerDictionary, which would write the word
      // into the operating system's dictionary and teach it to every other
      // app on the machine.
      const misspelled = params.misspelledWord
      items.push({
        label: 'Add to Dictionary',
        click: () => {
          void suppressedWordStore.addPhrase(misspelled, 'lexicon').then(() => {
            backupStore.markDirty()
            mainWindow.webContents.send('lexicon:suppressedWordsChanged')
          })
        }
      })
      items.push({ type: 'separator' })
    }

    if (params.isEditable) {
      items.push(
        { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste }
      )
    } else if (params.selectionText) {
      items.push({ label: 'Copy', role: 'copy' })
    }

    if (items.length === 0) return
    Menu.buildFromTemplate(items).popup()
  })

  // Update checking is bound to this window so status can be pushed to it.
  // Nothing is checked automatically at startup — see updater.ts.
  initUpdater(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Give the renderer a chance to flush any pending autosave before the
  // window actually closes, so a normal quit never loses in-flight edits.
  // (A hard kill/crash bypasses this entirely — that's what the periodic
  // max-wait autosave in the renderer is for.)
  let readyToClose = false
  mainWindow.on('close', (event) => {
    if (readyToClose) return
    event.preventDefault()

    const timeout = setTimeout(() => {
      readyToClose = true
      mainWindow.close()
    }, QUIT_FLUSH_TIMEOUT_MS)

    ipcMain.once('app:flush-complete', () => {
      clearTimeout(timeout)
      readyToClose = true
      mainWindow.close()
    })

    mainWindow.webContents.send('app:before-quit')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.chapterflow.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Restore whichever project folder was last open (Open Project persists
  // this) before anything else touches the project data — must happen before
  // the window loads so every store reads/writes the right location from the start.
  const persistedRoot = await preferencesStore.getProjectRoot()
  if (persistedRoot) setProjectRoot(persistedRoot)

  const startupRoot = getProjectRoot()
  if (projectExistsAt(startupRoot)) {
    void binderStore
      .getState()
      .then((state) => lifetimeStore.recordProjectOpened(startupRoot, state.projectName))
      .catch(() => undefined)
  }

  // The search index listens to every project write from here on. Building it
  // is not awaited: the window should not wait on indexing, and any write that
  // lands first is picked up by the same hook rather than being missed.
  searchIndex.install()
  void searchIndex.open()

  ipcMain.handle('binder:getState', () => binderStore.getState())

  ipcMain.handle('binder:createDocument', async (_event, parentId: string | null) => {
    const node = await binderStore.createDocument(parentId)
    backupStore.markDirty()
    return node
  })

  ipcMain.handle('binder:createFolder', async (_event, parentId: string | null) => {
    const node = await binderStore.createFolder(parentId)
    backupStore.markDirty()
    return node
  })

  // --- Scrivener personal dictionary ------------------------------------
  //
  // Scanning and parsing only. Nothing is written until the writer has seen
  // the actual words and confirmed them: this file is machine-wide, so it
  // routinely holds names from other people's manuscripts and the occasional
  // accepted typo.
  ipcMain.handle('scrivener:scanWordlists', async () => {
    const scan = scrivenerWordlist.scanForWordlists()
    const parsed = await Promise.all(
      scan.found.map(async (location) => {
        try {
          return await scrivenerWordlist.readWordlist(location, location.path)
        } catch (error) {
          return {
            location,
            words: [],
            duplicates: 0,
            empty: true,
            error: (error as Error).message
          }
        }
      })
    )
    return { ambiguous: scan.ambiguous, candidates: parsed, searched: scrivenerWordlist.knownWordlistPaths() }
  })

  /** The fallback when neither known location exists — a picker rather than a
   *  dead end. */
  ipcMain.handle('scrivener:pickWordlist', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a Scrivener word list',
      properties: ['openFile'],
      filters: [
        { name: 'Scrivener word list', extensions: ['txt', 'ini'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    try {
      const parsed = await scrivenerWordlist.readWordlist(null, result.filePaths[0])
      return { canceled: false, parsed: { ...parsed, path: result.filePaths[0] } }
    } catch (error) {
      return { canceled: false, error: (error as Error).message }
    }
  })

  /** Adds the chosen words to this project's Lexicon. addEntry is idempotent
   *  per word and registers each one with the spellchecker, which is what a
   *  personal dictionary is for. */
  /** Adds the chosen words to this project's Lexicon in one pass. Each entry
   *  also registers its word with the spellchecker, which is what a personal
   *  dictionary is for. */
  ipcMain.handle('scrivener:importWords', async (_event, words: string[]) => {
    const outcome = await lexiconStore.addEntries(words)
    if (outcome.added > 0) {
      backupStore.markDirty()
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('lexicon:suppressedWordsChanged'))
    }
    return outcome
  })

  ipcMain.handle('binder:createTopLevelFolder', async (_event, name?: string) => {
    const node = await binderStore.createTopLevelFolder(name)
    backupStore.markDirty()
    return node
  })

  // Toolbar/menu "new document"/"new folder": placed relative to the
  // selected node rather than always nested inside it — see insertNear in
  // binderStore for why a selected document lands a sibling next to it
  // instead of gaining an unwanted child.
  ipcMain.handle('binder:createDocumentNear', async (_event, targetId: string | null) => {
    const node = await binderStore.createDocumentNear(targetId)
    backupStore.markDirty()
    return node
  })

  ipcMain.handle('binder:createFolderNear', async (_event, targetId: string | null) => {
    const node = await binderStore.createFolderNear(targetId)
    backupStore.markDirty()
    return node
  })

  ipcMain.handle('binder:rename', async (_event, id: string, name: string) => {
    await binderStore.rename(id, name)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:duplicate', async (_event, id: string) => {
    const node = await binderStore.duplicateNode(id)
    backupStore.markDirty()
    return node
  })

  ipcMain.handle('binder:setCollapsed', async (_event, id: string, collapsed: boolean) => {
    await binderStore.setCollapsed(id, collapsed)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setLastOpenDocument', (_event, id: string | null) =>
    binderStore.setLastOpenDocument(id)
  )

  ipcMain.handle('binder:setNotes', async (_event, id: string, notes: string) => {
    await binderStore.setNotes(id, notes)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setSynopsis', async (_event, id: string, synopsis: string) => {
    await binderStore.setSynopsis(id, synopsis)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setStatusId', async (_event, id: string, statusId: string | null) => {
    await binderStore.setStatusId(id, statusId)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setTagIds', async (_event, id: string, tagIds: string[]) => {
    await binderStore.setTagIds(id, tagIds)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setWordTarget', async (_event, id: string, target: number | null) => {
    await binderStore.setWordTarget(id, target)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setChapterNumber', async (_event, id: string, chapterNumber: number | null) => {
    await binderStore.setChapterNumber(id, chapterNumber)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setFolderIsPart', async (_event, id: string, isPart: boolean) => {
    await binderStore.setFolderIsPart(id, isPart)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setStatuses', async (_event, statuses: StatusDef[]) => {
    await binderStore.setStatuses(statuses)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setTags', async (_event, tags: TagDef[]) => {
    await binderStore.setTags(tags)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setSavedViews', async (_event, views: SavedView[]) => {
    await binderStore.setSavedViews(views)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setOverusedIgnoreList', async (_event, words: string[]) => {
    await binderStore.setOverusedIgnoreList(words)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setAuthorName', async (_event, name: string | null) => {
    await binderStore.setAuthorName(name)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setProjectWordTarget', async (_event, target: number | null) => {
    await binderStore.setProjectWordTarget(target)
    backupStore.markDirty()
  })

  ipcMain.handle('binder:setProjectDeadline', async (_event, deadline: string | null) => {
    await binderStore.setProjectDeadline(deadline)
    backupStore.markDirty()
  })

  ipcMain.handle(
    'binder:setProjectTargetStart',
    async (_event, date: string | null, count: number | null) => {
      await binderStore.setProjectTargetStart(date, count)
      backupStore.markDirty()
    }
  )

  ipcMain.handle('binder:setActiveView', (_event, view: ActiveView) => binderStore.setActiveView(view))

  ipcMain.handle('binder:setManuscriptView', (_event, view: ManuscriptView) =>
    binderStore.setManuscriptView(view)
  )

  ipcMain.handle('binder:setOutlinerSort', (_event, sort: OutlinerSort | null) =>
    binderStore.setOutlinerSort(sort)
  )

  ipcMain.handle('binder:setOutlinerFilter', (_event, filter: string) => binderStore.setOutlinerFilter(filter))

  ipcMain.handle('binder:setStatusFilter', (_event, statusIds: string[]) => binderStore.setStatusFilter(statusIds))

  ipcMain.handle('binder:setTagFilter', (_event, tagIds: string[]) => binderStore.setTagFilter(tagIds))

  ipcMain.handle('binder:setReferenceDocumentId', (_event, id: string | null) =>
    binderStore.setReferenceDocumentId(id)
  )

  ipcMain.handle('binder:setSplitViewLocked', (_event, locked: boolean) => binderStore.setSplitViewLocked(locked))

  ipcMain.handle('binder:setSplitViewSyncScroll', (_event, sync: boolean) =>
    binderStore.setSplitViewSyncScroll(sync)
  )

  ipcMain.handle('binder:setProjectName', async (_event, name: string) => {
    await binderStore.setProjectName(name)
    backupStore.markDirty()
  })

  ipcMain.handle(
    'binder:move',
    async (_event, id: string, targetParentId: string | null, targetIndex: number) => {
      await binderStore.moveNode(id, targetParentId, targetIndex)
      backupStore.markDirty()
    }
  )

  // The confirmation itself is the renderer's job now — an in-app modal
  // (ConfirmModal, styled with the rest of the app) rather than this OS
  // dialog. By the time this handler runs, the writer has already confirmed;
  // it deletes unconditionally, the same as every other binder mutation here.
  ipcMain.handle('binder:delete', async (_event, id: string) => {
    const node = binderStore.getNode(id)
    if (!node) return { deleted: false }

    const documentIds = await binderStore.deleteNode(id)
    await Promise.all(documentIds.map((docId) => mentionStore.deleteAllForDocument(docId)))
    // Comment bodies live outside the document file, so deleting the document
    // has to take them with it or they'd outlive the text they annotate.
    await Promise.all(documentIds.map((docId) => commentStore.deleteAllForDocument(docId)))
    // Submissions referencing a deleted document keep the record but lose the
    // (now-meaningless) document/snapshot link — see submissionStore.
    await Promise.all(documentIds.map((docId) => submissionStore.handleDocumentDeleted(docId)))
    backupStore.markDirty()
    return { deleted: true }
  })

  // Emptying Trash is the one destructive action in the app that leaves
  // nothing behind — binderStore.emptyTrash takes the snapshots with the
  // documents. As with binder:delete, the confirmation is the renderer's job
  // and has already happened by the time this runs; the cascade below is the
  // same one a delete performs, because the deletion itself is the same, only
  // wider and without a recovery path.
  ipcMain.handle('binder:emptyTrash', async () => {
    const documentIds = await binderStore.emptyTrash()
    await Promise.all(documentIds.map((docId) => mentionStore.deleteAllForDocument(docId)))
    await Promise.all(documentIds.map((docId) => commentStore.deleteAllForDocument(docId)))
    await Promise.all(documentIds.map((docId) => submissionStore.handleDocumentDeleted(docId)))
    if (documentIds.length) backupStore.markDirty()
    return { deleted: documentIds.length }
  })

  ipcMain.handle('submissions:getState', () => submissionStore.getState())

  ipcMain.handle('submissions:create', async (_event, draft: submissionStore.SubmissionDraft) => {
    const submission = await submissionStore.createSubmission(draft)
    backupStore.markDirty()
    return submission
  })

  ipcMain.handle('submissions:update', async (_event, id: string, patch: Partial<submissionStore.SubmissionDraft>) => {
    await submissionStore.updateSubmission(id, patch)
    backupStore.markDirty()
  })

  ipcMain.handle('submissions:delete', async (_event, id: string) => {
    await submissionStore.deleteSubmission(id)
    backupStore.markDirty()
  })

  ipcMain.handle('submissions:setStatuses', async (_event, statuses: SubmissionStatus[]) => {
    await submissionStore.setStatuses(statuses)
    backupStore.markDirty()
  })

  // Continuity board. Note what is deliberately absent: no cascade from
  // `binder:delete` or `storyBible:deleteItem` into this store. A timeline
  // entry keeps its ids when the thing they point at goes away, the board
  // renders them as visibly broken links, and `timeline:pruneReferences`
  // below drops them only when the user asks. That's what makes restoring a
  // backup relink an entry instead of leaving it permanently gutted.
  ipcMain.handle('timeline:getState', () => timelineStore.getState())

  ipcMain.handle('timeline:create', async (_event, draft: TimelineDraft) => {
    const entry = await timelineStore.createEntry(draft)
    backupStore.markDirty()
    return entry
  })

  ipcMain.handle('timeline:update', async (_event, id: string, patch: Partial<TimelineDraft>) => {
    await timelineStore.updateEntry(id, patch)
    backupStore.markDirty()
  })

  ipcMain.handle('timeline:delete', async (_event, id: string) => {
    await timelineStore.deleteEntry(id)
    backupStore.markDirty()
  })

  ipcMain.handle('timeline:move', async (_event, id: string, targetIndex: number) => {
    await timelineStore.moveEntry(id, targetIndex)
    backupStore.markDirty()
  })

  // Cleans up both kinds of dead reference the board can show — timeline links
  // and relationships — in one action, since the user sees them as one count.
  ipcMain.handle('timeline:pruneReferences', async () => {
    const [{ items }, documentIds] = await Promise.all([
      storyBibleStore.getState(),
      binderStore.getAllDocumentIds()
    ])
    const itemIds = items.map((item) => item.id)
    const [removedLinks, removedRelationships] = await Promise.all([
      timelineStore.pruneReferences(itemIds, documentIds),
      relationshipStore.pruneBrokenRelationships(itemIds)
    ])
    const removed = removedLinks + removedRelationships
    if (removed > 0) backupStore.markDirty()
    return removed
  })

  // Relationships. Note again what is absent: no cascade from
  // storyBible:deleteItem. A relationship keeps its ids when an item goes, the
  // board shows it as broken, and the prune above removes it only on request.
  // Writing sessions. The renderer owns detection (typing activity and the
  // live word count both live there); this side only persists.
  ipcMain.handle('session:getState', () => sessionStore.getState())

  ipcMain.handle('session:checkpoint', (_event, open: OpenSession) =>
    sessionStore.checkpointOpenSession(open)
  )

  ipcMain.handle('session:close', async (_event, open: OpenSession) => {
    const sealed = await sessionStore.closeSession(open)
    if (sealed) {
      backupStore.markDirty()
      // The one place the lifetime word total moves. Awaited, because unlike
      // the display figure above this is not recoverable — the session is
      // sealed once and its delta is never recomputed.
      await lifetimeStore.recordSession(sealed)
    }
    return sealed
  })

  /**
   * The other path that seals a session, and it has to move the lifetime total
   * exactly as session:close does.
   *
   * A session is left open by a crash, a force-quit, or File > Open Project
   * (which reloads without flushing). Recovering it wrote the session into the
   * project's own sessions.json — so the Progress page and the session
   * analytics counted it — while the dashboard's lifetime total never heard
   * about it. The two systems disagreed, permanently, because a sealed
   * session's delta is never recomputed.
   */
  ipcMain.handle('session:recoverOpen', async () => {
    const sealed = await sessionStore.recoverOpenSession()
    if (sealed) await lifetimeStore.recordSession(sealed)
    return sealed
  })

  // Sprints reference sessions by id and never create session records — see
  // sprintStore. Recording one is a single append.
  ipcMain.handle('sprint:getState', () => sprintStore.getState())

  ipcMain.handle('sprint:record', async (_event, sprint: Sprint) => {
    await sprintStore.recordSprint(sprint)
    backupStore.markDirty()
  })

  ipcMain.handle('preferences:getSpeech', () => preferencesStore.getSpeechPreferences())

  ipcMain.handle('preferences:setSpeech', (_event, next: { rate: number; voiceUri: string | null }) =>
    preferencesStore.setSpeechPreferences(next)
  )

  ipcMain.handle('preferences:getSprint', () => preferencesStore.getSprintPreferences())

  ipcMain.handle('preferences:setSprint', (_event, next: { softLockout: boolean; chime: boolean }) =>
    preferencesStore.setSprintPreferences(next)
  )

  ipcMain.handle('preferences:getIdleGapMinutes', () => preferencesStore.getIdleGapMinutes())

  ipcMain.handle('preferences:setIdleGapMinutes', (_event, minutes: number) =>
    preferencesStore.setIdleGapMinutes(minutes)
  )

  /** Writes session data wherever the user picks. CSV flattens documents to a
   *  name list; JSON keeps the record verbatim, ids and all. */
  ipcMain.handle('session:export', async (event, format: 'csv' | 'json') => {
    const [{ sessions }, state] = await Promise.all([sessionStore.getState(), binderStore.getState()])
    const names = new Map<string, string>()
    const walk = (nodes: typeof state.tree): void => {
      for (const node of nodes) {
        names.set(node.id, node.name)
        walk(node.children)
      }
    }
    walk(state.tree)

    const projectName = state.projectName || 'Untitled Project'
    const body =
      format === 'csv'
        ? sessionsToCsv(sessions, (id) => names.get(id) ?? 'Deleted document')
        : JSON.stringify({ project: projectName, exportedAt: new Date().toISOString(), sessions }, null, 2)

    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      defaultPath: `${sanitizeFilename(projectName)} sessions.${format}`,
      filters: [{ name: format === 'csv' ? 'CSV' : 'JSON', extensions: [format] }]
    }
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { saved: false }
    await writeFile(result.filePath, body, 'utf-8')
    return { saved: true, path: result.filePath }
  })

  ipcMain.handle('relationship:getState', () => relationshipStore.getState())

  ipcMain.handle('relationship:create', async (_event, draft: RelationshipDraft) => {
    const relationship = await relationshipStore.createRelationship(draft)
    backupStore.markDirty()
    return relationship
  })

  ipcMain.handle('relationship:update', async (_event, id: string, patch: Partial<RelationshipDraft>) => {
    await relationshipStore.updateRelationship(id, patch)
    backupStore.markDirty()
  })

  ipcMain.handle('relationship:delete', async (_event, id: string) => {
    await relationshipStore.deleteRelationship(id)
    backupStore.markDirty()
  })

  ipcMain.handle('storyBible:getIndex', () => storyBibleStore.getState())

  ipcMain.handle('storyBible:createItem', async (event, typeId: string, name: string) => {
    const item = await storyBibleStore.createItem(typeId, name)
    backupStore.markDirty()
    // A brand-new item's name might already appear in text written before it
    // existed — a full rescan catches that retroactively.
    triggerMentionRescan(event)
    return item
  })

  ipcMain.handle('storyBible:renameItem', async (event, id: string, name: string) => {
    await storyBibleStore.renameItem(id, name)
    backupStore.markDirty()
    triggerMentionRescan(event)
  })

  ipcMain.handle('storyBible:setItemType', async (_event, id: string, typeId: string) => {
    await storyBibleStore.setItemType(id, typeId)
    backupStore.markDirty()
  })

  ipcMain.handle('storyBible:setItemSummary', async (_event, id: string, summary: string) => {
    await storyBibleStore.setItemSummary(id, summary)
    backupStore.markDirty()
  })

  ipcMain.handle('storyBible:setItemAliases', async (event, id: string, aliases: string[]) => {
    await storyBibleStore.setItemAliases(id, aliases)
    backupStore.markDirty()
    triggerMentionRescan(event)
  })

  ipcMain.handle('storyBible:setTypes', async (_event, types: StoryBibleTypeDef[]) => {
    await storyBibleStore.setTypes(types)
    backupStore.markDirty()
  })

  ipcMain.handle('storyBible:deleteItem', async (event, id: string) => {
    const item = storyBibleStore.getItem(id)
    if (!item) return { deleted: false }

    const options = {
      type: 'warning' as const,
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      message: `Delete "${item.name}"?`,
      detail: 'This permanently deletes this item, its sheet, and any images on it. This cannot be undone.'
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)

    if (result.response !== 1) return { deleted: false }

    await storyBibleStore.deleteItem(id)
    await mentionStore.deleteAllForItem(id)
    backupStore.markDirty()
    return { deleted: true }
  })

  ipcMain.handle('storyBible:getSheet', (_event, itemId: string) => storyBibleSheetStore.getSheet(itemId))

  ipcMain.handle('storyBible:saveSheet', async (_event, itemId: string, blocks: StoryBibleBlock[]) => {
    await storyBibleSheetStore.saveSheet(itemId, blocks)
    backupStore.markDirty()
  })

  ipcMain.handle('storyBible:importImage', (event) => storyBibleImageStore.importImage(event))

  ipcMain.handle('storyBible:getImage', (_event, imageId: string) => storyBibleImageStore.getImageDataUri(imageId))

  ipcMain.handle('storyBible:deleteImage', (_event, imageId: string) => storyBibleImageStore.deleteImage(imageId))

  // Manuscript images — a separate store and folder from the Story Bible's
  // reference photos, since these get exported into the PDF/docx and must not
  // be collected by a Story Bible sheet deletion.
  ipcMain.handle('documentImage:import', (event) => documentImageStore.importImage(event))

  ipcMain.handle('documentImage:get', (_event, imageId: string) =>
    documentImageStore.getImageDataUri(imageId)
  )

  ipcMain.handle('documentImage:getMany', (_event, imageIds: string[]) =>
    documentImageStore.getImageDataUris(imageIds)
  )

  // Lexicon + the shared, APP-ONLY suppression list. Nothing here calls
  // session.addWordToSpellCheckerDictionary: that writes through to the
  // operating system dictionary on Windows 10+ and macOS, which would teach
  // the word to every other application on the machine. Suppression is done
  // entirely in the editor — see the SpellcheckSuppress extension.
  /** Reads the already-current index — nothing is scanned or parsed here. */
  ipcMain.handle('search:query', (_event, text: string, options?: SearchQueryOptions) =>
    searchIndex.query(text, options ?? {})
  )

  ipcMain.handle('search:stats', () => searchIndex.stats())

  /** One small file, already current. Nothing is scanned or aggregated here. */
  ipcMain.handle('dashboard:data', async () => {
    const root = getProjectRoot()
    if (projectExistsAt(root)) {
      await lifetimeStore.ensureProject(root, (await binderStore.getState()).projectName)
    }
    return lifetimeStore.getDashboardData(root)
  })

  ipcMain.handle('dashboard:forgetProject', (_event, path: string) => lifetimeStore.forgetProject(path))

  ipcMain.handle('dashboard:getSkipOnLaunch', () => preferencesStore.getSkipDashboardOnLaunch())

  ipcMain.handle('dashboard:setSkipOnLaunch', (_event, skip: boolean) =>
    preferencesStore.setSkipDashboardOnLaunch(skip)
  )

  // Reserved for the alternative editor skin. Read and written so the choice
  // survives a restart; nothing acts on it yet.
  ipcMain.handle('dashboard:getClassicMode', () => preferencesStore.getClassicMode())

  ipcMain.handle('dashboard:setClassicMode', (_event, enabled: boolean) =>
    preferencesStore.setClassicMode(enabled)
  )

  ipcMain.handle('dashboard:openProjectAt', async (_event, path: string) => {
    if (!projectExistsAt(path)) return false
    setProjectRoot(path)
    await preferencesStore.setProjectRootPref(path)
    await lifetimeStore.recordProjectOpened(path, (await binderStore.getState()).projectName)
    wordCountStore.invalidateAll()
    void searchIndex.open()
    return true
  })

  /** Ranked results — the same index read, put through the tier rules. */
  ipcMain.handle('search:ranked', (_event, text: string, options?: SearchQueryOptions) =>
    searchRank.search(text, options ?? {})
  )

  ipcMain.handle('search:history', () => searchHistoryStore.list())

  ipcMain.handle('search:recordHistory', (_event, text: string) => searchHistoryStore.record(text))

  ipcMain.handle('search:clearHistory', async () => {
    await searchHistoryStore.clear()
  })

  ipcMain.handle('lexicon:list', () => lexiconStore.listEntries())

  ipcMain.handle('lexicon:add', async (_event, word: string, meaning?: string, pronunciation?: string) => {
    const entry = await lexiconStore.addEntry(word, meaning ?? '', pronunciation ?? '')
    backupStore.markDirty()
    return entry
  })

  ipcMain.handle(
    'lexicon:update',
    async (_event, id: string, changes: Partial<Pick<LexiconEntry, 'word' | 'meaning' | 'pronunciation'>>) => {
      await lexiconStore.updateEntry(id, changes)
      backupStore.markDirty()
    }
  )

  ipcMain.handle('lexicon:delete', async (_event, id: string) => {
    await lexiconStore.deleteEntry(id)
    backupStore.markDirty()
  })

  ipcMain.handle('suppressedWords:list', () => suppressedWordStore.listWords())

  /* The same list with the source that asked for each word. The editor only
     needs the words; the Lexicon page needs to say which of them came from a
     Story Bible name, which is the half of the picture it never showed. */
  ipcMain.handle('suppressedWords:listEntries', () => suppressedWordStore.listEntries())

  /** Right-click "Add to Dictionary": suppresses the word in this project
   *  only, with no Lexicon entry and no OS involvement. */
  ipcMain.handle('suppressedWords:add', async (_event, word: string) => {
    await suppressedWordStore.addPhrase(word, 'lexicon')
    backupStore.markDirty()
  })

  ipcMain.handle('comment:list', () => commentStore.listComments())

  ipcMain.handle('comment:add', async (_event, record: CommentRecord) => {
    await commentStore.addComment(record)
    backupStore.markDirty()
  })

  ipcMain.handle(
    'comment:update',
    async (_event, id: string, changes: Partial<Pick<CommentRecord, 'body' | 'resolved'>>) => {
      await commentStore.updateComment(id, changes)
      backupStore.markDirty()
    }
  )

  ipcMain.handle('comment:delete', async (_event, id: string) => {
    await commentStore.deleteComment(id)
    backupStore.markDirty()
  })

  ipcMain.handle('storyBible:getMentionRollup', async () => {
    const [mentions, { items }] = await Promise.all([mentionStore.listMentions(), storyBibleStore.getState()])
    const validItemIds = new Set(items.map((i) => i.id))
    const rollup: Record<string, string[]> = {}
    for (const m of mentions) {
      if (!validItemIds.has(m.itemId)) continue
      const existing = rollup[m.documentId] ?? []
      if (!existing.includes(m.itemId)) existing.push(m.itemId)
      rollup[m.documentId] = existing
    }
    return rollup
  })

  ipcMain.handle('storyBible:getMentionStats', (_event, itemId: string) => mentionStore.getStatsForItem(itemId))

  /** Every item's stats in one read, keyed by item id. The card wall wears a
   *  mention count and a presence strip on every card, and asking per item
   *  would be one IPC round trip per entry over the same single file. */
  ipcMain.handle('storyBible:getAllMentionStats', async () => {
    const [mentions, { items }] = await Promise.all([mentionStore.listMentions(), storyBibleStore.getState()])
    const validItemIds = new Set(items.map((i) => i.id))
    const byItem: Record<string, ItemMentionStat[]> = {}
    for (const m of mentions) {
      if (!validItemIds.has(m.itemId)) continue
      const existing = byItem[m.itemId] ?? []
      existing.push({
        documentId: m.documentId,
        count: m.count,
        firstOffset: m.firstOffset,
        lastOffset: m.lastOffset
      })
      byItem[m.itemId] = existing
    }
    return byItem
  })

  ipcMain.handle('storyBible:setManualMention', async (_event, documentId: string, itemId: string, present: boolean) => {
    await mentionStore.setManualMention(documentId, itemId, present)
    backupStore.markDirty()
  })

  ipcMain.handle('document:load', (_event, id: string) => documentStore.loadDocument(id))

  ipcMain.handle('document:save', async (_event, id: string, html: string) => {
    await documentStore.saveDocument(id, html)
    wordCountStore.invalidate(id)
    // The project's size on the dashboard's Recent list, kept current by the
    // path that already knows the count changed. Not awaited and not allowed
    // to fail a save: it is a display figure, rebuilt on the next save if this
    // one is lost.
    void wordCountStore
      .projectWordCount()
      .then((words) => lifetimeStore.recordProjectWords(getProjectRoot(), words))
      .catch(() => undefined)
    backupStore.markDirty()
    await spanTagStore.rebuildForDocument(id, html)
    // Prunes comment bodies whose anchor the writer has deleted. Awaited
    // alongside the span-tag rebuild rather than fired off, because a comment
    // body is authored content — losing the ordering here could resurrect a
    // record the user just deleted.
    await commentStore.reconcileForDocument(id, html)
    // Not awaited: this shares a write-queue with the much slower full-project
    // rescan (triggered by Story Bible item edits), and every autosave must
    // never stall behind one already in flight. The renderer's mention
    // rollup is already eventually-consistent by design (debounced live
    // highlight, push-notified rescan), so this doesn't need to block the save.
    void mentionStore.rebuildAutoForDocument(id, html)
  })

  ipcMain.handle('export:document', async (event, id: string, format: ExportFormat, preset: ExportPreset = 'standard') => {
    const node = binderStore.getNode(id)
    const html = await documentStore.loadDocument(id)
    const title = node?.name ?? 'Untitled'
    const options = await buildExportOptions(preset, title)
    const suggested = preset === 'manuscript' ? `${title} (manuscript)` : title
    return runExport(event, suggested, format, () => renderDocumentExport(html, format, options))
  })

  // "Project" here means the manuscript: Draft's contents. Notes and Matter
  // are excluded from the quick menu paths — the compile panel is the
  // matter-aware pipeline.
  ipcMain.handle('export:project', async (event, format: ExportFormat, preset: ExportPreset = 'standard') => {
    const state = await binderStore.getState()
    const name = state.projectName || 'Untitled Project'
    const options = await buildExportOptions(preset, name)
    const suggested = preset === 'manuscript' ? `${name} (manuscript)` : name
    return runExport(event, suggested, format, () =>
      renderProjectExport(draftChildren(state.tree), state.projectName, format, options)
    )
  })

  // Printing renders exactly the same page the PDF export would, then hands it
  // to the system print dialog — not a second, separately-styled path.
  ipcMain.handle('print:document', async (_event, id: string, preset: ExportPreset = 'standard') => {
    const node = binderStore.getNode(id)
    const html = await documentStore.loadDocument(id)
    const options = await buildExportOptions(preset, node?.name ?? 'Untitled')
    return printHtml(await renderDocumentHtml(html, options), options)
  })

  ipcMain.handle('print:project', async (_event, preset: ExportPreset = 'standard') => {
    const state = await binderStore.getState()
    const options = await buildExportOptions(preset, state.projectName || 'Untitled Project')
    return printHtml(await renderProjectHtml(draftChildren(state.tree), options), options)
  })

  // Compiling is export:project's pipeline pointed at in-app storage instead
  // of a save dialog, with three substitutions: page setup comes from the
  // project's compile settings (never the editor's global Page Setup — see
  // compileSettingsStore), the tree is pruned to the requested scope first,
  // and the result lands in compiles/<id>/ as an immutable record.
  // The pre-flight check, standalone — the workbench's Run Checks button,
  // and the first leg of every compile (the renderer validates, shows the
  // findings, and only then calls compile:run with whatever was accepted).
  ipcMain.handle('compile:validate', (_event, scope: CompileScope, stylePreset: ExportPreset) =>
    validateCompileScope(scope, stylePreset)
  )

  ipcMain.handle(
    'compile:run',
    async (
      _event,
      name: string | null,
      scope: CompileScope,
      format: ExportFormat,
      stylePreset: ExportPreset,
      acceptedFindings: CompileFinding[] = []
    ) => {
      const [state, settings] = await Promise.all([
        binderStore.getState(),
        compileSettingsStore.getCompileSettings()
      ])
      // Draft is the manuscript: scope selection and the summary live on its
      // forest. Matter joins the output around it (front matter before, the
      // designated back-matter folder after), and Notes never compiles.
      const draftForest = draftChildren(state.tree)
      const scopeSummary = summarizeScope(draftForest, scope)
      if (scopeSummary.includedDocuments === 0) {
        throw new Error('The selected scope contains no manuscript documents.')
      }
      const title = state.projectName || 'Untitled Project'
      const options: ExportOptions = {
        preset: stylePreset,
        pageSize: settings.pageSize,
        marginMm: settings.marginMm,
        authorName: state.authorName,
        title,
        sceneBreakMark: settings.sceneBreakMark,
        bookTrim: settings.bookTrim,
        bookIncludeContents: settings.bookIncludeContents,
        documentSeparation: settings.documentSeparation,
        personalDetails: settings.personalDetails
      }
      const filteredDraft = filterTreeByScope(draftForest, scope)
      const matter = matterFolder(state.tree)
      const matterItems = matter ? (filterTreeByScope([matter], scope)[0]?.children ?? []) : []
      const matterBack = matterItems.filter((node) => node.id === settings.backMatterFolderId)
      const matterFront = matterItems.filter((node) => node.id !== settings.backMatterFolderId)
      // Passed as groups, not concatenated: the renderer gives matter its own
      // display-page treatment rather than the chapter-heading one.
      const { output, viewHtml } = await renderProjectCompile(filteredDraft, state.projectName, format, options, {
        front: matterFront,
        back: matterBack
      })
      // The recorded word count is the MANUSCRIPT's — matter appears in the
      // output but never in this number.
      const draftDocIds: string[] = []
      const collectIds = (nodes: BinderNode[]): void => {
        for (const node of nodes) {
          if (node.type === 'document') draftDocIds.push(node.id)
          collectIds(node.children)
        }
      }
      collectIds(filteredDraft)
      const wordCount = await wordCountStore.countForDocuments(draftDocIds)
      return compileStore.createCompile(
        {
          name: name?.trim() || title,
          format,
          stylePreset,
          scope,
          scopeSummary,
          pageSize: settings.pageSize,
          marginMm: settings.marginMm,
          ...(stylePreset === 'book' ? { bookTrim: settings.bookTrim } : {}),
          wordCount,
          warningsAccepted: acceptedFindings.length,
          // Only stored when something was actually waived — a clean compile
          // reads as clean by the field's absence, not an empty list.
          ...(acceptedFindings.length > 0 ? { acceptedFindings } : {})
        },
        output,
        viewHtml
      )
    }
  )

  ipcMain.handle('compile:list', () => compileStore.listCompiles())

  ipcMain.handle('compile:getView', (_event, id: string) => compileStore.getCompileView(id))

  // "Export a copy" writes the stored artifact's exact bytes to a location the
  // user picks — a re-render could differ if documents changed since.
  ipcMain.handle('compile:exportCopy', async (event, id: string) => {
    const meta = await compileStore.getCompile(id)
    return runExport(event, meta.name, meta.format, () => compileStore.readCompileOutput(id))
  })

  ipcMain.handle('compile:delete', (_event, id: string) => compileStore.deleteCompile(id))

  ipcMain.handle('compile:getSettings', () => compileSettingsStore.getCompileSettings())

  ipcMain.handle('compile:updateSettings', (_event, settings: CompileSettings) =>
    compileSettingsStore.updateCompileSettings(settings)
  )

  // The stored draft as a complete printable document — buildPrintableHtml
  // over the frozen body with the page setup recorded on the compile, which
  // is exactly what printing or PDF-exporting it would render. The in-app
  // viewer shows THIS, so what you see is what the artifact is.
  ipcMain.handle('compile:getPrintableView', async (_event, id: string) => {
    const meta = await compileStore.getCompile(id)
    const viewHtml = await compileStore.getCompileView(id)
    const options: ExportOptions = {
      preset: meta.stylePreset,
      pageSize: meta.pageSize,
      marginMm: meta.marginMm,
      authorName: null,
      title: meta.name
    }
    return buildPrintableHtml(viewHtml, options)
  })

  // Prints a STORED draft's frozen view — the page that prints is the page
  // that was compiled, not a re-render of documents that may have changed
  // since. Same printHtml path as live printing, so no second print styling.
  ipcMain.handle('compile:print', async (_event, id: string) => {
    const meta = await compileStore.getCompile(id)
    // A book compile's page — folios, blanks, gutter — exists only in the
    // stored PDF; printHtml would re-lay it wrongly. Hand the artifact to the
    // system PDF viewer, whose print dialog prints it as compiled.
    if (meta.stylePreset === 'book' && meta.format === 'pdf') {
      const bytes = await compileStore.readCompileOutput(id)
      const target = join(app.getPath('temp'), `chapterflow-print-${id}.pdf`)
      await writeFile(target, bytes)
      const error = await shell.openPath(target)
      if (error) throw new Error(error)
      return { printed: true }
    }
    const viewHtml = await compileStore.getCompileView(id)
    const options: ExportOptions = {
      preset: meta.stylePreset,
      pageSize: meta.pageSize,
      marginMm: meta.marginMm,
      // The one live input: the manuscript header's byline. The body is
      // frozen; the header template is built at print time and the meta
      // doesn't record the author, so current is the best truth available.
      authorName: await binderStore.getAuthorName(),
      title: meta.name
    }
    return printHtml(viewHtml, options)
  })

  // Front/back matter are ordinary binder structure made through the same
  // template machinery — the settings only record the designation so the
  // panel can show they exist.
  ipcMain.handle('compile:createFrontMatter', async () => {
    const folderId = await createFrontMatter()
    const settings = await compileSettingsStore.getCompileSettings()
    return compileSettingsStore.updateCompileSettings({ ...settings, frontMatterFolderId: folderId })
  })

  ipcMain.handle('compile:createBackMatter', async () => {
    const folderId = await createBackMatter()
    const settings = await compileSettingsStore.getCompileSettings()
    return compileSettingsStore.updateCompileSettings({ ...settings, backMatterFolderId: folderId })
  })

  ipcMain.handle('compile:listPresets', () => compileSettingsStore.listPresets())

  ipcMain.handle('compile:savePreset', (_event, draft: Omit<CompilePreset, 'id'>) =>
    compileSettingsStore.savePreset(draft)
  )

  ipcMain.handle('compile:deletePreset', (_event, id: string) => compileSettingsStore.deletePreset(id))

  // External word lookup. The renderer sends a word and one of two
  // whitelisted kinds — never a URL — and the URL is assembled here from the
  // fixed template, so this handler can only ever open the two reference
  // services. Returns the URL it opened, so callers (and tests) can see
  // exactly what left the app.
  ipcMain.handle('lookup:word', async (_event, kind: LookupKind, word: string) => {
    if (!isLookupKind(kind) || typeof word !== 'string' || !word.trim()) {
      throw new Error('Nothing to look up')
    }
    const url = lookupUrl(kind, word.trim())
    await shell.openExternal(url)
    return { url }
  })

  ipcMain.handle('import:files', async (event, parentId: string | null): Promise<ImportResult> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: [...IMPORT_EXTENSIONS] },
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'Word Document', extensions: ['docx'] }
      ]
    }
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, documents: [], warnings: [], failures: [] }
    }

    const documents: ImportedDocument[] = []
    const failures: ImportFailure[] = []
    const totals = new Map<ImportWarningKind, number>()

    // Files import in the order picked, as siblings under the same parent. One
    // bad file fails on its own and never aborts the rest of the batch.
    for (const filePath of result.filePaths) {
      try {
        const parsed = await parseImportFile(filePath)
        // Deliberately the same two calls a natively-created document makes —
        // there is no separate "imported" document type or storage path.
        const node = await binderStore.createDocument(parentId, parsed.name)
        await documentStore.saveDocument(node.id, parsed.html)
        // ...plus the exact side effects document:save performs, so the new
        // document has correct word counts, backup state, span-tag and
        // Story Bible indexes from the moment it exists.
        wordCountStore.invalidate(node.id)
        await spanTagStore.rebuildForDocument(node.id, parsed.html)
        void mentionStore.rebuildAutoForDocument(node.id, parsed.html)

        documents.push({ id: node.id, name: node.name })
        for (const [kind, count] of Object.entries(parsed.warnings)) {
          if (!count) continue
          const key = kind as ImportWarningKind
          totals.set(key, (totals.get(key) ?? 0) + count)
        }
      } catch (error) {
        failures.push({
          fileName: basename(filePath),
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }

    if (documents.length > 0) backupStore.markDirty()

    return {
      canceled: false,
      documents,
      warnings: [...totals.entries()].map(([kind, count]) => ({ kind, count })),
      failures
    }
  })

  ipcMain.handle('wordCount:getDailyBaseline', () => wordCountStore.getDailyBaseline())

  ipcMain.handle('wordCount:getOthersTotal', (_event, excludeId: string | null) =>
    wordCountStore.getOtherDocumentsWordCount(excludeId)
  )

  ipcMain.handle('wordCount:getByDocument', () => wordCountStore.getWordCountsByDocument())

  ipcMain.handle('preferences:getTheme', () => preferencesStore.getTheme())

  ipcMain.handle('preferences:setTheme', async (event, theme: Theme) => {
    await preferencesStore.setTheme(theme)
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.setTitleBarOverlay({ ...TITLE_BAR_COLORS[theme], height: 32 })
  })

  ipcMain.handle('preferences:getSidebarWidth', () => preferencesStore.getSidebarWidth())

  ipcMain.handle('preferences:setSidebarWidth', (_event, width: number) =>
    preferencesStore.setSidebarWidth(width)
  )

  ipcMain.handle('preferences:getSidebarCollapsed', () => preferencesStore.getSidebarCollapsed())

  ipcMain.handle('preferences:setSidebarCollapsed', (_event, collapsed: boolean) =>
    preferencesStore.setSidebarCollapsed(collapsed)
  )

  ipcMain.handle('preferences:getAccentColor', () => preferencesStore.getAccentColor())

  ipcMain.handle('preferences:setAccentColor', (_event, color: string | null) =>
    preferencesStore.setAccentColor(color)
  )

  ipcMain.handle('preferences:getZoomPercent', () => preferencesStore.getZoomPercent())

  ipcMain.handle('preferences:setZoomPercent', (_event, zoom: number) =>
    preferencesStore.setZoomPercent(zoom)
  )

  ipcMain.handle('preferences:getDefaultTypography', () => preferencesStore.getDefaultTypography())

  ipcMain.handle('preferences:setDefaultTypography', (_event, typography: TypographyDefaults) =>
    preferencesStore.setDefaultTypography(typography)
  )

  ipcMain.handle('preferences:getBackgroundColor', () => preferencesStore.getBackgroundColor())

  ipcMain.handle('preferences:setBackgroundColor', (_event, color: string | null) =>
    preferencesStore.setBackgroundColor(color)
  )

  ipcMain.handle('preferences:getTextColor', () => preferencesStore.getTextColor())

  ipcMain.handle('preferences:setTextColor', (_event, color: string | null) =>
    preferencesStore.setTextColor(color)
  )

  ipcMain.handle('preferences:getPageBackgroundColor', () => preferencesStore.getPageBackgroundColor())

  ipcMain.handle('preferences:setPageBackgroundColor', (_event, color: string | null) =>
    preferencesStore.setPageBackgroundColor(color)
  )

  ipcMain.handle('preferences:getColorPresetId', () => preferencesStore.getColorPresetId())

  ipcMain.handle('preferences:setColorPresetId', (_event, id: string | null) =>
    preferencesStore.setColorPresetId(id)
  )

  ipcMain.handle('preferences:getHiddenToolbarSections', () => preferencesStore.getHiddenToolbarSections())

  ipcMain.handle('preferences:setHiddenToolbarSections', (_event, sections: ToolbarSectionId[]) =>
    preferencesStore.setHiddenToolbarSections(sections)
  )

  ipcMain.handle('preferences:getLayoutPresets', () => preferencesStore.getLayoutPresets())

  ipcMain.handle('preferences:getCustomThemes', () => preferencesStore.getCustomThemes())

  ipcMain.handle('preferences:setCustomThemes', (_event, themes: CustomTheme[]) =>
    preferencesStore.setCustomThemes(themes)
  )

  ipcMain.handle('preferences:setLayoutPresets', (_event, presets: LayoutPreset[]) =>
    preferencesStore.setLayoutPresets(presets)
  )

  ipcMain.handle('preferences:getCardWidth', () => preferencesStore.getCardWidth())

  ipcMain.handle('preferences:setCardWidth', (_event, width: number) => preferencesStore.setCardWidth(width))

  ipcMain.handle('preferences:getPageSize', () => preferencesStore.getPageSize())

  ipcMain.handle('preferences:setPageSize', (_event, size: PageSize) => preferencesStore.setPageSize(size))

  ipcMain.handle('preferences:getPageMarginMm', () => preferencesStore.getPageMarginMm())

  ipcMain.handle('preferences:setPageMarginMm', (_event, mm: number) => preferencesStore.setPageMarginMm(mm))

  ipcMain.handle('preferences:getPageViewMode', () => preferencesStore.getPageViewMode())

  ipcMain.handle('preferences:setPageViewMode', (_event, mode: PageViewMode) =>
    preferencesStore.setPageViewMode(mode)
  )

  ipcMain.handle('template:apply', async (_event, id: TemplateId) => {
    await applyTemplate(id)
    backupStore.markDirty()
    const root = getProjectRoot()
    await lifetimeStore.recordProjectOpened(root, (await binderStore.getState()).projectName)
  })

  ipcMain.handle('project:exists', () => projectExistsAt(getProjectRoot()))

  ipcMain.handle('project:openFolder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })

    if (result.canceled || result.filePaths.length === 0) return { opened: false }

    const chosen = result.filePaths[0]
    setProjectRoot(chosen)
    await preferencesStore.setProjectRootPref(chosen)
    await lifetimeStore.recordProjectOpened(chosen, (await binderStore.getState()).projectName)
    binderStore.invalidateCache()
    storyBibleStore.invalidateCache()
    wordCountStore.invalidateAll()
    // A different project means a different index; open() validates the
    // persisted one against the files and re-indexes only what disagrees.
    void searchIndex.open()
    return { opened: true, path: chosen }
  })

  /**
   * Creates a genuinely new project: an empty binder in a folder of the
   * writer's choosing, which the app then switches to.
   *
   * This is deliberately NOT template application. Templates add structure to
   * whatever project is already open; they never made a project, so "New
   * Project" previously changed nothing at all when the chosen structure was
   * Blank. Creation is its own step, and it happens here.
   *
   * The steps mirror project:openFolder — the only established way the root
   * changes — plus the two that make the folder a project rather than just a
   * destination: the caches are reset to empty defaults (invalidateCache,
   * which exists precisely so a root without a binder.json doesn't keep
   * showing the previous project's tree) and binder.json is written straight
   * away, so the project exists on disk before the window reloads into it.
   */
  ipcMain.handle('project:createNew', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'New Project',
      buttonLabel: 'Create Project',
      // createDirectory lets the writer make the folder in the dialog; an
      // existing empty folder is equally valid.
      properties: ['openDirectory', 'createDirectory']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return { created: false as const }

    const chosen = result.filePaths[0]
    // A binder.json here means this folder already IS a project. Adopting it
    // would silently present someone's existing work as a new empty one, and
    // the first write would erase it — so refuse, and say so rather than
    // returning quietly, which would look exactly like the do-nothing bug
    // this handler replaces.
    if (projectExistsAt(chosen)) {
      const warning = {
        type: 'info' as const,
        buttons: ['OK'],
        message: 'That folder already holds a project',
        detail:
          'Pick an empty folder — or create one in the dialog — for a new project. To work on the project that is already there, use File ▸ Open Project instead.'
      }
      if (window) await dialog.showMessageBox(window, warning)
      else await dialog.showMessageBox(warning)
      return { created: false as const, reason: 'exists' as const }
    }

    await mkdir(chosen, { recursive: true })
    setProjectRoot(chosen)
    await preferencesStore.setProjectRootPref(chosen)
    binderStore.invalidateCache()
    storyBibleStore.invalidateCache()
    wordCountStore.invalidateAll()
    // Writes binder.json (a missing file is not a load failure, so persist is
    // allowed), naming the project after its folder.
    await binderStore.setProjectName(basename(chosen))
    await lifetimeStore.recordProjectOpened(chosen, (await binderStore.getState()).projectName)
    void searchIndex.open()
    return { created: true as const, path: chosen }
  })

  /**
   * Imports a Scrivener project into a new ChapterFlow project.
   *
   * Everything is parsed BEFORE anything is written, so a malformed project
   * fails without leaving a half-made one behind. Then the order below, which
   * is deliberate at two points:
   *
   *   - documents to disk before the binder insert. A crash after the binder
   *     lands leaves a project full of chapters that exist and are empty,
   *     indistinguishable from data loss; the reverse leaves orphan files,
   *     which are discoverable and deletable.
   *   - the search index suspended across the whole write. Every project write
   *     re-serialises the entire index, so 129 documents is quadratic without
   *     it. resume() re-opens once, in a finally.
   */
  ipcMain.handle('scrivener:importProject', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const ask = async (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> =>
      window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)

    const picked = await ask({
      title: 'Choose a Scrivener project',
      buttonLabel: 'Choose',
      // A .scriv is a folder on Windows; a .zip is Scrivener's own backup.
      properties: ['openDirectory']
    })
    if (picked.canceled || picked.filePaths.length === 0) return { imported: false as const }
    const sourcePath = picked.filePaths[0]

    // Parse first. Nothing below this point is reversible.
    let prepared: Awaited<ReturnType<typeof scrivenerImport.prepareProject>>
    try {
      prepared = await scrivenerImport.prepareProject(sourcePath)
    } catch (error) {
      const warning = {
        type: 'warning' as const,
        buttons: ['OK'],
        message: 'That project could not be imported',
        detail: (error as Error).message
      }
      if (window) await dialog.showMessageBox(window, warning)
      else await dialog.showMessageBox(warning)
      return { imported: false as const, reason: (error as Error).message }
    }

    const destination = await ask({
      title: 'Where should the imported project go?',
      buttonLabel: 'Import Here',
      properties: ['openDirectory', 'createDirectory']
    })
    if (destination.canceled || destination.filePaths.length === 0) return { imported: false as const }
    const chosen = destination.filePaths[0]

    if (projectExistsAt(chosen)) {
      const warning = {
        type: 'info' as const,
        buttons: ['OK'],
        message: 'That folder already holds a project',
        detail:
          'Pick an empty folder — or create one in the dialog. Importing into an existing project would overwrite its binder.'
      }
      if (window) await dialog.showMessageBox(window, warning)
      else await dialog.showMessageBox(warning)
      return { imported: false as const, reason: 'exists' as const }
    }

    return writeImportedProject(prepared, sourcePath, chosen)
  })

  /**
   * The write half, shared by the dialog-driven handler above and the
   * acceptance test seam below — so what is verified end to end is the same
   * code a writer runs, not a parallel copy of it.
   */
  async function writeImportedProject(
    prepared: Awaited<ReturnType<typeof scrivenerImport.prepareProject>>,
    sourcePath: string,
    chosen: string
  ): Promise<ScrivenerProjectImportResult> {
    await mkdir(chosen, { recursive: true })
    setProjectRoot(chosen)
    await preferencesStore.setProjectRootPref(chosen)
    binderStore.invalidateCache()
    storyBibleStore.invalidateCache()
    wordCountStore.invalidateAll()

    const name = prepared.title || basename(sourcePath).replace(/\.scriv$/i, '')
    await binderStore.setProjectName(name)
    // Both replace the whole list, which is safe only because this is a new
    // project with nothing of the writer's to merge with.
    if (prepared.statuses.length > 0) await binderStore.setStatuses(prepared.statuses)
    if (prepared.tags.length > 0) await binderStore.setTags(prepared.tags)

    let documentCount = 0
    searchIndex.suspend()
    try {
      for (const document of prepared.documents) {
        await documentStore.saveDocument(document.id, document.html)
        documentCount++
        // After the document itself, so a crash never leaves version history
        // for a document with no current text.
        for (const snapshot of document.snapshots) {
          await snapshotStore.importSnapshot(document.id, snapshot.html, snapshot.timestamp, snapshot.title)
        }
      }
      for (const folder of prepared.topLevelFolders) {
        const created = await binderStore.createTopLevelFolder(folder.name)
        if (folder.nodes.length > 0) await binderStore.insertSubtree(created.id, folder.nodes)
      }
      for (const placement of prepared.placements) {
        if (placement.nodes.length > 0) await binderStore.insertSubtree(placement.parentId, placement.nodes)
      }
    } finally {
      await searchIndex.resume()
    }

    wordCountStore.invalidateAll()
    backupStore.markDirty()
    await lifetimeStore.recordProjectOpened(chosen, name)

    return {
      imported: true as const,
      path: chosen,
      documents: documentCount,
      snapshots: prepared.snapshotCount,
      warnings: Object.entries(prepared.warnings).map(([kind, count]) => ({
        kind: kind as ImportWarningKind,
        count: count as number
      })),
      notes: prepared.notes,
      failures: prepared.failures
    }
  }

  /** Test seam: the same import without the two directory dialogs, so the
   *  acceptance test drives the real path rather than a copy of it. */
  ipcMain.handle('scrivener:importProjectAt', async (_event, sourcePath: string, destination: string) => {
    const prepared = await scrivenerImport.prepareProject(sourcePath)
    return writeImportedProject(prepared, sourcePath, destination)
  })

  ipcMain.handle('backup:list', () => backupStore.listBackups())

  ipcMain.handle('backup:restore', (_event, id: string) => backupStore.restoreBackup(id))

  ipcMain.handle('snapshot:create', (_event, documentId: string, name: string | null, auto?: boolean) =>
    snapshotStore.createSnapshot(documentId, name, auto)
  )

  ipcMain.handle('snapshot:list', (_event, documentId: string) => snapshotStore.listSnapshots(documentId))

  ipcMain.handle('snapshot:getContent', (_event, documentId: string, snapshotId: string) =>
    snapshotStore.getSnapshotContent(documentId, snapshotId)
  )

  ipcMain.handle('snapshot:delete', (_event, documentId: string, snapshotId: string) =>
    snapshotStore.deleteSnapshot(documentId, snapshotId)
  )

  ipcMain.handle('snapshot:restore', (_event, documentId: string, snapshotId: string) =>
    snapshotStore.restoreSnapshot(documentId, snapshotId)
  )

  // A span's tag can outlive its TagDef (deleting a tag from the palette
  // deliberately leaves inline spans inert rather than rewriting every
  // document's HTML) — so both of these filter out spans whose tagId no
  // longer resolves, the same way a dangling reference would just vanish
  // from view rather than error.
  ipcMain.handle('spanTag:list', async () => {
    const [spans, tags] = await Promise.all([spanTagStore.listSpans(), binderStore.getTags()])
    const validTagIds = new Set(tags.map((t) => t.id))
    return spans.filter((s) => validTagIds.has(s.tagId))
  })

  ipcMain.handle('spanTag:getRollup', async () => {
    const [spans, tags] = await Promise.all([spanTagStore.listSpans(), binderStore.getTags()])
    const validTagIds = new Set(tags.map((t) => t.id))
    const rollup: Record<string, string[]> = {}
    for (const span of spans) {
      if (!validTagIds.has(span.tagId)) continue
      const existing = rollup[span.documentId] ?? []
      if (!existing.includes(span.tagId)) existing.push(span.tagId)
      rollup[span.documentId] = existing
    }
    return rollup
  })

  backupStore.startPeriodicBackups()

  void createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
