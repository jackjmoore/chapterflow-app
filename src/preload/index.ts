import type { ScrivenerWordlistScan, ScrivenerWordlistPick, ScrivenerProjectImportResult } from '../shared/scrivenerImport'
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ActiveView,
  BinderNode,
  BinderState,
  DocumentNode,
  FolderNode,
  ManuscriptView,
  OutlinerSort,
  StatusDef,
  TagDef,
  SavedView
} from '../shared/binder'
import type { Theme, TypographyDefaults, PageSize, PageViewMode } from '../shared/preferences'
import type { BackupInfo } from '../shared/backup'
import type { SnapshotMeta } from '../shared/snapshot'
import type { SpanTagRecord } from '../shared/spanTags'
import type { CommentRecord } from '../shared/comments'
import type { LexiconEntry, SuppressedWord } from '../shared/lexicon'
import type { DashboardData } from '../shared/dashboard'
import type {
  RecentSearch,
  SearchIndexStats,
  SearchMatch,
  SearchQueryOptions,
  SearchResults
} from '../shared/search'
import type { ExportFormat, ExportPreset, ExportResult } from '../shared/export'
import type { CompilePreset, CompileScope, CompileSettings, CompiledDraftMeta } from '../shared/compile'
import type { CompileFinding, CompileValidationReport } from '../shared/compileValidation'
import type { LookupKind } from '../shared/lookup'
import type { ImportResult } from '../shared/import'
import type { Submission, SubmissionState, SubmissionStatus } from '../shared/submissions'

type SubmissionDraft = Omit<Submission, 'id' | 'createdAt' | 'updatedAt'>
import type { TimelineDraft, TimelineEntry, TimelineState } from '../shared/timeline'
import type { Relationship, RelationshipDraft, RelationshipState } from '../shared/relationships'
import type { OpenSession, SessionState, WritingSession } from '../shared/sessions'
import type { Sprint, SprintState } from '../shared/sprints'
import type { UpdateStatus, VersionInfo } from '../shared/update'
import type { TemplateId } from '../shared/templates'
import type { ToolbarSectionId } from '../shared/toolbarSections'
import type { LayoutPreset } from '../shared/layoutPresets'
import type { CustomTheme } from '../shared/customThemes'
import type { EditorContextMenuPayload } from '../shared/contextMenu'
import type {
  ItemMentionStat,
  StoryBibleBlock,
  StoryBibleItem,
  StoryBibleSheet,
  StoryBibleState,
  StoryBibleTypeDef
} from '../shared/storyBible'

