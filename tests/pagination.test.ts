/**
 * Drives the pagination checks inside a real browser window loaded with the
 * application's own built stylesheet.
 *
 * Pagination is a layout question — how tall this paragraph is, in this font,
 * at this measure — so it can only be answered by a real layout engine with
 * the real CSS. Running it against the built stylesheet also means a
 * typography change that silently moves every page break shows up here.
 */
import { app, BrowserWindow } from 'electron'
import { readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { assert, createReport, note, section, summarize } from './harness'

/** Structurally identical to the browser module's own Check. Declared here
 *  rather than imported so this file (a Node-side test) never pulls a
 *  renderer module into the node TypeScript project. */
interface Check {
  ok: boolean
  label: string
}

// Resolved from the working directory rather than __dirname: the test runs
// from a bundle inside node_modules/.cache, so a path relative to the bundle
// would point somewhere unrelated. npm scripts always run at the project root.
const ASSETS_DIR = join(process.cwd(), 'out', 'renderer', 'assets')

/** The built CSS filename carries a content hash, so it's discovered rather
 *  than hardcoded. A missing build is reported as such instead of silently
 *  testing unstyled text, which would paginate quite differently. */
async function loadBuiltCss(): Promise<string> {
  const files = await readdir(ASSETS_DIR)
  const cssFile = files.find((f) => f.endsWith('.css'))
  if (!cssFile) throw new Error(`No built stylesheet in ${ASSETS_DIR} — run "npm run build" first.`)
  return readFile(join(ASSETS_DIR, cssFile), 'utf-8')
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'

  try {
    const css = await loadBuiltCss()
    const bundle = await readFile(join(__dirname, 'pagination.browser.cjs'), 'utf-8')

    const window = new BrowserWindow({ show: false, width: 1280, height: 900 })
    try {
      await window.loadURL('data:text/html;charset=utf-8,<html><body></body></html>')
      await window.webContents.insertCSS(css)
      const checks: Check[] = await window.webContents.executeJavaScript(
        `${bundle};\nwindow.__paginationChecks.runChecks()`
      )

      section(report, 'pagination')
      note(report, `${checks.length} checks, run against the built stylesheet`)
      for (const check of checks) assert(report, check.ok, check.label)
    } finally {
      if (!window.isDestroyed()) window.destroy()
    }
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }

  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

app.on('window-all-closed', () => {})
app.whenReady().then(() => void main())
