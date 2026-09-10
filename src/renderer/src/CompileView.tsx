import { useEffect, useRef, useState } from 'react'
import { draftChildren, matterFolder } from '../../shared/binder'
import type { BinderNode } from '../../shared/binder'
import { BOOK_TRIM_OPTIONS, BOOK_TRIMS, type BookTrim } from '../../shared/book'
import type {
  CompilePreset,
  CompileScope,
  CompileSettings,
  CompiledDraftMeta,
  DocumentSeparation,
  PersonalDetails
} from '../../shared/compile'
import { filterTreeByScope, SCENE_BREAK_MARK_CHOICES, summarizeScope } from '../../shared/compile'
import type { CompileFinding, CompileValidationReport } from '../../shared/compileValidation'
import type { ExportFormat, ExportPreset } from '../../shared/export'
import type { Submission } from '../../shared/submissions'
import {
  MAX_PAGE_MARGIN_MM,
  MIN_PAGE_MARGIN_MM,
  PAGE_DIMENSIONS_MM,
  PAGE_MARGIN_STEP_MM,
  PAGE_SIZE_OPTIONS,
  type PageSize
} from '../../shared/preferences'
import CompileScopeTree from './CompileScopeTree'
import ConfirmModal from './ConfirmModal'

interface CompileViewProps {
  tree: BinderNode[]
  /** Newest first, as listCompiles returns them. */
  compiles: CompiledDraftMeta[]
  /** null until the section is first entered — loading settings is what seeds
   *  the project's compile.json, so it's deliberately deferred to that moment. */
  settings: CompileSettings | null
  scope: CompileScope
  onScopeChange: (scope: CompileScope) => void
  onUpdateSettings: (settings: CompileSettings) => void
  /** The pre-flight pass. Every compile goes through it first; Run checks
   *  calls it standalone. */
  onValidate: (scope: CompileScope, stylePreset: ExportPreset) => Promise<CompileValidationReport>
  onRunCompile: (
    name: string | null,
    scope: CompileScope,
    format: ExportFormat,
    stylePreset: ExportPreset,
    acceptedFindings: CompileFinding[]
  ) => Promise<CompiledDraftMeta>
  /** Jump to a finding's document in the editor — the same cross-section
   *  navigation the continuity board's document links use. */
  onOpenDocument: (id: string) => void
  onExportCopy: (id: string) => void
  onDeleteCompile: (id: string) => Promise<void>
  /** For the delete warning and the viewer's sent-to line — read-only here,
   *  the Query Tracker owns the records. */
  submissions: Submission[]
  /** From outside (the tracker's View Sent, its Compiled Drafts list): open
   *  this draft in the read-only viewer. */
  viewRequest: { id: string; token: number } | null
  /** The stored draft as a complete printable document, for the viewer. */
  onLoadDraftView: (id: string) => Promise<string>
  onPrint: (id: string) => void
  onSavePreset: (draft: Omit<CompilePreset, 'id'>) => Promise<void>
  /** Saved presets, shown as chips over the workbench — their one home now
   *  that the compile section has no side panel. */
  presets: CompilePreset[]
  onApplyPreset: (preset: CompilePreset) => void
  onDeletePreset: (preset: CompilePreset) => void
  onCreateFrontMatter: () => Promise<void>
  onCreateBackMatter: () => Promise<void>
  /** Live per-document counts — the same record the binder and Progress page
   *  read, so the hero sentence can't disagree with them. */
  wordCounts: Record<string, number>
  /** For the proof's title page. */
  projectName: string | null
  authorName: string | null
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string }[] = [
  { id: 'docx', label: 'Word (.docx)' },
  { id: 'pdf', label: 'PDF' },
  { id: 'txt', label: 'Plain Text' },
  { id: 'md', label: 'Markdown' }
]

const STYLE_OPTIONS: { id: ExportPreset; label: string; hint: string }[] = [
  { id: 'manuscript', label: 'Manuscript format', hint: 'It sets 12pt Times, double spacing, and a running header.' },
  { id: 'standard', label: 'Standard', hint: 'It matches the page you see in the editor.' },
  {
    id: 'book',
    label: 'Book interior',
    hint: 'A print-ready PDF: mirrored margins, running headers, roman-numeral front matter.'
  }
]

/** Short page names for sentences; the picker keeps the full labels. */
const PAGE_SHORT_NAMES: Record<PageSize, string> = {
  letter: 'Letter',
  a4: 'A4',
  a5: 'A5',
  trade6x9: 'US Trade',
  legal: 'US Legal'
}

/** Manuscript convention estimates a page at 250 words; the other styles
 *  set more per page. Estimates only — the proof caption says as much. */
