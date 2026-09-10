/**
 * Drives the revision-mode checks inside a real browser window.
 *
 * Revision mode's own contribution is a mapping from diff offsets back to
 * ProseMirror positions, which only means anything against a real schema with
 * real node boundaries — so, like the page-view suite, this runs the checks in
 * an actual window rather than as plain unit tests. No stylesheet is needed:
 * nothing here is a layout question, only a positional one.
 */
import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { assert, createReport, note, section, summarize } from './harness'

/** Structurally identical to the browser module's own Check. Declared here
 *  rather than imported so this file (a Node-side test) never pulls a
 *  renderer module into the node TypeScript project. */
interface Check {
  ok: boolean
  label: string
  detail?: string
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'

  try {
    const bundle = await readFile(join(__dirname, 'revision.browser.cjs'), 'utf-8')

    const window = new BrowserWindow({ show: false, width: 1280, height: 900 })
    try {
      await window.loadURL('data:text/html;charset=utf-8,<html><body></body></html>')
      const checks: Check[] = await window.webContents.executeJavaScript(
        `${bundle};\nwindow.__revisionChecks.runChecks()`
      )

      section(report, 'revision mode')
      note(report, `${checks.length} checks, run against a real editor instance`)
      for (const check of checks) {
        assert(report, check.ok, check.label)
        // Only failures carry detail, and only then is it worth the noise.
        if (!check.ok && check.detail) note(report, check.detail)
      }
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
