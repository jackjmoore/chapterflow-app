/**
 * Verifies that suppression is app-only.
 *
 * The claim under test is a negative — "the operating system's dictionary was
 * never written to" — so it is checked two ways. Statically: no OS dictionary
 * API appears anywhere in the source. Dynamically: Electron's own
 * `listWordsInSpellCheckerDictionary()` (which reads the very dictionary the
 * forbidden API writes to) returns an unchanged list after a word has been
 * defined and confirmed suppressed in the editor.
 *
 * That second check is the machine-side equivalent of opening Notepad and
 * finding the word still underlined.
 */
import { app, BrowserWindow, session } from 'electron'
import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { assert, createReport, note, section, summarize } from './harness'

const FORBIDDEN = [
  'addWordToSpellCheckerDictionary',
  'removeWordFromSpellCheckerDictionary',
  'setSpellCheckerDictionaryDownloadURL'
]

async function sourceFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await sourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'

  try {
    // ---- static: the OS APIs are not used at all --------------------
    section(report, 'no OS dictionary API in the source')
    const files = await sourceFiles(join(process.cwd(), 'src'))
    for (const api of FORBIDDEN) {
      const hits: string[] = []
      for (const file of files) {
        const text = await readFile(file, 'utf-8')
        // Comments explaining why the API is avoided are expected; a real
        // call is not. Anything followed by "(" is a call.
        if (new RegExp(`${api}\\s*\\(`).test(text)) hits.push(file)
      }
      assert(report, hits.length === 0, `${api} is never called (${hits.length} call sites)`)
    }

    // ---- dynamic: suppression works, OS dictionary untouched --------
    section(report, 'suppression in the editor, not in the OS')
    const before = await session.defaultSession.listWordsInSpellCheckerDictionary()
    note(report, `OS custom dictionary holds ${before.length} word(s) before the test`)

    const win = new BrowserWindow({ show: false, width: 900, height: 600, webPreferences: { spellcheck: true } })
    const WORD = 'zelphrandix'
    // Two occurrences: one plain, one carrying the decoration the extension
    // applies. Same word, same document — the only difference is the
    // attribute, which is the entire mechanism.
    const html = `<!doctype html><html><body style="font:16px serif">
      <div id="ed" contenteditable="true" spellcheck="true" style="width:700px;padding:20px">
        <p><span id="plain">${WORD}</span> and <span id="suppressed" spellcheck="false">${WORD}</span></p>
      </div></body></html>`

    const seen: { misspelled: string; suggestions: number }[] = []
    win.webContents.on('context-menu', (_e, params) => {
      seen.push({ misspelled: params.misspelledWord, suggestions: params.dictionarySuggestions.length })
    })

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await win.webContents.executeJavaScript(`document.getElementById('ed').focus(); true`)
    await new Promise((r) => setTimeout(r, 2500))

    const centres = (await win.webContents.executeJavaScript(`
      (() => {
        const out = {}
        for (const id of ['plain', 'suppressed']) {
          const r = document.getElementById(id).getBoundingClientRect()
          out[id] = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        }
        return out
      })()
    `)) as Record<string, { x: number; y: number }>

    const probe = async (id: 'plain' | 'suppressed'): Promise<{ misspelled: string; suggestions: number }> => {
      const index = seen.length
      const { x, y } = centres[id]
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 })
      await new Promise((r) => setTimeout(r, 600))
      return seen[index] ?? { misspelled: '(no event)', suggestions: 0 }
    }

    const plain = await probe('plain')
    const suppressed = await probe('suppressed')
    note(report, `plain: "${plain.misspelled}" (${plain.suggestions} suggestions)`)
    note(report, `suppressed: "${suppressed.misspelled}" (${suppressed.suggestions} suggestions)`)

    assert(report, plain.misspelled === WORD, `an unknown word is flagged normally (got "${plain.misspelled}")`)
    assert(
      report,
      suppressed.misspelled === '',
      `the same word is not flagged where suppressed (got "${suppressed.misspelled}")`
    )
    assert(
      report,
      suppressed.suggestions === 0,
      `a suppressed word offers no spelling suggestions either (got ${suppressed.suggestions})`
    )

    const after = await session.defaultSession.listWordsInSpellCheckerDictionary()
    assert(
      report,
      after.length === before.length && !after.includes(WORD),
      `the OS custom dictionary is unchanged — the word was never taught to the system ` +
        `(${before.length} → ${after.length} words)`
    )

    win.destroy()
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }

  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

app.on('window-all-closed', () => {})
app.whenReady().then(() => void main())
