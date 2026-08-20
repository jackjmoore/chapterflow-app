import { BrowserWindow } from 'electron'
import { effectiveMarginMm, type ExportOptions } from '../../shared/export'

const MM_PER_INCH = 25.4
const CSS_PX_PER_INCH = 96

const SHARED_CSS = `
  * { box-sizing: border-box; }
  h1, h2, h3 { break-after: avoid; break-inside: avoid; }
  p { orphans: 3; widows: 3; }
  blockquote { break-inside: avoid; }
  .chf-section-title { break-before: page; }
  .chf-section-title:first-child { break-before: avoid; }
  .chf-toc { break-after: page; }
  .chf-toc h1 { break-after: avoid; }
  .chf-toc ul { list-style: none; padding-left: 0; }
  .chf-toc li { margin: 0.35em 0; }
`

/** The app's own page look — the same serif setting the editor shows. */
const STANDARD_CSS = `
  body {
    margin: 0;
    background: #faf6ec;
    color: #2b2620;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
    font-size: 12pt;
    line-height: 1.6;
  }
  h1, h2, h3 { margin: 1.1em 0 0.4em; font-weight: 700; line-height: 1.3; }
  h1 { font-size: 22pt; }
  h2 { font-size: 17pt; }
  h3 { font-size: 14pt; }
  p { margin: 0 0 0.75em; }
  blockquote {
    margin: 0.75em 0;
    padding-left: 1em;
    border-left: 3px solid #c9bfa3;
    color: #6e6656;
    font-style: italic;
  }
  ul, ol { margin: 0 0 0.75em; padding-left: 1.5em; }
  li { margin: 0.2em 0; }
  li > p { margin: 0; }
  .chf-toc .chf-toc-folder { font-weight: 700; margin-top: 0.6em; }
  .chf-toc .chf-toc-doc { padding-left: 1.2em; color: #4a4335; }
  .chf-scene-break { text-align: center; margin: 1em 0; }
`

/**
 * Standard manuscript format. Every value here is convention rather than
 * taste: 12pt Times New Roman, true double spacing, a first-line indent with
 * no blank line between paragraphs, no bold/oversized chapter headings, and
 * white background regardless of the app's theme.
 */
const MANUSCRIPT_CSS = `
  body {
    margin: 0;
    background: #ffffff;
    color: #000000;
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 2;
  }
  p {
    margin: 0;
    text-indent: 0.5in;
    text-align: left;
  }
  /* A paragraph opening a scene or chapter is flush left by convention. */
  h1 + p, h2 + p, h3 + p, .chf-scene-break + p, body > p:first-child { text-indent: 0; }
  h1, h2, h3 {
    margin: 0 0 2em;
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    font-weight: 400;
    line-height: 2;
    text-align: center;
    text-transform: uppercase;
  }
  .chf-section-title { margin-top: 2in; }
  blockquote { margin: 0 0 0 0.5in; font-style: normal; border: none; padding: 0; }
  ul, ol { margin: 0 0 0 0.5in; padding-left: 1.5em; }
  li { margin: 0; }
  li > p { margin: 0; text-indent: 0; }
  .chf-scene-break { text-align: center; text-indent: 0; margin: 0; }
  .chf-toc { font-size: 12pt; }
  .chf-toc li { margin: 0; }
`