const WORDS_PER_PAGE: Record<ExportPreset, number> = { manuscript: 250, standard: 350, book: 300 }

type Feedback =
  | { kind: 'success'; meta: CompiledDraftMeta }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string }

const SMALL_COUNTS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty'
]

/** Counts read as words up to twenty and as numerals beyond, per the app's
 *  register ("Sixty-five days of writing", but never "one hundred and twelve"). */
function countWord(n: number): string {
  return n >= 0 && n <= 20 ? SMALL_COUNTS[n] : n.toLocaleString()
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDateTime(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return createdAt
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** IPC failures arrive wrapped ("Error invoking remote method 'compile:run':
 *  Error: ..."); only the tail is the message a writer should read. */
function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

function nodeExists(nodes: BinderNode[], id: string | null): boolean {
  if (!id) return false
  for (const node of nodes) {
    if (node.id === id || nodeExists(node.children, id)) return true
  }
  return false
}

/** True page width in CSS pixels, for the viewer's frame. */
function pageWidthPx(pageSize: PageSize): number {
  return Math.round((PAGE_DIMENSIONS_MM[pageSize].widthMm / 25.4) * 96)
}

function collectDocumentIds(nodes: BinderNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'document') into.push(node.id)
    collectDocumentIds(node.children, into)
  }
  return into
}

function scopesMatch(a: CompileScope, b: CompileScope): boolean {
  if (a.mode === 'all' || b.mode === 'all') return a.mode === b.mode
  if (a.nodeIds.length !== b.nodeIds.length) return false
  const sorted = [...b.nodeIds].sort()
  return [...a.nodeIds].sort().every((id, i) => id === sorted[i])
}

/**
 * The Compile section's main area, laid out as the assembly: preset chips, a
 * hero sentence stating what a compile right now would produce, hairline
 * steps beside a proof of the title page, the checks inline below the steps,
 * and every stored draft as a filmstrip at the bottom. Every compile still
 * produces a stored, immutable draft — there is no compile-to-file side
 * door, which is what keeps the history a complete answer to "what did I
 * send".
 */
function CompileView(props: CompileViewProps): JSX.Element {
  const {
    tree,
    compiles,
    settings,
    scope,
    onScopeChange,
    onUpdateSettings,
    onValidate,
    onRunCompile,
    onOpenDocument,
    onExportCopy,
    onDeleteCompile,
    submissions,
    viewRequest,
    onLoadDraftView,
    onPrint,
    onSavePreset,
    presets,
    onApplyPreset,
    onDeletePreset,
    onCreateFrontMatter,
    onCreateBackMatter,
    wordCounts,
    projectName,
    authorName
  } = props

  const [nameDraft, setNameDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  /** The last pre-flight report, shown inline in the checks step. null means
   *  the checks have not run against the current scope and style. */
  const [report, setReport] = useState<CompileValidationReport | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CompiledDraftMeta | null>(null)
  /** The read-only draft viewer: a stored draft's meta plus its printable
   *  document. Replaces the whole section body while open. */
  const [viewer, setViewer] = useState<{ meta: CompiledDraftMeta; html: string } | null>(null)
  const [presetNameOpen, setPresetNameOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [matterBusy, setMatterBusy] = useState(false)
  /** The personal-details editor behind the sticky bar's button. The draft
   *  is seeded from the stored settings each time it opens. */
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsDraft, setDetailsDraft] = useState<PersonalDetails>({ name: '', contact: '', address: '' })
  const selectedCardRef = useRef<HTMLDivElement | null>(null)
  const checksRef = useRef<HTMLDivElement | null>(null)

  async function openViewer(meta: CompiledDraftMeta): Promise<void> {
    try {
      const html = await onLoadDraftView(meta.id)
      setSelectedId(meta.id)
      setViewer({ meta, html })
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    }
  }

  // View Sent (and the tracker's Compiled Drafts list) lands here.
  useEffect(() => {
    if (!viewRequest) return
    const meta = compiles.find((m) => m.id === viewRequest.id)
    if (meta) void openViewer(meta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest])

  useEffect(() => {
    selectedCardRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // A report describes one scope and style; when either moves, it no longer
  // does, and the checks step honestly returns to "not run".
  useEffect(() => {
    setReport(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, settings?.stylePreset])

  // Draft is the manuscript the scope selects within; Matter appears in the
  // scope tree as its own checkable root (included in the output around the
  // Draft, never in the manuscript word count). Notes never appears here.
  const manuscriptForest = draftChildren(tree)
  const matter = matterFolder(tree)
  const scopeForest = matter ? [...manuscriptForest, matter] : manuscriptForest
  const summary = summarizeScope(manuscriptForest, scope)

  // Manuscript words inside the scope — the same live counts the binder rows
  // wear, filtered by the same walk the export pipeline uses.
  const scopedWords = collectDocumentIds(filterTreeByScope(manuscriptForest, scope)).reduce(
    (sum, id) => sum + (wordCounts[id] ?? 0),
    0
  )

  const findings = report?.findings ?? null
  const hasFindings = findings != null && findings.length > 0

  async function doCompile(acceptedFindings: CompileFinding[]): Promise<void> {
    if (!settings || running) return
    setRunning(true)
    setFeedback(null)
    try {
      const meta = await onRunCompile(
        nameDraft.trim() || null,
        scope,
        settings.format,
        settings.stylePreset,
        acceptedFindings
      )
      setFeedback({ kind: 'success', meta })
      setNameDraft('')
      setSelectedId(meta.id)
      setReport(null)
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    } finally {
      setRunning(false)
    }
  }

  /** Runs the pass and leaves the result inline in the checks step. */
  async function runChecks(): Promise<void> {
    if (!settings || running || checking) return
    setChecking(true)
    setFeedback(null)
    try {
      setReport(await onValidate(scope, settings.stylePreset))
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    } finally {
      setChecking(false)
    }
  }

  /** The one compile action. With findings already on screen it compiles past
   *  them; otherwise it runs the checks first, compiles when they are clean,
   *  and stops at the findings when they are not. */
  async function handleCompile(): Promise<void> {
    if (!settings || running || checking) return
    if (hasFindings) {
      await doCompile(findings)
      return
    }
    setChecking(true)
    setFeedback(null)
    try {
      const fresh = await onValidate(scope, settings.stylePreset)
      setReport(fresh)
      if (fresh.findings.length === 0) {
        await doCompile([])
      } else {
        checksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    } finally {
      setChecking(false)
    }
  }

  async function handleSavePreset(): Promise<void> {
    const name = presetName.trim()
    if (!name || !settings) return
    try {
      await onSavePreset({ name, scope, format: settings.format, stylePreset: settings.stylePreset })
      setPresetNameOpen(false)
      setPresetName('')
      setFeedback({ kind: 'info', message: `Preset “${name}” was saved. It also appears in the side panel.` })
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    }
  }

  async function handleCreateMatter(which: 'front' | 'back'): Promise<void> {
    if (matterBusy) return
    setMatterBusy(true)
    try {
      await (which === 'front' ? onCreateFrontMatter() : onCreateBackMatter())
    } catch (err) {
      setFeedback({ kind: 'error', message: errorMessage(err) })
    } finally {
      setMatterBusy(false)
    }
  }

  function presetIsActive(preset: CompilePreset): boolean {
    if (!settings) return false
    return (
      preset.format === settings.format &&
      preset.stylePreset === settings.stylePreset &&
      scopesMatch(preset.scope, scope)
    )
  }

  function scopeCell(meta: CompiledDraftMeta): string {
    return meta.scope.mode === 'all'
      ? 'everything'
      : `${meta.scopeSummary.includedDocuments} of ${meta.scopeSummary.totalDocuments} documents`
  }

  const renderAssembly = (): JSX.Element => {
    if (!settings) return <div className="compile-assembly" />

    const isBook = settings.stylePreset === 'book'
    const formatLabel = FORMAT_OPTIONS.find((o) => o.id === settings.format)?.label ?? settings.format
    const pageName = isBook ? BOOK_TRIMS[settings.bookTrim].label : PAGE_SHORT_NAMES[settings.pageSize]
    const marginPhrase =
      settings.stylePreset === 'manuscript'
        ? '1 inch margins'
        : isBook
          ? 'mirrored book margins'
          : `${settings.marginMm} mm margins`
    const outputPhrase =
      settings.stylePreset === 'manuscript'
        ? `manuscript-format ${formatLabel}`
        : isBook
          ? 'a print-ready book PDF'
          : `${formatLabel} in the app's own style`

    const included = summary.includedDocuments
    const total = summary.totalDocuments
    const heroLead =
      included === 0
        ? 'Nothing is selected to compile.'
        : scope.mode === 'all'
          ? total === 1
            ? `The one document will compile to ${outputPhrase}.`
            : `All ${countWord(total)} documents will compile to ${outputPhrase}.`
          : `${capitalize(countWord(included))} of ${countWord(total)} documents will compile to ${outputPhrase}.`
    const heroDetail =
      included === 0 ? '' : `The selection runs to ${scopedWords.toLocaleString()} words on ${pageName} pages with ${marginPhrase}.`

    const frontExists = nodeExists(tree, settings.frontMatterFolderId)
    const backExists = nodeExists(tree, settings.backMatterFolderId)
    const matterSum = frontExists
      ? backExists
        ? 'Front and back matter live in the binder.'
        : 'Front matter is in the binder; there is no back matter yet.'
      : backExists
        ? 'Back matter is in the binder; there is no front matter yet.'
        : 'There is no front or back matter yet.'

    const includeSum =
      included === 0
        ? 'Nothing is included yet.'
        : scope.mode === 'all'
          ? total === 1
            ? 'The one document is included.'
            : `All ${countWord(total)} documents are included.`
          : `${capitalize(countWord(included))} of ${countWord(total)} documents are included.`

    const checksSum =
      report == null
        ? 'The checks have not run yet.'
        : hasFindings
          ? `The checks found ${countWord(findings.length)} ${findings.length === 1 ? 'thing' : 'things'}.`
          : 'All checks passed.'

    const compileLabel = running
      ? 'Compiling…'
      : checking
        ? 'Checking…'
        : hasFindings
          ? 'Compile past these'
          : 'Compile'
    const compileDisabled = running || checking || included === 0

    // The proof: a title page in the chosen style, approximated from what the
    // panel already knows. Words round the way manuscript covers do, and the
    // page count is an estimate by convention.
    const dims = isBook
      ? { widthMm: BOOK_TRIMS[settings.bookTrim].widthIn, heightMm: BOOK_TRIMS[settings.bookTrim].heightIn }
      : PAGE_DIMENSIONS_MM[settings.pageSize]
    const approxWords = Math.round(scopedWords / 100) * 100
    const pageEstimate = Math.max(1, Math.round(scopedWords / WORDS_PER_PAGE[settings.stylePreset]))
    const title = (projectName ?? 'Untitled').trim() || 'Untitled'

    return (
      <div className="compile-assembly">
        <div className="compile-presets">
          <span className="compile-presets-label">Presets</span>
          {presets.length === 0 && <span className="compile-hint">None have been saved yet.</span>}
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`compile-preset-chip ${presetIsActive(preset) ? 'is-active' : ''}`}
              title="Load this preset's selection, format, and style"
              onClick={() => onApplyPreset(preset)}
            >
              {preset.name || 'Untitled'}
              {/* A span rather than a nested button — the chip itself is
                  already the apply button, as in the old panel nav. */}
              <span
                className="compile-preset-chip-delete"
                role="button"
                title="Delete preset"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeletePreset(preset)
                }}
              >
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            className="compile-preset-chip is-save"
            onClick={() => setPresetNameOpen(true)}
          >
            Save current…
          </button>
        </div>

        <div className="compile-hero-row">
          <p className="compile-hero">
            {heroLead}
            {heroDetail && <span className="compile-hero-detail"> {heroDetail}</span>}
          </p>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            disabled={compileDisabled}
            onClick={() => void handleCompile()}
          >
            {compileLabel}
          </button>
        </div>

        {feedback && (
          <p className={`compile-feedback ${feedback.kind === 'error' ? 'is-error' : ''}`}>
            {feedback.kind === 'success' && (
              <>
                “{feedback.meta.name || 'Untitled'}” compiled a moment ago. It runs to{' '}
                {feedback.meta.wordCount.toLocaleString()} words
                {feedback.meta.warningsAccepted > 0
                  ? `, with ${countWord(feedback.meta.warningsAccepted)} ${
                      feedback.meta.warningsAccepted === 1 ? 'warning' : 'warnings'
                    } accepted.`
                  : ', and the checks passed.'}{' '}
                <button
                  type="button"
                  className="compile-link-button"
                  onClick={() => void openViewer(feedback.meta)}
                >
                  View it
                </button>
              </>
            )}
            {feedback.kind === 'error' && <>The compile failed. {feedback.message}</>}
            {feedback.kind === 'info' && feedback.message}
          </p>
        )}

        <div className="compile-split">
          <div className="compile-steps">
            <div className="compile-step">
              <div className="compile-step-head">
                <span className="compile-step-num">1</span>
                <span className="compile-step-title">What to include</span>
                <span className="compile-step-sum">{includeSum}</span>
              </div>
              <div className="compile-step-body">
                <div className="compile-scope-actions">
                  <button type="button" className="outliner-open-button" onClick={() => onScopeChange({ mode: 'all' })}>
                    All
                  </button>
                  <button
                    type="button"
                    className="outliner-open-button"
                    onClick={() => onScopeChange({ mode: 'selection', nodeIds: [] })}
                  >
                    None
                  </button>
                </div>
                <CompileScopeTree tree={scopeForest} scope={scope} onChange={onScopeChange} />
              </div>
            </div>

            <div className="compile-step">
              <div className="compile-step-head">
                <span className="compile-step-num">2</span>
                <span className="compile-step-title">Output</span>
                <span className="compile-step-sum">{`The output is ${outputPhrase}.`}</span>
              </div>
              <div className="compile-step-body">
                <div className="compile-option-row">
                  <span className="compile-option-label">Format</span>
                  <div className="compile-option-buttons">
                    {FORMAT_OPTIONS.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`view-switcher-button ${settings.format === id ? 'is-active' : ''}`}
                        // Book output is PDF only — the other formats can't
                        // carry its folios, so they aren't offered under it.
                        disabled={isBook && id !== 'pdf'}
                        onClick={() => onUpdateSettings({ ...settings, format: id })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="compile-option-row">
                  <span className="compile-option-label">Style</span>
                  <div className="compile-option-buttons">
                    {STYLE_OPTIONS.map(({ id, label, hint }) => (
                      <button
                        key={id}
                        type="button"
                        title={hint}
                        className={`view-switcher-button ${settings.stylePreset === id ? 'is-active' : ''}`}
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            stylePreset: id,
                            // Book is PDF-only; choosing it moves the format
                            // along rather than leaving an impossible pair.
                            ...(id === 'book' ? { format: 'pdf' as ExportFormat } : {})
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="compile-hint">
                    {STYLE_OPTIONS.find((o) => o.id === settings.stylePreset)?.hint}
                  </span>
                </div>
                <div className="compile-option-row">
                  <span className="compile-option-label">Scene breaks</span>
                  {settings.stylePreset === 'manuscript' ? (
                    <span className="compile-hint">
                      Manuscript format renders every scene break as a centered #, by convention.
                    </span>
                  ) : (
                    <>
                      <div className="compile-option-buttons">
                        {SCENE_BREAK_MARK_CHOICES.map((mark) => (
                          <button
                            key={mark}
                            type="button"
                            className={`view-switcher-button ${settings.sceneBreakMark === mark ? 'is-active' : ''}`}
                            onClick={() => onUpdateSettings({ ...settings, sceneBreakMark: mark })}
                          >
                            {mark}
                          </button>
                        ))}
                      </div>
                      <span className="compile-hint">
                        Every typed divider compiles as this one marker, so it can't vary between chapters.
                      </span>
                    </>
                  )}
                </div>
                <div className="compile-option-row">
                  <span className="compile-option-label">Label</span>
                  <input
                    className="outliner-filter-input"
                    placeholder="Query Package, for example"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* The manuscript page setup — a genuinely separate surface from
                the editor's Page Setup modal: per-project, governs compiled
                output only, seeded once from the global setting and never
                synced. */}
            <div className="compile-step">
              <div className="compile-step-head">
                <span className="compile-step-num">3</span>
                <span className="compile-step-title">Page</span>
                <span className="compile-step-sum">{`Pages are ${pageName} with ${marginPhrase}.`}</span>
              </div>
              <div className="compile-step-body">
                {isBook ? (
                  <>
                    <div className="compile-option-row">
                      <span className="compile-option-label">Trim</span>
                      <select
                        className="outliner-filter-input compile-page-select"
                        value={settings.bookTrim}
                        onChange={(e) => onUpdateSettings({ ...settings, bookTrim: e.target.value as BookTrim })}
                      >
                        {BOOK_TRIM_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="compile-hint">
                        Margins are fixed by the trim and mirrored for binding, with a wider inner gutter.
                      </span>
                    </div>
                    <div className="compile-option-row">
                      <span className="compile-option-label">Contents</span>
                      <div className="compile-option-buttons">
                        {[true, false].map((included) => (
                          <button
                            key={String(included)}
                            type="button"
                            className={`view-switcher-button ${settings.bookIncludeContents === included ? 'is-active' : ''}`}
                            onClick={() => onUpdateSettings({ ...settings, bookIncludeContents: included })}
                          >
                            {included ? 'Included' : 'Omitted'}
                          </button>
                        ))}
                      </div>
                      <span className="compile-hint">
                        The Contents lists parts and chapters without page numbers. Navigation comes from the PDF's
                        own bookmarks either way.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="compile-option-row">
                    <span className="compile-option-label">Page</span>
                    <select
                      className="outliner-filter-input compile-page-select"
                      value={settings.pageSize}
                      onChange={(e) => onUpdateSettings({ ...settings, pageSize: e.target.value as PageSize })}
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="compile-hint">
                      This setup belongs to the manuscript and stays apart from the editor's Page Setup.
                    </span>
                  </div>
                )}
                {!isBook && (
                <div className="compile-option-row">
                  <span className="compile-option-label">Margins</span>
                  {settings.stylePreset === 'manuscript' ? (
                    <span className="compile-hint">Margins are fixed at 1 inch by the manuscript convention.</span>
                  ) : (
                    <div className="compile-margin-stepper">
                      <button
                        type="button"
                        className="outliner-open-button"
                        aria-label="Decrease margin"
                        disabled={settings.marginMm <= MIN_PAGE_MARGIN_MM}
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            marginMm: Math.max(MIN_PAGE_MARGIN_MM, settings.marginMm - PAGE_MARGIN_STEP_MM)
                          })
                        }
                      >
                        −
                      </button>
                      <span className="compile-margin-value">{settings.marginMm} mm</span>
                      <button
                        type="button"
                        className="outliner-open-button"
                        aria-label="Increase margin"
                        disabled={settings.marginMm >= MAX_PAGE_MARGIN_MM}
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            marginMm: Math.min(MAX_PAGE_MARGIN_MM, settings.marginMm + PAGE_MARGIN_STEP_MM)
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
                )}
                {/* One project-level formatting choice, every style, every
                    document uniformly — nothing structural hangs off it. */}
                <div className="compile-option-row">
                  <span className="compile-option-label">Documents</span>
                  <div className="compile-option-buttons">
                    {(
                      [
                        { id: 'page', label: 'New page' },
                        { id: 'divider', label: 'Continuous' }
                      ] as { id: DocumentSeparation; label: string }[]
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`view-switcher-button ${settings.documentSeparation === id ? 'is-active' : ''}`}
                        onClick={() => onUpdateSettings({ ...settings, documentSeparation: id })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="compile-hint">
                    {settings.documentSeparation === 'divider'
                      ? 'Documents run on, separated by the scene marker instead of a page break.'
                      : 'Every document begins on a new page.'}
                    {(settings.format === 'txt' || settings.format === 'md') &&
                      ' Plain text and Markdown have no pages, so they ignore this.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="compile-step">
              <div className="compile-step-head">
                <span className="compile-step-num">4</span>
                <span className="compile-step-title">Front &amp; back matter</span>
                <span className="compile-step-sum">{matterSum}</span>
              </div>
              <div className="compile-step-body">
                <div className="compile-option-row">
                  <span className="compile-option-label">Front</span>
                  {frontExists ? (
                    <span className="compile-hint">
                      It holds the title page, copyright, and dedication. They edit like any chapter.
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="submissions-add-button"
                        disabled={matterBusy}
                        onClick={() => void handleCreateMatter('front')}
                      >
                        Create front matter
                      </button>
                      <span className="compile-hint">
                        It seeds a title page, copyright, and dedication from the project's name and author.
                      </span>
                    </>
                  )}
                </div>
                <div className="compile-option-row">
                  <span className="compile-option-label">Back</span>
                  {backExists ? (
                    <span className="compile-hint">
                      It holds About the Author and Acknowledgments. They edit like any chapter.
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="submissions-add-button"
                        disabled={matterBusy}
                        onClick={() => void handleCreateMatter('back')}
                      >
                        Create back matter
                      </button>
                      <span className="compile-hint">It seeds About the Author and Acknowledgments.</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="compile-step" ref={checksRef}>
              <div className="compile-step-head">
                <span className="compile-step-num">5</span>
                <span className="compile-step-title">Checks</span>
                <span className={`compile-step-sum ${hasFindings ? 'is-waived' : ''}`}>{checksSum}</span>
              </div>
              <div className="compile-step-body">
                {report == null && <p className="compile-hint">The checks have not run yet.</p>}
                {report != null && !hasFindings && (
                  <p className="compile-hint">
                    All checks passed. {capitalize(countWord(report.checkedDocuments))}{' '}
                    {report.checkedDocuments === 1 ? 'document was' : 'documents were'} checked.
                  </p>
                )}
                {hasFindings && (
                  <div className="compile-findings">
                    {findings.map((finding, index) => (
                      <div className="compile-finding" key={index}>
                        <span className="compile-finding-dot" />
                        <span className="compile-finding-message">{finding.message}</span>
                        {finding.documentId && (
                          <button
                            type="button"
                            className="compile-quiet-link"
                            onClick={() => onOpenDocument(finding.documentId as string)}
                          >
                            Open
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="compile-step-actions">
                  <button
                    type="button"
                    className="modal-cancel"
                    disabled={running || checking || included === 0}
                    onClick={() => void runChecks()}
                  >
                    {checking ? 'Checking…' : report == null ? 'Run checks' : 'Run again'}
                  </button>
                  <button
                    type="button"
                    className="modal-confirm modal-confirm--primary"
                    disabled={compileDisabled}
                    onClick={() => void handleCompile()}
                  >
                    {compileLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="compile-proofcol">
            <div
              className={`compile-proof ${settings.stylePreset === 'manuscript' ? 'is-manuscript' : 'is-standard'}`}
              style={{ aspectRatio: `${dims.widthMm} / ${dims.heightMm}` }}
            >
              {settings.stylePreset === 'manuscript' && (
                <>
                  {authorName && <div className="compile-proof-contact">{authorName}</div>}
                  {scopedWords > 0 && (
                    <div className="compile-proof-words">approx. {approxWords.toLocaleString()} words</div>
                  )}
                </>
              )}
              <div className="compile-proof-titleblock">
                <div className="compile-proof-title">
                  {settings.stylePreset === 'manuscript' ? title.toUpperCase() : title}
                </div>
                {authorName && <div className="compile-proof-byline">by {authorName}</div>}
              </div>
            </div>
            {scopedWords > 0 && (
              <span className="compile-proof-pages">Title page · 1 of about {pageEstimate.toLocaleString()}</span>
            )}
            <span className="compile-proof-caption">
              The proof approximates the finished page. The compile itself is exact.
            </span>
          </div>
        </div>

        <div className="compile-film">
          <span className="compile-film-label">Past compiles</span>
          {compiles.length === 0 ? (
            <p className="compile-hint">Nothing has been compiled yet.</p>
          ) : (
            <div className="compile-film-row">
              {compiles.map((meta) => {
                const sentCount = submissions.filter((s) => s.compiledDraftId === meta.id).length
                return (
                  <div
                    key={meta.id}
                    ref={selectedId === meta.id ? selectedCardRef : undefined}
                    className={`compile-film-card ${selectedId === meta.id ? 'is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openViewer(meta)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void openViewer(meta)
                    }}
                  >
                    <span className="compile-film-thumb" />
                    <span className="compile-film-info">
                      <span className="compile-film-name">{meta.name || 'Untitled'}</span>
                      <span className="compile-film-meta">
                        <span className="compile-format-badge">{meta.format.toUpperCase()}</span>{' '}
                        {scopeCell(meta)} · {meta.wordCount.toLocaleString()} words
                      </span>
                      <span className="compile-film-meta">{formatDateTime(meta.createdAt)}</span>
                      <span className="compile-film-meta">
                        {meta.warningsAccepted === 0 ? (
                          <span className="compile-checks-clean">clean</span>
                        ) : (
                          // The hover lists exactly what was waived — the
                          // record keeps the findings, not just their count.
                          <span
                            className="compile-checks-waived"
                            title={(meta.acceptedFindings ?? []).map((f) => f.message).join('\n')}
                          >
                            {meta.warningsAccepted} accepted
                          </span>
                        )}
                        {sentCount > 0 && <> · sent to {sentCount}</>}
                      </span>
                      <span className="compile-film-actions">
                        <button
                          type="button"
                          className="compile-quiet-link"
                          onClick={(e) => {
                            e.stopPropagation()
                            onExportCopy(meta.id)
                          }}
                        >
                          Export a copy…
                        </button>
                        <button
                          type="button"
                          className="compile-quiet-link"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPrint(meta.id)
                          }}
                        >
                          Print…
                        </button>
                        <button
                          type="button"
                          className="compile-quiet-link is-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(meta)
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  /** The read-only draft viewer: the printable document in a sandboxed frame
   *  — the same buildPrintableHtml page printing renders, so what shows IS
   *  the artifact. Static HTML in a frame is inherently uneditable; nothing
   *  here can write back. */
  const renderViewer = (open: { meta: CompiledDraftMeta; html: string }): JSX.Element => {
    const sentTo = submissions.filter((s) => s.compiledDraftId === open.meta.id).map((s) => s.recipient)
    return (
      <>
        <div className="compile-viewer-header">
          <button type="button" className="outliner-open-button" onClick={() => setViewer(null)}>
            ← Compile
          </button>
          <div className="compile-viewer-meta">
            <span className="compile-viewer-title">{open.meta.name || 'Untitled'}</span>
            <span className="compile-viewer-sub">
              {formatDateTime(open.meta.createdAt)} ·{' '}
              <span className="compile-format-badge">{open.meta.format.toUpperCase()}</span>
              {open.meta.stylePreset === 'manuscript' && ' · Manuscript format'} · {scopeCell(open.meta)} ·{' '}
              {open.meta.wordCount.toLocaleString()} words
              {open.meta.warningsAccepted > 0 && ` · ${open.meta.warningsAccepted} warnings accepted`}
              {sentTo.length > 0 && ` · Sent to ${sentTo.join(', ')}`}
              {' · Read-only, frozen at compile time'}
            </span>
          </div>
          <div className="compile-viewer-actions">
            <button type="button" className="submissions-add-button" onClick={() => onExportCopy(open.meta.id)}>
              Export a copy…
            </button>
            <button type="button" className="submissions-add-button" onClick={() => onPrint(open.meta.id)}>
              Print…
            </button>
          </div>
        </div>
        <div className="compile-viewer-body">
          {/* allow-same-origin, NOT sandbox="": a fully sandboxed srcdoc gets
              an opaque origin the app CSP's 'self' can never match, and
              Chromium then refuses to paint the document at all. Scripts stay
              disabled either way (no allow-scripts) — this only keeps the
              frame's origin matchable so its embedded stylesheet applies. */}
          <iframe
            className="compile-viewer-frame"
            style={{
              width: open.meta.bookTrim
                ? Math.round(BOOK_TRIMS[open.meta.bookTrim].widthIn * 96)
                : pageWidthPx(open.meta.pageSize)
            }}
            srcDoc={open.html}
            sandbox="allow-same-origin"
            title={open.meta.name || 'Compiled draft'}
          />
        </div>
      </>
    )
  }

  const details = settings?.personalDetails
  const detailsSaved = !!details && (details.name.trim() !== '' || details.contact.trim() !== '' || details.address.trim() !== '')
  const detailsSummary = !detailsSaved
    ? 'No personal details are saved yet.'
    : details?.name.trim()
      ? `Personal details are saved for ${details.name.trim()}.`
      : 'Personal details are saved.'

  return (
    <div className="outliner compile-view">
      {viewer ? (
        renderViewer(viewer)
      ) : (
        <>
          {/* The slim bar stays put while the assembly scrolls — the same
              treatment as the Continuity Board's toolbar. */}
          {settings && (
            <div className="outliner-toolbar compile-details-bar">
              <button
                type="button"
                className="submissions-add-button"
                onClick={() => {
                  setDetailsDraft({ ...settings.personalDetails })
                  setDetailsOpen(true)
                }}
              >
                Personal details…
              </button>
              <span className="compile-details-spacer" />
              <span className="compile-details-summary">{detailsSummary}</span>
            </div>
          )}
          {renderAssembly()}
        </>
      )}

      {detailsOpen && settings && (
        <div className="modal-overlay" onClick={() => setDetailsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Personal details</h2>
            <p className="modal-message">
              Name, contact number and address for the compiled output. Matter documents place them with{' '}
              {'{{name}}'}, {'{{contact}}'} and {'{{address}}'} markers, filled in at compile time — the saved
              values are never written into the documents themselves, so editing them here updates every future
              compile.
            </p>
            <label className="compile-details-field">
              <span>Name</span>
              <input
                className="outliner-filter-input"
                autoFocus
                value={detailsDraft.name}
                onChange={(e) => setDetailsDraft({ ...detailsDraft, name: e.target.value })}
              />
            </label>
            <label className="compile-details-field">
              <span>Contact number</span>
              <input
                className="outliner-filter-input"
                value={detailsDraft.contact}
                onChange={(e) => setDetailsDraft({ ...detailsDraft, contact: e.target.value })}
              />
            </label>
            <label className="compile-details-field">
              <span>Address</span>
              <textarea
                className="outliner-filter-input compile-details-address"
                rows={3}
                value={detailsDraft.address}
                onChange={(e) => setDetailsDraft({ ...detailsDraft, address: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setDetailsOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm modal-confirm--primary"
                onClick={() => {
                  onUpdateSettings({ ...settings, personalDetails: { ...detailsDraft } })
                  setDetailsOpen(false)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {presetNameOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setPresetNameOpen(false)
            setPresetName('')
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Save compile preset</h2>
            <p className="modal-message">
              This saves the current selection, format, and style under one name for one-click reuse.
            </p>
            <input
              className="outliner-filter-input compile-preset-name-input"
              autoFocus
              placeholder="Query Package, for example"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSavePreset()
                if (e.key === 'Escape') {
                  setPresetNameOpen(false)
                  setPresetName('')
                }
              }}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel"
                onClick={() => {
                  setPresetNameOpen(false)
                  setPresetName('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm modal-confirm--primary"
                disabled={!presetName.trim()}
                onClick={() => void handleSavePreset()}
              >
                Save preset
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete compiled draft?"
          message={`“${deleteTarget.name}” (${formatDateTime(deleteTarget.createdAt)}) will be removed permanently. A compiled draft can't be regenerated exactly, because the manuscript may have changed since.${(() => {
            const attached = submissions.filter((s) => s.compiledDraftId === deleteTarget.id)
            if (attached.length === 0) return ''
            const names = attached.map((s) => s.recipient || 'Untitled')
            const listed = names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '')
            return ` It is attached to ${attached.length} ${
              attached.length === 1 ? 'submission' : 'submissions'
            } (${listed}). Those records will keep the draft's name but lose the stored copy.`
          })()}`}
          confirmLabel="Delete"
          onConfirm={() => {
            void onDeleteCompile(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

export default CompileView
