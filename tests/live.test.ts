/**
 * Drives the real application and types into it.
 *
 * Every other suite here answers "does paginate() compute the right breaks",
 * and they all passed while page view was visibly broken, because the bug was
 * never in the calculation. Repagination runs on a debounce after typing
 * stops, and a debounce is reset by every keystroke — so typing continuously
 * past the bottom of the last page produced no new page at all until the
 * writer paused, and the text simply ran off the sheet. That is a question
 * about time, not layout, and only typing into the running app can ask it.
 *
 * Launches out/main/index.js — the same entry `electron .` uses — against a
 * scratch project in a temp directory, and talks to it over the Chrome
 * DevTools Protocol. Never touches the user's own projects or preferences.
 */
import type { ChildProcess } from 'child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { assert, createReport, note, section, summarize } from './harness'
import { spawnApp, waitForDebugPort } from './cdpPort'

const DOC_ID = 'live-pagination-doc'

interface Sample {
  sheets: number
  gaps: number
  pmHeight: number
  stackHeight: number
  /** How far the last line of text sits below the last sheet's text area.
   *  Positive means content has run past the final page and a new one is
   *  owed. Measured against the sheet itself rather than the stack, because
   *  the stack is a normal block that simply grows with its content — its
   *  height can never reveal an overflow. */
  overflowPx: number
}

/** A project whose single document already nearly fills one page, so a few
 *  seconds of typing runs past its bottom. */
async function seedProject(): Promise<{ userDataDir: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'chapterflow-live-'))
  const projectDir = join(base, 'project')
  const userDataDir = join(base, 'userdata')
  await mkdir(join(projectDir, 'documents'), { recursive: true })
  await mkdir(userDataDir, { recursive: true })

  const sentence = 'The lamp guttered and went out and she waited in the dark. '
  await writeFile(join(projectDir, 'documents', `${DOC_ID}.html`), `<p>${sentence.repeat(55)}</p>`)

  await writeFile(
    join(projectDir, 'binder.json'),
    JSON.stringify({
      version: 1,
      tree: [
        {
          id: DOC_ID,
          type: 'document',
          name: 'Live Pagination',
          collapsed: false,
          synopsis: '',
    notes: '',
          statusId: null,
          tagIds: [],
          wordTarget: null,
          children: []
        }
      ],
      lastOpenDocumentId: DOC_ID,
      wordCountBaseline: null,
      projectName: 'Live Pagination',
      viewState: {
        activeView: 'editor',
        manuscriptView: 'editor',
        outlinerSort: null,
        outlinerFilter: '',
        statusFilter: [],
        tagFilter: [],
        referenceDocumentId: null,
        splitViewLocked: false,
        splitViewSyncScroll: false
      },
      statuses: [],
      tags: [],
      savedViews: [],
      overusedIgnoreList: [],
      authorName: null,
      projectWordTarget: null,
      projectDeadline: null,
      projectTargetStartDate: null,
      projectTargetStartCount: null
    })
  )

  await writeFile(
    join(userDataDir, 'preferences.json'),
    JSON.stringify({
      theme: 'dark',
      sidebarWidth: 260,
      sidebarCollapsed: false,
      pageSize: 'letter',
      pageMarginMm: 25,
      zoomPercent: 100,
      projectRoot: projectDir,
      // These suites are about the editor; the dashboard now precedes it on
      // every launch, so they ask to be taken straight through.
      skipDashboardOnLaunch: true
    })
  )

  return { userDataDir, cleanup: () => rm(base, { recursive: true, force: true }) }
}

interface Cdp {
  evaluate: (expression: string) => Promise<unknown>
  insertText: (text: string) => Promise<unknown>
  pressEnter: () => Promise<void>
  pressBackspace: () => Promise<void>
  selectAll: () => Promise<void>
  selectAllAndDelete: () => Promise<void>
  close: () => void
}