const api = {
  getBinderState: (): Promise<BinderState> => ipcRenderer.invoke('binder:getState'),

  createDocument: (parentId: string | null): Promise<DocumentNode> =>
    ipcRenderer.invoke('binder:createDocument', parentId),

  createFolder: (parentId: string | null): Promise<FolderNode> =>
    ipcRenderer.invoke('binder:createFolder', parentId),
  createTopLevelFolder: (name?: string): Promise<FolderNode> =>
    ipcRenderer.invoke('binder:createTopLevelFolder', name),

  scanScrivenerWordlists: (): Promise<ScrivenerWordlistScan> =>
    ipcRenderer.invoke('scrivener:scanWordlists'),
  pickScrivenerWordlist: (): Promise<ScrivenerWordlistPick> =>
    ipcRenderer.invoke('scrivener:pickWordlist'),
  importScrivenerWords: (words: string[]): Promise<{ added: number; alreadyPresent: number }> =>
    ipcRenderer.invoke('scrivener:importWords', words),
  importScrivenerProject: (): Promise<ScrivenerProjectImportResult> =>
    ipcRenderer.invoke('scrivener:importProject'),
  /** Test seam — see the handler's comment. Not used by the app itself. */
  __testImportScrivener: (source: string, destination: string): Promise<ScrivenerProjectImportResult> =>
    ipcRenderer.invoke('scrivener:importProjectAt', source, destination),

  createDocumentNear: (targetId: string | null): Promise<DocumentNode> =>
    ipcRenderer.invoke('binder:createDocumentNear', targetId),

  createFolderNear: (targetId: string | null): Promise<FolderNode> =>
    ipcRenderer.invoke('binder:createFolderNear', targetId),

  renameNode: (id: string, name: string): Promise<void> => ipcRenderer.invoke('binder:rename', id, name),

  duplicateNode: (id: string): Promise<BinderNode> => ipcRenderer.invoke('binder:duplicate', id),

  setFolderCollapsed: (id: string, collapsed: boolean): Promise<void> =>
    ipcRenderer.invoke('binder:setCollapsed', id, collapsed),

  setLastOpenDocument: (id: string | null): Promise<void> =>
    ipcRenderer.invoke('binder:setLastOpenDocument', id),

  setProjectName: (name: string): Promise<void> => ipcRenderer.invoke('binder:setProjectName', name),

  setSynopsis: (id: string, synopsis: string): Promise<void> => ipcRenderer.invoke('binder:setSynopsis', id, synopsis),
  setNotes: (id: string, notes: string): Promise<void> => ipcRenderer.invoke('binder:setNotes', id, notes),

  setStatusId: (id: string, statusId: string | null): Promise<void> =>
    ipcRenderer.invoke('binder:setStatusId', id, statusId),

  setTagIds: (id: string, tagIds: string[]): Promise<void> => ipcRenderer.invoke('binder:setTagIds', id, tagIds),

  setWordTarget: (id: string, target: number | null): Promise<void> =>
    ipcRenderer.invoke('binder:setWordTarget', id, target),

  setChapterNumber: (id: string, chapterNumber: number | null): Promise<void> =>
    ipcRenderer.invoke('binder:setChapterNumber', id, chapterNumber),

  setFolderIsPart: (id: string, isPart: boolean): Promise<void> =>
    ipcRenderer.invoke('binder:setFolderIsPart', id, isPart),

  setStatuses: (statuses: StatusDef[]): Promise<void> => ipcRenderer.invoke('binder:setStatuses', statuses),

  setTags: (tags: TagDef[]): Promise<void> => ipcRenderer.invoke('binder:setTags', tags),

  setSavedViews: (views: SavedView[]): Promise<void> => ipcRenderer.invoke('binder:setSavedViews', views),

  setOverusedIgnoreList: (words: string[]): Promise<void> =>
    ipcRenderer.invoke('binder:setOverusedIgnoreList', words),

  setAuthorName: (name: string | null): Promise<void> => ipcRenderer.invoke('binder:setAuthorName', name),

  setProjectWordTarget: (target: number | null): Promise<void> =>
    ipcRenderer.invoke('binder:setProjectWordTarget', target),

  setProjectDeadline: (deadline: string | null): Promise<void> =>
    ipcRenderer.invoke('binder:setProjectDeadline', deadline),

  setProjectTargetStart: (date: string | null, count: number | null): Promise<void> =>
    ipcRenderer.invoke('binder:setProjectTargetStart', date, count),

  setActiveView: (view: ActiveView): Promise<void> => ipcRenderer.invoke('binder:setActiveView', view),

  setManuscriptView: (view: ManuscriptView): Promise<void> =>
    ipcRenderer.invoke('binder:setManuscriptView', view),

  setOutlinerSort: (sort: OutlinerSort | null): Promise<void> =>
    ipcRenderer.invoke('binder:setOutlinerSort', sort),

  setOutlinerFilter: (filter: string): Promise<void> => ipcRenderer.invoke('binder:setOutlinerFilter', filter),

  setStatusFilter: (statusIds: string[]): Promise<void> => ipcRenderer.invoke('binder:setStatusFilter', statusIds),

  setTagFilter: (tagIds: string[]): Promise<void> => ipcRenderer.invoke('binder:setTagFilter', tagIds),

  setReferenceDocumentId: (id: string | null): Promise<void> =>
    ipcRenderer.invoke('binder:setReferenceDocumentId', id),

  setSplitViewLocked: (locked: boolean): Promise<void> => ipcRenderer.invoke('binder:setSplitViewLocked', locked),

  setSplitViewSyncScroll: (sync: boolean): Promise<void> =>
    ipcRenderer.invoke('binder:setSplitViewSyncScroll', sync),

  moveNode: (id: string, targetParentId: string | null, targetIndex: number): Promise<void> =>
    ipcRenderer.invoke('binder:move', id, targetParentId, targetIndex),

  deleteNode: (id: string): Promise<{ deleted: boolean }> => ipcRenderer.invoke('binder:delete', id),
  emptyTrash: (): Promise<{ deleted: number }> => ipcRenderer.invoke('binder:emptyTrash'),

  getStoryBibleIndex: (): Promise<StoryBibleState> => ipcRenderer.invoke('storyBible:getIndex'),

  createStoryBibleItem: (typeId: string, name: string): Promise<StoryBibleItem> =>
    ipcRenderer.invoke('storyBible:createItem', typeId, name),

  renameStoryBibleItem: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('storyBible:renameItem', id, name),

  setStoryBibleItemType: (id: string, typeId: string): Promise<void> =>
    ipcRenderer.invoke('storyBible:setItemType', id, typeId),

  setStoryBibleItemSummary: (id: string, summary: string): Promise<void> =>
    ipcRenderer.invoke('storyBible:setItemSummary', id, summary),

  setStoryBibleItemAliases: (id: string, aliases: string[]): Promise<void> =>
    ipcRenderer.invoke('storyBible:setItemAliases', id, aliases),

  setStoryBibleTypes: (types: StoryBibleTypeDef[]): Promise<void> =>
    ipcRenderer.invoke('storyBible:setTypes', types),

  deleteStoryBibleItem: (id: string): Promise<{ deleted: boolean }> =>
    ipcRenderer.invoke('storyBible:deleteItem', id),

  getStoryBibleSheet: (itemId: string): Promise<StoryBibleSheet> =>
    ipcRenderer.invoke('storyBible:getSheet', itemId),

  saveStoryBibleSheet: (itemId: string, blocks: StoryBibleBlock[]): Promise<void> =>
    ipcRenderer.invoke('storyBible:saveSheet', itemId, blocks),

  importStoryBibleImage: (): Promise<string | null> => ipcRenderer.invoke('storyBible:importImage'),

  getStoryBibleImage: (imageId: string): Promise<string | null> =>
    ipcRenderer.invoke('storyBible:getImage', imageId),

  deleteStoryBibleImage: (imageId: string): Promise<void> => ipcRenderer.invoke('storyBible:deleteImage', imageId),

  getMentionRollup: (): Promise<Record<string, string[]>> => ipcRenderer.invoke('storyBible:getMentionRollup'),

  getMentionStats: (itemId: string): Promise<ItemMentionStat[]> =>
    ipcRenderer.invoke('storyBible:getMentionStats', itemId),

  getAllMentionStats: (): Promise<Record<string, ItemMentionStat[]>> =>
    ipcRenderer.invoke('storyBible:getAllMentionStats'),

  setManualMention: (documentId: string, itemId: string, present: boolean): Promise<void> =>
    ipcRenderer.invoke('storyBible:setManualMention', documentId, itemId, present),

  onMentionsUpdated: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('storyBible:mentionsUpdated', listener)
    return () => ipcRenderer.removeListener('storyBible:mentionsUpdated', listener)
  },

  loadDocument: (id: string): Promise<string> => ipcRenderer.invoke('document:load', id),

  saveDocument: (id: string, html: string): Promise<void> =>
    ipcRenderer.invoke('document:save', id, html),

  getDailyWordCountBaseline: (): Promise<number> => ipcRenderer.invoke('wordCount:getDailyBaseline'),

  getOtherDocumentsWordCount: (excludeId: string | null): Promise<number> =>
    ipcRenderer.invoke('wordCount:getOthersTotal', excludeId),

  getWordCountsByDocument: (): Promise<Record<string, number>> => ipcRenderer.invoke('wordCount:getByDocument'),

  onBeforeQuit: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('app:before-quit', listener)
    return () => ipcRenderer.removeListener('app:before-quit', listener)
  },

  notifyFlushComplete: (): void => {
    ipcRenderer.send('app:flush-complete')
  },

  onEditorContextMenu: (callback: (payload: EditorContextMenuPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: EditorContextMenuPayload): void =>
      callback(payload)
    ipcRenderer.on('editor-context-menu', listener)
    return () => ipcRenderer.removeListener('editor-context-menu', listener)
  },

  replaceMisspelling: (suggestion: string): Promise<void> =>
    ipcRenderer.invoke('editor:replaceMisspelling', suggestion),

  setEditorFocused: (focused: boolean): void => {
    ipcRenderer.send('editor:setFocused', focused)
  },

  getTheme: (): Promise<Theme> => ipcRenderer.invoke('preferences:getTheme'),

  setTheme: (theme: Theme): Promise<void> => ipcRenderer.invoke('preferences:setTheme', theme),

  getSidebarWidth: (): Promise<number> => ipcRenderer.invoke('preferences:getSidebarWidth'),

  setSidebarWidth: (width: number): Promise<void> => ipcRenderer.invoke('preferences:setSidebarWidth', width),

  getSidebarCollapsed: (): Promise<boolean> => ipcRenderer.invoke('preferences:getSidebarCollapsed'),

  setSidebarCollapsed: (collapsed: boolean): Promise<void> =>
    ipcRenderer.invoke('preferences:setSidebarCollapsed', collapsed),

  getAccentColor: (): Promise<string | null> => ipcRenderer.invoke('preferences:getAccentColor'),

  setAccentColor: (color: string | null): Promise<void> => ipcRenderer.invoke('preferences:setAccentColor', color),

  getZoomPercent: (): Promise<number> => ipcRenderer.invoke('preferences:getZoomPercent'),

  setZoomPercent: (zoom: number): Promise<void> => ipcRenderer.invoke('preferences:setZoomPercent', zoom),

  getDefaultTypography: (): Promise<TypographyDefaults> => ipcRenderer.invoke('preferences:getDefaultTypography'),

  setDefaultTypography: (typography: TypographyDefaults): Promise<void> =>
    ipcRenderer.invoke('preferences:setDefaultTypography', typography),

  getBackgroundColor: (): Promise<string | null> => ipcRenderer.invoke('preferences:getBackgroundColor'),

  setBackgroundColor: (color: string | null): Promise<void> =>
    ipcRenderer.invoke('preferences:setBackgroundColor', color),

  getTextColor: (): Promise<string | null> => ipcRenderer.invoke('preferences:getTextColor'),

  setTextColor: (color: string | null): Promise<void> => ipcRenderer.invoke('preferences:setTextColor', color),

  getPageBackgroundColor: (): Promise<string | null> => ipcRenderer.invoke('preferences:getPageBackgroundColor'),

  setPageBackgroundColor: (color: string | null): Promise<void> =>
    ipcRenderer.invoke('preferences:setPageBackgroundColor', color),

  getColorPresetId: (): Promise<string | null> => ipcRenderer.invoke('preferences:getColorPresetId'),

  setColorPresetId: (id: string | null): Promise<void> => ipcRenderer.invoke('preferences:setColorPresetId', id),

  getHiddenToolbarSections: (): Promise<ToolbarSectionId[]> =>
    ipcRenderer.invoke('preferences:getHiddenToolbarSections'),

  setHiddenToolbarSections: (sections: ToolbarSectionId[]): Promise<void> =>
    ipcRenderer.invoke('preferences:setHiddenToolbarSections', sections),

  getLayoutPresets: (): Promise<LayoutPreset[]> => ipcRenderer.invoke('preferences:getLayoutPresets'),

  setLayoutPresets: (presets: LayoutPreset[]): Promise<void> =>
    ipcRenderer.invoke('preferences:setLayoutPresets', presets),

  getCustomThemes: (): Promise<CustomTheme[]> => ipcRenderer.invoke('preferences:getCustomThemes'),

  setCustomThemes: (themes: CustomTheme[]): Promise<void> =>
    ipcRenderer.invoke('preferences:setCustomThemes', themes),

  getCardWidth: (): Promise<number> => ipcRenderer.invoke('preferences:getCardWidth'),

  setCardWidth: (width: number): Promise<void> => ipcRenderer.invoke('preferences:setCardWidth', width),

  getPageSize: (): Promise<PageSize> => ipcRenderer.invoke('preferences:getPageSize'),

  setPageSize: (size: PageSize): Promise<void> => ipcRenderer.invoke('preferences:setPageSize', size),

  getPageMarginMm: (): Promise<number> => ipcRenderer.invoke('preferences:getPageMarginMm'),

  setPageMarginMm: (mm: number): Promise<void> => ipcRenderer.invoke('preferences:setPageMarginMm', mm),

  getPageViewMode: (): Promise<PageViewMode> => ipcRenderer.invoke('preferences:getPageViewMode'),

  setPageViewMode: (mode: PageViewMode): Promise<void> => ipcRenderer.invoke('preferences:setPageViewMode', mode),

  applyTemplate: (id: TemplateId): Promise<void> => ipcRenderer.invoke('template:apply', id),

  projectExists: (): Promise<boolean> => ipcRenderer.invoke('project:exists'),

  openProjectFolder: (): Promise<{ opened: boolean; path?: string }> =>
    ipcRenderer.invoke('project:openFolder'),

  createNewProject: (): Promise<{ created: boolean; path?: string; reason?: 'exists' }> =>
    ipcRenderer.invoke('project:createNew'),

  listBackups: (): Promise<BackupInfo[]> => ipcRenderer.invoke('backup:list'),

  restoreBackup: (id: string): Promise<void> => ipcRenderer.invoke('backup:restore', id),

  createSnapshot: (documentId: string, name: string | null, auto?: boolean): Promise<SnapshotMeta> =>
    ipcRenderer.invoke('snapshot:create', documentId, name, auto),

  listSnapshots: (documentId: string): Promise<SnapshotMeta[]> => ipcRenderer.invoke('snapshot:list', documentId),

  getSnapshotContent: (documentId: string, snapshotId: string): Promise<string> =>
    ipcRenderer.invoke('snapshot:getContent', documentId, snapshotId),

  deleteSnapshot: (documentId: string, snapshotId: string): Promise<void> =>
    ipcRenderer.invoke('snapshot:delete', documentId, snapshotId),

  restoreSnapshot: (documentId: string, snapshotId: string): Promise<string> =>
    ipcRenderer.invoke('snapshot:restore', documentId, snapshotId),

  listSpanTags: (): Promise<SpanTagRecord[]> => ipcRenderer.invoke('spanTag:list'),

  getSpanTagRollup: (): Promise<Record<string, string[]>> => ipcRenderer.invoke('spanTag:getRollup'),

  importDocumentImage: (): Promise<string | null> => ipcRenderer.invoke('documentImage:import'),

  getDocumentImage: (imageId: string): Promise<string | null> =>
    ipcRenderer.invoke('documentImage:get', imageId),

  /** Resolved in one round trip when a document opens, rather than one call
   *  per image. */
  getDocumentImages: (imageIds: string[]): Promise<Record<string, string>> =>
    ipcRenderer.invoke('documentImage:getMany', imageIds),

  /** Raw, unranked matches from the maintained index. Nothing is scanned
   *  at query time. */
  searchProject: (text: string, options?: SearchQueryOptions): Promise<SearchMatch[]> =>
    ipcRenderer.invoke('search:query', text, options),

  getSearchStats: (): Promise<SearchIndexStats> => ipcRenderer.invoke('search:stats'),

  getDashboardData: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:data'),
  forgetProject: (path: string): Promise<void> => ipcRenderer.invoke('dashboard:forgetProject', path),
  openProjectAt: (path: string): Promise<boolean> => ipcRenderer.invoke('dashboard:openProjectAt', path),
  getSkipDashboardOnLaunch: (): Promise<boolean> => ipcRenderer.invoke('dashboard:getSkipOnLaunch'),
  setSkipDashboardOnLaunch: (skip: boolean): Promise<void> => ipcRenderer.invoke('dashboard:setSkipOnLaunch', skip),
  getClassicMode: (): Promise<boolean> => ipcRenderer.invoke('dashboard:getClassicMode'),
  setClassicMode: (enabled: boolean): Promise<void> => ipcRenderer.invoke('dashboard:setClassicMode', enabled),

  /** Ranked, tiered results. What the project search interface uses; the raw
   *  `searchProject` above stays for anything that wants the unordered set. */
  searchRanked: (text: string, options?: SearchQueryOptions): Promise<SearchResults> =>
    ipcRenderer.invoke('search:ranked', text, options),

  listSearchHistory: (): Promise<RecentSearch[]> => ipcRenderer.invoke('search:history'),

  recordSearchHistory: (text: string): Promise<RecentSearch[]> =>
    ipcRenderer.invoke('search:recordHistory', text),

  clearSearchHistory: (): Promise<void> => ipcRenderer.invoke('search:clearHistory'),

  listLexicon: (): Promise<LexiconEntry[]> => ipcRenderer.invoke('lexicon:list'),

  addLexiconEntry: (word: string, meaning?: string, pronunciation?: string): Promise<LexiconEntry | null> =>
    ipcRenderer.invoke('lexicon:add', word, meaning, pronunciation),

  updateLexiconEntry: (
    id: string,
    changes: Partial<Pick<LexiconEntry, 'word' | 'meaning' | 'pronunciation'>>
  ): Promise<void> => ipcRenderer.invoke('lexicon:update', id, changes),

  deleteLexiconEntry: (id: string): Promise<void> => ipcRenderer.invoke('lexicon:delete', id),

  /** Every word the editor should stop flagging. App-only: no OS dictionary
   *  is ever written. */
  listSuppressedWords: (): Promise<string[]> => ipcRenderer.invoke('suppressedWords:list'),
  listSuppressedWordEntries: (): Promise<SuppressedWord[]> =>
    ipcRenderer.invoke('suppressedWords:listEntries'),

  addSuppressedWord: (word: string): Promise<void> => ipcRenderer.invoke('suppressedWords:add', word),

  onSuppressedWordsChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('lexicon:suppressedWordsChanged', listener)
    return () => ipcRenderer.removeListener('lexicon:suppressedWordsChanged', listener)
  },

  listComments: (): Promise<CommentRecord[]> => ipcRenderer.invoke('comment:list'),

  addComment: (record: CommentRecord): Promise<void> => ipcRenderer.invoke('comment:add', record),

  updateComment: (
    id: string,
    changes: Partial<Pick<CommentRecord, 'body' | 'resolved'>>
  ): Promise<void> => ipcRenderer.invoke('comment:update', id, changes),

  deleteComment: (id: string): Promise<void> => ipcRenderer.invoke('comment:delete', id),

  exportDocument: (id: string, format: ExportFormat, preset: ExportPreset = 'standard'): Promise<ExportResult> =>
    ipcRenderer.invoke('export:document', id, format, preset),

  exportProject: (format: ExportFormat, preset: ExportPreset = 'standard'): Promise<ExportResult> =>
    ipcRenderer.invoke('export:project', format, preset),

  printDocument: (id: string, preset: ExportPreset = 'standard'): Promise<{ printed: boolean }> =>
    ipcRenderer.invoke('print:document', id, preset),

  printProject: (preset: ExportPreset = 'standard'): Promise<{ printed: boolean }> =>
    ipcRenderer.invoke('print:project', preset),

  validateCompile: (scope: CompileScope, stylePreset: ExportPreset): Promise<CompileValidationReport> =>
    ipcRenderer.invoke('compile:validate', scope, stylePreset),

  runCompile: (
    name: string | null,
    scope: CompileScope,
    format: ExportFormat,
    stylePreset: ExportPreset,
    acceptedFindings: CompileFinding[] = []
  ): Promise<CompiledDraftMeta> =>
    ipcRenderer.invoke('compile:run', name, scope, format, stylePreset, acceptedFindings),

  listCompiles: (): Promise<CompiledDraftMeta[]> => ipcRenderer.invoke('compile:list'),

  getCompileView: (id: string): Promise<string> => ipcRenderer.invoke('compile:getView', id),

  exportCompileCopy: (id: string): Promise<ExportResult> => ipcRenderer.invoke('compile:exportCopy', id),

  deleteCompile: (id: string): Promise<void> => ipcRenderer.invoke('compile:delete', id),

  getCompileSettings: (): Promise<CompileSettings> => ipcRenderer.invoke('compile:getSettings'),

  updateCompileSettings: (settings: CompileSettings): Promise<CompileSettings> =>
    ipcRenderer.invoke('compile:updateSettings', settings),

  printCompile: (id: string): Promise<{ printed: boolean }> => ipcRenderer.invoke('compile:print', id),

  getCompilePrintableView: (id: string): Promise<string> => ipcRenderer.invoke('compile:getPrintableView', id),

  lookupWord: (kind: LookupKind, word: string): Promise<{ url: string }> =>
    ipcRenderer.invoke('lookup:word', kind, word),

  createCompileFrontMatter: (): Promise<CompileSettings> => ipcRenderer.invoke('compile:createFrontMatter'),

  createCompileBackMatter: (): Promise<CompileSettings> => ipcRenderer.invoke('compile:createBackMatter'),

  listCompilePresets: (): Promise<CompilePreset[]> => ipcRenderer.invoke('compile:listPresets'),

  saveCompilePreset: (draft: Omit<CompilePreset, 'id'>): Promise<CompilePreset> =>
    ipcRenderer.invoke('compile:savePreset', draft),

  deleteCompilePreset: (id: string): Promise<void> => ipcRenderer.invoke('compile:deletePreset', id),

  importFiles: (parentId: string | null): Promise<ImportResult> => ipcRenderer.invoke('import:files', parentId),

  getSubmissions: (): Promise<SubmissionState> => ipcRenderer.invoke('submissions:getState'),

  createSubmission: (draft: SubmissionDraft): Promise<Submission> =>
    ipcRenderer.invoke('submissions:create', draft),

  updateSubmission: (id: string, patch: Partial<SubmissionDraft>): Promise<void> =>
    ipcRenderer.invoke('submissions:update', id, patch),

  deleteSubmission: (id: string): Promise<void> => ipcRenderer.invoke('submissions:delete', id),

  setSubmissionStatuses: (statuses: SubmissionStatus[]): Promise<void> =>
    ipcRenderer.invoke('submissions:setStatuses', statuses),

  getTimeline: (): Promise<TimelineState> => ipcRenderer.invoke('timeline:getState'),

  createTimelineEntry: (draft: TimelineDraft): Promise<TimelineEntry> =>
    ipcRenderer.invoke('timeline:create', draft),

  updateTimelineEntry: (id: string, patch: Partial<TimelineDraft>): Promise<void> =>
    ipcRenderer.invoke('timeline:update', id, patch),

  deleteTimelineEntry: (id: string): Promise<void> => ipcRenderer.invoke('timeline:delete', id),

  moveTimelineEntry: (id: string, targetIndex: number): Promise<void> =>
    ipcRenderer.invoke('timeline:move', id, targetIndex),

  /** Drops every reference that no longer resolves — dead timeline links and
   *  relationships with a deleted endpoint. Returns how many went. */
  pruneTimelineReferences: (): Promise<number> => ipcRenderer.invoke('timeline:pruneReferences'),

  getRelationships: (): Promise<RelationshipState> => ipcRenderer.invoke('relationship:getState'),

  createRelationship: (draft: RelationshipDraft): Promise<Relationship> =>
    ipcRenderer.invoke('relationship:create', draft),

  updateRelationship: (id: string, patch: Partial<RelationshipDraft>): Promise<void> =>
    ipcRenderer.invoke('relationship:update', id, patch),

  deleteRelationship: (id: string): Promise<void> => ipcRenderer.invoke('relationship:delete', id),

  getSessions: (): Promise<SessionState> => ipcRenderer.invoke('session:getState'),

  checkpointSession: (open: OpenSession): Promise<void> => ipcRenderer.invoke('session:checkpoint', open),

  closeSession: (open: OpenSession): Promise<WritingSession | null> =>
    ipcRenderer.invoke('session:close', open),

  /** Seals a session left open by a crash, using its last checkpoint. */
  recoverOpenSession: (): Promise<WritingSession | null> => ipcRenderer.invoke('session:recoverOpen'),

  exportSessions: (format: 'csv' | 'json'): Promise<ExportResult> =>
    ipcRenderer.invoke('session:export', format),

  getIdleGapMinutes: (): Promise<number> => ipcRenderer.invoke('preferences:getIdleGapMinutes'),

  setIdleGapMinutes: (minutes: number): Promise<void> =>
    ipcRenderer.invoke('preferences:setIdleGapMinutes', minutes),

  getSprints: (): Promise<SprintState> => ipcRenderer.invoke('sprint:getState'),

  recordSprint: (sprint: Sprint): Promise<void> => ipcRenderer.invoke('sprint:record', sprint),

  getSprintPreferences: (): Promise<{ softLockout: boolean; chime: boolean }> =>
    ipcRenderer.invoke('preferences:getSprint'),

  setSprintPreferences: (next: { softLockout: boolean; chime: boolean }): Promise<void> =>
    ipcRenderer.invoke('preferences:setSprint', next),

  getSpeechPreferences: (): Promise<{ rate: number; voiceUri: string | null }> =>
    ipcRenderer.invoke('preferences:getSpeech'),

  setSpeechPreferences: (next: { rate: number; voiceUri: string | null }): Promise<void> =>
    ipcRenderer.invoke('preferences:setSpeech', next),

  getVersionInfo: (): Promise<VersionInfo> => ipcRenderer.invoke('update:getVersion'),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:getStatus'),

  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),

  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:download'),

  /** Restarts into the new version. Only ever called from an explicit click. */
  installUpdateNow: (): Promise<void> => ipcRenderer.invoke('update:installNow'),

  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
