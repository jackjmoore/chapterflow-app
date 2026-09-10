import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editorExtensions'
import { Pagination } from '../src/renderer/src/extensions/pagination'
import { paginate, pageStartOffsets, PAGE_GAP_PX } from '../src/renderer/src/pagePreview'

export interface Check {
  ok: boolean
  label: string
}

/**
 * Mounts a real editor inside the same DOM structure App.tsx renders, with
 * the real stylesheet, and inspects what actually comes out.
 *
 * The unit tests verify that paginate() computes correct breaks. They cannot
 * catch the integration failing — breaks computed correctly but never
 * reaching the view, or reaching it against a text column of a different
 * width than they were measured for. That gap is what this covers.
 */
function mountApp(html: string, marginPx: number, pageWidthPx: number): {
  editor: Editor
  proseMirror: HTMLElement
  stack: HTMLElement
  teardown: () => void
} {
  const editorEl = document.createElement('div')
  editorEl.className = 'editor'

  const stack = document.createElement('div')
  stack.className = 'page-stack'
  stack.style.width = `${pageWidthPx}px`
  stack.style.setProperty('--chf-page-margin', `${marginPx}px`)

  const sheets = document.createElement('div')
  sheets.className = 'page-sheets'
  stack.appendChild(sheets)

  // Stands in for <EditorContent>, which renders a wrapper div and lets
  // ProseMirror mount inside it.
  const mount = document.createElement('div')
  stack.appendChild(mount)
  editorEl.appendChild(stack)
  document.body.appendChild(editorEl)

  const editor = new Editor({
    element: mount,
    extensions: [...createEditorExtensions(), Pagination],
    content: html
  })

  const proseMirror = mount.querySelector('.ProseMirror') as HTMLElement
  return {
    editor,
    proseMirror,
    stack,
    teardown: () => {
      editor.destroy()
      editorEl.remove()
    }
  }
}

/**
 * Every rendered line of text whose box falls outside its page's text area.
 *
 * Measures actual line boxes via Ranges over the text nodes — the gap
 * spacers are elements with no text, so they're excluded automatically,
 * which matters because a spacer legitimately occupies the gutter.
 * Returns the offending line tops, in content-box coordinates.
 */
function straddlingLines(
  proseMirror: HTMLElement,
  marginPx: number,
  stride: number,
  usableHeightPx: number
): number[] {
  const contentTop = proseMirror.getBoundingClientRect().top + marginPx
  const walker = document.createTreeWalker(proseMirror, NodeFilter.SHOW_TEXT)
  const offenders: number[] = []
  const range = document.createRange()

  let node = walker.nextNode()
  while (node) {
    if ((node as Text).length > 0) {
      range.selectNodeContents(node)
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.height === 0) continue
        const top = rect.top - contentTop
        const bottom = rect.bottom - contentTop
        const page = Math.floor(top / stride)
        // One pixel of slack for sub-pixel layout rounding.
        if (top < page * stride - 1 || bottom > page * stride + usableHeightPx + 1) {
          offenders.push(top)
        }
      }
    }
    node = walker.nextNode()
  }
  return offenders
}