async function connect(child: ChildProcess, userDataDir: string): Promise<Cdp> {
  const port = await waitForDebugPort(child, userDataDir)
  let target: { webSocketDebuggerUrl: string } | undefined
  for (let attempt = 0; attempt < 80 && !target; attempt += 1) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string
        url: string
        webSocketDebuggerUrl: string
      }[]
      target = targets.find((t) => t.type === 'page' && String(t.url).includes('index.html'))
    } catch {
      /* devtools endpoint not listening yet */
    }
    if (!target) await sleep(400)
  }
  if (!target) {
    if (child.exitCode !== null) throw new Error(`app exited early (code ${child.exitCode})`)
    throw new Error('app window never appeared on the devtools endpoint')
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error('devtools socket failed')), { once: true })
  })

  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String((event as MessageEvent).data))
    if (!msg.id || !pending.has(msg.id)) return
    const entry = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) entry?.reject(new Error(JSON.stringify(msg.error)))
    else if (msg.result?.exceptionDetails) entry?.reject(new Error(JSON.stringify(msg.result.exceptionDetails)))
    else entry?.resolve(msg.result?.result?.value ?? msg.result)
  })

  const send = (method: string, params: unknown = {}): Promise<unknown> => {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  const key = async (
    key: string,
    windowsVirtualKeyCode: number,
    modifiers = 0,
    text?: string
  ): Promise<void> => {
    await send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key,
      code: key,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
      modifiers,
      text
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: key,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
      modifiers
    })
  }

  return {
    evaluate: (expression) =>
      send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
    insertText: (text) => send('Input.insertText', { text }),
    pressEnter: () => key('Enter', 13, 0, '\r'),
    pressBackspace: () => key('Backspace', 8),
    selectAll: () => key('a', 65, 2),
    selectAllAndDelete: async () => {
      await key('a', 65, 2)
      await key('Delete', 46)
    },
    close: () => ws.close()
  }
}

