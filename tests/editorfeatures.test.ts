/**
 * Runs the editor-features checks (document split, document links) inside a
 * real browser window — the split is a schema-level operation whose whole
 * point is mark/node behavior at real boundaries, exactly like the revision
 * suite. The external-lookup URL builder is pure and is checked here on the
 * node side, right up to the IPC boundary the shell.openExternal call sits
 * behind.
 */
import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { lookupUrl, lookupWordFrom } from '../src/shared/lookup'
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
    section(report, 'external lookup urls')
    assert(
      report,
      lookupUrl('dictionary', 'whisper') === 'https://www.merriam-webster.com/dictionary/whisper',
      'dictionary lookups hit Merriam-Webster'
    )
    assert(
      report,
      lookupUrl('thesaurus', 'whisper') === 'https://www.merriam-webster.com/thesaurus/whisper',
      'thesaurus lookups hit the same publisher'
    )
    assert(
      report,
      lookupUrl('dictionary', 'fin de siècle') === 'https://www.merriam-webster.com/dictionary/fin%20de%20si%C3%A8cle',
      'the word is URL-encoded, never interpolated raw'
    )
    assert(report, lookupWordFrom('  “whisper,”  ') === 'whisper', 'surrounding punctuation is shed')
    assert(report, lookupWordFrom("don't stop") === "don't", 'the first word is used; interior apostrophes survive')
    assert(report, lookupWordFrom('well-worn phrase') === 'well-worn', 'interior hyphens survive')
    assert(report, lookupWordFrom('   ') === '', 'an empty selection looks up nothing')

    const bundle = await readFile(join(__dirname, 'editorfeatures.browser.cjs'), 'utf-8')

    const window = new BrowserWindow({ show: false, width: 1280, height: 900 })
    try {
      await window.loadURL('data:text/html;charset=utf-8,<html><body></body></html>')
      const checks: Check[] = await window.webContents.executeJavaScript(
        `${bundle};\nwindow.__editorfeaturesChecks.runChecks()`
      )

      section(report, 'document split and links')
      note(report, `${checks.length} checks, run against a real editor instance`)
      for (const check of checks) {
        assert(report, check.ok, check.detail ? `${check.label} — ${check.detail}` : check.label)
      }
    } finally {
      window.destroy()
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
