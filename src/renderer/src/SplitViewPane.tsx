import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createEditorExtensions } from './editorExtensions'
import { FindReplace } from './extensions/findReplace'
import { countWords } from '../../shared/wordCount'
import type { BinderNode } from '../../shared/binder'
import type { PageSize } from '../../shared/preferences'
import { collectAllDocuments } from './search/projectSearch'
import { computePageCount } from './pagePreview'
import { CloseIcon, LockIcon, SyncScrollIcon } from './icons'
import type { MentionCandidate } from '../../shared/mentionMatcher'

const MENTION_SCAN_DEBOUNCE_MS = 600

const AUTOSAVE_DELAY_MS = 500
const MAX_UNSAVED_MS = 3000
const PAGE_COUNT_DEBOUNCE_MS = 600

type Status = 'idle' | 'saving' | 'saved' | 'error'

export interface SplitViewPaneHandle {
  flushPendingSave: () => Promise<void>
}

interface SplitViewPaneProps {
  tree: BinderNode[]
  documentId: string
  excludeDocumentId: string | null
  locked: boolean
  syncScroll: boolean
  pageSize: PageSize
  pageMarginMm: number
  mentionCandidates: MentionCandidate[]
  /** Marks writing activity for session detection. */
  onActivity: () => void
  scrollContainerRef: RefObject<HTMLDivElement>
  onSelectDocument: (id: string) => void
  onToggleLocked: () => void
  onToggleSyncScroll: () => void
  onClose: () => void
}

/** A second, fully independent instance of the same editor pipeline the main
 *  pane uses (same extensions, same autosave/word-count/page-count logic) —
 *  not a read-only reference view or a separate editing path. Quit-time
 *  flushing is orchestrated by the parent (via the exposed handle) so both
 *  panes' pending saves are awaited together before the app actually closes. */
const SplitViewPane = forwardRef<SplitViewPaneHandle, SplitViewPaneProps>(function SplitViewPane(props, ref) {
  const {
    tree,
    documentId,
    excludeDocumentId,
    locked,
    syncScroll,
    pageSize,
    pageMarginMm,
    mentionCandidates,
    onActivity,
    scrollContainerRef,
    onSelectDocument,
    onToggleLocked,
    onToggleSyncScroll,
    onClose
  } = props

  const [status, setStatus] = useState<Status>('idle')
  const [wordCount, setWordCount] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  const documentIdRef = useRef<string | null>(null)
  const lastSavedHtml = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout>>()
  const pageCountTimer = useRef<ReturnType<typeof setTimeout>>()
  const mentionScanTimer = useRef<ReturnType<typeof setTimeout>>()

  const editor = useEditor({
    extensions: [...createEditorExtensions(), FindReplace],
    content: '',
    editorProps: { attributes: { spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      // Typing in the reference pane is writing too.
      onActivity()
      const html = editor.getHTML()
      setWordCount(countWords(html))
      scheduleSave(html)
      schedulePageCount(html)
      if (mentionScanTimer.current) clearTimeout(mentionScanTimer.current)
      mentionScanTimer.current = setTimeout(() => editor.commands.rescanMentions(), MENTION_SCAN_DEBOUNCE_MS)
    }
  })

  // Pushes the live candidate list into this pane's own mentionHighlight
  // instance — same wiring as the main editor in App.tsx, kept in sync so
  // the reference pane's live highlighting isn't silently dark. (The hover
  // card itself stays main-editor-only for now — a deliberate, smaller gap.)
  useEffect(() => {
    if (!editor) return
    editor.commands.setMentionCandidates(mentionCandidates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, mentionCandidates])

  async function performSave(html: string): Promise<void> {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    if (maxWaitTimer.current) {
      clearTimeout(maxWaitTimer.current)
      maxWaitTimer.current = undefined
    }
    const id = documentIdRef.current
    if (!id) return
    if (html === lastSavedHtml.current) return
    setStatus('saving')
    try {
      await window.api.saveDocument(id, html)
      lastSavedHtml.current = html
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  function scheduleSave(html: string): void {
    if (html === lastSavedHtml.current) return
    if (!documentIdRef.current) return
    setStatus('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void performSave(html), AUTOSAVE_DELAY_MS)
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => {
        maxWaitTimer.current = undefined
        if (editor) void performSave(editor.getHTML())
      }, MAX_UNSAVED_MS)
    }
  }

  function schedulePageCount(html: string): void {
    if (pageCountTimer.current) clearTimeout(pageCountTimer.current)
    pageCountTimer.current = setTimeout(() => {
      setPageCount(computePageCount(html, pageSize, pageMarginMm))
    }, PAGE_COUNT_DEBOUNCE_MS)
  }

  async function flushPendingSave(): Promise<void> {
    if (!editor) return
    await performSave(editor.getHTML())
  }

  useImperativeHandle(ref, () => ({ flushPendingSave }))

  // Load whichever document is pinned — flushing the previous one's pending
  // save first, the same discipline the main editor's switchDocument uses.
  useEffect(() => {
    if (!editor || !documentId) return
    let cancelled = false
    ;(async () => {
      await flushPendingSave()
      const html = await window.api.loadDocument(documentId)
      if (cancelled) return
      documentIdRef.current = documentId
      lastSavedHtml.current = html
      editor.commands.setContent(html, false)
      editor.commands.rescanMentions()
      setWordCount(countWords(html))
      setPageCount(computePageCount(html, pageSize, pageMarginMm))
      setStatus('saved')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, documentId])

  // Recompute if the shared page size/margin setting changes underneath us.
  useEffect(() => {
    if (!editor) return
    setPageCount(computePageCount(editor.getHTML(), pageSize, pageMarginMm))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, pageMarginMm])

  const statusLabel =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : status === 'error' ? 'Failed to save' : 'Autosave on'

  // Exclude the document already open in the main pane from the choices —
  // except when it's already the pinned one (can happen right after the
  // pin button targets whatever's currently open), so the <select> never
  // ends up with a value that has no matching <option>.
  const options = collectAllDocuments(tree).filter((d) => d.id !== excludeDocumentId || d.id === documentId)

  return (
    <div className="split-pane">
      <div className="split-pane-header">
        <select
          className="split-pane-picker"
          value={documentId}
          disabled={locked}
          title={locked ? 'Locked — unlock to change the pinned document' : 'Pick which document shows in this pane'}
          onChange={(e) => onSelectDocument(e.target.value)}
        >
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name || 'Untitled'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={locked ? 'is-active' : ''}
          title={locked ? 'Unlock reference pane' : 'Lock reference pane — binder navigation won’t swap it out'}
          onClick={onToggleLocked}
        >
          <LockIcon open={!locked} />
        </button>
        <button
          type="button"
          className={syncScroll ? 'is-active' : ''}
          title="Sync scroll with the main editor"
          onClick={onToggleSyncScroll}
        >
          <SyncScrollIcon />
        </button>
        <button type="button" title="Close split view" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="editor" ref={scrollContainerRef}>
        <EditorContent editor={editor} />
      </div>

      <div className="split-pane-footer">
        <span className={`autosave-status autosave-status--${status}`}>{statusLabel}</span>
        <span className="footer-word-count">{wordCount.toLocaleString()} words</span>
        <span className="footer-page-count">{pageCount.toFixed(1)} pages</span>
      </div>
    </div>
  )
})

export default SplitViewPane