export function runChecks(): Check[] {
  const checks: Check[] = []
  const assert = (ok: boolean, label: string): void => {
    checks.push({ ok, label })
  }

  const marginMm = 25
  const result0 = paginate('<p>x</p>', 'letter', marginMm)
  const { marginPx, pageWidthPx, usableWidthPx, usableHeightPx } = result0.geometry
  const stride = usableHeightPx + marginPx * 2 + PAGE_GAP_PX

  // ---- symptom 2: does the page actually have its margins? ------------
  {
    const long = `<p>${'The lamp guttered and went out again. '.repeat(14)}</p>`.repeat(30)
    const app = mountApp(long, marginPx, pageWidthPx)
    const style = getComputedStyle(app.proseMirror)
    const padTop = parseFloat(style.paddingTop)
    const padLeft = parseFloat(style.paddingLeft)

    assert(
      Math.abs(padTop - marginPx) < 1,
      `page has its top margin (expected ${marginPx.toFixed(1)}px, got ${padTop.toFixed(1)}px)`
    )
    assert(
      Math.abs(padLeft - marginPx) < 1,
      `page has its side margins (expected ${marginPx.toFixed(1)}px, got ${padLeft.toFixed(1)}px)`
    )
    assert(
      parseFloat(style.paddingBottom) > 1,
      `page has a bottom margin (got ${style.paddingBottom})`
    )

    // The load-bearing equality: the live text column must be exactly the
    // width pagination measured at, or every computed break lands wrong.
    const liveWidth = app.proseMirror.clientWidth - padLeft - parseFloat(style.paddingRight)
    assert(
      Math.abs(liveWidth - usableWidthPx) < 1,
      `live text column matches the measured width (measured ${usableWidthPx.toFixed(0)}px, live ${liveWidth.toFixed(0)}px)`
    )
    app.teardown()
  }

  // ---- symptom 1: do breaks reach the view as real gaps? --------------
  {
    const long = `<p>${'The lamp guttered and went out again. '.repeat(14)}</p>`.repeat(30)
    const app = mountApp(long, marginPx, pageWidthPx)
    const result = paginate(app.editor.getHTML(), 'letter', marginMm)
    app.editor.commands.setPageBreaks(result.breaks)

    const gaps = Array.from(app.proseMirror.querySelectorAll('.chf-page-gap')) as HTMLElement[]
    assert(result.breaks.length > 0, `pagination found breaks for a ${result.pageCount}-page document`)
    assert(
      gaps.length === result.breaks.length,
      `every break renders as a gap in the document (${result.breaks.length} breaks, ${gaps.length} gaps)`
    )

    // The gaps have to land content on the sheets, not merely exist.
    // Checked per line box, not per block: a paragraph split across a page
    // boundary legitimately spans two sheets, so a block-level check would
    // flag correct output. What must never happen is a *line* of text
    // sitting in the margin or the gutter between sheets.
    const straddles = straddlingLines(app.proseMirror, marginPx, stride, usableHeightPx)
    assert(
      straddles.length === 0,
      `no rendered line falls in a margin or gutter (${straddles.length} do${straddles.length ? `, first at y=${straddles[0].toFixed(0)}px` : ''})`
    )
    app.teardown()
  }

  // ---- symptom 3: is a manual page break honoured? --------------------
  {
    const withBreak =
      '<p>Short first page.</p>' +
      '<div data-page-break="true"></div>' +
      '<p>This must start page two.</p>'
    const result = paginate(withBreak, 'letter', marginMm)
    assert(result.pageCount === 2, `a manual page break makes two pages (got ${result.pageCount})`)
    assert(
      result.breaks.some((b) => b.blockIndex >= 2),
      'content after a manual break is pushed to the next page'
    )

    const chapter =
      '<p>Short first page.</p>' +
      '<div data-chapter-break="true"></div>' +
      '<p>This must start page two.</p>'
    assert(
      paginate(chapter, 'letter', marginMm).pageCount === 2,
      'a manual chapter break also starts a new page'
    )

    // A break at the very end shouldn't conjure a trailing blank page.
    const trailing = '<p>Only content.</p><div data-page-break="true"></div>'
    assert(
      paginate(trailing, 'letter', marginMm).pageCount <= 2,
      'a trailing manual break does not add unbounded pages'
    )
  }

  // ---- Book View windows: do the natural-flow offsets land on the same
  //      content the editor's sheets show? ------------------------------
  {
    // Short paragraphs, so breaks fall BETWEEN blocks — the whole-block case
    // the offset comparison below can actually measure. (The long-paragraph
    // fixture above only ever splits mid-block.)
    const long = Array.from({ length: 220 }, (_, i) => `<p>Short paragraph number ${i + 1}.</p>`).join('')
    const result = paginate(long, 'letter', marginMm)
    const starts = pageStartOffsets(result)

    assert(
      starts.length === result.pageCount,
      `one window offset per page (${starts.length} offsets, ${result.pageCount} pages)`
    )
    assert(
      starts.every((s, i) => i === 0 || s > starts[i - 1]),
      'window offsets are strictly increasing'
    )
    assert(
      starts.every((s, i) => i === 0 || s - starts[i - 1] <= usableHeightPx + 1),
      'no window claims more content than a page can hold'
    )

    // The load-bearing equality: render the same HTML in the natural
    // (gap-free) flow — exactly what a Book View leaf does — and check that
    // each whole-block break's block really does sit at its page's window
    // offset. If this drifts, Book View shows different pages than the
    // editor while claiming the same numbers.
    const host = document.createElement('div')
    host.className = 'editor page-measure-host'
    const flow = document.createElement('div')
    flow.className = 'ProseMirror page-measure-content'
    flow.style.width = `${usableWidthPx}px`
    flow.innerHTML = long
    host.appendChild(flow)
    document.body.appendChild(host)

    let checked = 0
    let misses = 0
    const blocks = Array.from(flow.children) as HTMLElement[]
    result.breaks.forEach((b, i) => {
      if (b.charOffset !== null) return // in-block breaks have no block edge to compare
      const naturalTop = blocks[b.blockIndex].offsetTop - flow.offsetTop
      checked += 1
      if (Math.abs(naturalTop - starts[i + 1]) > 1) misses += 1
    })
    host.remove()

    assert(
      checked > 0 && misses === 0,
      `whole-block page starts match the natural flow (${checked} checked, ${misses} off)`
    )
  }

  return checks
}
