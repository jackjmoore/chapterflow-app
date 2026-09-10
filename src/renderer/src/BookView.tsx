import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageSize } from '../../shared/preferences'
import {
  giveEmptyBlocksALineBox,
  pageStartOffsets,
  paginate,
  type PageGeometry
} from './pagePreview'
import { BOOK_TILT_RAD, createBookScene, type BookProjection, type BookSceneHandle } from './bookScene'
import { CloseIcon } from './icons'

interface BookViewProps {
  /** Produces the whole manuscript's stitched HTML (see assembleDraftHtml) —
   *  called once on entry; the view is read-only from there on. */
  assemble: () => Promise<string>
  pageSize: PageSize
  pageMarginMm: number
  /** Returns to whichever view was active before entering the book. */
  onClose: () => void
}

type BookMode = '2d' | '3d'

/**
 * One page leaf: the whole document rendered once, clipped to this page's
 * window.
 *
 * The same paginate() pass that lays out the editor's sheets supplies the
 * window offsets (see pageStartOffsets), so what shows on page N here is
 * character-identical to what the editor shows on sheet N — one pagination
 * system, two renderings of it. Turning a page changes only a transform; the
 * document DOM is written once per mount.
 */
function PageLeaf(props: {
  html: string
  geometry: PageGeometry
  offset: number
  clipHeight: number
  blank?: boolean
}): JSX.Element {
  const { html, geometry, offset, clipHeight, blank } = props
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.innerHTML = html
    // Same fix-up the measurement rig applies, for the same reason: the
    // layout here must reproduce what was measured, or windows drift.
    giveEmptyBlocksALineBox(el)
  }, [html])

  return (
    <div
      className="book-page"
      style={{ width: `${geometry.pageWidthPx}px`, height: `${geometry.pageHeightPx}px` }}
    >
      {!blank && (
        <div
          className="book-page-clip"
          style={{
            margin: `${geometry.marginPx}px`,
            width: `${geometry.usableWidthPx}px`,
            height: `${clipHeight}px`
          }}
        >
          <div
            ref={contentRef}
            className="ProseMirror book-page-content"
            style={{ width: `${geometry.usableWidthPx}px`, transform: `translateY(${-offset}px)` }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Read-only view of the manuscript as a physical book.
 *
 * Answers the one question the other views can't: where am I in the whole
 * thing? 2D mode is a flat page-by-page reader; 3D mode adds the book body —
 * page-block thickness either side of the open spread, proportional to pages
 * read and remaining. Both render the same pagination the editor computed.
 *
 * Read-only structurally, not by discipline: the pages are plain rendered
 * HTML, never an editor instance, so there is nothing here that could accept
 * an edit in the first place.
 */
function BookView(props: BookViewProps): JSX.Element {
  const { assemble, pageSize, pageMarginMm, onClose } = props

  const [mode, setMode] = useState<BookMode>('2d')
  const [page, setPage] = useState(0)
  const [jumpDraft, setJumpDraft] = useState('')
  // The stitched manuscript, assembled once on entry. Null while loading —
  // the assembly reads every document, so it is honestly async.
  const [html, setHtml] = useState<string | null>(null)
  // How the scene's camera projects the spread's plane, reported on every
  // resize — the DOM spread reproduces it in CSS so both layers agree.
  const [projection, setProjection] = useState<BookProjection>({ scale: 1, perspectivePx: 2000 })

  const sceneRef = useRef<HTMLDivElement>(null)
  const sceneHandleRef = useRef<BookSceneHandle | null>(null)

  useEffect(() => {
    let cancelled = false
    void assemble().then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
    // Assembled once per entry — the view mounts fresh each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The same engine, inputs, and geometry the editor's page view uses —
  // deliberately not a second pagination system.
  const pagination = useMemo(() => paginate(html ?? '', pageSize, pageMarginMm), [html, pageSize, pageMarginMm])
  const starts = useMemo(() => pageStartOffsets(pagination), [pagination])
  const { geometry, pageCount } = pagination

  // Geometry changes (Page Setup) can shrink the book under the current page.
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  const step = mode === '3d' ? 2 : 1
  const clampPage = (value: number): number => Math.max(0, Math.min(value, pageCount - 1))

  function goTo(value: number): void {
    // Spreads sit on even boundaries, like a real book's verso/recto.
    setPage(mode === '3d' ? clampPage(value) - (clampPage(value) % 2) : clampPage(value))
  }

  function enterMode(next: BookMode): void {
    setMode(next)
    if (next === '3d') setPage((current) => current - (current % 2))
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(page + step)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(page - step)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, step, pageCount, mode])

  // The 3D scene exists only while 3D mode is showing; leaving disposes every
  // GL resource so the view costs nothing once you're back in 2D or gone.
  useEffect(() => {
    if (mode !== '3d') return
    const container = sceneRef.current
    if (!container) return
    const handle = createBookScene(container, {
      pageWidthPx: geometry.pageWidthPx,
      pageHeightPx: geometry.pageHeightPx,
      pageCount,
      onProjection: setProjection
    })
    sceneHandleRef.current = handle
    const observer = new ResizeObserver(() => handle.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      handle.dispose()
      sceneHandleRef.current = null
    }
  }, [mode, geometry.pageWidthPx, geometry.pageHeightPx, pageCount])

  useEffect(() => {
    sceneHandleRef.current?.setProgress(page, Math.max(0, pageCount - page - 2))
  }, [mode, page, pageCount])

  const clipHeightFor = (p: number): number => {
    const next = starts[p + 1]
    if (next === undefined) return geometry.usableHeightPx
    // A hair PAST the boundary, deliberately. paginate() places an in-block
    // boundary at the kept text's em-box bottom (lineSplit's `bottomAt`), so
    // a cut exactly there grazes that line's descenders, and a cut short of
    // it slices them outright — measured both ways. The safe zone is the
    // inter-line gap just below the boundary: this slack keeps the kept
    // line whole while staying under the next line's ascent at any of the
    // app's line spacings, so at most an invisible ~1px of the next line's
    // leading enters the window.
    const BOUNDARY_SLACK_PX = 1.5
    return Math.min(geometry.usableHeightPx, Math.max(0, next - starts[p] + BOUNDARY_SLACK_PX))
  }

  const leaf = (p: number): JSX.Element => (
    <PageLeaf
      html={html ?? ''}
      geometry={geometry}
      offset={starts[p] ?? 0}
      clipHeight={clipHeightFor(p)}
      blank={p >= pageCount}
    />
  )

  const readout =
    mode === '3d' && page + 1 < pageCount
      ? `Pages ${page + 1}–${page + 2} of ${pageCount}`
      : `Page ${page + 1} of ${pageCount}`
  const percent = Math.round(((page + 1) / pageCount) * 100)

  function commitJump(): void {
    const value = Number(jumpDraft)
    if (Number.isFinite(value) && value >= 1) goTo(Math.round(value) - 1)
    setJumpDraft('')
  }

  return (
    <div className="book-view">
      <div className="book-view-toolbar">
        <div className="book-mode-switch">
          <button
            type="button"
            className={mode === '2d' ? 'is-active' : ''}
            title="Flat page-by-page reading"
            onClick={() => enterMode('2d')}
          >
            Flat
          </button>
          <button
            type="button"
            className={mode === '3d' ? 'is-active' : ''}
            title="The book as an object — thickness shows where you are"
            onClick={() => enterMode('3d')}
          >
            Book
          </button>
        </div>

        <span className="book-view-readout">
          {readout} · {percent}%
        </span>

        <div className="book-view-nav">
          <button type="button" title="Previous page (←)" disabled={page === 0} onClick={() => goTo(page - step)}>
            ‹
          </button>
          <input
            type="number"
            className="book-jump"
            min={1}
            max={pageCount}
            placeholder={String(page + 1)}
            value={jumpDraft}
            title="Jump to a page"
            onChange={(e) => setJumpDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitJump()
            }}
            onBlur={() => {
              if (jumpDraft) commitJump()
            }}
          />
          <button
            type="button"
            title="Next page (→)"
            disabled={page + step > pageCount - 1}
            onClick={() => goTo(page + step)}
          >
            ›
          </button>
        </div>

        <button type="button" className="icon-close-button" title="Close the draft (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div
        className="book-progress"
        title="Where you are in the book — click to jump"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          goTo(Math.floor(ratio * pageCount))
        }}
      >
        <div className="book-progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <div className="book-view-stage">
        {html === null ? (
          <div className="book-view-loading">Assembling the draft…</div>
        ) : mode === '2d' ? (
          <div className="editor book-page-typography book-flat">{leaf(page)}</div>
        ) : (
          <>
            <div className="book-scene" ref={sceneRef} />
            {/* The readable spread: plain DOM over the canvas, tilted with
                the same numbers the scene's camera reported, so the pages
                land on the WebGL book body without a synced 3D DOM layer.
                CSS rotateX is sign-flipped from three's (Y points down). */}
            <div className="book-spread-wrap" style={{ perspective: `${projection.perspectivePx}px` }}>
              <div
                className="editor book-page-typography book-spread"
                style={{
                  // Explicit size, and flex fully neutralized: the `editor`
                  // class carries `flex: 1`, whose basis-0 would override the
                  // width on a flex item and pivot the scale off-center.
                  width: `${geometry.pageWidthPx * 2}px`,
                  height: `${geometry.pageHeightPx}px`,
                  flex: '0 0 auto',
                  transform: `scale(${projection.scale}) rotateX(${-BOOK_TILT_RAD}rad)`
                }}
              >
                {leaf(page)}
                {leaf(page + 1)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default BookView
