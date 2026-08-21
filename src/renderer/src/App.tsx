import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { createEditorExtensions } from './editorExtensions'
import { FindReplace } from './extensions/findReplace'
import { ReadAloudHighlight } from './extensions/readAloudHighlight'
import { Pagination } from './extensions/pagination'
import { SpellcheckSuppress } from './extensions/spellcheckSuppress'
import {
  isManuscriptView,
  railSectionFor,
  type ActiveView,
  type BinderNode,
  type ManuscriptView,
  type OutlinerColumn,
  type OutlinerSort,
  type RailSection,
  type StatusDef,
  type TagDef,
  type SavedView
} from '../../shared/binder'
import type { EditorContextMenuPayload } from '../../shared/contextMenu'
import type { StoryBibleItem, StoryBibleSheet, StoryBibleTypeDef } from '../../shared/storyBible'
import type { MentionCandidate } from '../../shared/mentionMatcher'
import { countCharacters, countWords } from '../../shared/wordCount'
import {
  formatCharacterCount,
  formatDateTime,
  formatWordCount,
  type CountRounding
} from '../../shared/insertions'
import {
  applyImageSources,
  referencedImageIds,
  stripTransientImageSrc
} from './extensions/documentImage'
import NoteEditModal from './NoteEditModal'
import LexiconView from './LexiconView'
import LexiconNavList from './LexiconNavList'
import type { LexiconEntry } from '../../shared/lexicon'
import type { CommentRecord } from '../../shared/comments'
import { computePace } from '../../shared/pace'
import { findNode } from './binderUtils'
import Binder from './Binder'
import BinderMinimap from './BinderMinimap'
import BinderFlyoutList from './BinderFlyoutList'
import EditorContextMenu from './EditorContextMenu'
import BinderContextMenu from './BinderContextMenu'
import MentionHoverCard from './MentionHoverCard'
import LexiconHoverCard from './LexiconHoverCard'
import ImportReportModal from './ImportReportModal'
import type { ImportResult } from '../../shared/import'
import SubmissionsView from './SubmissionsView'
import SubmissionEditModal, { type SubmissionDraft } from './SubmissionEditModal'
import ManageSubmissionStatusesModal from './ManageSubmissionStatusesModal'
import SentContentModal from './SentContentModal'
import OverusedWordsModal, { type OverusedOccurrence } from './OverusedWordsModal'
import type { ScannedDocument } from '../../shared/wordFrequency'
import { collectAllDocuments, htmlToDoc } from './search/projectSearch'
import type { Submission, SubmissionStatus } from '../../shared/submissions'
import TimelineView, { type BoardMode } from './TimelineView'
import RelationshipEditModal from './RelationshipEditModal'
import SessionAnalyticsModal from './SessionAnalyticsModal'
import { useWritingSession, type WritingSessionController } from './useWritingSession'
import { useSprint } from './useSprint'
import { useReadAloud } from './useReadAloud'
import ReadAloudBar, { DEFAULT_SPEECH_RATE } from './ReadAloudBar'
import AboutModal from './AboutModal'
import UpdateBanner from './UpdateBanner'
import type { UpdateStatus } from '../../shared/update'
import { SprintStartModal, SprintResultModal } from './SprintModals'
import type { Sprint } from '../../shared/sprints'
import { DEFAULT_IDLE_GAP_MINUTES, type WritingSession } from '../../shared/sessions'
import type { Relationship, RelationshipDraft } from '../../shared/relationships'
import TimelineEntryModal from './TimelineEntryModal'
import type { TimelineDraft, TimelineEntry } from '../../shared/timeline'
import FindBar, { type FindFocusRequest } from './FindBar'
import type { RankedMatch } from '../../shared/search'
import BackupsModal from './BackupsModal'
import SnapshotsModal from './SnapshotsModal'
import SpanTagToolbarPicker from './SpanTagToolbarPicker'
import SpanTagBrowserModal from './SpanTagBrowserModal'
import MenuBar from './MenuBar'
import TemplateModal from './TemplateModal'
import TypographyModal from './TypographyModal'
import SaveLayoutPresetModal from './SaveLayoutPresetModal'
import ManageLayoutPresetsModal from './ManageLayoutPresetsModal'
import WelcomeScreen from './WelcomeScreen'
import ViewSwitcher from './ViewSwitcher'
import NavRail from './NavRail'
import SidePanel from './SidePanel'
import StoryBibleNavList from './StoryBibleNavList'
import TimelineNavList from './TimelineNavList'
import SubmissionsNavFilter from './SubmissionsNavFilter'
import OutlinerView from './OutlinerView'
import CorkboardView from './CorkboardView'
import StoryBibleView, { type StoryBibleViewHandle } from './StoryBibleView'
import ProjectTargetModal from './ProjectTargetModal'
import ManageColorListModal from './ManageColorListModal'
import SaveViewModal from './SaveViewModal'
import ManageSavedViewsModal from './ManageSavedViewsModal'
import PageSetupModal from './PageSetupModal'
import SplitViewPane, { type SplitViewPaneHandle } from './SplitViewPane'
import { paginate, pageGeometry, PAGE_GAP_PX, type Pagination as PaginationResult } from './pagePreview'
import { ALL_SHORTCUTS, buildMenus, matchesShortcut } from './menuConfig'
import { shadeHex, isDarkHex } from './colorUtils'
import {
  STYLE_OPTIONS,
  FONT_FAMILIES,
  FONT_SIZES_PT,
  DEFAULT_FONT_SIZE_PT,
  LINE_HEIGHTS,
  type StyleValue
} from './toolbarOptions'
import {
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  BulletListIcon,
  OrderedListIcon,
  IndentIcon,
  OutdentIcon,
  TextColorIcon,
  HighlightIcon,
  UndoIcon,
  RedoIcon,
  OptionsIcon
} from './icons'
import type { Theme, TypographyDefaults, PageSize } from '../../shared/preferences'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_ZOOM_PERCENT,
  MAX_ZOOM_PERCENT,
  ZOOM_STEP_PERCENT,
  DEFAULT_ZOOM_PERCENT,
  DEFAULT_CARD_WIDTH,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_MARGIN_MM
} from '../../shared/preferences'
import type { ExportFormat } from '../../shared/export'
import type { SnapshotMeta } from '../../shared/snapshot'
import type { SpanTagRecord } from '../../shared/spanTags'
import type { TemplateId } from '../../shared/templates'
import { COLOR_PRESETS } from '../../shared/colorPresets'
import { TOOLBAR_SECTIONS, type ToolbarSectionId } from '../../shared/toolbarSections'
import type { LayoutPreset } from '../../shared/layoutPresets'

type Status = 'idle' | 'saving' | 'saved' | 'error'
type Align = 'left' | 'center' | 'right' | 'justify'

const AUTOSAVE_DELAY_MS = 500
// Hard ceiling on how long unsaved edits can sit in memory — protects
// against losing more than a few seconds of work if the app is killed
// outright (crash / force-quit), where no graceful shutdown hook can run.
const MAX_UNSAVED_MS = 3000
// Short enough that the word counter still reads as live while typing, long
// enough that a fast typist never pays for a full-document recount per key.
const WORD_COUNT_DELAY_MS = 200
// Repagination waits for a pause in typing, because measuring page breaks
// means laying the whole document out off-screen — measured at roughly 45ms
// on a 39,000-word manuscript. At that cost a short pause is affordable, and
// a longer one only makes new pages feel late.
const PAGINATION_DEBOUNCE_MS = 350
// A pure debounce is reset by every keystroke, so typing continuously past
// the bottom of the last page produced no new page at all until the writer
// stopped. This is the ceiling on that: however long someone keeps typing,
// the pages catch up at least this often.
//
// Adaptive rather than fixed, because the cost is a property of the document
// rather than a constant: an ordinary manuscript paginates in ~45ms, while a
// pathological one — a single 40,000-word paragraph with no breaks at all —
// takes ~430ms, and repaginating that every 700ms would spend most of a
// second of every second on it. Budgeting a fixed share of the time keeps
// the common case responsive without letting the rare case saturate.
const PAGINATION_MIN_INTERVAL_MS = 700
const PAGINATION_MAX_INTERVAL_MS = 2500
/** Repaginate at most one part in six of elapsed time. */
const PAGINATION_DUTY_FACTOR = 6
const ALIGN_VALUES: Align[] = ['left', 'center', 'right', 'justify']
const ALIGN_SHORTCUTS: Record<Align, string> = {
  left: 'Ctrl+Shift+L',
  center: 'Ctrl+Shift+E',
  right: 'Ctrl+Shift+R',
  justify: 'Ctrl+Shift+J'
}

