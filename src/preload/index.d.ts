import { ElectronAPI } from '@electron-toolkit/preload'
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
import type { Theme, TypographyDefaults, PageSize } from '../shared/preferences'
import type { BackupInfo } from '../shared/backup'
import type { SnapshotMeta } from '../shared/snapshot'
import type { SpanTagRecord } from '../shared/spanTags'
import type { CommentRecord } from '../shared/comments'
import type { LexiconEntry } from '../shared/lexicon'
import type { DashboardData } from '../shared/dashboard'
import type {
  RecentSearch,
  SearchIndexStats,
  SearchMatch,
  SearchQueryOptions,
  SearchResults
} from '../shared/search'
import type { ExportFormat, ExportPreset, ExportResult } from '../shared/export'
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
import type { EditorContextMenuPayload } from '../shared/contextMenu'
import type {
  ItemMentionStat,
  StoryBibleBlock,
  StoryBibleItem,
  StoryBibleSheet,
  StoryBibleState,
  StoryBibleTypeDef
} from '../shared/storyBible'

interface Api {
  getBinderState: () => Promise<BinderState>
  createDocument: (parentId: string | null) => Promise<DocumentNode>
  createFolder: (parentId: string | null) => Promise<FolderNode>
  renameNode: (id: string, name: string) => Promise<void>
  duplicateNode: (id: string) => Promise<BinderNode>
  setFolderCollapsed: (id: string, collapsed: boolean) => Promise<void>
  setLastOpenDocument: (id: string | null) => Promise<void>
  setProjectName: (name: string) => Promise<void>
  setSynopsis: (id: string, synopsis: string) => Promise<void>
  setStatusId: (id: string, statusId: string | null) => Promise<void>
  setTagIds: (id: string, tagIds: string[]) => Promise<void>
  setWordTarget: (id: string, target: number | null) => Promise<void>
  setStatuses: (statuses: StatusDef[]) => Promise<void>
  setTags: (tags: TagDef[]) => Promise<void>
  setSavedViews: (views: SavedView[]) => Promise<void>
  setOverusedIgnoreList: (words: string[]) => Promise<void>
  setAuthorName: (name: string | null) => Promise<void>
  setProjectWordTarget: (target: number | null) => Promise<void>
  setProjectDeadline: (deadline: string | null) => Promise<void>
  setActiveView: (view: ActiveView) => Promise<void>
  setManuscriptView: (view: ManuscriptView) => Promise<void>
  setOutlinerSort: (sort: OutlinerSort | null) => Promise<void>
  setOutlinerFilter: (filter: string) => Promise<void>
  setStatusFilter: (statusIds: string[]) => Promise<void>
  setTagFilter: (tagIds: string[]) => Promise<void>
  setReferenceDocumentId: (id: string | null) => Promise<void>
  setSplitViewLocked: (locked: boolean) => Promise<void>
  setSplitViewSyncScroll: (sync: boolean) => Promise<void>
  moveNode: (id: string, targetParentId: string | null, targetIndex: number) => Promise<void>
  deleteNode: (id: string) => Promise<{ deleted: boolean }>
  getStoryBibleIndex: () => Promise<StoryBibleState>
  createStoryBibleItem: (typeId: string, name: string) => Promise<StoryBibleItem>
  renameStoryBibleItem: (id: string, name: string) => Promise<void>
  setStoryBibleItemType: (id: string, typeId: string) => Promise<void>
  setStoryBibleItemSummary: (id: string, summary: string) => Promise<void>
  setStoryBibleItemAliases: (id: string, aliases: string[]) => Promise<void>
  setStoryBibleTypes: (types: StoryBibleTypeDef[]) => Promise<void>
  deleteStoryBibleItem: (id: string) => Promise<{ deleted: boolean }>
  getStoryBibleSheet: (itemId: string) => Promise<StoryBibleSheet>
  saveStoryBibleSheet: (itemId: string, blocks: StoryBibleBlock[]) => Promise<void>
  importStoryBibleImage: () => Promise<string | null>
  getStoryBibleImage: (imageId: string) => Promise<string | null>
  deleteStoryBibleImage: (imageId: string) => Promise<void>
  getMentionRollup: () => Promise<Record<string, string[]>>
  getMentionStats: (itemId: string) => Promise<ItemMentionStat[]>
  setManualMention: (documentId: string, itemId: string, present: boolean) => Promise<void>
  onMentionsUpdated: (callback: () => void) => () => void
  loadDocument: (id: string) => Promise<string>
  saveDocument: (id: string, html: string) => Promise<void>
  getDailyWordCountBaseline: () => Promise<number>
  getOtherDocumentsWordCount: (excludeId: string | null) => Promise<number>
  getWordCountsByDocument: () => Promise<Record<string, number>>
  onBeforeQuit: (callback: () => void) => () => void
  notifyFlushComplete: () => void
  onEditorContextMenu: (callback: (payload: EditorContextMenuPayload) => void) => () => void
  replaceMisspelling: (suggestion: string) => Promise<void>
  setEditorFocused: (focused: boolean) => void
  getTheme: () => Promise<Theme>
  setTheme: (theme: Theme) => Promise<void>
  getSidebarWidth: () => Promise<number>
  setSidebarWidth: (width: number) => Promise<void>
  getSidebarCollapsed: () => Promise<boolean>
  setSidebarCollapsed: (collapsed: boolean) => Promise<void>
  getAccentColor: () => Promise<string | null>
  setAccentColor: (color: string | null) => Promise<void>
  getTrueBlack: () => Promise<boolean>
  setTrueBlack: (enabled: boolean) => Promise<void>
  getZoomPercent: () => Promise<number>
  setZoomPercent: (zoom: number) => Promise<void>
  getDefaultTypography: () => Promise<TypographyDefaults>
  setDefaultTypography: (typography: TypographyDefaults) => Promise<void>
  getBackgroundColor: () => Promise<string | null>
  setBackgroundColor: (color: string | null) => Promise<void>
  getTextColor: () => Promise<string | null>
  setTextColor: (color: string | null) => Promise<void>
  getHiddenToolbarSections: () => Promise<ToolbarSectionId[]>
  setHiddenToolbarSections: (sections: ToolbarSectionId[]) => Promise<void>
  getLayoutPresets: () => Promise<LayoutPreset[]>
  setLayoutPresets: (presets: LayoutPreset[]) => Promise<void>
  getCardWidth: () => Promise<number>
  setCardWidth: (width: number) => Promise<void>
  getPageSize: () => Promise<PageSize>
  setPageSize: (size: PageSize) => Promise<void>
  getPageMarginMm: () => Promise<number>
  setPageMarginMm: (mm: number) => Promise<void>
  applyTemplate: (id: TemplateId) => Promise<void>
  projectExists: () => Promise<boolean>
  openProjectFolder: () => Promise<{ opened: boolean; path?: string }>
  listBackups: () => Promise<BackupInfo[]>
  restoreBackup: (id: string) => Promise<void>
  createSnapshot: (documentId: string, name: string | null, auto?: boolean) => Promise<SnapshotMeta>
  listSnapshots: (documentId: string) => Promise<SnapshotMeta[]>
  getSnapshotContent: (documentId: string, snapshotId: string) => Promise<string>
  deleteSnapshot: (documentId: string, snapshotId: string) => Promise<void>
  restoreSnapshot: (documentId: string, snapshotId: string) => Promise<string>
  listSpanTags: () => Promise<SpanTagRecord[]>
  getSpanTagRollup: () => Promise<Record<string, string[]>>
  importDocumentImage: () => Promise<string | null>
  getDocumentImage: (imageId: string) => Promise<string | null>
  getDocumentImages: (imageIds: string[]) => Promise<Record<string, string>>
  searchProject: (text: string, options?: SearchQueryOptions) => Promise<SearchMatch[]>
  getSearchStats: () => Promise<SearchIndexStats>
  getDashboardData: () => Promise<DashboardData>
  forgetProject: (path: string) => Promise<void>
  openProjectAt: (path: string) => Promise<boolean>
  getSkipDashboardOnLaunch: () => Promise<boolean>
  setSkipDashboardOnLaunch: (skip: boolean) => Promise<void>
  getClassicMode: () => Promise<boolean>
  setClassicMode: (enabled: boolean) => Promise<void>
  searchRanked: (text: string, options?: SearchQueryOptions) => Promise<SearchResults>
  listSearchHistory: () => Promise<RecentSearch[]>
  recordSearchHistory: (text: string) => Promise<RecentSearch[]>
  clearSearchHistory: () => Promise<void>
  listLexicon: () => Promise<LexiconEntry[]>
  addLexiconEntry: (word: string, meaning?: string, pronunciation?: string) => Promise<LexiconEntry | null>
  updateLexiconEntry: (
    id: string,
    changes: Partial<Pick<LexiconEntry, 'word' | 'meaning' | 'pronunciation'>>
  ) => Promise<void>
  deleteLexiconEntry: (id: string) => Promise<void>
  listSuppressedWords: () => Promise<string[]>
  addSuppressedWord: (word: string) => Promise<void>
  onSuppressedWordsChanged: (callback: () => void) => () => void
  listComments: () => Promise<CommentRecord[]>
  addComment: (record: CommentRecord) => Promise<void>
  updateComment: (
    id: string,
    changes: Partial<Pick<CommentRecord, 'body' | 'resolved'>>
  ) => Promise<void>
  deleteComment: (id: string) => Promise<void>
  exportDocument: (id: string, format: ExportFormat, preset?: ExportPreset) => Promise<ExportResult>
  exportProject: (format: ExportFormat, preset?: ExportPreset) => Promise<ExportResult>
  printDocument: (id: string, preset?: ExportPreset) => Promise<{ printed: boolean }>
  printProject: (preset?: ExportPreset) => Promise<{ printed: boolean }>
  importFiles: (parentId: string | null) => Promise<ImportResult>
  getSubmissions: () => Promise<SubmissionState>
  createSubmission: (draft: SubmissionDraft) => Promise<Submission>
  updateSubmission: (id: string, patch: Partial<SubmissionDraft>) => Promise<void>
  deleteSubmission: (id: string) => Promise<void>
  setSubmissionStatuses: (statuses: SubmissionStatus[]) => Promise<void>
  getTimeline: () => Promise<TimelineState>
  createTimelineEntry: (draft: TimelineDraft) => Promise<TimelineEntry>
  updateTimelineEntry: (id: string, patch: Partial<TimelineDraft>) => Promise<void>
  deleteTimelineEntry: (id: string) => Promise<void>
  moveTimelineEntry: (id: string, targetIndex: number) => Promise<void>
  pruneTimelineReferences: () => Promise<number>
  getRelationships: () => Promise<RelationshipState>
  createRelationship: (draft: RelationshipDraft) => Promise<Relationship>
  updateRelationship: (id: string, patch: Partial<RelationshipDraft>) => Promise<void>
  deleteRelationship: (id: string) => Promise<void>
  getSessions: () => Promise<SessionState>
  checkpointSession: (open: OpenSession) => Promise<void>
  closeSession: (open: OpenSession) => Promise<WritingSession | null>
  recoverOpenSession: () => Promise<WritingSession | null>
  exportSessions: (format: 'csv' | 'json') => Promise<ExportResult>
  getIdleGapMinutes: () => Promise<number>
  setIdleGapMinutes: (minutes: number) => Promise<void>
  getSprints: () => Promise<SprintState>
  recordSprint: (sprint: Sprint) => Promise<void>
  getSprintPreferences: () => Promise<{ softLockout: boolean; chime: boolean }>
  setSprintPreferences: (next: { softLockout: boolean; chime: boolean }) => Promise<void>
  getSpeechPreferences: () => Promise<{ rate: number; voiceUri: string | null }>
  setSpeechPreferences: (next: { rate: number; voiceUri: string | null }) => Promise<void>
  getVersionInfo: () => Promise<VersionInfo>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  downloadUpdate: () => Promise<UpdateStatus>
  installUpdateNow: () => Promise<void>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
