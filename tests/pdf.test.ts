/**
 * Regression tests that need a real Electron main process: the PDF renderer
 * (Chromium's printToPDF) and the WebP→PNG transcoder (Chromium's image
 * decoder). Run via scripts/run-electron-test.mjs.
 *
 * The PDF assertions parse the produced bytes rather than checking that a
 * file exists. Chromium writes FlateDecode-compressed content streams using
 * subset fonts, so proving a string reached the page means inflating the
 * streams and decoding glyph ids through each font's ToUnicode CMap. A test
 * that only checked the file's size or its %PDF- header would pass just as
 * happily on a PDF with every footnote missing.
 */
import { app } from 'electron'
import { writeFile } from 'fs/promises'
import { inflateSync } from 'zlib'
import { htmlToBlocks } from '../src/main/export/htmlToBlocks'
import { blocksToHtml, footnotesToHtml } from '../src/main/export/blocksToHtml'
import { numberFootnotes } from '../src/main/export/footnotes'
import { htmlToPdfBuffer } from '../src/main/export/toPdf'
import { transcodeWebpToPng } from '../src/main/imageTranscode'
import { imageSize } from '../src/main/export/imageSize'
import type { ExportOptions } from '../src/shared/export'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

const SAMPLE_HTML = [
  '<h1>Chapter One</h1>',
  '<p>The lamp guttered<sup data-footnote="Whale oil, not gas."></sup> and went out.</p>',
  '<div data-chapter-line="true"></div>',
  '<p>She waited in the dark.<sup data-footnote="Compare the opening of ch. 9."></sup></p>',
  '<div data-page-break="true"></div>',
  '<p>Morning came grey.</p>'
].join('')

const OPTIONS: ExportOptions = {
  preset: 'standard',
  pageSize: 'letter',
  marginMm: 25.4,
  authorName: 'Test',
  title: 'Export Regression'
}

/** Every stream in the file, inflated where it's FlateDecode-compressed. */
function inflatedStreams(buffer: Buffer): string[] {
  const parts: string[] = []
  let index = 0
  while (true) {
    const start = buffer.indexOf('stream', index)
    if (start === -1) break
    let dataStart = start + 'stream'.length
    if (buffer[dataStart] === 0x0d) dataStart += 1
    if (buffer[dataStart] === 0x0a) dataStart += 1
    const end = buffer.indexOf('endstream', dataStart)
    if (end === -1) break
    try {
      parts.push(inflateSync(buffer.subarray(dataStart, end)).toString('latin1'))
    } catch {
      // Not a stream we can inflate — skip rather than aborting extraction.
    }
    index = end + 'endstream'.length
  }
  return parts
}