function wrapHtml(bodyHtml: string, options: ExportOptions, paddingCss: string): string {
  const css =
    SHARED_CSS + (options.preset === 'manuscript' ? MANUSCRIPT_CSS : STANDARD_CSS) + `body { ${paddingCss} }`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`
}

/** Surname-only is the usual convention; falls back to the whole string. */
function headerName(authorName: string | null): string {
  const trimmed = (authorName ?? '').trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/)
  return parts[parts.length - 1]
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** `Surname / TITLE / 3`, right-aligned in the top margin. Chromium requires
 *  an explicit font-size in these templates and supplies the page number
 *  through the reserved `.pageNumber` class. */
function manuscriptHeaderTemplate(options: ExportOptions): string {
  const surname = headerName(options.authorName)
  const title = escape(options.title.toUpperCase())
  const label = [surname && escape(surname), title].filter(Boolean).join(' / ')
  return `<div style="width:100%;font-family:'Times New Roman',Times,serif;font-size:10pt;color:#000;padding:0 0.5in;text-align:right;">
    ${label} / <span class="pageNumber"></span>
  </div>`
}

export interface PageGeometry {
  pageSize: 'A4' | 'Letter'
  marginInches: number
}

export function pageGeometry(options: ExportOptions): PageGeometry {
  return {
    pageSize: options.pageSize === 'letter' ? 'Letter' : 'A4',
    marginInches: effectiveMarginMm(options) / MM_PER_INCH
  }
}

/** Full HTML for a render — shared by PDF export and printing so both produce
 *  exactly the same page. */
export function buildPrintableHtml(bodyHtml: string, options: ExportOptions): string {
  // Manuscript keeps its margin in the print engine's own margin box so the
  // running header has somewhere to live; standard keeps the older behaviour
  // of padding the body, which needs no header room.
  if (options.preset === 'manuscript') return wrapHtml(bodyHtml, options, 'padding: 0;')
  const marginIn = effectiveMarginMm(options) / MM_PER_INCH
  return wrapHtml(bodyHtml, options, `padding: ${marginIn}in;`)
}

/**
 * Renders HTML through a real (offscreen) Chromium window and prints it to PDF —
 * full fidelity for headings/bold/italic/alignment/color since it's the actual
 * browser engine doing layout, not a hand-rolled PDF writer.
 */
export async function htmlToPdfBuffer(bodyHtml: string, options: ExportOptions): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  try {
    const html = buildPrintableHtml(bodyHtml, options)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const { pageSize, marginInches } = pageGeometry(options)
    const isManuscript = options.preset === 'manuscript'
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: false,
      pageSize,
      displayHeaderFooter: isManuscript,
      headerTemplate: isManuscript ? manuscriptHeaderTemplate(options) : undefined,
      // An empty footer still has to be supplied, or Chromium falls back to
      // printing its default URL/date footer.
      footerTemplate: isManuscript ? '<span></span>' : undefined,
      margins: isManuscript
        ? { top: marginInches, bottom: marginInches, left: marginInches, right: marginInches }
        : { top: 0, bottom: 0, left: 0, right: 0 }
    })
  } finally {
    win.destroy()
  }
}

/**
 * Sends the same rendered page to a real printer through the system print
 * dialog. Deliberately shares buildPrintableHtml with the PDF path so what
 * prints is what a PDF export would have produced.
 */
export async function printHtml(bodyHtml: string, options: ExportOptions): Promise<{ printed: boolean }> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  try {
    const html = buildPrintableHtml(bodyHtml, options)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const { pageSize, marginInches } = pageGeometry(options)
    const isManuscript = options.preset === 'manuscript'

    // print() takes margins in CSS pixels, unlike printToPDF which takes
    // inches — passing inches here would silently produce hairline margins.
    const marginPx = Math.round(marginInches * CSS_PX_PER_INCH)

    return await new Promise<{ printed: boolean }>((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          pageSize,
          // Chromium's print path only accepts a plain header string — it has
          // no page-number token, so the page number comes from the print
          // dialog's own header/footer option. PDF export renders the full
          // `Surname / TITLE / n` header itself.
          header: isManuscript
            ? [headerName(options.authorName), options.title.toUpperCase()].filter(Boolean).join(' / ')
            : undefined,
          margins: isManuscript
            ? { marginType: 'custom', top: marginPx, bottom: marginPx, left: marginPx, right: marginPx }
            : { marginType: 'none' }
        },
        (success) => resolve({ printed: success })
      )
    })
  } finally {
    // The window must outlive the print callback, which the awaited promise
    // above guarantees before this runs.
    win.destroy()
  }
}