async function main(): Promise<void> {
  const report = createReport()
  const { userDataDir, cleanup } = await seedProject()
  const electronBinary = (await import('electron')).default as unknown as string

  // ELECTRON_RUN_AS_NODE is set in some shells (and by the runner that drives
  // the main-process suites). Inherited here it makes Electron start as plain
  // Node, which throws on the first `electron.app` access — so the app dies
  // before a window ever exists and this suite fails on connect rather than on
  // anything it is meant to be testing.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawnApp(electronBinary, userDataDir, env)

  try {
    const cdp = await connect(child, userDataDir)

    // Wait for the app to mount and paginate its seeded content.
    let ready = false
    for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
      await sleep(500)
      ready = Boolean(await cdp.evaluate(`!!document.querySelector('.page-stack .ProseMirror')`))
    }
    if (!ready) throw new Error('editor never rendered a page stack')
    await sleep(2500)

    const sample = (): Promise<Sample> =>
      cdp.evaluate(`(() => {
        const pm = document.querySelector('.page-stack .ProseMirror')
        const sheetEls = document.querySelectorAll('.page-sheet')
        const margin = parseFloat(getComputedStyle(pm).paddingBottom)

        // Bottom of the last real line of text. Walks text nodes so the gap
        // spacers are excluded — a spacer legitimately occupies the gutter
        // and would otherwise read as an overflow.
        const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
        const range = document.createRange()
        let textBottom = 0
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.length) continue
          range.selectNodeContents(n)
          for (const r of range.getClientRects()) {
            if (r.height > 0 && r.bottom > textBottom) textBottom = r.bottom
          }
        }

        const lastSheet = sheetEls[sheetEls.length - 1]
        const lastTextAreaBottom = lastSheet ? lastSheet.getBoundingClientRect().bottom - margin : 0
        return {
          sheets: sheetEls.length,
          gaps: document.querySelectorAll('.chf-page-gap').length,
          pmHeight: Math.round(pm.getBoundingClientRect().height),
          stackHeight: Math.round(document.querySelector('.page-stack').getBoundingClientRect().height),
          overflowPx: Math.round(textBottom - lastTextAreaBottom)
        }
      })()`) as Promise<Sample>

    /** Content sitting past the last page, i.e. a new sheet is owed. */
    const isOverflowing = (s: Sample): boolean => s.overflowPx > 2

    // Caret to the very end, then type without ever pausing long enough for
    // the debounce to fire on its own.
    await cdp.evaluate(`(() => {
      const pm = document.querySelector('.page-stack .ProseMirror')
      pm.focus()
      const range = document.createRange()
      range.selectNodeContents(pm)
      range.collapse(false)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      return true
    })()`)

    section(report, 'live typing (real app)')
    const before = await sample()
    note(report, `before typing: ${before.sheets} sheets, content ${before.pmHeight}px in ${before.stackHeight}px`)

    const chunk = 'and then she kept writing and writing without stopping at all '
    const during: Sample[] = []
    const start = Date.now()
    let lastSample = 0
    while (Date.now() - start < 7000) {
      await cdp.insertText(chunk)
      if (Date.now() - lastSample > 900) {
        lastSample = Date.now()
        during.push(await sample())
      }
      await sleep(120)
    }
    const last = during[during.length - 1]
    note(report, `while typing: ${before.sheets} → ${last.sheets} sheets, content grew to ${last.pmHeight}px`)

    // The regression itself: pages must keep up *during* typing, not only
    // once the writer stops.
    assert(
      report,
      last.sheets > before.sheets,
      `a new page appears while still typing (${before.sheets} → ${last.sheets} sheets)`
    )
    const overflowed = during.filter(isOverflowing)
    assert(
      report,
      overflowed.length === 0,
      `content never overflows the sheets while typing (${overflowed.length} samples overflowed)`
    )

    await sleep(2000)
    const after = await sample()
    assert(report, after.sheets >= last.sheets, 'page count settles rather than shrinking after the pause')
    assert(
      report,
      !isOverflowing(after),
      `content fits the sheets once typing stops (overflow ${after.overflowPx}px)`
    )

    // ---- blank lines from holding Enter --------------------------------
    // getHTML() serializes an empty paragraph as <p></p>, which generates no
    // line box and measured zero pixels tall, so a screenful of blank lines
    // looked like a document of no height and never paginated at all — no
    // matter how long the writer waited. This is that scenario, driven
    // through real key events rather than by setting content.
    section(report, 'blank lines from repeated Enter (real app)')
    await cdp.selectAllAndDelete()
    await sleep(1600)
    const emptied = await sample()
    note(report, `after clearing: ${emptied.sheets} sheet(s)`)

    const ENTER_PRESSES = 90
    for (let i = 0; i < ENTER_PRESSES; i += 1) {
      await cdp.pressEnter()
      await sleep(25)
    }
    // Well past both the debounce and the max-wait.
    await sleep(2500)
    const afterEnters = await sample()
    note(
      report,
      `after ${ENTER_PRESSES} Enter presses: ${afterEnters.sheets} sheets, content ${afterEnters.pmHeight}px`
    )

    assert(
      report,
      afterEnters.sheets > 1,
      `repeated Enter creates new pages (got ${afterEnters.sheets} sheets from ${ENTER_PRESSES} blank lines)`
    )
    assert(
      report,
      !isOverflowing(afterEnters),
      `blank lines fit the sheets (overflow ${afterEnters.overflowPx}px)`
    )

    // ---- instant page on append ----------------------------------------
    // pm height exceeding stack height means content has run past the last
    // page's text area: the two are equal exactly when content fills it (see
    // the stride arithmetic in pagePreview). Sampling after every keystroke,
    // the instant path should never let that state persist — whereas the
    // debounced path leaves it standing for up to a full max-wait interval.
    section(report, 'instant page on append (real app)')
    await cdp.selectAllAndDelete()
    await sleep(1600)
    await cdp.insertText('Opening line. ')
    await sleep(1600)

    const overflowRun: number[] = []
    let consecutive = 0
    let sheetsGrewDuringBurst = false
    let maxKeystrokeGapMs = 0
    const startSheets = (await sample()).sheets
    let lastKeystrokeAt = Date.now()
    for (let i = 0; i < 120; i += 1) {
      await cdp.insertText('word word word word word word ')
      const now = Date.now()
      maxKeystrokeGapMs = Math.max(maxKeystrokeGapMs, now - lastKeystrokeAt)
      lastKeystrokeAt = now
      const s = await sample()
      if (isOverflowing(s)) {
        consecutive += 1
      } else {
        if (consecutive > 0) overflowRun.push(consecutive)
        consecutive = 0
      }
      if (s.sheets > startSheets) sheetsGrewDuringBurst = true
      await sleep(50)
    }
    if (consecutive > 0) overflowRun.push(consecutive)

    const worstRun = overflowRun.length ? Math.max(...overflowRun) : 0
    note(
      report,
      `sampled after every keystroke; longest run past the page bottom: ${worstRun} sample(s); ` +
        `slowest gap between keystrokes ${maxKeystrokeGapMs}ms`
    )
    assert(report, sheetsGrewDuringBurst, 'a page boundary was crossed during the burst')
    // The whole discriminating power of the next assertion rests on typing
    // faster than the debounce: if the machine is too loaded to keep the
    // keystrokes closer together than PAGINATION_DEBOUNCE_MS, the debounced
    // path would resolve the overflow on its own and the result would say
    // nothing about the instant path. Surfaced as its own check rather than
    // silently weakening the test.
    assert(
      report,
      maxKeystrokeGapMs < 300,
      `the burst typed faster than the debounce, so this run can tell the two paths apart ` +
        `(slowest gap ${maxKeystrokeGapMs}ms, debounce 350ms)`
    )
    assert(
      report,
      worstRun <= 1,
      `a new page appears within a keystroke or two of crossing (longest overflow run ${worstRun} samples; ` +
        `the debounced path alone would leave it standing for many)`
    )

    // ---- mid-document edit still settles via the debounce ---------------
    // The instant path is confined to the last page. An edit in the middle
    // can shift breaks for the rest of the document, which only a full
    // measurement can get right, so it must NOT react instantly.
    section(report, 'mid-document edit (real app)')
    await sleep(2000)
    const beforeMid = await sample()
    note(report, `document is ${beforeMid.sheets} sheets before the mid-document edit`)

    await cdp.evaluate(`(() => {
      const pm = document.querySelector('.page-stack .ProseMirror')
      const blocks = Array.from(pm.children).filter((el) => !el.classList.contains('chf-page-gap'))
      const target = blocks[Math.floor(blocks.length / 2)]
      const range = document.createRange()
      range.selectNodeContents(target)
      range.collapse(true)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      pm.focus()
      return true
    })()`)

    // Enough text to push a break several pages later.
    await cdp.insertText('INSERTED MID DOCUMENT. '.repeat(60))
    const immediately = await sample()
    assert(
      report,
      immediately.sheets === beforeMid.sheets,
      `a mid-document edit does not trigger an instant repagination ` +
        `(${beforeMid.sheets} → ${immediately.sheets} sheets before the debounce)`
    )

    await sleep(2500)
    const settled = await sample()
    const footer = String(await cdp.evaluate(`document.querySelector('.footer-page-count').textContent`))
    note(report, `settled at ${settled.sheets} sheets; footer reads "${footer}"`)
    assert(
      report,
      settled.sheets > beforeMid.sheets,
      `the mid-document edit settles to more pages (${beforeMid.sheets} → ${settled.sheets})`
    )
    assert(
      report,
      !isOverflowing(settled),
      `content fits the sheets after settling (overflow ${settled.overflowPx}px)`
    )
    assert(
      report,
      footer.startsWith(String(settled.sheets)),
      'the footer count and the rendered sheets agree after a mid-document edit'
    )

    // ---- deleting back across a boundary --------------------------------
    // Not the forward check in reverse: deleting upwards never puts the caret
    // past a page bottom, so a caret-only test could not see it at all. The
    // symmetric signal is content no longer reaching the last page.
    section(report, 'delete back across a boundary (real app)')
    await cdp.selectAllAndDelete()
    await sleep(1200)

    // Grow to exactly two pages in SMALL steps, so the content ends up only
    // just past the boundary. Larger steps overshoot by a variable amount and
    // a fixed backspace budget then sometimes cannot reach back — which made
    // this assertion flaky rather than wrong.
    for (let i = 0; i < 400; i += 1) {
      await cdp.insertText('word word word word ')
      if (i % 4 === 3 && (await sample()).sheets >= 2) break
      await sleep(20)
    }
    await sleep(2000)
    const beforeDelete = await sample()
    note(report, `just past the boundary: ${beforeDelete.sheets} sheets, overflow ${beforeDelete.overflowPx}px`)

    // Budget derived from how far past the boundary the content actually
    // sits, not a fixed guess: pagination lags the typing, so by the time the
    // new sheet appears there can be a couple of hundred pixels of text on it.
    // A fixed budget was sometimes too small, which read as a product failure
    // when it was only an under-powered test.
    const overshootPx = Math.max(0, beforeDelete.overflowPx + 867)
    const budget = Math.min(2000, Math.max(400, Math.ceil(overshootPx / 26) * 90))
    note(report, `deleting with a budget of ${budget} backspaces for ~${Math.round(overshootPx)}px of overshoot`)

    let sheetsDroppedWhileDeleting = false
    let pressesUsed = 0
    for (let i = 0; i < budget && !sheetsDroppedWhileDeleting; i += 1) {
      await cdp.pressBackspace()
      pressesUsed = i + 1
      if (i % 15 === 0 && (await sample()).sheets < beforeDelete.sheets) {
        sheetsDroppedWhileDeleting = true
      }
      await sleep(4)
    }
    note(report, `page dropped after ${pressesUsed} backspaces (still deleting: ${sheetsDroppedWhileDeleting})`)
    assert(
      report,
      sheetsDroppedWhileDeleting,
      `a page is removed while still deleting, not only after stopping ` +
        `(started at ${beforeDelete.sheets} sheets)`
    )

    // ---- a formatting-only change ---------------------------------------
    // No words added: applying a large heading to a line near the bottom of a
    // page changes only line height, and must still repaginate.
    section(report, 'formatting-only change (real app)')
    await cdp.selectAllAndDelete()
    await sleep(1200)
    // Fill to just under one page, then a final short line to promote.
    await cdp.insertText('The lamp guttered and went out and she waited in the dark. '.repeat(52))
    await sleep(2000)
    const beforeFormat = await sample()
    note(report, `before formatting: ${beforeFormat.sheets} sheets, overflow ${beforeFormat.overflowPx}px`)

    // Select all and promote to Heading 1 — pure line-height change.
    await cdp.selectAll()
    await cdp.evaluate(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: '1', code: 'Digit1', ctrlKey: true, altKey: true, bubbles: true
      }))
      return true
    })()`)
    await sleep(2500)
    const afterFormat = await sample()
    note(report, `after heading applied: ${afterFormat.sheets} sheets, overflow ${afterFormat.overflowPx}px`)
    assert(
      report,
      afterFormat.sheets > beforeFormat.sheets,
      `a formatting-only change repaginates without needing another keystroke ` +
        `(${beforeFormat.sheets} → ${afterFormat.sheets} sheets)`
    )
    assert(
      report,
      !isOverflowing(afterFormat),
      `content still fits the sheets after reformatting (overflow ${afterFormat.overflowPx}px)`
    )

    // ---- a multi-page paste ---------------------------------------------
    // Several pages arriving in one operation must produce several pages in
    // one pass, not one page per subsequent edit.
    section(report, 'multi-page paste (real app)')
    await cdp.selectAllAndDelete()
    await sleep(1200)
    const beforePaste = await sample()
    await cdp.insertText('The lamp guttered and went out and she waited in the dark. '.repeat(400))
    await sleep(3000)
    const afterPaste = await sample()
    note(report, `paste: ${beforePaste.sheets} → ${afterPaste.sheets} sheets in one operation`)
    assert(
      report,
      afterPaste.sheets >= beforePaste.sheets + 3,
      `pasting several pages of text creates several pages at once ` +
        `(${beforePaste.sheets} → ${afterPaste.sheets})`
    )
    assert(
      report,
      !isOverflowing(afterPaste),
      `pasted content fits the sheets (overflow ${afterPaste.overflowPx}px)`
    )
    const pasteFooter = String(await cdp.evaluate(`document.querySelector('.footer-page-count').textContent`))
    assert(
      report,
      pasteFooter.startsWith(String(afterPaste.sheets)),
      `the page count display is not stale after a bulk change (footer "${pasteFooter}", ${afterPaste.sheets} sheets)`
    )

    cdp.close()
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  } finally {
    child.kill()
    // Electron keeps its user-data files open for a moment after the process
    // is signalled, and on Windows unlinking them races the shutdown. The
    // scratch directory living in the OS temp dir is not worth failing a test
    // run over, so give it a beat and then ignore whatever is left.
    await sleep(1200)
    await cleanup().catch(() => undefined)
  }

  console.log(summarize(report))
  if (report.failures > 0) process.exitCode = 1
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