/** Parses one ToUnicode CMap's bfchar/bfrange sections into code → text. */
function parseCMap(stream: string): Map<number, string> {
  const map = new Map<number, string>()
  const fromHex = (hex: string): string => {
    let out = ''
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
    return out
  }

  for (const s of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of s[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(pair[1], 16), fromHex(pair[2]))
    }
  }
  for (const s of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of s[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const lo = parseInt(r[1], 16)
      const hi = parseInt(r[2], 16)
      const dst = parseInt(r[3], 16)
      for (let code = lo; code <= hi && code - lo < 0x10000; code += 1) {
        map.set(code, String.fromCharCode(dst + (code - lo)))
      }
    }
    for (const r of s[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(r[1], 16)
      ;[...r[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((t, i) => map.set(lo + i, fromHex(t[1])))
    }
  }
  return map
}

/**
 * Readable text from the PDF. Decodes the glyph stream once per embedded
 * font's CMap and concatenates: runs belonging to that font come out as real
 * words, the rest as noise no assertion will match. Only glyph tokens are
 * kept — Chromium positions nearly every glyph with its own operator, so
 * leaving those in would scatter the letters of a word apart. Spaces survive
 * because they are glyphs with their own CMap entry.
 */
function pdfText(buffer: Buffer): string {
  const streams = inflatedStreams(buffer)
  const cmaps = streams.filter((s) => s.includes('beginbfchar') || s.includes('beginbfrange')).map(parseCMap)
  const content = streams.filter((s) => s.includes('Tj') || s.includes('TJ')).join('\n')
  const glyphs = [...content.matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1])

  return cmaps
    .map((cmap) =>
      glyphs
        .map((hex) => {
          let out = ''
          for (let i = 0; i + 4 <= hex.length; i += 4) out += cmap.get(parseInt(hex.slice(i, i + 4), 16)) ?? ''
          return out
        })
        .join('')
    )
    .join('\n')
}

function pageCount(buffer: Buffer): number {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function testPdf(report: TestReport, outDir: string): Promise<void> {
  section(report, 'pdf render')
  const blocks = htmlToBlocks(SAMPLE_HTML)
  const notes = numberFootnotes(blocks)
  const buffer = await htmlToPdfBuffer(blocksToHtml(blocks) + footnotesToHtml(notes), OPTIONS)
  const outPath = `${outDir}/export-regression.pdf`
  await writeFile(outPath, buffer)
  note(report, `wrote ${outPath} (${buffer.length} bytes)`)

  assert(report, buffer.subarray(0, 5).toString() === '%PDF-', 'output is a real PDF')

  const text = pdfText(buffer)
  const pages = pageCount(buffer)
  note(report, `${pages} page(s), ${text.length} chars of decoded text`)

  assert(report, text.includes('Chapter One'), 'body text rendered')
  assert(report, text.includes('Whale oil'), 'footnote 1 text reached the page')
  assert(report, text.includes('Compare the opening'), 'footnote 2 text reached the page')
  assert(report, text.includes('Notes'), 'endnote heading rendered')
  assert(report, text.includes('1. Whale oil'), 'endnotes are numbered')
  // One explicit page break plus the endnotes' own break-before:page.
  assert(report, pages >= 3, `page break forced new pages (got ${pages})`)
}

/**
 * Builds a genuine WebP with Chromium's own encoder, then runs it through the
 * production transcoder. Generating the fixture rather than committing binary
 * bytes keeps the test self-contained and proves the encode/decode pair.
 */
async function testWebpTranscode(report: TestReport): Promise<void> {
  section(report, 'webp transcode')
  const { BrowserWindow } = await import('electron')
  const window = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  let webp: Buffer
  try {
    await window.loadURL('data:text/html,<html><body></body></html>')
    const dataUrl: string = await window.webContents.executeJavaScript(`
      (() => {
        const c = document.createElement('canvas'); c.width = 40; c.height = 24
        const x = c.getContext('2d')
        x.fillStyle = '#c0392b'; x.fillRect(0, 0, 40, 24)
        return c.toDataURL('image/webp')
      })()
    `)
    assert(report, dataUrl.startsWith('data:image/webp'), 'fixture really is WebP, not a PNG fallback')
    webp = Buffer.from(dataUrl.split(',')[1], 'base64')
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }

  assert(report, webp.toString('ascii', 8, 12) === 'WEBP', 'fixture has a WEBP RIFF header')

  const png = await transcodeWebpToPng(webp)
  assert(report, png.readUInt32BE(0) === 0x89504e47, 'transcoder returns a real PNG')
  const size = imageSize(png)
  assert(report, size?.width === 40 && size?.height === 24, 'transcode preserves pixel dimensions')
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  try {
    await testPdf(report, outDir)
    await testWebpTranscode(report)
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }

  // Electron's main process does not attach stdout to the parent console on
  // Windows, so the runner reads the report back from here.
  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

// htmlToPdfBuffer and the transcoder each create and destroy a BrowserWindow.
// Electron's default is to quit once the last window closes, which would kill
// this process mid-run before the report is written.
app.on('window-all-closed', () => {})

app.whenReady().then(() => void main())