/** mm:ss for the sprint countdown. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function parsePt(size: string | null | undefined): number {
  if (!size) return DEFAULT_FONT_SIZE_PT
  const n = parseFloat(size)
  return Number.isNaN(n) ? DEFAULT_FONT_SIZE_PT : n
}

function buildMentionCandidates(items: StoryBibleItem[]): MentionCandidate[] {
  const candidates: MentionCandidate[] = []
  for (const item of items) {
    candidates.push({ itemId: item.id, text: item.name })
    for (const alias of item.aliases) candidates.push({ itemId: item.id, text: alias })
  }
  return candidates
}

function App(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle')
  const [tree, setTree] = useState<BinderNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [editRequestId, setEditRequestId] = useState<{ id: string; token: number } | null>(null)
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuPayload | null>(null)
  // Footnote being written or edited. `pos` addresses the node in the current
  // document, so the modal can write the text straight back onto it.
  const [footnoteEdit, setFootnoteEdit] = useState<{ pos: number; text: string; isNew: boolean } | null>(null)
  // Comment being written or edited. A new one has its mark applied only when
  // the modal is saved, so cancelling leaves no orphan highlight behind.
  const [commentEdit, setCommentEdit] = useState<{
    commentId: string
    body: string
    snippet: string
    isNew: boolean
  } | null>(null)
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [lexiconEntries, setLexiconEntries] = useState<LexiconEntry[]>([])
  const [lexiconReveal, setLexiconReveal] = useState<{ id: string; token: number } | null>(null)
  // The hover listener is attached once, so it reads entries through a ref
  // rather than closing over a stale render.
  const lexiconEntriesRef = useRef<LexiconEntry[]>([])
  lexiconEntriesRef.current = lexiconEntries
  // The editor's handleClickOn closure is created once, so it can't read
  // `comments` directly without going stale — it reads this instead.
  const commentsRef = useRef<CommentRecord[]>([])
  commentsRef.current = comments
  const [binderContextMenu, setBinderContextMenu] = useState<{
    node: BinderNode | null
    x: number
    y: number
  } | null>(null)
  const [revealRequest, setRevealRequest] = useState<{ id: string; token: number } | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')
  const [findFocusRequest, setFindFocusRequest] = useState<FindFocusRequest | null>(null)
  const [backupsModalOpen, setBackupsModalOpen] = useState(false)
  const [snapshotsModalOpen, setSnapshotsModalOpen] = useState(false)
  const [spanTagRollup, setSpanTagRollup] = useState<Record<string, string[]>>({})
  const [storyBibleItems, setStoryBibleItems] = useState<StoryBibleItem[]>([])
  const [storyBibleTypes, setStoryBibleTypes] = useState<StoryBibleTypeDef[]>([])
  const [mentionRollup, setMentionRollup] = useState<Record<string, string[]>>({})
  const [importReport, setImportReport] = useState<ImportResult | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionStatuses, setSubmissionStatuses] = useState<SubmissionStatus[]>([])
  const [submissionEdit, setSubmissionEdit] = useState<{ existing: Submission | null } | null>(null)
  const [manageSubmissionStatusesOpen, setManageSubmissionStatusesOpen] = useState(false)
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([])
  const [timelineEdit, setTimelineEdit] = useState<{ existing: TimelineEntry | null } | null>(null)
  const [sentContent, setSentContent] = useState<{ title: string; html: string | null; error: string | null } | null>(null)
  const [hoveredMention, setHoveredMention] = useState<{ itemId: string; rect: DOMRect } | null>(null)
  const [hoveredLexiconWord, setHoveredLexiconWord] = useState<{ word: string; rect: DOMRect } | null>(null)
  const [hoveredMentionSheet, setHoveredMentionSheet] = useState<StoryBibleSheet | null>(null)
  const [spanTagBrowserOpen, setSpanTagBrowserOpen] = useState(false)
  const [spanTagBrowserSpans, setSpanTagBrowserSpans] = useState<SpanTagRecord[]>([])
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [distractionFree, setDistractionFree] = useState(false)
  const [trueBlack, setTrueBlackState] = useState(false)
  const [accentColor, setAccentColorState] = useState<string | null>(null)
  const [zoomPercent, setZoomPercentState] = useState(DEFAULT_ZOOM_PERCENT)
  const [defaultTypography, setDefaultTypography] = useState<TypographyDefaults>({
    fontFamily: null,
    fontSizePt: null,
    lineHeight: null
  })
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [typographyModalOpen, setTypographyModalOpen] = useState(false)
  const [backgroundColor, setBackgroundColorState] = useState<string | null>(null)
  const [textColor, setTextColorState] = useState<string | null>(null)
  const [hiddenToolbarSections, setHiddenToolbarSections] = useState<ToolbarSectionId[]>([])
  const [layoutPresets, setLayoutPresets] = useState<LayoutPreset[]>([])
  const [saveLayoutPresetModalOpen, setSaveLayoutPresetModalOpen] = useState(false)
  const [managePresetsModalOpen, setManagePresetsModalOpen] = useState(false)
  const [toolbarOverflowOpen, setToolbarOverflowOpen] = useState(false)
  // undefined while checking, then true/false once known — avoids flashing
  // the normal UI (or the welcome screen) before we actually know which to show.
  const [projectReady, setProjectReady] = useState<boolean | undefined>(undefined)
  const [activeView, setActiveViewState] = useState<ActiveView>('editor')
  // Which of the three manuscript views to restore when the rail comes back to
  // 'manuscript'. The rail section itself is derived from activeView, never
  // stored, so the two can't disagree.
  const [manuscriptView, setManuscriptViewState] = useState<ManuscriptView>('editor')
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false)
  const [storyBibleSelectedId, setStoryBibleSelectedId] = useState<string | null>(null)
  const [timelineRevealRequest, setTimelineRevealRequest] = useState<{ id: string; token: number } | null>(null)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [relationshipEdit, setRelationshipEdit] = useState<{ existing: Relationship | null; fromId: string | null } | null>(null)
  // Which face of the continuity board is showing. Session state only — the
  // board opens on the chronology, which is its primary reading.
  const [boardMode, setBoardMode] = useState<BoardMode>('chronology')
  const [sessions, setSessions] = useState<WritingSession[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [sprintStartOpen, setSprintStartOpen] = useState(false)
  const [sprintResult, setSprintResult] = useState<Sprint | null>(null)
  const [sprintPrefs, setSprintPrefs] = useState({ softLockout: false, chime: true })
  const [aboutOpen, setAboutOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [readAloudOpen, setReadAloudOpen] = useState(false)
  const [speechRate, setSpeechRate] = useState(DEFAULT_SPEECH_RATE)
  const [speechVoiceUri, setSpeechVoiceUri] = useState<string | null>(null)
  const [idleGapMinutes, setIdleGapMinutes] = useState(DEFAULT_IDLE_GAP_MINUTES)
  const [overusedModalOpen, setOverusedModalOpen] = useState(false)
  const [overusedDocuments, setOverusedDocuments] = useState<ScannedDocument[]>([])
  const [overusedIgnoreList, setOverusedIgnoreList] = useState<string[]>([])
  const [authorName, setAuthorName] = useState<string | null>(null)
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string | null>(null)
  const [outlinerSort, setOutlinerSortState] = useState<OutlinerSort | null>(null)
  const [outlinerFilter, setOutlinerFilterState] = useState('')
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({})
  const [cardWidth, setCardWidthState] = useState(DEFAULT_CARD_WIDTH)
  const [statuses, setStatuses] = useState<StatusDef[]>([])
  const [tags, setTags] = useState<TagDef[]>([])
  const [statusFilter, setStatusFilterState] = useState<string[]>([])
  const [tagFilter, setTagFilterState] = useState<string[]>([])
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [projectWordTarget, setProjectWordTargetState] = useState<number | null>(null)
  const [projectDeadline, setProjectDeadlineState] = useState<string | null>(null)
  const [projectTargetStartDate, setProjectTargetStartDate] = useState<string | null>(null)
  const [projectTargetStartCount, setProjectTargetStartCount] = useState<number | null>(null)
  const [projectTargetModalOpen, setProjectTargetModalOpen] = useState(false)
  const [manageStatusesModalOpen, setManageStatusesModalOpen] = useState(false)
  const [manageTagsModalOpen, setManageTagsModalOpen] = useState(false)
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false)
  const [manageSavedViewsModalOpen, setManageSavedViewsModalOpen] = useState(false)
  const [pageSize, setPageSizeState] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [pageMarginMm, setPageMarginMmState] = useState(DEFAULT_PAGE_MARGIN_MM)
  const [pageCount, setPageCount] = useState(0)
  // Where the sheets go and how big they are. Null until the first
  // measurement lands, which is why the stack falls back to a single
  // correctly-sized page rather than to no page at all.
  const [pagination, setPagination] = useState<PaginationResult | null>(null)
  const [pageSetupModalOpen, setPageSetupModalOpen] = useState(false)
  const [referenceDocumentId, setReferenceDocumentIdState] = useState<string | null>(null)
  const [splitViewLocked, setSplitViewLockedState] = useState(false)
  const [splitViewSyncScroll, setSplitViewSyncScrollState] = useState(false)

  const activeDocumentIdRef = useRef<string | null>(null)
  const lastSavedHtml = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout>>()
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)
  const isResizingRef = useRef(false)
  // The collapsed rail matches its top zone's chrome-colored height to the
  // real toolbar's, so it reads as a continuation of the toolbar rather than
  // a separately-colored strip beside it. Measured rather than assumed
  // because the toolbar wraps to more than one row at narrow widths.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const textColorInputRef = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const accentColorInputRef = useRef<HTMLInputElement>(null)
  const themeBackgroundColorInputRef = useRef<HTMLInputElement>(null)
  const themeTextColorInputRef = useRef<HTMLInputElement>(null)
  const toolbarOverflowRef = useRef<HTMLDivElement>(null)
  const outlinerFilterSaveTimer = useRef<ReturnType<typeof setTimeout>>()
  const pageCountTimer = useRef<ReturnType<typeof setTimeout>>()
  const paginationMaxWaitTimer = useRef<ReturnType<typeof setTimeout>>()
  /** Latest pagination result, read by the tail check's rAF callback — which
   *  must not close over a stale render's state. */
  const paginationRef = useRef<PaginationResult | null>(null)
  const tailCheckFrame = useRef<number | null>(null)
  /** Set when an instant pass failed to add a page; cleared by the next
   *  measurement. See runTailCheck. */
  const instantPaginationSuppressed = useRef(false)
  /** Cost of the most recent pagination pass, in ms — see schedulePageCount. */
  const lastPaginationMsRef = useRef(0)
  const wordCountTimer = useRef<ReturnType<typeof setTimeout>>()
  const mentionScanTimer = useRef<ReturnType<typeof setTimeout>>()
  const mentionHideTimer = useRef<ReturnType<typeof setTimeout>>()
  const mentionSheetCache = useRef<Map<string, StoryBibleSheet>>(new Map())
  const hoveredItemIdRef = useRef<string | null>(null)
  const pageSizeRef = useRef<PageSize>(DEFAULT_PAGE_SIZE)
  const pageMarginMmRef = useRef(DEFAULT_PAGE_MARGIN_MM)
  const splitPaneRef = useRef<SplitViewPaneHandle>(null)
  const storyBibleRef = useRef<StoryBibleViewHandle>(null)
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const referenceScrollRef = useRef<HTMLDivElement>(null)
  const isSyncingScrollRef = useRef(false)
  const [, forceRender] = useReducer((c: number) => c + 1, 0)

  // The session recorder reads the live project total through this ref rather
  // than as a prop, so a changing word count never re-subscribes the hook.
  const projectWordCountRef = useRef(0)
  const sessionRef = useRef<WritingSessionController | null>(null)
  const sprintRef = useRef<ReturnType<typeof useSprint> | null>(null)

  const [documentWordCount, setDocumentWordCount] = useState(0)
  const [otherDocsWordCount, setOtherDocsWordCount] = useState(0)
  const [sessionBaseline, setSessionBaseline] = useState(0)

  const editor = useEditor({
    // Pagination is main-editor only: the split pane is a narrow reference
    // view where a full-width sheet would mean permanent horizontal scroll.
    extensions: [...createEditorExtensions(), FindReplace, ReadAloudHighlight, Pagination, SpellcheckSuppress],
    content: '',
    editorProps: {
      attributes: { spellcheck: 'true' },
      // Click a footnote marker or commented text to edit the note behind it.
      // handleClickOn gives the exact node/position, so neither needs a
      // NodeView or a DOM query to find what was clicked.
      handleClickOn: (_view, _pos, node, nodePos) => {
        if (node.type.name === 'footnote') {
          setFootnoteEdit({ pos: nodePos, text: String(node.attrs.text ?? ''), isNew: false })
          return true
        }
        const commentMark = node.marks?.find((mark) => mark.type.name === 'comment')
        if (commentMark) {
          const commentId = String(commentMark.attrs.commentId ?? '')
          const existing = commentsRef.current.find((c) => c.id === commentId)
          if (existing) {
            setCommentEdit({
              commentId,
              body: existing.body,
              snippet: existing.snippet,
              isNew: false
            })
            return true
          }
        }
        return false
      }
    },
    // Nothing here may touch the document's full HTML. Serializing the doc
    // (editor.getHTML) and re-scanning it (countWords) on every keystroke was
    // the measured typing bottleneck on a large document — ~2.7ms/keystroke
    // for the word count alone on a 20k-word file, and it scales with
    // document length. Every full-document operation now happens behind its
    // own debounce, on a pause, at the same intervals as before.
    onUpdate: ({ editor }) => {
      // One ref write; see useWritingSession. Nothing here serializes the doc.
      sessionRef.current?.noteActivity()
      sprintRef.current?.noteActivity()
      markDocumentDirty()
      scheduleWordCount()
      scheduleSave()
      schedulePageCount()
      // Cheap, rAF-deferred, last-page-only: see scheduleTailCheck.
      scheduleTailCheck()
      scheduleMentionScan(editor)
    },
    // Lets the main process's context-menu handler tell this editor apart
    // from the split-view pane's independent editor instance — both report
    // formControlType 'none', so focus is the only distinguishing signal.
    onFocus: () => window.api.setEditorFocused(true),
    onBlur: () => window.api.setEditorFocused(false)
  })

  // Session detection. Deliberately independent of every save/count timer —
  // see useWritingSession — so it can neither delay a save nor slow typing.
  const writingSession = useWritingSession({
    idleGapMinutes,
    projectWordCountRef,
    activeDocumentIdRef,
    onSessionClosed: () => void refreshSessions()
  })
  sessionRef.current = writingSession

  // The sprint timer sits on top of the session system: it reads the enclosing
  // session's id, and never opens or seals a session itself.
  const sprint = useSprint({
    projectWordCountRef,
    activeDocumentIdRef,
    currentSessionId: writingSession.currentSessionId,
    chime: sprintPrefs.chime,
    onFinished: (finished) => {
      setSprintResult(finished)
      void refreshSprints()
    }
  })
  sprintRef.current = sprint

  // Read-aloud speaks the LIVE editor document — no second extraction path.
  const readAloud = useReadAloud({ editor, rate: speechRate, voiceUri: speechVoiceUri })

  useEffect(() => window.api.onEditorContextMenu(setEditorContextMenu), [])

  // Page count reflows on a pause in typing, not every keystroke — updated
  // via the same offscreen, real-layout measurement used for the split
  // pane, reading the live editor's own HTML/formatting, never a copy.
  // Serializes the document itself, at fire time, so a keystroke never pays
  // for it.
  function schedulePageCount(): void {
    if (pageCountTimer.current) clearTimeout(pageCountTimer.current)
    pageCountTimer.current = setTimeout(() => {
      if (!editor) return
      applyPagination(editor.getHTML())
    }, PAGINATION_DEBOUNCE_MS)

    // The debounce above is reset by every keystroke, so on its own it never
    // fires while someone is actually typing — which is exactly when a page
    // fills up and a new one needs to appear. This max-wait guarantees the
    // pages keep up during continuous typing, the same shape as the
    // max-unsaved guarantee that backs autosave. Its interval is scaled to
    // what this document actually costs to measure; see the constants.
    if (!paginationMaxWaitTimer.current) {
      const interval = Math.min(
        PAGINATION_MAX_INTERVAL_MS,
        Math.max(PAGINATION_MIN_INTERVAL_MS, lastPaginationMsRef.current * PAGINATION_DUTY_FACTOR)
      )
      paginationMaxWaitTimer.current = setTimeout(() => {
        paginationMaxWaitTimer.current = undefined
        if (editor) applyPagination(editor.getHTML())
      }, interval)
    }
  }

  // The visible word count updates on a brief pause rather than per
  // keystroke: counting words means serializing the whole document and
  // regex-stripping it, which is the single most expensive thing that used
  // to run on the keystroke path. 200ms still reads as live while typing.
  function scheduleWordCount(): void {
    if (wordCountTimer.current) clearTimeout(wordCountTimer.current)
    wordCountTimer.current = setTimeout(() => {
      if (!editor) return
      setDocumentWordCount(countWords(editor.getHTML()))
    }, WORD_COUNT_DELAY_MS)
  }

  /** One measurement pass drives both the sheets on screen and the count in
   *  the footer — they read the same Pagination object, so they cannot
   *  report different numbers of pages. */
  function applyPagination(html: string): PaginationResult {
    // Whichever timer got here first, both are now satisfied — and the
    // max-wait must be disarmed so the next burst of typing arms a fresh one
    // rather than inheriting an almost-expired timer.
    if (pageCountTimer.current) {
      clearTimeout(pageCountTimer.current)
      pageCountTimer.current = undefined
    }
    if (paginationMaxWaitTimer.current) {
      clearTimeout(paginationMaxWaitTimer.current)
      paginationMaxWaitTimer.current = undefined
    }
    const startedAt = performance.now()
    const result = paginate(html, pageSizeRef.current, pageMarginMmRef.current)
    // Feeds the adaptive max-wait interval above, so a document that is
    // expensive to measure is measured less often.
    lastPaginationMsRef.current = performance.now() - startedAt
    paginationRef.current = result
    setPagination(result)
    setPageCount(result.pageCount)
    // Not added to the undo history and doesn't touch the document — see the
    // setPageBreaks command.
    editor?.commands.setPageBreaks(result.breaks)
    // A fresh measurement re-arms the instant path: whatever made it give up
    // before is no longer the current state of the document.
    instantPaginationSuppressed.current = false
    return result
  }

  /**
   * Appending past the bottom of the last page repaginates immediately
   * instead of waiting for the debounce, so a new sheet appears as you type
   * rather than after you stop.
   *
   * Deliberately narrow. This reads the live editor — which contains the gap
   * decorations pagination itself renders — so it is confined to producing a
   * single boolean: "measure now". It never decides where a break goes. Every
   * break position still comes from paginate() against the clean off-screen
   * copy, which has no gaps in it, exactly as before. That separation is what
   * keeps this from feeding its own output back into its next input.
   *
   * Runs inside requestAnimationFrame, so the browser has already laid out:
   * it observes a settled DOM, never forces a synchronous reflow on the
   * keystroke path, and can run at most once per frame.
   */
  function scheduleTailCheck(): void {
    if (tailCheckFrame.current !== null) return
    if (instantPaginationSuppressed.current) return
    tailCheckFrame.current = requestAnimationFrame(() => {
      tailCheckFrame.current = null
      runTailCheck()
    })
  }

  function runTailCheck(): void {
    const current = paginationRef.current
    if (!editor || !current) return

    const { geometry, pageCount } = current
    const stride = geometry.usableHeightPx + geometry.marginPx * 2 + PAGE_GAP_PX

    let caretBottom: number
    let editorRect: DOMRect
    try {
      // ProseMirror's own coordinate lookup rather than the DOM selection
      // API: it answers for the document position, so it stays correct when
      // the selection is inside a node view or beside a widget.
      caretBottom = editor.view.coordsAtPos(editor.state.selection.head).bottom
      editorRect = editor.view.dom.getBoundingClientRect()
    } catch {
      // A position that no longer resolves (mid-transaction) is not worth
      // reacting to; the debounced pass will catch up regardless.
      return
    }

    // Into the same content-box coordinates paginate() works in.
    const caretPage = Math.floor((caretBottom - editorRect.top - geometry.marginPx) / stride)

    // The element is margin + content + margin, so this is where the content
    // actually ends — including any gaps pagination has already inserted,
    // which is exactly the coordinate space the page boundaries live in.
    const contentBottom = editorRect.height - geometry.marginPx * 2
    const lastPageTextBottom = (pageCount - 1) * stride + geometry.usableHeightPx
    const previousPageTextBottom = (pageCount - 2) * stride + geometry.usableHeightPx

    // Symmetric in effect, but the two cases cannot share a caret test.
    //
    // Growing: strictly the last page. An edit further back can shift breaks
    // for everything after it, which is the debounced path's job, and letting
    // this fire there would mean a full repagination every frame while
    // someone types mid-manuscript.
    //
    // Shrinking: one page of extra slack, because deleting backwards across a
    // boundary lands the caret on the page *before* the last — the caret
    // never goes past a page bottom on the way up, which is why the forward
    // check could never see this case. Safe to allow, since content that no
    // longer reaches the last page can only mean there is one too many.
    const needsAnotherPage = caretPage >= pageCount - 1 && contentBottom > lastPageTextBottom + 1
    const hasSparePage =
      pageCount > 1 && caretPage >= pageCount - 2 && contentBottom <= previousPageTextBottom
    if (!needsAnotherPage && !hasSparePage) return

    const result = applyPagination(editor.getHTML())
    // If measuring changed nothing, the content is past a boundary that
    // pagination cannot resolve — a single line taller than a page. Stop
    // trying until the next debounced pass re-arms it, rather than paying for
    // a full measurement on every frame.
    if (result.pageCount === pageCount) instantPaginationSuppressed.current = true
  }

  /** Paginates content the caller already has in hand, but on the next
   *  frame, so opening/restoring a document paints first and pays for the
   *  offscreen layout measurement afterwards. */
  function deferPageCount(html: string): void {
    if (pageCountTimer.current) clearTimeout(pageCountTimer.current)
    requestAnimationFrame(() => applyPagination(html))
  }

  /** Immediate, cheap side of an edit: flag unsaved state and arm the
   *  max-wait save guarantee, without serializing anything. */
  function markDocumentDirty(): void {
    if (!activeDocumentIdRef.current) return
    setStatus('idle')
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => {
        maxWaitTimer.current = undefined
        if (editor) void performSave(editor.getHTML())
      }, MAX_UNSAVED_MS)
    }
  }

  // Same debounce shape as schedulePageCount, same reasoning: mention
  // highlighting is active for 100% of typing (unlike Find, which only
  // recomputes constantly while a rare, deliberate search is open), so it
  // must not re-scan the document on every keystroke. The
  // mentionHighlight plugin itself never auto-recomputes on doc changes —
  // this is what actually triggers a recompute, after a pause.
  function scheduleMentionScan(editorInstance: Editor): void {
    if (mentionScanTimer.current) clearTimeout(mentionScanTimer.current)
    mentionScanTimer.current = setTimeout(() => {
      editorInstance.commands.rescanMentions()
    }, 600)
  }

  useEffect(() => {
    pageSizeRef.current = pageSize
    pageMarginMmRef.current = pageMarginMm
    // Changing page size or margins changes where every break falls, so the
    // sheets have to be re-laid-out, not just recounted.
    if (editor) applyPagination(editor.getHTML())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, pageMarginMm])

  useEffect(() => {
    if (!editor) return
    const onTransaction = (): void => forceRender()
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])

  // Onboarding: checked once, independent of the editor — a brand-new
  // install (or a freshly opened, still-empty project folder) shows the
  // welcome screen instead of the normal chrome.
  useEffect(() => {
    window.api.projectExists().then(setProjectReady)
  }, [])

  async function handleOpenProject(): Promise<void> {
    const result = await window.api.openProjectFolder()
    if (!result.opened) return
    // The project root changed in the main process — every store there reads
    // it fresh, but the simplest correct way to resync all the renderer's
    // own state (tree, editor content, every preference) is the same full
    // reload already used after restoring a backup.
    window.location.reload()
  }

  async function performSave(html: string): Promise<void> {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    if (maxWaitTimer.current) {
      clearTimeout(maxWaitTimer.current)
      maxWaitTimer.current = undefined
    }
    const docId = activeDocumentIdRef.current
    if (!docId) return
    if (html === lastSavedHtml.current) return
    setStatus('saving')
    try {
      // The base64 data URIs the editor paints images with are transient —
      // only the durable image id is written to disk, or every save would
      // put megabytes of binary into a text file. lastSavedHtml keeps the
      // editor's own version so the next dirty-check compares like with like.
      await window.api.saveDocument(docId, stripTransientImageSrc(html))
      lastSavedHtml.current = html
      setStatus('saved')
      // The main process rebuilds spanTags.json from this same save, so the
      // rollup badges (binder/outliner/corkboard) and browse list stay live
      // as you tag spans, not just after a manual refresh.
      void window.api.getSpanTagRollup().then(setSpanTagRollup)
      // Mirrors the span-tag refresh above — mentionStore's rebuild for this
      // document is fire-and-forget on the main side, so this refetch can
      // land slightly before it's done; the next save (or the debounced
      // live highlight) catches up. Good enough for a rollup badge.
      void refreshMentionRollup()
    } catch {
      setStatus('error')
    }
  }

  // Debounce: save shortly after typing pauses. The document is serialized
  // at fire time, not per keystroke (see onUpdate). The max-wait guarantee
  // that a save can't be outrun by continuous typing is armed separately in
  // markDocumentDirty, which runs immediately on every edit.
  function scheduleSave(): void {
    if (!activeDocumentIdRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (editor) void performSave(editor.getHTML())
    }, AUTOSAVE_DELAY_MS)
  }

  async function flushPendingSave(): Promise<void> {
    if (!editor) return
    await performSave(editor.getHTML())
  }

  async function handleCreateSnapshot(name: string | null): Promise<SnapshotMeta> {
    // Flush first so a manual snapshot never captures stale on-disk content
    // that's a few hundred ms behind what's actually on screen.
    await flushPendingSave()
    const id = activeDocumentIdRef.current
    if (!id) throw new Error('No active document')
    return window.api.createSnapshot(id, name)
  }

  async function handleRestoreSnapshot(snapshotId: string): Promise<void> {
    await flushPendingSave()
    const id = activeDocumentIdRef.current
    if (!id || !editor) return
    // snapshot:restore only reads/writes under snapshots/ — it returns the
    // target HTML without ever touching documents/<id>.html itself. Applying
    // it here and saving through the normal saveDocument call keeps restore
    // on the exact same single-writer path autosave already uses.
    const restoredHtml = await window.api.restoreSnapshot(id, snapshotId)
    lastSavedHtml.current = restoredHtml
    editor.commands.setContent(restoredHtml, false)
    setDocumentWordCount(countWords(restoredHtml))
    deferPageCount(restoredHtml)
    await window.api.saveDocument(id, restoredHtml)
    setStatus('saved')
    // This save bypasses performSave (restore already has its own save
    // call above), so it needs its own rollup refresh — the main process
    // rebuilt spanTags.json from this save, but the renderer's cached
    // rollup won't know that until it re-fetches.
    void window.api.getSpanTagRollup().then(setSpanTagRollup)
    void refreshMentionRollup()
  }

  /** Paints the saved image ids back into displayable data URIs. The inverse
   *  of the strip on save — one IPC round trip for all of a document's
   *  images rather than one per image. */
  async function hydrateImages(html: string): Promise<string> {
    const ids = referencedImageIds(html)
    if (ids.length === 0) return html
    const sources = await window.api.getDocumentImages(ids)
    return applyImageSources(html, sources)
  }

  async function switchDocument(id: string): Promise<void> {
    if (!editor || activeDocumentIdRef.current === id) return
    await flushPendingSave()
    const stored = await window.api.loadDocument(id)
    const html = await hydrateImages(stored)
    activeDocumentIdRef.current = id
    lastSavedHtml.current = html
    editor.commands.setContent(html, false)
    editor.commands.rescanMentions()
    setActiveDocumentId(id)
    setDocumentWordCount(countWords(html))
    // Deferred a frame rather than run inline: this is a real offscreen
    // layout (~60ms on a 20k-word document) and running it synchronously here
    // kept the newly-opened document from painting until it finished.
    deferPageCount(html)
    setStatus('saved')
    window.api.setLastOpenDocument(id)
    const others = await window.api.getOtherDocumentsWordCount(id)
    setOtherDocsWordCount(others)
  }

  async function jumpToSpan(documentId: string, spanId: string): Promise<void> {
    setSpanTagBrowserOpen(false)
    setActiveViewState('editor')
    void window.api.setActiveView('editor')
    if (activeDocumentIdRef.current !== documentId) await switchDocument(documentId)
    // The editor DOM updates synchronously from setContent, but give it a
    // frame before querying so the browser has actually painted the nodes.
    requestAnimationFrame(() => {
      // pagePreview.ts keeps a hidden off-screen .ProseMirror clone (same
      // class, same HTML) for page-count measurement — exclude it explicitly
      // rather than relying on DOM order to put the real editor first.
      const el = document.querySelector(`.ProseMirror:not(.page-measure-content) [data-span-id="${spanId}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('span-tag-jump-flash')
      setTimeout(() => el.classList.remove('span-tag-jump-flash'), 1600)
    })
  }

  async function refreshTree(): Promise<BinderNode[]> {
    const state = await window.api.getBinderState()
    setTree(state.tree)
    return state.tree
  }

  async function handleRenameProject(name: string): Promise<void> {
    setEditingProjectName(false)
    const trimmed = name.trim()
    if (!trimmed || trimmed === projectName) return
    setProjectName(trimmed)
    await window.api.setProjectName(trimmed)
  }

  function handleOpenMentionItem(itemId: string): void {
    setHoveredMention(null)
    handleViewChange('storyBible')
    storyBibleRef.current?.openItem(itemId)
  }

  async function handleSetManualMention(documentId: string, itemId: string, present: boolean): Promise<void> {
    await window.api.setManualMention(documentId, itemId, present)
    await refreshMentionRollup()
  }

  async function refreshOtherDocsWordCount(): Promise<void> {
    const others = await window.api.getOtherDocumentsWordCount(activeDocumentIdRef.current)
    setOtherDocsWordCount(others)
  }

  useEffect(() => {
    if (!editor) return
    window.api.getBinderState().then(async (state) => {
      setTree(state.tree)
      setProjectName(state.projectName)
      setActiveViewState(state.viewState.activeView)
      setManuscriptViewState(state.viewState.manuscriptView)
      setOutlinerSortState(state.viewState.outlinerSort)
      setOutlinerFilterState(state.viewState.outlinerFilter)
      setStatusFilterState(state.viewState.statusFilter)
      setTagFilterState(state.viewState.tagFilter)
      setStatuses(state.statuses)
      setTags(state.tags)
      setSavedViews(state.savedViews)
      setOverusedIgnoreList(state.overusedIgnoreList)
      setAuthorName(state.authorName)
      setProjectWordTargetState(state.projectWordTarget)
      setProjectDeadlineState(state.projectDeadline)
      setProjectTargetStartDate(state.projectTargetStartDate)
      setProjectTargetStartCount(state.projectTargetStartCount)
      setReferenceDocumentIdState(state.viewState.referenceDocumentId)
      setSplitViewLockedState(state.viewState.splitViewLocked)
      setSplitViewSyncScrollState(state.viewState.splitViewSyncScroll)
      const target = state.lastOpenDocumentId
      if (target && findNode(state.tree, target)?.type === 'document') {
        await switchDocument(target)
      } else {
        await refreshOtherDocsWordCount()
      }
    })
    window.api.getDailyWordCountBaseline().then(setSessionBaseline)
    window.api.getSpanTagRollup().then(setSpanTagRollup)
    void refreshComments()
    void refreshLexicon()
    void refreshSuppressedWords()
    void refreshStoryBibleIndex()
    void refreshMentionRollup()
    void refreshSubmissions()
    void refreshTimeline()
    void refreshRelationships()
    void refreshSessions()
    window.api.getIdleGapMinutes().then(setIdleGapMinutes)
    window.api.getSprintPreferences().then(setSprintPrefs)
    window.api.getSpeechPreferences().then(({ rate, voiceUri }) => {
      setSpeechRate(rate)
      setSpeechVoiceUri(voiceUri)
    })
    void refreshSprints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Story Bible's item/alias list is lifted here (not just inside
  // StoryBibleView) because the main editor also needs it live, to build
  // mention-detection candidates — one source of truth, not two
  // independently-fetched copies that could silently drift apart after an
  // edit made in one place isn't reflected in the other.
  async function refreshStoryBibleIndex(): Promise<void> {
    const state = await window.api.getStoryBibleIndex()
    setStoryBibleItems(state.items)
    setStoryBibleTypes(state.types)
    // Item names and aliases are the other writer of the shared suppression
    // list (the main process re-registers them on every name change), so any
    // refresh of the index is also the moment to re-read that list. The
    // Lexicon is untouched by this — neither feature reads the other's data.
    await refreshSuppressedWords()
  }

  async function refreshMentionRollup(): Promise<void> {
    const rollup = await window.api.getMentionRollup()
    setMentionRollup(rollup)
  }

  useEffect(() => window.api.onMentionsUpdated(() => void refreshMentionRollup()), [])

  // Update status arrives as a push from the main process. It is only ever a
  // notification — nothing downloads or installs without a click.
  useEffect(() => {
    void window.api.getUpdateStatus().then(setUpdateStatus)
    return window.api.onUpdateStatus((status) => {
      setUpdateStatus(status)
      if (status.state === 'available' || status.state === 'ready') setUpdateDismissed(false)
    })
  }, [])

  // Pushes the live candidate list (every item's name + aliases) into the
  // editor's mentionHighlight extension whenever it changes, and forces an
  // immediate recompute (not the debounced one — this isn't mid-typing).
  useEffect(() => {
    if (!editor) return
    editor.commands.setMentionCandidates(buildMentionCandidates(storyBibleItems))
  }, [editor, storyBibleItems])

  // Hover-only mention cards: delegated listener on the editor's own DOM
  // (decorations are plain DOM attributes, not React nodes, so this can't be
  // done with a per-span React handler). A short hide delay lets the mouse
  // travel from the highlighted text into the card itself, which is
  // clickable (opens the full sheet).
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom

    function clearHideTimer(): void {
      if (mentionHideTimer.current) {
        clearTimeout(mentionHideTimer.current)
        mentionHideTimer.current = undefined
      }
    }

    function handleMouseOver(e: MouseEvent): void {
      // A suppressed word with a Lexicon entry gets its own card. Story
      // Bible names are suppressed too but have no Lexicon entry, so they
      // fall through — the two features stay independent here as well.
      const lexiconTarget = (e.target as HTMLElement).closest('.chf-suppressed-word')
      if (lexiconTarget) {
        const word = (lexiconTarget.textContent ?? '').trim().toLowerCase()
        if (lexiconEntriesRef.current.some((entry) => entry.word.trim().toLowerCase() === word)) {
          clearHideTimer()
          setHoveredLexiconWord({ word, rect: lexiconTarget.getBoundingClientRect() })
          return
        }
      }

      const target = (e.target as HTMLElement).closest('[data-mention-item-id]')
      if (!target) return
      clearHideTimer()
      const itemId = target.getAttribute('data-mention-item-id')
      if (!itemId) return
      hoveredItemIdRef.current = itemId
      setHoveredMention({ itemId, rect: target.getBoundingClientRect() })
      const cached = mentionSheetCache.current.get(itemId)
      if (cached) {
        setHoveredMentionSheet(cached)
      } else {
        setHoveredMentionSheet(null)
        void window.api.getStoryBibleSheet(itemId).then((sheet) => {
          mentionSheetCache.current.set(itemId, sheet)
          // The user may have moved to a different mention (or away) before
          // this resolved — only apply it if it's still the one being shown.
          if (hoveredItemIdRef.current === itemId) setHoveredMentionSheet(sheet)
        })
      }
    }

    function handleMouseOut(e: MouseEvent): void {
      if ((e.target as HTMLElement).closest('.chf-suppressed-word')) {
        mentionHideTimer.current = setTimeout(() => setHoveredLexiconWord(null), 150)
        return
      }
      const target = (e.target as HTMLElement).closest('[data-mention-item-id]')
      if (!target) return
      mentionHideTimer.current = setTimeout(() => {
        hoveredItemIdRef.current = null
        setHoveredMention(null)
      }, 150)
    }

    dom.addEventListener('mouseover', handleMouseOver)
    dom.addEventListener('mouseout', handleMouseOut)
    return () => {
      dom.removeEventListener('mouseover', handleMouseOver)
      dom.removeEventListener('mouseout', handleMouseOut)
      clearHideTimer()
    }
  }, [editor])

  // Electron's native application menu doesn't render at all with
  // titleBarStyle: 'hidden' on Windows, so the custom MenuBar below is the
  // only menu UI — and its keyboard shortcuts are dispatched here rather
  // than via a (nonfunctional) native accelerator table. Editor-owned
  // shortcuts (bold, undo, etc.) already work via TipTap's own keymap; the
  // defaultPrevented check lets those win instead of double-firing.
  useEffect(() => {
    if (!editor) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.repeat || e.defaultPrevented) return
      const match = ALL_SHORTCUTS.find(({ shortcut }) => matchesShortcut(e, shortcut))
      if (!match) return
      e.preventDefault()
      handleMenuAction(match.action)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, selectedId, tree])

  // Flush any pending autosave — main pane AND the split-view reference pane
  // if one's open — before the app is actually allowed to quit.
  useEffect(() => {
    return window.api.onBeforeQuit(() => {
      Promise.all([
        flushPendingSave(),
        splitPaneRef.current?.flushPendingSave(),
        storyBibleRef.current?.flushPendingSave(),
        sessionRef.current?.flush()
      ]).finally(() => window.api.notifyFlushComplete())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Interface theme — chrome only, never touches the document page itself.
  useEffect(() => {
    window.api.getTheme().then((t) => {
      setTheme(t)
      document.documentElement.dataset.theme = t
    })
  }, [])

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setThemeDirect(next)
  }

  function setThemeDirect(next: Theme): void {
    setTheme(next)
    document.documentElement.dataset.theme = next
    void window.api.setTheme(next)
  }

  // Theme polish: accent/background/text colors and true-black are all
  // additive on top of the existing light/dark toggle — loaded once, then
  // applied as CSS custom property overrides so they never touch the
  // underlying theme stylesheets.
  useEffect(() => {
    window.api.getAccentColor().then(setAccentColorState)
    window.api.getBackgroundColor().then(setBackgroundColorState)
    window.api.getTextColor().then(setTextColorState)
    window.api.getTrueBlack().then(setTrueBlackState)
    window.api.getZoomPercent().then(setZoomPercentState)
    window.api.getDefaultTypography().then(setDefaultTypography)
    window.api.getHiddenToolbarSections().then(setHiddenToolbarSections)
    window.api.getLayoutPresets().then(setLayoutPresets)
    window.api.getCardWidth().then(setCardWidthState)
    window.api.getPageSize().then(setPageSizeState)
    window.api.getPageMarginMm().then(setPageMarginMmState)
  }, [])

  useEffect(() => {
    if (accentColor) document.documentElement.style.setProperty('--chrome-accent', accentColor)
    else document.documentElement.style.removeProperty('--chrome-accent')
  }, [accentColor])

  // A single custom background drives --chrome-bg directly, with the
  // elevated/sidebar panel shades derived from it (lighter or darker
  // depending on whether the chosen color itself reads as dark or light) so
  // there's still some surface hierarchy rather than one flat color everywhere.
  useEffect(() => {
    const root = document.documentElement.style
    if (backgroundColor) {
      const dark = isDarkHex(backgroundColor)
      const shift = dark ? 10 : -10
      root.setProperty('--chrome-bg', backgroundColor)
      root.setProperty('--chrome-bg-elevated', shadeHex(backgroundColor, shift))
      root.setProperty('--chrome-bg-sidebar', shadeHex(backgroundColor, shift * 2))
      // Elevation has to follow the chosen background, not the theme it was
      // picked in: the same shadow that reads as depth over a near-black
      // chrome reads as grime over a pale one. The stylesheet's own light and
      // dark values are the two ends this interpolates between.
      root.setProperty('--shadow-weak', dark ? '0.22' : '0.08')
      root.setProperty('--shadow-soft', dark ? '0.3' : '0.13')
      root.setProperty('--shadow-strong', dark ? '0.4' : '0.18')
    } else {
      root.removeProperty('--chrome-bg')
      root.removeProperty('--chrome-bg-elevated')
      root.removeProperty('--chrome-bg-sidebar')
      root.removeProperty('--shadow-weak')
      root.removeProperty('--shadow-soft')
      root.removeProperty('--shadow-strong')
    }
  }, [backgroundColor])

  useEffect(() => {
    const root = document.documentElement.style
    if (textColor) {
      root.setProperty('--chrome-text', textColor)
      root.setProperty('--chrome-text-heading', textColor)
    } else {
      root.removeProperty('--chrome-text')
      root.removeProperty('--chrome-text-heading')
    }
  }, [textColor])

  useEffect(() => {
    document.documentElement.classList.toggle('true-black', trueBlack)
  }, [trueBlack])

  function toggleTrueBlack(): void {
    const next = !trueBlack
    setTrueBlackState(next)
    void window.api.setTrueBlack(next)
  }

  function handleAccentColorChange(hex: string): void {
    setAccentColorState(hex)
    void window.api.setAccentColor(hex)
  }

  function handleBackgroundColorChange(hex: string): void {
    setBackgroundColorState(hex)
    void window.api.setBackgroundColor(hex)
  }

  function handleThemeTextColorChange(hex: string): void {
    setTextColorState(hex)
    void window.api.setTextColor(hex)
  }

  function resetColors(): void {
    setAccentColorState(null)
    setBackgroundColorState(null)
    setTextColorState(null)
    void window.api.setAccentColor(null)
    void window.api.setBackgroundColor(null)
    void window.api.setTextColor(null)
  }

  function applyColorPreset(presetId: string): void {
    const preset = COLOR_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setThemeDirect(preset.theme)
    setAccentColorState(preset.accent)
    setBackgroundColorState(preset.background)
    setTextColorState(preset.text)
    void window.api.setAccentColor(preset.accent)
    void window.api.setBackgroundColor(preset.background)
    void window.api.setTextColor(preset.text)
  }

  function toggleToolbarSection(id: ToolbarSectionId): void {
    const next = hiddenToolbarSections.includes(id)
      ? hiddenToolbarSections.filter((s) => s !== id)
      : [...hiddenToolbarSections, id]
    setHiddenToolbarSections(next)
    void window.api.setHiddenToolbarSections(next)
  }

  async function handleSaveLayoutPreset(name: string): Promise<void> {
    const preset: LayoutPreset = {
      id: crypto.randomUUID(),
      name,
      theme,
      trueBlack,
      accentColor,
      backgroundColor,
      textColor,
      zoomPercent,
      distractionFree,
      defaultFontFamily: defaultTypography.fontFamily
    }
    const next = [...layoutPresets, preset]
    setLayoutPresets(next)
    await window.api.setLayoutPresets(next)
    setSaveLayoutPresetModalOpen(false)
  }

  function handleDeleteLayoutPreset(id: string): void {
    const next = layoutPresets.filter((p) => p.id !== id)
    setLayoutPresets(next)
    void window.api.setLayoutPresets(next)
  }

  function applyLayoutPreset(id: string): void {
    const preset = layoutPresets.find((p) => p.id === id)
    if (!preset) return
    setThemeDirect(preset.theme)
    setTrueBlackState(preset.trueBlack)
    void window.api.setTrueBlack(preset.trueBlack)
    setAccentColorState(preset.accentColor)
    void window.api.setAccentColor(preset.accentColor)
    setBackgroundColorState(preset.backgroundColor)
    void window.api.setBackgroundColor(preset.backgroundColor)
    setTextColorState(preset.textColor)
    void window.api.setTextColor(preset.textColor)
    setZoomPercentState(preset.zoomPercent)
    void window.api.setZoomPercent(preset.zoomPercent)
    setDistractionFree(preset.distractionFree)
    const nextTypography = { ...defaultTypography, fontFamily: preset.defaultFontFamily }
    setDefaultTypography(nextTypography)
    void window.api.setDefaultTypography(nextTypography)
  }

  // Outliner/Corkboard: pure read/render layers over the same binderStore +
  // documentStore data the binder and editor already use — no parallel
  // document objects. Which view is active, plus outliner sort/filter, is
  // separate session state (same tier as lastOpenDocumentId), persisted
  // per-project in binder.json.
  function handleViewChange(view: ActiveView): void {
    setActiveViewState(view)
    void window.api.setActiveView(view)
    // Landing on any manuscript view — however you got there, including
    // "Reveal in Outliner" or opening a document from another section — is
    // what the rail should return you to next time.
    if (isManuscriptView(view)) {
      setManuscriptViewState(view)
      void window.api.setManuscriptView(view)
    }
  }

  /** Rail click. 'manuscript' reopens whichever of Editor/Outliner/Corkboard
   *  you were last using rather than always snapping back to the Editor. */
  function handleRailChange(section: RailSection): void {
    handleViewChange(section === 'manuscript' ? manuscriptView : section)
  }

  /**
   * Gathers every document's plain text for the overused-words scan. The
   * active document's text comes from the live editor rather than disk, so
   * words typed since the last autosave are counted; everything else is read
   * through the same documentStore the exporter uses.
   */
  async function openOverusedWords(): Promise<void> {
    await flushPendingSave()
    const documents = collectAllDocuments(tree)
    const scanned = await Promise.all(
      documents.map(async (doc) => {
        const html =
          doc.id === activeDocumentIdRef.current && editor
            ? editor.getHTML()
            : await window.api.loadDocument(doc.id)
        const pmDoc = htmlToDoc(html)
        return { id: doc.id, name: doc.name, text: pmDoc.textBetween(0, pmDoc.content.size, '\n', ' ') }
      })
    )
    setOverusedDocuments(scanned)
    setOverusedModalOpen(true)
  }

  /** Jumps to one occurrence: opens its document, then reuses the find bar's
   *  own search to select the Nth match — the same highlighting and scrolling
   *  Ctrl+F already produces, rather than a second bespoke mechanism. */
  async function handleJumpToOccurrence(occurrence: OverusedOccurrence, term: string): Promise<void> {
    setOverusedModalOpen(false)
    handleViewChange('editor')
    if (activeDocumentIdRef.current !== occurrence.documentId) await switchDocument(occurrence.documentId)
    if (!editor) return
    requestAnimationFrame(() => {
      editor.commands.setSearchQuery(term, { caseSensitive: false, wholeWord: true, useRegex: false })
      for (let i = 0; i < occurrence.indexInDocument; i++) editor.commands.findNext()
    })
  }

  async function handleSaveIgnoreList(words: string[]): Promise<void> {
    await window.api.setOverusedIgnoreList(words)
    const state = await window.api.getBinderState()
    setOverusedIgnoreList(state.overusedIgnoreList)
  }

  /** Panel "＋" in the Story Bible section. Routed through the view's own
   *  handle so creation, index refresh, and opening the new sheet stay one
   *  code path shared with the browse grid. */
  async function handleCreateStoryBibleItemFromPanel(typeId: string): Promise<void> {
    storyBibleRef.current?.createItem(typeId)
  }

  function handleToggleSidebarCollapsed(): void {
    const next = !sidebarCollapsed
    setSidebarCollapsedState(next)
    void window.api.setSidebarCollapsed(next)
  }

  function handleOutlinerSort(column: OutlinerColumn): void {
    const next: OutlinerSort =
      outlinerSort?.column === column
        ? { column, direction: outlinerSort.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    setOutlinerSortState(next)
    void window.api.setOutlinerSort(next)
  }

  function handleOutlinerFilterChange(text: string): void {
    setOutlinerFilterState(text)
    if (outlinerFilterSaveTimer.current) clearTimeout(outlinerFilterSaveTimer.current)
    outlinerFilterSaveTimer.current = setTimeout(() => {
      void window.api.setOutlinerFilter(text)
    }, 400)
  }

  async function handleEditSynopsis(id: string, synopsis: string): Promise<void> {
    await window.api.setSynopsis(id, synopsis)
    await refreshTree()
  }

  async function handleEditStatusId(id: string, statusId: string | null): Promise<void> {
    await window.api.setStatusId(id, statusId)
    await refreshTree()
  }

  async function handleEditTagIds(id: string, tagIds: string[]): Promise<void> {
    await window.api.setTagIds(id, tagIds)
    await refreshTree()
  }

  async function handleEditWordTarget(id: string, target: number | null): Promise<void> {
    await window.api.setWordTarget(id, target)
    await refreshTree()
  }

  function handleCardWidthChange(width: number): void {
    setCardWidthState(width)
    void window.api.setCardWidth(width)
  }

  function handleStatusTagFilterChange(nextStatusFilter: string[], nextTagFilter: string[]): void {
    setStatusFilterState(nextStatusFilter)
    setTagFilterState(nextTagFilter)
    void window.api.setStatusFilter(nextStatusFilter)
    void window.api.setTagFilter(nextTagFilter)
  }

  async function handleSaveStatuses(next: StatusDef[]): Promise<void> {
    setStatuses(next)
    await window.api.setStatuses(next)
    await refreshTree()
    setManageStatusesModalOpen(false)
  }

  async function handleSaveTags(next: TagDef[]): Promise<void> {
    setTags(next)
    await window.api.setTags(next)
    await refreshTree()
    setManageTagsModalOpen(false)
  }

  async function handleSaveProjectTarget(target: number | null, deadline: string | null): Promise<void> {
    await window.api.setProjectWordTarget(target)
    await window.api.setProjectDeadline(deadline)
    const state = await window.api.getBinderState()
    setProjectWordTargetState(state.projectWordTarget)
    setProjectDeadlineState(state.projectDeadline)
    setProjectTargetStartDate(state.projectTargetStartDate)
    setProjectTargetStartCount(state.projectTargetStartCount)
    setProjectTargetModalOpen(false)
  }

  async function handleSaveCurrentFilterAsView(name: string): Promise<void> {
    const view: SavedView = { id: crypto.randomUUID(), name, statusFilter, tagFilter }
    const next = [...savedViews, view]
    setSavedViews(next)
    await window.api.setSavedViews(next)
    setSaveViewModalOpen(false)
  }

  function handleDeleteSavedView(id: string): void {
    const next = savedViews.filter((v) => v.id !== id)
    setSavedViews(next)
    void window.api.setSavedViews(next)
  }

  function handleApplySavedView(id: string): void {
    const view = savedViews.find((v) => v.id === id)
    if (!view) return
    handleStatusTagFilterChange(view.statusFilter, view.tagFilter)
    if (activeView === 'editor') handleViewChange('outliner')
  }

  async function handleSavePageSetup(size: PageSize, marginMm: number, author: string | null): Promise<void> {
    setPageSizeState(size)
    setPageMarginMmState(marginMm)
    setAuthorName(author)
    await window.api.setPageSize(size)
    await window.api.setPageMarginMm(marginMm)
    await window.api.setAuthorName(author)
    setPageSetupModalOpen(false)
  }

  // Split view: pinning a document from the binder opens (or retargets) the
  // reference pane — unless it's locked, in which case binder navigation
  // must not swap it out from under you.
  function handleOpenSplitView(id: string): void {
    if (referenceDocumentId && splitViewLocked) return
    setReferenceDocumentIdState(id)
    void window.api.setReferenceDocumentId(id)
  }

  function handleSelectReferenceDocument(id: string): void {
    setReferenceDocumentIdState(id)
    void window.api.setReferenceDocumentId(id)
  }

  async function handleCloseSplitView(): Promise<void> {
    await splitPaneRef.current?.flushPendingSave()
    setReferenceDocumentIdState(null)
    void window.api.setReferenceDocumentId(null)
  }

  function handleToggleSplitViewLocked(): void {
    const next = !splitViewLocked
    setSplitViewLockedState(next)
    void window.api.setSplitViewLocked(next)
  }

  function handleToggleSplitViewSyncScroll(): void {
    const next = !splitViewSyncScroll
    setSplitViewSyncScrollState(next)
    void window.api.setSplitViewSyncScroll(next)
  }

  /** Opening a document from the outliner/corkboard takes you to the editor
   *  to actually see it — otherwise "open" would have no visible effect. */
  async function handleOpenFromOtherView(id: string): Promise<void> {
    await switchDocument(id)
    handleViewChange('editor')
  }

  // Word counts for the outliner/corkboard are fetched fresh whenever either
  // is shown (and whenever the tree changes while already showing one) —
  // flushed first so a just-typed edit in the still-open editor isn't missed.
  useEffect(() => {
    if (activeView !== 'outliner' && activeView !== 'corkboard') return
    void flushPendingSave().then(() => window.api.getWordCountsByDocument()).then(setWordCounts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, tree])

  function stepZoom(direction: 1 | -1): void {
    const next = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, zoomPercent + direction * ZOOM_STEP_PERCENT))
    setZoomPercentState(next)
    void window.api.setZoomPercent(next)
  }

  function resetZoom(): void {
    setZoomPercentState(DEFAULT_ZOOM_PERCENT)
    void window.api.setZoomPercent(DEFAULT_ZOOM_PERCENT)
  }

  async function handleApplyTemplate(id: TemplateId): Promise<void> {
    await window.api.applyTemplate(id)
    await refreshTree()
    setTemplateModalOpen(false)
  }

  async function handleSaveTypography(value: TypographyDefaults): Promise<void> {
    setDefaultTypography(value)
    await window.api.setDefaultTypography(value)
    setTypographyModalOpen(false)
  }

  /** Applied right after creating a brand-new (necessarily empty) document —
   *  a default the editor opens with, distinct from the toolbar's per-
   *  selection formatting controls which always take precedence afterward.
   *  Deliberately does NOT call .focus(): a new document also autofocuses
   *  the binder's inline rename input at the same moment, and that DOM focus
   *  race was silently dropping the textStyle mark (font family/size) before
   *  it could be read back — even a few hundred ms later. Setting marks and
   *  node attributes on editor.state doesn't require DOM focus at all (only
   *  a valid selection, which setContent already established), so skipping
   *  focus() sidesteps the race entirely rather than trying to win it. */
  function applyDefaultTypographyToNewDocument(): void {
    if (!editor) return
    const { fontFamily, fontSizePt, lineHeight } = defaultTypography
    // Line height updates the paragraph NODE's attrs (setNodeMarkup), which
    // re-maps the selection as a side effect and resets ProseMirror's stored
    // marks to null — so it must run BEFORE the font-family/font-size marks,
    // never after, or it silently wipes them.
    if (lineHeight) editor.chain().setLineHeight(lineHeight).run()
    if (fontFamily) editor.chain().setFontFamily(fontFamily).run()
    if (fontSizePt) editor.chain().setFontSize(`${fontSizePt}pt`).run()
  }

  // Sync-scroll: proportional (scrollTop / scrollable-range), since the two
  // documents are almost never the same length. A guard flag stops the two
  // listeners from bouncing scroll events back and forth at each other.
  useEffect(() => {
    if (!splitViewSyncScroll || !referenceDocumentId) return
    const mainEl = mainScrollRef.current
    const refEl = referenceScrollRef.current
    if (!mainEl || !refEl) return

    function syncFrom(source: HTMLDivElement, target: HTMLDivElement): void {
      if (isSyncingScrollRef.current) return
      isSyncingScrollRef.current = true
      const sourceRange = source.scrollHeight - source.clientHeight
      const targetRange = target.scrollHeight - target.clientHeight
      if (sourceRange > 0 && targetRange > 0) {
        target.scrollTop = (source.scrollTop / sourceRange) * targetRange
      }
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false
      })
    }

    const onMainScroll = (): void => syncFrom(mainEl, refEl)
    const onRefScroll = (): void => syncFrom(refEl, mainEl)
    mainEl.addEventListener('scroll', onMainScroll)
    refEl.addEventListener('scroll', onRefScroll)
    return () => {
      mainEl.removeEventListener('scroll', onMainScroll)
      refEl.removeEventListener('scroll', onRefScroll)
    }
  }, [splitViewSyncScroll, referenceDocumentId, activeView, activeDocumentId])

  useEffect(() => {
    if (!toolbarOverflowOpen) return
    function handlePointerDown(e: MouseEvent): void {
      if (toolbarOverflowRef.current && !toolbarOverflowRef.current.contains(e.target as Node)) {
        setToolbarOverflowOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [toolbarOverflowOpen])

  // The word list is fetched before the editor necessarily exists, and the
  // native right-click menu can add to it from the main process — so push it
  // again whenever the editor appears, and whenever main says it changed.
  useEffect(() => {
    if (!editor) return
    void refreshSuppressedWords()
    return window.api.onSuppressedWordsChanged(() => void refreshSuppressedWords())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Binder width — loaded once, persisted only when a drag finishes (not on
  // every pixel of movement).
  useEffect(() => {
    window.api.getSidebarWidth().then((width) => {
      sidebarWidthRef.current = width
      setSidebarWidth(width)
    })
    window.api.getSidebarCollapsed().then(setSidebarCollapsedState)
  }, [])

  // The toolbar only exists in editor view, and only mounts/unmounts as that
  // and the open document change — re-attaching the observer on those changes
  // (rather than once on mount) keeps toolbarHeight accurate, including
  // resetting to 0 the moment there's no toolbar to measure.
  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) {
      setToolbarHeight(0)
      return
    }
    // Re-measure via the element itself rather than trusting the observer
    // entry: ResizeObserver's contentRect excludes padding and border, while
    // getBoundingClientRect() (used for the first read below) includes them.
    // The toolbar has both, so reading contentRect here would report it as
    // ~17px shorter the moment the observer's first callback landed —
    // exactly the seam this measurement exists to prevent.
    const observer = new ResizeObserver(() => setToolbarHeight(el.getBoundingClientRect().height))
    observer.observe(el)
    setToolbarHeight(el.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [activeView, activeDocumentId, distractionFree])

  function handleResizeMove(e: MouseEvent): void {
    if (!isResizingRef.current) return
    const next = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX))
    sidebarWidthRef.current = next
    setSidebarWidth(next)
  }

  function handleResizeEnd(): void {
    isResizingRef.current = false
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
    void window.api.setSidebarWidth(sidebarWidthRef.current)
  }

  function handleResizeStart(e: ReactMouseEvent): void {
    e.preventDefault()
    isResizingRef.current = true
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
  }

  function resolveTargetParentId(): string | null {
    // Anything selected — folder or document — can hold the new item.
    return selectedId
  }

  // parentIdOverride lets the binder context menu target the right-clicked
  // node directly — resolveTargetParentId() reads `selectedId` from this
  // render's closure, which wouldn't yet reflect a `setSelectedId` call made
  // earlier in the very same click handler (state updates don't apply until
  // the next render), so an explicit override is needed rather than
  // select-then-call.
  async function handleCreateDocument(parentIdOverride?: string | null): Promise<void> {
    const parentId = parentIdOverride !== undefined ? parentIdOverride : resolveTargetParentId()
    const node = await window.api.createDocument(parentId)
    if (parentId) await window.api.setFolderCollapsed(parentId, false)
    await refreshTree()
    setSelectedId(node.id)
    setEditRequestId({ id: node.id, token: Date.now() })
    await switchDocument(node.id)
    applyDefaultTypographyToNewDocument()
  }

  async function handleCreateFolder(parentIdOverride?: string | null): Promise<void> {
    const parentId = parentIdOverride !== undefined ? parentIdOverride : resolveTargetParentId()
    const node = await window.api.createFolder(parentId)
    if (parentId) await window.api.setFolderCollapsed(parentId, false)
    await refreshTree()
    setSelectedId(node.id)
    setEditRequestId({ id: node.id, token: Date.now() })
    await refreshOtherDocsWordCount()
  }

  async function handleRename(id: string, name: string): Promise<void> {
    await window.api.renameNode(id, name)
    await refreshTree()
  }

  async function refreshSubmissions(): Promise<void> {
    const state = await window.api.getSubmissions()
    setSubmissions(state.submissions)
    setSubmissionStatuses(state.statuses)
  }

  /** Saves a new or edited submission. When the form asked to freeze what was
   *  sent, a snapshot is created here first (the form can't — it needs the new
   *  snapshot's id) using the same snapshot mechanism the editor already uses. */
  async function handleSaveSubmission(draft: SubmissionDraft, captureSnapshot: boolean): Promise<void> {
    let snapshotId = draft.snapshotId
    if (captureSnapshot && draft.documentId) {
      // Flush first so the frozen copy is what's on screen, not a slightly
      // stale on-disk version — same discipline as manual snapshots.
      await flushPendingSave()
      const meta = await window.api.createSnapshot(
        draft.documentId,
        `Sent to ${draft.recipient}`.slice(0, 80)
      )
      snapshotId = meta.id
    }
    const finalDraft: SubmissionDraft = { ...draft, snapshotId }

    const existing = submissionEdit?.existing
    if (existing) await window.api.updateSubmission(existing.id, finalDraft)
    else await window.api.createSubmission(finalDraft)

    setSubmissionEdit(null)
    await refreshSubmissions()
  }

  async function handleDeleteSubmission(submission: Submission): Promise<void> {
    await window.api.deleteSubmission(submission.id)
    await refreshSubmissions()
  }

  async function handleSaveSubmissionStatuses(statuses: SubmissionStatus[]): Promise<void> {
    await window.api.setSubmissionStatuses(statuses)
    setManageSubmissionStatusesOpen(false)
    await refreshSubmissions()
  }

  // Continuity board. Entries hold Story Bible item ids and document ids only,
  // so nothing here re-fetches or re-derives names — TimelineView reads the
  // same live `storyBibleItems`/`tree` this component already holds, which is
  // why renaming an item in the Story Bible is reflected on the board with no
  // timeline write at all.
  async function refreshTimeline(): Promise<void> {
    const state = await window.api.getTimeline()
    setTimelineEntries(state.entries)
  }

  // Relationships hold Story Bible ids only, so like the timeline they need no
  // refresh when an item is renamed — TimelineView, the map, and the sheet
  // panel all resolve names from the live `storyBibleItems` this component
  // already holds.
  async function handleChangeSpeech(next: { rate: number; voiceUri: string | null }): Promise<void> {
    setSpeechRate(next.rate)
    setSpeechVoiceUri(next.voiceUri)
    await window.api.setSpeechPreferences(next)
  }

  async function refreshSprints(): Promise<void> {
    const state = await window.api.getSprints()
    setSprints(state.sprints)
  }

  async function handleChangeSprintPreferences(next: { softLockout: boolean; chime: boolean }): Promise<void> {
    setSprintPrefs(next)
    await window.api.setSprintPreferences(next)
  }

  async function refreshSessions(): Promise<void> {
    const state = await window.api.getSessions()
    setSessions(state.sessions)
  }

  async function handleChangeIdleGap(minutes: number): Promise<void> {
    setIdleGapMinutes(minutes)
    await window.api.setIdleGapMinutes(minutes)
  }

  async function handleExportSessions(format: 'csv' | 'json'): Promise<void> {
    // Seal the in-progress session first, so an export never silently omits
    // the stretch you are in the middle of.
    await sessionRef.current?.flush()
    await refreshSessions()
    await window.api.exportSessions(format).catch((err) => window.alert(`Export failed: ${err}`))
  }

  async function refreshRelationships(): Promise<void> {
    const state = await window.api.getRelationships()
    setRelationships(state.relationships)
  }

  async function handleSaveRelationship(draft: RelationshipDraft): Promise<void> {
    const existing = relationshipEdit?.existing
    if (existing) await window.api.updateRelationship(existing.id, draft)
    else await window.api.createRelationship(draft)
    setRelationshipEdit(null)
    await refreshRelationships()
  }

  async function handleDeleteRelationship(relationship: Relationship): Promise<void> {
    await window.api.deleteRelationship(relationship.id)
    await refreshRelationships()
  }

  /**
   * Takes a ranked search result to whatever it is.
   *
   * Every branch reuses the entry point that view already exposes — the same
   * one the nav list, the hover card or the continuity board uses — so search
   * never becomes a second, subtly different way of opening things.
   */
  async function handleNavigateToSearchResult(match: RankedMatch): Promise<void> {
    const { entry } = match
    switch (entry.kind) {
      case 'prose':
      case 'footnote':
      case 'comment':
      case 'spanTag':
      case 'documentTitle':
        if (entry.documentId) await handleOpenFromOtherView(entry.documentId)
        break
      case 'storyBibleName':
      case 'storyBibleAlias':
      case 'storyBibleField':
        handleOpenStoryBibleItem(entry.ownerId)
        break
      case 'relationship':
        // Relationships are read on the item's own sheet; there is no
        // free-standing relationship view to reveal.
        handleViewChange('storyBible')
        break
      case 'lexicon':
        handleViewChange('lexicon')
        setLexiconReveal({ id: entry.ownerId, token: Date.now() })
        break
      case 'timeline':
        handleViewChange('timeline')
        setTimelineRevealRequest({ id: entry.ownerId, token: Date.now() })
        break
      case 'submission':
        handleViewChange('submissions')
        break
    }
  }

  /** Opening a character from the map or a relationship row goes through the
   *  same always-mounted Story Bible view the hover card uses. */
  function handleOpenStoryBibleItem(id: string): void {
    handleViewChange('storyBible')
    storyBibleRef.current?.openItem(id)
  }

  async function handleSaveTimelineEntry(draft: TimelineDraft): Promise<void> {
    const existing = timelineEdit?.existing
    if (existing) await window.api.updateTimelineEntry(existing.id, draft)
    else await window.api.createTimelineEntry(draft)
    setTimelineEdit(null)
    await refreshTimeline()
  }

  async function handleDeleteTimelineEntry(entry: TimelineEntry): Promise<void> {
    await window.api.deleteTimelineEntry(entry.id)
    await refreshTimeline()
  }

  async function handleMoveTimelineEntry(id: string, targetIndex: number): Promise<void> {
    await window.api.moveTimelineEntry(id, targetIndex)
    await refreshTimeline()
  }

  async function handleCleanUpTimelineLinks(): Promise<void> {
    await window.api.pruneTimelineReferences()
    await refreshTimeline()
    await refreshRelationships()
  }

  /** Shows exactly what went out: the pinned snapshot when there is one,
   *  otherwise the document as it stands now (labelled as such). Both
   *  references are resolved live, so a since-deleted snapshot reports itself
   *  rather than failing. */
  async function handleViewSent(submission: Submission): Promise<void> {
    if (!submission.documentId) return
    const label = submission.documentNameAtSend || 'Document'
    setSentContent({ title: `Sent to ${submission.recipient}`, html: null, error: null })

    if (submission.snapshotId) {
      const available = await window.api.listSnapshots(submission.documentId)
      if (!available.some((s) => s.id === submission.snapshotId)) {
        setSentContent({
          title: `Sent to ${submission.recipient}`,
          html: null,
          error: `The pinned version of “${label}” is no longer available — that snapshot has since been deleted.`
        })
        return
      }
      const html = await window.api.getSnapshotContent(submission.documentId, submission.snapshotId)
      setSentContent({ title: `${label} — as sent`, html, error: null })
      return
    }

    const html = await window.api.loadDocument(submission.documentId)
    setSentContent({
      title: `${label} — current version (no snapshot was pinned)`,
      html,
      error: null
    })
  }

  /** Imports one or more .txt/.docx files as sibling documents under
   *  `parentId` (or at the root when null), then opens the first one — the
   *  same shape as handleCreateDocument, minus the inline-rename prompt since
   *  the name already comes from the filename. */
  async function handleImportFiles(parentId: string | null): Promise<void> {
    const result = await window.api.importFiles(parentId)
    if (result.canceled) return

    if (parentId) await window.api.setFolderCollapsed(parentId, false)
    await refreshTree()
    await refreshOtherDocsWordCount()
    void window.api.getSpanTagRollup().then(setSpanTagRollup)
    void refreshMentionRollup()

    const first = result.documents[0]
    if (first) {
      setSelectedId(first.id)
      await switchDocument(first.id)
    }
    setImportReport(result)
  }

  async function handleDuplicate(id: string): Promise<void> {
    const node = await window.api.duplicateNode(id)
    await refreshTree()
    setSelectedId(node.id)
    await refreshOtherDocsWordCount()
  }

  /** Switches to the target view and scrolls/flashes the given document's
   *  row (outliner) or card (corkboard) there — the binder-side entry point
   *  for "Reveal in Outliner/Corkboard". */
  function handleReveal(id: string, view: 'outliner' | 'corkboard'): void {
    handleViewChange(view)
    setSelectedId(id)
    setRevealRequest({ id, token: Date.now() })
  }

  async function handleToggleCollapse(id: string): Promise<void> {
    const node = findNode(tree, id)
    if (!node) return
    await window.api.setFolderCollapsed(id, !node.collapsed)
    await refreshTree()
  }

  async function handleMove(id: string, targetParentId: string | null, targetIndex: number): Promise<void> {
    await window.api.moveNode(id, targetParentId, targetIndex)
    await refreshTree()
  }

  async function handleDelete(id: string): Promise<void> {
    const result = await window.api.deleteNode(id)
    if (!result.deleted) return

    const newTree = await refreshTree()
    if (selectedId === id) setSelectedId(null)
    await refreshOtherDocsWordCount()

    if (activeDocumentIdRef.current && !findNode(newTree, activeDocumentIdRef.current)) {
      activeDocumentIdRef.current = null
      lastSavedHtml.current = ''
      editor?.commands.setContent('', false)
      setActiveDocumentId(null)
      setDocumentWordCount(0)
      setStatus('idle')
      window.api.setLastOpenDocument(null)
    }
  }

  const statusLabel =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
        ? 'All changes saved'
        : status === 'error'
          ? 'Failed to save'
          : 'Autosave on'

  const currentStyle = (): StyleValue => {
    if (!editor) return 'paragraph'
    if (editor.isActive('blockquote')) return 'blockquote'
    if (editor.isActive('heading', { level: 1 })) return 'h1'
    if (editor.isActive('heading', { level: 2 })) return 'h2'
    if (editor.isActive('heading', { level: 3 })) return 'h3'
    return 'paragraph'
  }

  const applyStyle = (value: StyleValue): void => {
    if (!editor) return
    const chain = editor.chain().focus()
    const wasQuote = editor.isActive('blockquote')

    if (value === 'blockquote') {
      if (!wasQuote) chain.toggleBlockquote()
      chain.run()
      return
    }

    if (wasQuote) chain.toggleBlockquote()
    if (value === 'paragraph') chain.setParagraph()
    else chain.toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
    chain.run()
  }

  const currentBlockAttrType = (): 'paragraph' | 'heading' | 'blockquote' => {
    const style = currentStyle()
    if (style === 'blockquote') return 'blockquote'
    if (style.startsWith('h')) return 'heading'
    return 'paragraph'
  }

  const currentLineHeight = (): string => editor?.getAttributes(currentBlockAttrType()).lineHeight ?? '1'

  const applyLineHeight = (value: string): void => {
    editor?.chain().focus().setLineHeight(value).run()
  }

  const currentFontFamily = (): string => editor?.getAttributes('textStyle').fontFamily ?? ''

  const applyFontFamily = (value: string): void => {
    if (!editor) return
    if (!value) editor.chain().focus().unsetFontFamily().run()
    else editor.chain().focus().setFontFamily(value).run()
  }

  const currentFontSizePt = (): number => parsePt(editor?.getAttributes('textStyle').fontSize)

  const applyFontSizePt = (pt: number): void => {
    editor?.chain().focus().setFontSize(`${pt}pt`).run()
  }

  const stepFontSize = (direction: 1 | -1): void => {
    const current = currentFontSizePt()
    const sizes = FONT_SIZES_PT
    const next =
      direction === 1
        ? (sizes.find((s) => s > current) ?? sizes[sizes.length - 1])
        : ([...sizes].reverse().find((s) => s < current) ?? sizes[0])
    applyFontSizePt(next)
  }

  const isAlign = (value: Align): boolean => !!editor?.isActive({ textAlign: value })

  const applyAlign = (value: Align): void => {
    editor?.chain().focus().setTextAlign(value).run()
  }

  const currentTextColor = (): string =>
    editor?.getAttributes('textStyle').color || getCssVar('--editor-text', '#2b2620')

  const applyTextColor = (hex: string): void => {
    editor?.chain().focus().setColor(hex).run()
  }

  const clearTextColor = (): void => {
    editor?.chain().focus().unsetColor().run()
  }

  const currentHighlightColor = (): string =>
    editor?.getAttributes('highlight').color || getCssVar('--editor-highlight-default', '#e8c468')

  const applyHighlight = (hex: string): void => {
    editor?.chain().focus().setHighlight({ color: hex }).run()
  }

  const clearHighlight = (): void => {
    editor?.chain().focus().unsetHighlight().run()
  }

  async function refreshComments(): Promise<void> {
    setComments(await window.api.listComments())
  }

  /** Adds the word to the Lexicon and suppresses it in one action, then
   *  jumps to the new entry so a meaning can be typed straight away. */
  async function handleDefineInLexicon(word: string): Promise<void> {
    const entry = await window.api.addLexiconEntry(word)
    await refreshLexicon()
    await refreshSuppressedWords()
    if (entry) {
      handleViewChange('lexicon')
      setLexiconReveal({ id: entry.id, token: Date.now() })
    }
  }

  async function refreshLexicon(): Promise<void> {
    setLexiconEntries(await window.api.listLexicon())
  }

  /**
   * Pushes the project word list into the editor, which stops flagging those
   * words by decorating them with spellcheck=false.
   *
   * App-only by construction: no OS dictionary call is involved anywhere in
   * this path, so the words stay unknown to every other program on the
   * machine. Both the Lexicon and Story Bible names feed the same list.
   */
  async function refreshSuppressedWords(): Promise<void> {
    const words = await window.api.listSuppressedWords()
    editor?.commands.setSuppressedWords(words)
  }

  /** Menu actions carry the rounding as a string; anything unrecognized
   *  falls back to exact rather than silently rounding by a wrong amount. */
  function parseRounding(raw: string): CountRounding {
    if (raw === 'exact') return 'exact'
    const value = Number(raw)
    return value === 50 || value === 100 || value === 250 || value === 500 || value === 1000
      ? value
      : 'exact'
  }

  async function handleInsertImage(): Promise<void> {
    if (!editor) return
    const imageId = await window.api.importDocumentImage()
    // Null means the picker was cancelled — not an error worth reporting.
    if (!imageId) return
    const src = await window.api.getDocumentImage(imageId)
    if (!src) return
    // Decoded before it goes in, so the first pagination pass measures the
    // image at its real height. Inserting first would have the measurement
    // race the decode and see a zero-height box, leaving the page breaks
    // around it wrong until some later edit happened to trigger a recompute.
    await new Promise<void>((resolve) => {
      const probe = new Image()
      probe.onload = () => resolve()
      probe.onerror = () => resolve()
      probe.src = src
    })
    editor.chain().focus().insertDocumentImage({ imageId, src }).run()
  }

  /** Inserts an empty marker, then opens the editor for its text. The node
   *  goes in first so the modal has a real position to write back to. */
  function handleInsertFootnote(): void {
    if (!editor) return
    editor.chain().focus().insertFootnote('').run()
    // insertContent leaves the selection just after the inserted node.
    const pos = Math.max(0, editor.state.selection.from - 1)
    setFootnoteEdit({ pos, text: '', isNew: true })
  }

  function handleSaveFootnote(text: string): void {
    if (!editor || !footnoteEdit) return
    const trimmed = text.trim()
    // An empty footnote is nothing but a stray superscript — discard the
    // marker rather than leaving an unexplained number in the prose.
    if (!trimmed) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: footnoteEdit.pos, to: footnoteEdit.pos + 1 })
        .run()
    } else {
      editor.chain().focus().updateFootnote(footnoteEdit.pos, trimmed).run()
    }
    setFootnoteEdit(null)
  }

  function handleDeleteFootnote(): void {
    if (!editor || !footnoteEdit) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: footnoteEdit.pos, to: footnoteEdit.pos + 1 })
      .run()
    setFootnoteEdit(null)
  }

  /** Opens the comment composer for the current selection. The mark isn't
   *  applied until the modal saves, so cancelling leaves nothing behind. */
  function handleStartComment(): void {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const snippet = editor.state.doc.textBetween(from, to, ' ').trim()
    setCommentEdit({ commentId: crypto.randomUUID(), body: '', snippet, isNew: true })
  }

  async function handleSaveComment(body: string): Promise<void> {
    if (!editor || !commentEdit) return
    const trimmed = body.trim()
    const documentId = activeDocumentIdRef.current
    if (!trimmed || !documentId) {
      setCommentEdit(null)
      return
    }
    if (commentEdit.isNew) {
      // Mark first, then the body: the save that follows reconciles bodies
      // against anchors, and a body without its anchor would be pruned.
      editor.chain().focus().addComment(commentEdit.commentId).run()
      await window.api.addComment({
        id: commentEdit.commentId,
        documentId,
        body: trimmed,
        createdAt: Date.now(),
        snippet: commentEdit.snippet,
        resolved: false
      })
      await performSave(editor.getHTML())
    } else {
      await window.api.updateComment(commentEdit.commentId, { body: trimmed })
    }
    setCommentEdit(null)
    void refreshComments()
  }

  async function handleDeleteComment(): Promise<void> {
    if (!editor || !commentEdit) return
    editor.chain().focus().removeComment(commentEdit.commentId).run()
    await window.api.deleteComment(commentEdit.commentId)
    await performSave(editor.getHTML())
    setCommentEdit(null)
    void refreshComments()
  }

  function handleMenuAction(action: string): void {
    if (action === 'newDocument') {
      void handleCreateDocument()
      return
    }
    if (action === 'newFolder') {
      void handleCreateFolder()
      return
    }
    if (action === 'saveNow') {
      void flushPendingSave()
      return
    }
    if (action === 'delete') {
      const id = selectedId ?? activeDocumentIdRef.current
      if (id) void handleDelete(id)
      return
    }
    if (action === 'textColor') {
      textColorInputRef.current?.click()
      return
    }
    if (action === 'highlightColor') {
      highlightColorInputRef.current?.click()
      return
    }
    if (action === 'undo') {
      editor?.chain().focus().undo().run()
      return
    }
    if (action === 'redo') {
      editor?.chain().focus().redo().run()
      return
    }
    if (action === 'cut' || action === 'copy' || action === 'paste') {
      editor?.chain().focus().run()
      document.execCommand(action)
      return
    }
    if (action === 'selectAll') {
      editor?.chain().focus().selectAll().run()
      return
    }
    // ---- Insert menu ----------------------------------------------------
    // The three static-text insertions. Each resolves to a plain string that
    // goes in as ordinary text: nothing here is a live field, so once
    // inserted it never updates itself and exports to every format for free.
    if (action === 'insertDateTime') {
      editor?.chain().focus().insertContent(formatDateTime(new Date())).run()
      return
    }
    if (action.startsWith('insertWordCount:')) {
      const rounding = parseRounding(action.slice('insertWordCount:'.length))
      const count = countWords(editor?.getHTML() ?? '')
      editor?.chain().focus().insertContent(formatWordCount(count, rounding)).run()
      return
    }
    if (action.startsWith('insertCharacterCount:')) {
      const rounding = parseRounding(action.slice('insertCharacterCount:'.length))
      const count = countCharacters(editor?.getHTML() ?? '')
      editor?.chain().focus().insertContent(formatCharacterCount(count, rounding)).run()
      return
    }

    if (action === 'insertPageBreak') {
      editor?.chain().focus().insertPageBreak().run()
      return
    }
    if (action === 'insertChapterBreak') {
      editor?.chain().focus().insertChapterBreak().run()
      return
    }
    if (action === 'insertChapterLine') {
      editor?.chain().focus().insertChapterLine().run()
      return
    }
    if (action === 'insertImage') {
      void handleInsertImage()
      return
    }
    if (action === 'insertFootnote') {
      handleInsertFootnote()
      return
    }
    // Both stop the word being flagged through the same project-only list;
    // neither touches the operating system dictionary.
    if (action.startsWith('addToDictionary:')) {
      const word = action.slice('addToDictionary:'.length)
      void window.api.addSuppressedWord(word).then(refreshSuppressedWords)
      return
    }
    if (action.startsWith('defineInLexicon:')) {
      const word = action.slice('defineInLexicon:'.length)
      void handleDefineInLexicon(word)
      return
    }

    if (action === 'insertComment') {
      handleStartComment()
      return
    }

    if (action === 'toggleBold') {
      editor?.chain().focus().toggleBold().run()
      return
    }
    if (action === 'toggleItalic') {
      editor?.chain().focus().toggleItalic().run()
      return
    }
    if (action === 'toggleUnderline') {
      editor?.chain().focus().toggleUnderline().run()
      return
    }
    if (action.startsWith('style:')) {
      applyStyle(action.slice('style:'.length) as StyleValue)
      return
    }
    if (action.startsWith('align:')) {
      applyAlign(action.slice('align:'.length) as Align)
      return
    }
    if (action === 'list:bullet') {
      editor?.chain().focus().toggleBulletList().run()
      return
    }
    if (action === 'list:ordered') {
      editor?.chain().focus().toggleOrderedList().run()
      return
    }
    if (action === 'indent') {
      editor?.chain().focus().sinkListItem('listItem').run()
      return
    }
    if (action === 'outdent') {
      editor?.chain().focus().liftListItem('listItem').run()
      return
    }
    if (action === 'fontSize:increase') {
      stepFontSize(1)
      return
    }
    if (action === 'fontSize:decrease') {
      stepFontSize(-1)
      return
    }
    if (action === 'toggleTheme') {
      toggleTheme()
      return
    }
    if (action.startsWith('setTheme:')) {
      setThemeDirect(action.slice('setTheme:'.length) as Theme)
      return
    }
    if (action === 'toggleTrueBlack') {
      toggleTrueBlack()
      return
    }
    if (action === 'accentColor') {
      accentColorInputRef.current?.click()
      return
    }
    if (action === 'backgroundColor') {
      themeBackgroundColorInputRef.current?.click()
      return
    }
    if (action === 'textColorTheme') {
      themeTextColorInputRef.current?.click()
      return
    }
    if (action === 'resetColors') {
      resetColors()
      return
    }
    if (action.startsWith('colorPreset:')) {
      applyColorPreset(action.slice('colorPreset:'.length))
      return
    }
    if (action.startsWith('toolbarSection:')) {
      toggleToolbarSection(action.slice('toolbarSection:'.length) as ToolbarSectionId)
      return
    }
    if (action === 'saveLayoutPreset') {
      setSaveLayoutPresetModalOpen(true)
      return
    }
    if (action === 'manageLayoutPresets') {
      setManagePresetsModalOpen(true)
      return
    }
    if (action.startsWith('applyLayoutPreset:')) {
      applyLayoutPreset(action.slice('applyLayoutPreset:'.length))
      return
    }
    if (action === 'openTypographyModal') {
      setTypographyModalOpen(true)
      return
    }
    if (action === 'openPageSetupModal') {
      setPageSetupModalOpen(true)
      return
    }
    if (action === 'toggleDistractionFree') {
      setDistractionFree((v) => !v)
      return
    }
    if (action === 'openProjectTargetModal') {
      setProjectTargetModalOpen(true)
      return
    }
    if (action === 'openManageStatusesModal') {
      setManageStatusesModalOpen(true)
      return
    }
    if (action === 'openManageTagsModal') {
      setManageTagsModalOpen(true)
      return
    }
    if (action === 'saveCurrentFilterAsView') {
      setSaveViewModalOpen(true)
      return
    }
    if (action === 'manageSavedViews') {
      setManageSavedViewsModalOpen(true)
      return
    }
    if (action.startsWith('applySavedView:')) {
      handleApplySavedView(action.slice('applySavedView:'.length))
      return
    }
    if (action === 'newProjectFromTemplate') {
      setTemplateModalOpen(true)
      return
    }
    if (action === 'openProject') {
      void handleOpenProject()
      return
    }
    if (action === 'importFiles') {
      void handleImportFiles(resolveTargetParentId())
      return
    }
    // Scope is left alone here. Ctrl+F forcing 'document' was how the
    // project-wide default got silently overridden — the habitual key dropped
    // you into the one mode where the filters and the ranked list do not
    // exist, which made changes to them look like they had not shipped.
    if (action === 'find') {
      setFindFocusRequest({ token: Date.now(), scope: null, showReplace: false })
      return
    }
    if (action === 'findReplace') {
      setFindFocusRequest({ token: Date.now(), scope: null, showReplace: true })
      return
    }
    // The one shortcut that still names a scope. It only ever widens, so it
    // cannot strand anyone in a mode with less interface than they expected.
    if (action === 'findInProject') {
      setFindFocusRequest({ token: Date.now(), scope: 'project', showReplace: false })
      return
    }
    if (action === 'showBackups') {
      setBackupsModalOpen(true)
      return
    }
    if (action === 'showSnapshots') {
      if (!activeDocumentIdRef.current) return
      setSnapshotsModalOpen(true)
      return
    }
    if (action === 'showSpanTags') {
      void window.api.listSpanTags().then((spans) => {
        setSpanTagBrowserSpans(spans)
        setSpanTagBrowserOpen(true)
      })
      return
    }
    if (action === 'showAbout') {
      setAboutOpen(true)
      return
    }
    if (action === 'checkForUpdates') {
      setAboutOpen(true)
      void window.api.checkForUpdates()
      return
    }
    if (action === 'readAloud') {
      setReadAloudOpen((open) => {
        if (open) readAloud.stop()
        return !open
      })
      return
    }
    if (action === 'startSprint') {
      if (sprintRef.current?.isRunning) sprintRef.current.stop()
      else setSprintStartOpen(true)
      return
    }
    if (action === 'showSessions') {
      void refreshSessions().then(() => setSessionModalOpen(true))
      return
    }
    if (action === 'showOverusedWords') {
      void openOverusedWords()
      return
    }
    // Manuscript format is the same export with different styling inputs, so
    // it routes through the identical exportDocument/exportProject calls.
    if (action.startsWith('exportManuscript:document:')) {
      const format = action.slice('exportManuscript:document:'.length) as ExportFormat
      const id = activeDocumentIdRef.current
      if (!id) return
      void flushPendingSave().then(() =>
        window.api.exportDocument(id, format, 'manuscript').catch((err) => window.alert(`Export failed: ${err}`))
      )
      return
    }
    if (action.startsWith('exportManuscript:project:')) {
      const format = action.slice('exportManuscript:project:'.length) as ExportFormat
      void flushPendingSave().then(() =>
        window.api.exportProject(format, 'manuscript').catch((err) => window.alert(`Export failed: ${err}`))
      )
      return
    }
    if (action === 'print:document' || action === 'printManuscript:document') {
      const id = activeDocumentIdRef.current
      if (!id) return
      const preset = action === 'printManuscript:document' ? 'manuscript' : 'standard'
      void flushPendingSave().then(() =>
        window.api.printDocument(id, preset).catch((err) => window.alert(`Print failed: ${err}`))
      )
      return
    }
    if (action === 'print:project' || action === 'printManuscript:project') {
      const preset = action === 'printManuscript:project' ? 'manuscript' : 'standard'
      void flushPendingSave().then(() =>
        window.api.printProject(preset).catch((err) => window.alert(`Print failed: ${err}`))
      )
      return
    }
    if (action.startsWith('export:document:')) {
      const format = action.slice('export:document:'.length) as ExportFormat
      const id = activeDocumentIdRef.current
      if (!id) return
      void flushPendingSave().then(() =>
        window.api.exportDocument(id, format).catch((err) => window.alert(`Export failed: ${err}`))
      )
      return
    }
    if (action.startsWith('export:project:')) {
      const format = action.slice('export:project:'.length) as ExportFormat
      void flushPendingSave().then(() =>
        window.api.exportProject(format).catch((err) => window.alert(`Export failed: ${err}`))
      )
      return
    }
  }

  const projectWordCount = otherDocsWordCount + documentWordCount
  // Kept current for the session recorder — the same number the footer shows,
  // so sessions and the visible word count can never disagree.
  projectWordCountRef.current = projectWordCount
  const sessionWordCount = Math.max(0, projectWordCount - sessionBaseline)

  // Derived, not stored — see railSectionFor. Whatever sets activeView (a rail
  // click, "Reveal in Outliner", a continuity entry's document link) moves the
  // rail with it automatically, so the two can never disagree.
  const activeRailSection = railSectionFor(activeView)
  // True only when there's an actual paper page on screen — the collapsed
  // rail's page-margin treatment (Fix 3) only makes sense then. Outliner,
  // Corkboard, and the other sections' own panels are chrome-styled, not
  // paper, so the rail should read as ordinary chrome beside them instead.
  const isPagedView = activeRailSection === 'manuscript' && activeView === 'editor' && !!activeDocumentId

  const checkedActions = new Set<string>()
  checkedActions.add(`setTheme:${theme}`)
  if (trueBlack) checkedActions.add('toggleTrueBlack')
  if (distractionFree) checkedActions.add('toggleDistractionFree')
  if (readAloudOpen) checkedActions.add('readAloud')
  for (const section of TOOLBAR_SECTIONS) {
    if (!hiddenToolbarSections.includes(section.id)) checkedActions.add(`toolbarSection:${section.id}`)
  }

  const menus = buildMenus(layoutPresets, savedViews)

  const pace = computePace({
    currentTotal: projectWordCount,
    target: projectWordTarget,
    deadline: projectDeadline,
    startDate: projectTargetStartDate,
    startCount: projectTargetStartCount
  })

  const paceSentence = ((): string | null => {
    if (!pace) return null
    if (pace.status === 'complete') return 'Target reached.'
    if (pace.status === 'overdue') return `Deadline passed with ${pace.wordsRemaining.toLocaleString()} words remaining.`
    const required = `${Math.round(pace.requiredPace).toLocaleString()} words/day needed to finish on time`
    if (pace.status === 'no-data') return `${required}. Not enough history yet to compare your actual pace.`
    const actual = `averaging ${Math.round(pace.actualPace).toLocaleString()} words/day`
    const verdict = pace.status === 'ahead' ? 'Ahead of pace.' : 'Behind pace.'
    return `${required}, ${actual}. ${verdict}`
  })()

  if (projectReady === undefined) {
    return <div className="app-shell" />
  }

  if (projectReady === false) {
    return (
      <WelcomeScreen
        onNewProject={() => {
          setProjectReady(true)
          setTemplateModalOpen(true)
        }}
        onOpenProject={() => void handleOpenProject()}
      />
    )
  }

  /** The active section's full navigation, for the expanded panel only. The
   *  hover flyout gets its own compact rendering below — it shows names, not
   *  this component's search box, create buttons, badges, or row actions. */
  function renderSectionNav(): JSX.Element {
    return (
      <>
        {/* The binder is Manuscript-mode navigation, so it appears only
            there — the tool sections bring their own navigation rather
            than showing documents that aren't relevant to them. */}
        {activeRailSection === 'manuscript' && (
          <Binder
            tree={tree}
            // The same value the panel itself is sized from, so the badges
            // respond as the drag happens rather than on a second measurement
            // of the width that is already known here.
            panelWidth={sidebarWidth}
            activeDocumentId={activeDocumentId}
            selectedId={selectedId}
            editRequestId={editRequestId}
            statuses={statuses}
            tags={tags}
            spanTagRollup={spanTagRollup}
            storyBibleItems={storyBibleItems}
            storyBibleTypes={storyBibleTypes}
            mentionRollup={mentionRollup}
            onSelect={setSelectedId}
            onOpenDocument={(id) => void switchDocument(id)}
            onToggleCollapse={(id) => void handleToggleCollapse(id)}
            onRename={(id, name) => void handleRename(id, name)}
            onDelete={(id) => void handleDelete(id)}
            onMove={(id, parentId, index) => void handleMove(id, parentId, index)}
            onOpenSplitView={handleOpenSplitView}
            onContextMenu={(node, x, y) => setBinderContextMenu({ node, x, y })}
          />
        )}

        {activeRailSection === 'storyBible' && (
          <StoryBibleNavList
            items={storyBibleItems}
            types={storyBibleTypes}
            selectedItemId={storyBibleSelectedId}
            collapsed={false}
            // Deliberately the same entry point the mention hover card
            // uses — one way to open a sheet, not two.
            onOpenItem={(id) => storyBibleRef.current?.openItem(id)}
          />
        )}

        {activeRailSection === 'timeline' && (
          <TimelineNavList
            entries={timelineEntries}
            collapsed={false}
            onJumpToEntry={(id) => setTimelineRevealRequest({ id, token: Date.now() })}
          />
        )}

        {activeRailSection === 'submissions' && (
          <SubmissionsNavFilter
            submissions={submissions}
            statuses={submissionStatuses}
            statusFilter={submissionStatusFilter}
            collapsed={false}
            onChange={setSubmissionStatusFilter}
          />
        )}
        {activeRailSection === 'lexicon' && (
          <LexiconNavList
            entries={lexiconEntries}
            collapsed={false}
            onJumpToEntry={(id) => setLexiconReveal({ id, token: Date.now() })}
          />
        )}
      </>
    )
  }

  /** The hover flyout's content: a compact, names-only version of the active
   *  section's navigation — no search box, no create buttons, no per-row
   *  badges or actions. Opening a document or jumping to an entry dismisses
   *  the flyout the way clicking through a menu does; a filter toggle isn't
   *  navigating away, so it leaves the flyout up. */
  function renderFlyoutNav(close: () => void): JSX.Element {
    return (
      <>
        {activeRailSection === 'manuscript' && (
          <BinderFlyoutList
            tree={tree}
            activeDocumentId={activeDocumentId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onToggleCollapse={(id) => void handleToggleCollapse(id)}
            onOpenDocument={(id) => {
              void switchDocument(id)
              close()
            }}
          />
        )}

        {activeRailSection === 'storyBible' && (
          <StoryBibleNavList
            items={storyBibleItems}
            types={storyBibleTypes}
            selectedItemId={storyBibleSelectedId}
            collapsed={false}
            compact
            onOpenItem={(id) => {
              storyBibleRef.current?.openItem(id)
              close()
            }}
          />
        )}

        {activeRailSection === 'timeline' && (
          <TimelineNavList
            entries={timelineEntries}
            collapsed={false}
            onJumpToEntry={(id) => {
              setTimelineRevealRequest({ id, token: Date.now() })
              close()
            }}
          />
        )}

        {activeRailSection === 'submissions' && (
          <SubmissionsNavFilter
            submissions={submissions}
            statuses={submissionStatuses}
            statusFilter={submissionStatusFilter}
            collapsed={false}
            onChange={setSubmissionStatusFilter}
          />
        )}
        {activeRailSection === 'lexicon' && (
          <LexiconNavList
            entries={lexiconEntries}
            collapsed={false}
            compact
            onJumpToEntry={(id) => {
              setLexiconReveal({ id, token: Date.now() })
              close()
            }}
          />
        )}
      </>
    )
  }

  /** The same navigation reduced to the collapsed rail's reserved width. The
   *  manuscript gets a minimap of the binder; the tool sections keep their
   *  glyph strips. */
  function renderSectionRail(): JSX.Element {
    return (
      <>
        {activeRailSection === 'manuscript' && (
          <BinderMinimap
            tree={tree}
            activeDocumentId={activeDocumentId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenDocument={(id) => void switchDocument(id)}
          />
        )}

        {activeRailSection === 'storyBible' && (
          <StoryBibleNavList
            items={storyBibleItems}
            types={storyBibleTypes}
            selectedItemId={storyBibleSelectedId}
            collapsed
            onOpenItem={(id) => storyBibleRef.current?.openItem(id)}
          />
        )}

        {activeRailSection === 'timeline' && (
          <TimelineNavList
            entries={timelineEntries}
            collapsed
            onJumpToEntry={(id) => setTimelineRevealRequest({ id, token: Date.now() })}
          />
        )}

        {activeRailSection === 'submissions' && (
          <SubmissionsNavFilter
            submissions={submissions}
            statuses={submissionStatuses}
            statusFilter={submissionStatusFilter}
            collapsed
            onChange={setSubmissionStatusFilter}
          />
        )}

        {activeRailSection === 'lexicon' && (
          <LexiconNavList
            entries={lexiconEntries}
            collapsed
            onJumpToEntry={(id) => setLexiconReveal({ id, token: Date.now() })}
          />
        )}
      </>
    )
  }

  return (
    <div className={`app-shell${sprint.isRunning && sprintPrefs.softLockout ? ' is-sprinting' : ''}`}>
      <input
        ref={accentColorInputRef}
        type="color"
        className="visually-hidden-input"
        value={accentColor ?? '#c9a24b'}
        onChange={(e) => handleAccentColorChange(e.target.value)}
      />
      <input
        ref={themeBackgroundColorInputRef}
        type="color"
        className="visually-hidden-input"
        value={backgroundColor ?? getCssVar('--chrome-bg', '#1c1a17')}
        onChange={(e) => handleBackgroundColorChange(e.target.value)}
      />
      <input
        ref={themeTextColorInputRef}
        type="color"
        className="visually-hidden-input"
        value={textColor ?? getCssVar('--chrome-text-heading', '#f0ece2')}
        onChange={(e) => handleThemeTextColorChange(e.target.value)}
      />

      {templateModalOpen && (
        <TemplateModal onChoose={handleApplyTemplate} onClose={() => setTemplateModalOpen(false)} />
      )}
      {typographyModalOpen && (
        <TypographyModal
          initial={defaultTypography}
          onSave={handleSaveTypography}
          onClose={() => setTypographyModalOpen(false)}
        />
      )}
      {saveLayoutPresetModalOpen && (
        <SaveLayoutPresetModal
          onSave={handleSaveLayoutPreset}
          onClose={() => setSaveLayoutPresetModalOpen(false)}
        />
      )}
      {managePresetsModalOpen && (
        <ManageLayoutPresetsModal
          presets={layoutPresets}
          onDelete={handleDeleteLayoutPreset}
          onClose={() => setManagePresetsModalOpen(false)}
        />
      )}
      {projectTargetModalOpen && (
        <ProjectTargetModal
          initialTarget={projectWordTarget}
          initialDeadline={projectDeadline}
          onSave={handleSaveProjectTarget}
          onClose={() => setProjectTargetModalOpen(false)}
        />
      )}
      {manageStatusesModalOpen && (
        <ManageColorListModal
          title="Manage statuses"
          message="The stage list shown as a colored badge on every document — edit, add, remove, or recolor freely."
          items={statuses}
          addLabel="Add status"
          defaultColor="#8a8a8a"
          onSave={handleSaveStatuses}
          onClose={() => setManageStatusesModalOpen(false)}
        />
      )}
      {manageTagsModalOpen && (
        <ManageColorListModal
          title="Manage tags"
          message="Tags are separate from status — a document can carry any number of them."
          items={tags}
          addLabel="Add tag"
          defaultColor="#6b8cae"
          onSave={handleSaveTags}
          onClose={() => setManageTagsModalOpen(false)}
        />
      )}
      {footnoteEdit && (
        <NoteEditModal
          title={footnoteEdit.isNew ? 'Add footnote' : 'Edit footnote'}
          message="Appears as a superscript marker here, and as a real footnote in Word or an endnote in PDF. Numbering follows document order automatically."
          placeholder="Footnote text…"
          initialText={footnoteEdit.text}
          onDelete={footnoteEdit.isNew ? undefined : handleDeleteFootnote}
          onSave={handleSaveFootnote}
          // Cancelling a brand-new footnote takes the empty marker with it,
          // rather than leaving an unexplained superscript in the prose.
          onClose={() => (footnoteEdit.isNew ? handleDeleteFootnote() : setFootnoteEdit(null))}
        />
      )}

      {commentEdit && (
        <NoteEditModal
          title={commentEdit.isNew ? 'Add comment' : 'Edit comment'}
          message={`On “${commentEdit.snippet}”. Comments stay in the project — they're never exported into the manuscript.`}
          placeholder="Comment…"
          initialText={commentEdit.body}
          onDelete={commentEdit.isNew ? undefined : () => void handleDeleteComment()}
          onSave={(text) => void handleSaveComment(text)}
          onClose={() => setCommentEdit(null)}
        />
      )}

      {saveViewModalOpen && (
        <SaveViewModal onSave={handleSaveCurrentFilterAsView} onClose={() => setSaveViewModalOpen(false)} />
      )}
      {manageSavedViewsModalOpen && (
        <ManageSavedViewsModal
          views={savedViews}
          onDelete={handleDeleteSavedView}
          onClose={() => setManageSavedViewsModalOpen(false)}
        />
      )}
      {pageSetupModalOpen && (
        <PageSetupModal
          initialPageSize={pageSize}
          initialMarginMm={pageMarginMm}
          initialAuthorName={authorName}
          onSave={handleSavePageSetup}
          onClose={() => setPageSetupModalOpen(false)}
        />
      )}

      {!distractionFree && (
        <div className="titlebar">
          <span className="titlebar-title">ChapterFlow</span>
        </div>
      )}

      {!distractionFree && <MenuBar menus={menus} onAction={handleMenuAction} checkedActions={checkedActions} />}

      {!distractionFree && !updateDismissed && (
        <UpdateBanner
          status={updateStatus}
          onOpenDetails={() => setAboutOpen(true)}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}

      {!distractionFree && (
        <FindBar
          editor={editor}
          tree={tree}
          activeDocumentId={activeDocumentId}
          focusRequest={findFocusRequest}
          onNavigateToResult={handleNavigateToSearchResult}
          onProjectDataChanged={() => {
            void refreshOtherDocsWordCount()
            void window.api.getSpanTagRollup().then(setSpanTagRollup)
          }}
          // Sub-mode switch, so it belongs to the Manuscript section only.
          trailingContent={
            activeRailSection === 'manuscript' ? (
              <ViewSwitcher activeView={manuscriptView} onChange={handleViewChange} />
            ) : null
          }
        />
      )}

      <div className="workspace">
        {!distractionFree && <NavRail activeSection={activeRailSection} onChange={handleRailChange} />}

        {/* Always rendered: collapsing narrows it to a minimap rail rather than
            removing it, so the current section's navigation never disappears. */}
        {!distractionFree && (
          <SidePanel
            section={activeRailSection}
            width={sidebarWidth}
            collapsed={sidebarCollapsed}
            onExpand={handleToggleSidebarCollapsed}
            projectName={projectName}
            editingProjectName={editingProjectName}
            projectNameDraft={projectNameDraft}
            storyBibleTypes={storyBibleTypes}
            onProjectNameDraftChange={setProjectNameDraft}
            onStartEditProjectName={() => {
              setProjectNameDraft(projectName ?? '')
              setEditingProjectName(true)
            }}
            onCommitProjectName={(name) => void handleRenameProject(name)}
            onCancelEditProjectName={() => setEditingProjectName(false)}
            onCreateDocument={() => void handleCreateDocument()}
            onCreateFolder={() => void handleCreateFolder()}
            onCreateStoryBibleItem={(typeId) => void handleCreateStoryBibleItemFromPanel(typeId)}
            onCollapse={handleToggleSidebarCollapsed}
            onResizeStart={handleResizeStart}
            isPagedView={isPagedView}
            toolbarHeight={toolbarHeight}
            railBody={renderSectionRail()}
            flyoutBody={(close) => renderFlyoutNav(close)}
          >
            {renderSectionNav()}
          </SidePanel>
        )}

        <div className="app">
          {editorContextMenu && (
            <EditorContextMenu
              payload={editorContextMenu}
              editor={editor}
              tags={tags}
              onAction={handleMenuAction}
              onClose={() => setEditorContextMenu(null)}
            />
          )}

          {hoveredLexiconWord &&
            (() => {
              const entry = lexiconEntries.find(
                (e) => e.word.trim().toLowerCase() === hoveredLexiconWord.word
              )
              if (!entry) return null
              return (
                <LexiconHoverCard
                  rect={hoveredLexiconWord.rect}
                  entry={entry}
                  onOpenEntry={() => {
                    setHoveredLexiconWord(null)
                    handleViewChange('lexicon')
                    setLexiconReveal({ id: entry.id, token: Date.now() })
                  }}
                  onMouseEnter={() => {
                    if (mentionHideTimer.current) clearTimeout(mentionHideTimer.current)
                  }}
                  onMouseLeave={() => setHoveredLexiconWord(null)}
                />
              )
            })()}

          {hoveredMention &&
            (() => {
              const item = storyBibleItems.find((i) => i.id === hoveredMention.itemId)
              if (!item) return null
              const type = storyBibleTypes.find((t) => t.id === item.typeId) ?? null
              return (
                <MentionHoverCard
                  rect={hoveredMention.rect}
                  item={item}
                  type={type}
                  sheet={hoveredMentionSheet}
                  onOpenItem={() => handleOpenMentionItem(item.id)}
                  onMouseEnter={() => {
                    if (mentionHideTimer.current) {
                      clearTimeout(mentionHideTimer.current)
                      mentionHideTimer.current = undefined
                    }
                  }}
                  onMouseLeave={() => {
                    mentionHideTimer.current = setTimeout(() => {
                      hoveredItemIdRef.current = null
                      setHoveredMention(null)
                    }, 150)
                  }}
                />
              )
            })()}

          {binderContextMenu && (
            <BinderContextMenu
              node={binderContextMenu.node}
              x={binderContextMenu.x}
              y={binderContextMenu.y}
              statuses={statuses}
              tags={tags}
              storyBibleItems={storyBibleItems}
              mentionRollup={mentionRollup}
              onClose={() => setBinderContextMenu(null)}
              onCreateDocument={(parentId) => void handleCreateDocument(parentId)}
              onCreateFolder={(parentId) => void handleCreateFolder(parentId)}
              onImportFiles={(parentId) => void handleImportFiles(parentId)}
              onRename={(id) => setEditRequestId({ id, token: Date.now() })}
              onDelete={(id) => void handleDelete(id)}
              onDuplicate={(id) => void handleDuplicate(id)}
              onSetStatus={(id, statusId) => void handleEditStatusId(id, statusId)}
              onSetTags={(id, tagIds) => void handleEditTagIds(id, tagIds)}
              onReveal={handleReveal}
              onSetManualMention={(documentId, itemId, present) => void handleSetManualMention(documentId, itemId, present)}
            />
          )}

          {importReport && <ImportReportModal result={importReport} onClose={() => setImportReport(null)} />}

          {submissionEdit && (
            <SubmissionEditModal
              existing={submissionEdit.existing}
              statuses={submissionStatuses}
              tree={tree}
              onSave={handleSaveSubmission}
              onClose={() => setSubmissionEdit(null)}
            />
          )}

          {timelineEdit && (
            <TimelineEntryModal
              existing={timelineEdit.existing}
              items={storyBibleItems}
              types={storyBibleTypes}
              tree={tree}
              onSave={handleSaveTimelineEntry}
              onClose={() => setTimelineEdit(null)}
            />
          )}

          {aboutOpen && (
            <AboutModal
              onClose={() => setAboutOpen(false)}
              onBeforeInstall={async () => {
                await Promise.all([
                  flushPendingSave(),
                  splitPaneRef.current?.flushPendingSave(),
                  storyBibleRef.current?.flushPendingSave(),
                  sessionRef.current?.flush()
                ])
              }}
            />
          )}

          {sprintStartOpen && (
            <SprintStartModal
              softLockout={sprintPrefs.softLockout}
              chime={sprintPrefs.chime}
              onChangePreferences={(next) => void handleChangeSprintPreferences(next)}
              onStart={(minutes) => {
                setSprintStartOpen(false)
                sprint.start(minutes)
              }}
              onClose={() => setSprintStartOpen(false)}
            />
          )}

          {sprintResult && (
            <SprintResultModal
              sprint={sprintResult}
              onStartAnother={() => {
                setSprintResult(null)
                setSprintStartOpen(true)
              }}
              onClose={() => setSprintResult(null)}
            />
          )}

          {sessionModalOpen && (
            <SessionAnalyticsModal
              sessions={sessions}
              sprints={sprints}
              tree={tree}
              idleGapMinutes={idleGapMinutes}
              onChangeIdleGap={(m) => void handleChangeIdleGap(m)}
              onExport={(format) => void handleExportSessions(format)}
              onClose={() => setSessionModalOpen(false)}
            />
          )}

          {relationshipEdit && (
            <RelationshipEditModal
              existing={relationshipEdit.existing}
              initialFromId={relationshipEdit.fromId}
              items={storyBibleItems}
              types={storyBibleTypes}
              onSave={handleSaveRelationship}
              onClose={() => setRelationshipEdit(null)}
            />
          )}

          {overusedModalOpen && (
            <OverusedWordsModal
              documents={overusedDocuments}
              tree={tree}
              activeDocumentId={activeDocumentId}
              ignoreList={overusedIgnoreList}
              onSaveIgnoreList={(words) => void handleSaveIgnoreList(words)}
              onJump={(occ, term) => void handleJumpToOccurrence(occ, term)}
              onClose={() => setOverusedModalOpen(false)}
            />
          )}

          {manageSubmissionStatusesOpen && (
            <ManageSubmissionStatusesModal
              statuses={submissionStatuses}
              onSave={handleSaveSubmissionStatuses}
              onClose={() => setManageSubmissionStatusesOpen(false)}
            />
          )}

          {sentContent && (
            <SentContentModal
              title={sentContent.title}
              html={sentContent.html}
              error={sentContent.error}
              onClose={() => setSentContent(null)}
            />
          )}

          {backupsModalOpen && <BackupsModal onClose={() => setBackupsModalOpen(false)} />}

          {snapshotsModalOpen && activeDocumentId && (
            <SnapshotsModal
              documentId={activeDocumentId}
              documentName={findNode(tree, activeDocumentId)?.name ?? 'Untitled'}
              getCurrentHtml={() => editor?.getHTML() ?? ''}
              onCreateSnapshot={handleCreateSnapshot}
              onRestore={handleRestoreSnapshot}
              onClose={() => setSnapshotsModalOpen(false)}
            />
          )}

          {spanTagBrowserOpen && (
            <SpanTagBrowserModal
              spans={spanTagBrowserSpans}
              tags={tags}
              tree={tree}
              onJump={(documentId, spanId) => void jumpToSpan(documentId, spanId)}
              onClose={() => setSpanTagBrowserOpen(false)}
            />
          )}

          {/* Span-tag underline colors come from the live project palette
              (not baked into saved HTML), so renaming/recoloring a tag
              updates every already-tagged span immediately, everywhere. */}
          {tags.length > 0 && (
            <style>
              {tags.map((tag) => `.ProseMirror [data-tag-id="${tag.id}"] { text-decoration-color: ${tag.color}; }`).join('\n')}
            </style>
          )}

          {activeView === 'editor' && (!activeDocumentId ? (
          <div className="empty-state">Select or create a document to start writing.</div>
        ) : (
          <>
            {!distractionFree && (
            <div className="toolbar" ref={toolbarRef}>
              {(() => {
                const sections: { id: ToolbarSectionId; node: JSX.Element }[] = [
                  {
                    id: 'history',
                    node: (
                      <div className="toolbar-group">
                        <button
                          type="button"
                          title="Undo (Ctrl+Z)"
                          disabled={!editor?.can().undo()}
                          onClick={() => editor?.chain().focus().undo().run()}
                        >
                          <UndoIcon />
                        </button>
                        <button
                          type="button"
                          title="Redo (Ctrl+Y)"
                          disabled={!editor?.can().redo()}
                          onClick={() => editor?.chain().focus().redo().run()}
                        >
                          <RedoIcon />
                        </button>
                      </div>
                    )
                  },
                  {
                    id: 'style',
                    node: (
                      <div className="toolbar-group">
                        <select
                          className="select-style"
                          title="Paragraph style (Ctrl+Alt+0/1/2/3, Ctrl+Alt+Q)"
                          value={currentStyle()}
                          onChange={(e) => applyStyle(e.target.value as StyleValue)}
                        >
                          {STYLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  },
                  {
                    id: 'font',
                    node: (
                      <div className="toolbar-group">
                        <select
                          className="select-font-family"
                          title="Font family"
                          value={currentFontFamily()}
                          onChange={(e) => applyFontFamily(e.target.value)}
                        >
                          <option value="">Default font</option>
                          {FONT_FAMILIES.map((font) => (
                            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                              {font.label}
                            </option>
                          ))}
                        </select>

                        <div className="font-size-group">
                          <button type="button" title="Decrease font size (Ctrl+Shift+,)" onClick={() => stepFontSize(-1)}>
                            −
                          </button>
                          <select
                            className="select-font-size"
                            title="Font size"
                            value={currentFontSizePt()}
                            onChange={(e) => applyFontSizePt(Number(e.target.value))}
                          >
                            {FONT_SIZES_PT.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                          <button type="button" title="Increase font size (Ctrl+Shift+.)" onClick={() => stepFontSize(1)}>
                            +
                          </button>
                        </div>
                      </div>
                    )
                  },
                  {
                    id: 'marks',
                    node: (
                      <div className="toolbar-group">
                        <button
                          type="button"
                          className={editor?.isActive('bold') ? 'is-active' : ''}
                          title="Bold (Ctrl+B)"
                          onClick={() => editor?.chain().focus().toggleBold().run()}
                        >
                          <strong>B</strong>
                        </button>
                        <button
                          type="button"
                          className={editor?.isActive('italic') ? 'is-active' : ''}
                          title="Italic (Ctrl+I)"
                          onClick={() => editor?.chain().focus().toggleItalic().run()}
                        >
                          <em>I</em>
                        </button>
                        <button
                          type="button"
                          className={editor?.isActive('underline') ? 'is-active' : ''}
                          title="Underline (Ctrl+U)"
                          onClick={() => editor?.chain().focus().toggleUnderline().run()}
                        >
                          <u>U</u>
                        </button>
                      </div>
                    )
                  },
                  {
                    id: 'colors',
                    node: (
                      <div className="toolbar-group">
                        <div className="color-control">
                          <TextColorIcon />
                          <input
                            ref={textColorInputRef}
                            type="color"
                            title="Text color"
                            value={currentTextColor()}
                            onChange={(e) => applyTextColor(e.target.value)}
                          />
                          <button type="button" className="clear-color" title="Clear text color" onClick={clearTextColor}>
                            ×
                          </button>
                        </div>
                        <div className="color-control">
                          <HighlightIcon />
                          <input
                            ref={highlightColorInputRef}
                            type="color"
                            title="Highlight color"
                            value={currentHighlightColor()}
                            onChange={(e) => applyHighlight(e.target.value)}
                          />
                          <button type="button" className="clear-color" title="Clear highlight" onClick={clearHighlight}>
                            ×
                          </button>
                        </div>
                        <SpanTagToolbarPicker editor={editor} tags={tags} />
                      </div>
                    )
                  },
                  {
                    id: 'align',
                    node: (
                      <div className="toolbar-group">
                        {ALIGN_VALUES.map((value) => {
                          const Icon =
                            value === 'left'
                              ? AlignLeftIcon
                              : value === 'center'
                                ? AlignCenterIcon
                                : value === 'right'
                                  ? AlignRightIcon
                                  : AlignJustifyIcon
                          return (
                            <button
                              key={value}
                              type="button"
                              className={isAlign(value) ? 'is-active' : ''}
                              title={`Align ${value} (${ALIGN_SHORTCUTS[value]})`}
                              onClick={() => applyAlign(value)}
                            >
                              <Icon />
                            </button>
                          )
                        })}
                      </div>
                    )
                  },
                  {
                    id: 'lineHeight',
                    node: (
                      <div className="toolbar-group">
                        <select
                          className="select-line-height"
                          title="Line spacing"
                          value={currentLineHeight()}
                          onChange={(e) => applyLineHeight(e.target.value)}
                        >
                          {LINE_HEIGHTS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  },
                  {
                    id: 'lists',
                    node: (
                      <div className="toolbar-group">
                        <button
                          type="button"
                          className={editor?.isActive('bulletList') ? 'is-active' : ''}
                          title="Bulleted list (Ctrl+Shift+8)"
                          onClick={() => editor?.chain().focus().toggleBulletList().run()}
                        >
                          <BulletListIcon />
                        </button>
                        <button
                          type="button"
                          className={editor?.isActive('orderedList') ? 'is-active' : ''}
                          title="Numbered list (Ctrl+Shift+7)"
                          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                        >
                          <OrderedListIcon />
                        </button>
                        <button
                          type="button"
                          title="Outdent (Ctrl+[ or Shift+Tab)"
                          onClick={() => editor?.chain().focus().liftListItem('listItem').run()}
                        >
                          <OutdentIcon />
                        </button>
                        <button
                          type="button"
                          title="Indent (Ctrl+] or Tab)"
                          onClick={() => editor?.chain().focus().sinkListItem('listItem').run()}
                        >
                          <IndentIcon />
                        </button>
                      </div>
                    )
                  }
                ]

                const visibleSections = sections.filter((s) => !hiddenToolbarSections.includes(s.id))
                const overflowSections = sections.filter((s) => hiddenToolbarSections.includes(s.id))

                return (
                  <>
                    {visibleSections.map((s, i) => (
                      <Fragment key={s.id}>
                        {i > 0 && <span className="toolbar-divider" />}
                        {s.node}
                      </Fragment>
                    ))}
                    {overflowSections.length > 0 && (
                      <div className="toolbar-overflow-container" ref={toolbarOverflowRef}>
                        <button
                          type="button"
                          className={toolbarOverflowOpen ? 'is-active' : ''}
                          title="More formatting controls"
                          onClick={() => setToolbarOverflowOpen((v) => !v)}
                        >
                          <OptionsIcon />
                        </button>
                        {toolbarOverflowOpen && (
                          <div className="toolbar-overflow-popover">
                            {overflowSections.map((s) => (
                              <div key={s.id}>{s.node}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
            )}

            {readAloudOpen && (
              <ReadAloudBar
                controller={readAloud}
                rate={speechRate}
                voiceUri={speechVoiceUri}
                hasSelection={!!editor && !editor.state.selection.empty}
                onChangeRate={(rate) => void handleChangeSpeech({ rate, voiceUri: speechVoiceUri })}
                onChangeVoice={(voiceUri) => void handleChangeSpeech({ rate: speechRate, voiceUri })}
                onClose={() => {
                  readAloud.stop()
                  setReadAloudOpen(false)
                }}
              />
            )}

            <div className="editor" ref={mainScrollRef} style={{ zoom: `${zoomPercent}%` }}>
              {(() => {
                // Before the first measurement lands, show one correctly-sized
                // empty page rather than nothing — a new or just-opened
                // document should never flash a stretched or missing sheet.
                const geometry = pagination?.geometry ?? pageGeometry(pageSize, pageMarginMm)
                const sheets = pagination?.pageCount ?? 1
                const stride = geometry.pageHeightPx + PAGE_GAP_PX
                return (
                  <div
                    className="page-stack"
                    style={{
                      width: `${geometry.pageWidthPx}px`,
                      minHeight: `${pagination?.stackHeightPx ?? geometry.pageHeightPx}px`,
                      // The writing column's padding is the page's real
                      // margin, which is what makes the live text measure
                      // identical to the width pagination measured at.
                      ['--chf-page-margin' as string]: `${geometry.marginPx}px`
                    }}
                  >
                    <div className="page-sheets" aria-hidden="true">
                      {Array.from({ length: sheets }, (_, index) => (
                        <div
                          key={index}
                          className="page-sheet"
                          style={{ top: `${index * stride}px`, height: `${geometry.pageHeightPx}px` }}
                        />
                      ))}
                    </div>
                    <EditorContent editor={editor} />
                  </div>
                )
              })()}
            </div>
          </>
        ))}

          {activeView === 'outliner' && (
            <OutlinerView
              tree={tree}
              wordCounts={wordCounts}
              sort={outlinerSort}
              filter={outlinerFilter}
              statuses={statuses}
              tags={tags}
              spanTagRollup={spanTagRollup}
              storyBibleItems={storyBibleItems}
              storyBibleTypes={storyBibleTypes}
              mentionRollup={mentionRollup}
              statusFilter={statusFilter}
              tagFilter={tagFilter}
              activeDocumentId={activeDocumentId}
              revealRequest={revealRequest}
              onSort={handleOutlinerSort}
              onFilterChange={handleOutlinerFilterChange}
              onStatusTagFilterChange={handleStatusTagFilterChange}
              onOpenDocument={(id) => void handleOpenFromOtherView(id)}
              onEditTitle={(id, name) => void handleRename(id, name)}
              onEditSynopsis={(id, synopsis) => void handleEditSynopsis(id, synopsis)}
              onEditStatusId={(id, statusId) => void handleEditStatusId(id, statusId)}
              onEditTagIds={(id, tagIds) => void handleEditTagIds(id, tagIds)}
              onEditWordTarget={(id, target) => void handleEditWordTarget(id, target)}
            />
          )}

          {activeView === 'corkboard' && (
            <CorkboardView
              tree={tree}
              cardWidth={cardWidth}
              activeDocumentId={activeDocumentId}
              revealRequest={revealRequest}
              wordCounts={wordCounts}
              statuses={statuses}
              tags={tags}
              spanTagRollup={spanTagRollup}
              storyBibleItems={storyBibleItems}
              storyBibleTypes={storyBibleTypes}
              mentionRollup={mentionRollup}
              statusFilter={statusFilter}
              tagFilter={tagFilter}
              onOpenDocument={(id) => void handleOpenFromOtherView(id)}
              onEditTitle={(id, name) => void handleRename(id, name)}
              onEditSynopsis={(id, synopsis) => void handleEditSynopsis(id, synopsis)}
              onEditStatusId={(id, statusId) => void handleEditStatusId(id, statusId)}
              onEditTagIds={(id, tagIds) => void handleEditTagIds(id, tagIds)}
              onEditWordTarget={(id, target) => void handleEditWordTarget(id, target)}
              onMove={(id, parentId, index) => void handleMove(id, parentId, index)}
              onCardWidthChange={handleCardWidthChange}
              onStatusTagFilterChange={handleStatusTagFilterChange}
            />
          )}

          {/* Always mounted (unlike Outliner/Corkboard, which are cheap to
              re-fetch): it owns its own debounced-save timers in React state,
              so unmounting on every view switch would risk losing an edit
              made just before switching away — same reasoning that keeps the
              main `editor` instance alive across view switches. */}
          <div style={{ display: activeView === 'storyBible' ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
            <StoryBibleView
              ref={storyBibleRef}
              tree={tree}
              items={storyBibleItems}
              types={storyBibleTypes}
              onRefreshIndex={refreshStoryBibleIndex}
              onSelectionChange={setStoryBibleSelectedId}
              relationships={relationships}
              onAddRelationship={(fromId) => setRelationshipEdit({ existing: null, fromId })}
              onEditRelationship={(relationship) => setRelationshipEdit({ existing: relationship, fromId: null })}
              onDeleteRelationship={(relationship) => void handleDeleteRelationship(relationship)}
            />
          </div>

          {/* Conditionally rendered for the same reason as Submissions below:
              entries commit through the modal's Save, never a debounce timer,
              so unmounting on a view switch can't drop a pending edit. */}
          {activeView === 'timeline' && (
            <TimelineView
              entries={timelineEntries}
              items={storyBibleItems}
              types={storyBibleTypes}
              tree={tree}
              revealRequest={timelineRevealRequest}
              board={boardMode}
              onBoardChange={setBoardMode}
              relationships={relationships}
              onOpenItem={handleOpenStoryBibleItem}
              onAddRelationship={() => setRelationshipEdit({ existing: null, fromId: null })}
              onEditRelationship={(relationship) => setRelationshipEdit({ existing: relationship, fromId: null })}
              onAdd={() => setTimelineEdit({ existing: null })}
              onEdit={(entry) => setTimelineEdit({ existing: entry })}
              onDelete={(entry) => void handleDeleteTimelineEntry(entry)}
              onMove={(id, targetIndex) => void handleMoveTimelineEntry(id, targetIndex)}
              onOpenDocument={(id) => void handleOpenFromOtherView(id)}
              onCleanUpBrokenLinks={() => void handleCleanUpTimelineLinks()}
            />
          )}

          {/* Conditionally rendered, unlike Story Bible: every field commits
              on save rather than through a debounce timer held in component
              state, so unmounting can't drop a pending edit. */}
          {activeView === 'submissions' && (
            <SubmissionsView
              submissions={submissions}
              statuses={submissionStatuses}
              tree={tree}
              statusFilter={submissionStatusFilter}
              onAdd={() => setSubmissionEdit({ existing: null })}
              onEdit={(submission) => setSubmissionEdit({ existing: submission })}
              onDelete={(submission) => void handleDeleteSubmission(submission)}
              onViewSent={(submission) => void handleViewSent(submission)}
              onManageStatuses={() => setManageSubmissionStatusesOpen(true)}
            />
          )}

          {activeView === 'lexicon' && (
            <LexiconView
              entries={lexiconEntries}
              revealRequest={lexiconReveal}
              onAdd={async (word) => {
                await window.api.addLexiconEntry(word)
                await refreshLexicon()
                await refreshSuppressedWords()
              }}
              onUpdate={async (id, changes) => {
                // Optimistic: typing in a field shouldn't wait on a disk write
                // and a round trip before the character appears.
                setLexiconEntries((current) =>
                  current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry))
                )
                await window.api.updateLexiconEntry(id, changes)
                // A renamed word suppresses something different now.
                if (changes.word !== undefined) await refreshSuppressedWords()
              }}
              onDelete={async (id) => {
                await window.api.deleteLexiconEntry(id)
                await refreshLexicon()
                // The word becomes flaggable again — unless the Story Bible
                // still claims it.
                await refreshSuppressedWords()
              }}
            />
          )}

        {!distractionFree && (
        <div className="editor-footer">
          {projectWordTarget != null && (
            <div className="footer-progress-track" title={`${projectWordCount.toLocaleString()} / ${projectWordTarget.toLocaleString()} words`}>
              <div
                className="footer-progress-fill"
                style={{ width: `${Math.min(100, (projectWordCount / projectWordTarget) * 100)}%` }}
              />
            </div>
          )}
          {sprint.isRunning && (
            <button
              type="button"
              className="sprint-countdown"
              title={`Sprint: ${sprint.targetMinutes} minutes planned. Click to stop early.`}
              onClick={() => sprint.stop()}
            >
              <span className="sprint-countdown-time">{formatRemaining(sprint.remainingMs ?? 0)}</span>
              <span className="sprint-countdown-stop">stop</span>
            </button>
          )}
          <span className={activeDocumentId ? `autosave-status autosave-status--${status}` : 'autosave-status'}>
            {activeDocumentId ? statusLabel : ''}
          </span>
          <div className="footer-word-count-container">
            {activeDocumentId ? (
              <>
                <span className="footer-word-count">{documentWordCount.toLocaleString()} words</span>
                <span className="footer-page-count">{pageCount.toLocaleString()} {pageCount === 1 ? "page" : "pages"}</span>
                <div className="footer-word-count-popover">
                  <div className="stats-popover-row">
                    <span className="stats-popover-label">Today</span>
                    <span className="stats-popover-value">{sessionWordCount.toLocaleString()} words</span>
                  </div>
                  <div className="stats-popover-row">
                    <span className="stats-popover-label">Project</span>
                    <span className="stats-popover-value">{projectWordCount.toLocaleString()} words</span>
                  </div>
                  {projectWordTarget != null && (
                    <div className="stats-popover-row">
                      <span className="stats-popover-label">Target</span>
                      <span className="stats-popover-value">
                        {projectWordCount.toLocaleString()} / {projectWordTarget.toLocaleString()}
                        {projectDeadline ? ` by ${projectDeadline}` : ''}
                      </span>
                    </div>
                  )}
                  {paceSentence && <p className="stats-popover-pace">{paceSentence}</p>}
                </div>
              </>
            ) : (
              <span className="footer-word-count">—</span>
            )}
          </div>
          <div className="footer-zoom">
            <button type="button" title="Zoom out" onClick={() => stepZoom(-1)} disabled={zoomPercent <= MIN_ZOOM_PERCENT}>
              −
            </button>
            <button type="button" className="footer-zoom-value" title="Reset zoom" onClick={resetZoom}>
              {zoomPercent}%
            </button>
            <button type="button" title="Zoom in" onClick={() => stepZoom(1)} disabled={zoomPercent >= MAX_ZOOM_PERCENT}>
              +
            </button>
          </div>
        </div>
        )}
      </div>

      {referenceDocumentId && activeView === 'editor' && (
        <SplitViewPane
          ref={splitPaneRef}
          tree={tree}
          documentId={referenceDocumentId}
          excludeDocumentId={activeDocumentId}
          locked={splitViewLocked}
          syncScroll={splitViewSyncScroll}
          pageSize={pageSize}
          pageMarginMm={pageMarginMm}
          mentionCandidates={buildMentionCandidates(storyBibleItems)}
          onActivity={() => sessionRef.current?.noteActivity()}
          scrollContainerRef={referenceScrollRef}
          onSelectDocument={handleSelectReferenceDocument}
          onToggleLocked={handleToggleSplitViewLocked}
          onToggleSyncScroll={handleToggleSplitViewSyncScroll}
          onClose={() => void handleCloseSplitView()}
        />
      )}
    </div>
    </div>
  )
}

export default App
