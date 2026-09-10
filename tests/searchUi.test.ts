/**
 * Drives the real application's search interface against the demo project.
 *
 * The ranking suite proves the rules put a character's own sheet above the
 * chapters that mention her. This one asks the question that actually matters
 * to a reader: once those results are on screen, can you tell which is which?
 * So the assertions are about rendered DOM and computed style — the tier a row
 * declares, the border it draws, the typeface it uses — not about ordering,
 * which has already been proven elsewhere.
 *
 * Launches out/main/index.js against a freshly generated demo project in a
 * temp directory and talks to it over the Chrome DevTools Protocol. Never
 * touches the user's own projects or preferences.
 */
import { execFileSync, type ChildProcess } from 'child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { assert, createReport, note, section, summarize } from './harness'
import { spawnApp, waitForDebugPort } from './cdpPort'


async function seedProject(): Promise<{ projectDir: string; userDataDir: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'chapterflow-searchui-'))
  const projectDir = join(base, 'project')
  const userDataDir = join(base, 'userdata')
  await mkdir(userDataDir, { recursive: true })

  execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'make-demo-project.mjs'), projectDir], {
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })

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

  return { projectDir, userDataDir, cleanup: () => rm(base, { recursive: true, force: true }) }
}

interface Cdp {
  evaluate: <T = unknown>(expression: string) => Promise<T>
  insertText: (text: string) => Promise<unknown>
  clearInput: () => Promise<void>
  pressEnter: () => Promise<void>
  shortcut: (code: string, vk: number, modifiers: number) => Promise<void>
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

  const key = async (name: string, code: number, modifiers = 0, text?: string): Promise<void> => {
    // `key` is the character, `code` is the physical key. The app's shortcut
    // matcher reads `code`, so "KeyF" must arrive as the code, not the key.
    const keyName = name.startsWith('Key') ? name.slice(3).toLowerCase() : name
    await send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key: keyName,
      code: name,
      windowsVirtualKeyCode: code,
      nativeVirtualKeyCode: code,
      modifiers,
      text
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: keyName,
      code: name,
      windowsVirtualKeyCode: code,
      nativeVirtualKeyCode: code,
      modifiers
    })
  }

  return {
    evaluate: <T,>(expression: string) =>
      send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }) as Promise<T>,
    insertText: (text) => send('Input.insertText', { text }),
    clearInput: async () => {
      await key('a', 65, 2)
      await key('Delete', 46)
    },
    pressEnter: () => key('Enter', 13, 0, '\r'),
    /** Sends a real accelerator: the app matches on `event.code`, so the code
     *  ("KeyF") and the key ("f") are not interchangeable. */
    shortcut: (code: string, vk: number, modifiers: number) => key(code, vk, modifiers),
    close: () => ws.close()
  }
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  const { projectDir, userDataDir, cleanup } = await seedProject()
  const electronBinary = (await import('electron')).default as unknown as string

  // ELECTRON_RUN_AS_NODE is set in some shells (and by the test runner that
  // drives the main-process suites). Inherited here it makes Electron start as
  // plain Node, which fails on the first `electron.app` access — so the app
  // dies before its window ever exists.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const child = spawnApp(electronBinary, userDataDir, env)

  try {
    const cdp = await connect(child, userDataDir)

    let ready = false
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      await sleep(500)
      ready = await cdp.evaluate<boolean>(`!!document.querySelector('.find-input')`)
    }
    if (!ready) throw new Error('the app never rendered its search bar')
    // The index builds on startup; give the 40-chapter demo project time.
    await sleep(3000)

    /** Focuses the search box, switches to project mode, and types a query. */
    async function search(text: string): Promise<void> {
      await cdp.evaluate(`(() => {
        const input = document.querySelector('.find-input')
        input.focus()
        return true
      })()`)
      await cdp.clearInput()
      // The scope is stated in the field itself and toggles when pressed, so
      // it is only clicked when it is not already on the project.
      await cdp.evaluate(`(() => {
        const pill = document.querySelector('.find-scope-pill')
        if (pill && pill.textContent.trim() !== 'The whole project') pill.click()
        return true
      })()`)
      await cdp.evaluate(`document.querySelector('.find-input').focus()`)
      await cdp.insertText(text)
      // Debounce, IPC round trip, render. Polled rather than slept through,
      // because a cold index on a 40-chapter project is not reliably quick and
      // a fixed wait would make this suite flake rather than fail honestly.
      await settle()
    }

    /** Waits until the result list stops changing, or gives up. */
    async function settle(): Promise<void> {
      let previous = -1
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(250)
        const count = await cdp.evaluate<number>(`document.querySelectorAll('.search-result').length`)
        const searching = await cdp.evaluate<boolean>(
          `(document.querySelector('.find-count')?.textContent ?? '').trim() === 'Searching…'`
        )
        if (!searching && count === previous && attempt > 1) return
        previous = count
      }
    }

    const rows = (): Promise<{ tier: string; kind: string; heading: string; detail: string }[]> =>
      cdp.evaluate(`(() => [...document.querySelectorAll('.search-result')].map((el) => ({
        tier: el.getAttribute('data-tier'),
        kind: el.getAttribute('data-kind'),
        heading: (el.querySelector('.search-result-heading')?.textContent ?? '').trim(),
        detail: (el.querySelector('.search-result-detail')?.textContent ?? '').trim()
      })))()`)

    // ---- the bar opens ready to search the project ------------------------
    section(report, 'project-wide is where the bar starts')
    await cdp.evaluate(`document.querySelector('.find-input').focus()`)
    await sleep(400)
    const initialScope = await cdp.evaluate<string>(
      `(document.querySelector('.find-scope-pill')?.textContent ?? '(none)').trim()`
    )
    assert(
      report,
      initialScope === 'The whole project',
      `a freshly opened bar searches the whole project ("${initialScope}")`
    )

    // ---- every way in reaches the same surface ---------------------------
    // This is the regression that mattered: Ctrl+F used to force document
    // scope, so the habitual shortcut landed in the one mode without filters
    // or a ranked list — and every assertion in this file passed anyway,
    // because the helper below clicks "Whole Project" before it looks.
    section(report, 'the same surface however it is opened')

    const surfaceState = async (): Promise<{
      open: boolean
      scope: string
      kinds: number
      replaceRow: boolean
      replaceFocused: boolean
    }> =>
      cdp.evaluate(`(() => ({
        open: !!document.querySelector('.find-options-popover'),
        scope: (document.querySelector('.find-scope-pill')?.textContent ?? '(closed)').trim(),
        // Everything, plus one row per filter group.
        kinds: document.querySelectorAll('.find-rail-item').length,
        replaceRow: !!document.querySelector('.find-replace-row'),
        replaceFocused: document.activeElement === document.querySelector('.find-replace-input')
      }))()`)

    const closeBar = async (): Promise<void> => {
      await cdp.evaluate(`document.querySelector('.ProseMirror')?.focus()`)
      await sleep(350)
    }

    await closeBar()
    await cdp.shortcut('KeyF', 70, 2)
    await sleep(700)
    const viaCtrlF = await surfaceState()
    note(report, `Ctrl+F -> ${JSON.stringify(viaCtrlF)}`)
    assert(report, viaCtrlF.open, 'Ctrl+F opens the bar')
    assert(report, viaCtrlF.scope === 'The whole project', `and leaves the scope alone (${viaCtrlF.scope})`)
    assert(report, viaCtrlF.kinds === 7, `so the kinds rail is there too (${viaCtrlF.kinds})`)
    assert(report, viaCtrlF.replaceRow, 'and replace is on screen without being asked for')

    await closeBar()
    await cdp.shortcut('KeyH', 72, 2)
    await sleep(700)
    const viaCtrlH = await surfaceState()
    note(report, `Ctrl+H -> ${JSON.stringify(viaCtrlH)}`)
    assert(report, viaCtrlH.open && viaCtrlH.replaceRow, 'Ctrl+H opens the same bar')
    // Replace is no longer behind a toggle, so the shortcut puts the cursor
    // in it rather than revealing it.
    assert(report, viaCtrlH.replaceFocused, 'and puts the cursor in the replace box')
    assert(report, viaCtrlH.kinds === 7, 'and still shows the rest of the surface')

    await closeBar()
    await cdp.shortcut('KeyF', 70, 10)
    await sleep(700)
    const viaProject = await surfaceState()
    assert(
      report,
      viaProject.open && viaProject.scope === 'The whole project',
      `Ctrl+Shift+F opens it scoped to the project (${viaProject.scope})`
    )

    // One menu entry, three working shortcuts.
    // Opening the menu is a React render, so it needs its own round trip:
    // clicking and reading in one evaluate reads the DOM before it updates.
    const menuTriggers = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.menubar-top-button')].map((b) => b.textContent.trim()))()`
    )
    note(report, 'menus: ' + menuTriggers.join(', '))
    await cdp.evaluate(`(() => {
      const trigger = [...document.querySelectorAll('.menubar-top-button')]
        .find((b) => b.textContent.trim() === 'Edit')
      if (trigger) trigger.click()
      return !!trigger
    })()`)
    await sleep(400)
    const editMenu = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.menubar-dropdown .menubar-item-label')].map((l) => l.textContent.trim()))()`
    )
    const findEntries = editMenu.filter((l) => /find|replace/i.test(l))
    note(report, `Edit menu find entries: ${findEntries.join(' | ')}`)
    assert(
      report,
      findEntries.length === 1 && findEntries[0].startsWith('Find & Replace'),
      `the three menu entries are now one (${findEntries.length}: ${findEntries.join(', ')})`
    )
    await cdp.evaluate(`document.body.click()`)
    await sleep(250)

    // ---- one keystroke suggests names, not prose --------------------------
    section(report, 'a single character narrows towards names without prose noise')
    await search('W')
    const oneLetterRows = await rows()
    note(
      report,
      `"W" -> ${oneLetterRows.length} row(s): ${[...new Set(oneLetterRows.map((r) => r.tier + ':' + r.kind))].join(', ')}`
    )
    assert(report, oneLetterRows.length > 0, `one letter still suggests something (${oneLetterRows.length})`)
    assert(
      report,
      oneLetterRows.every((r) => r.kind !== 'prose'),
      'and none of it is prose'
    )
    assert(
      report,
      oneLetterRows.some((r) => r.heading.includes('Wren')),
      'typing one letter narrows towards a character'
    )
    await search('har')
    assert(
      report,
      (await rows()).every((r) => r.kind !== 'prose'),
      'two and three characters are still too short for prose'
    )
    await search('harbour')
    assert(
      report,
      (await rows()).some((r) => r.kind === 'prose'),
      'a whole word brings the manuscript back'
    )

    // ---- a chapter title is its own kind of result ------------------------
    section(report, 'a chapter title ranks as a document, above the records')
    await search('Harbour Business')
    const titleGroups = await cdp.evaluate<{ tier: string; label: string }[]>(
      `(() => [...document.querySelectorAll('.search-result-group')].map((el) => ({
        tier: el.getAttribute('data-tier'),
        label: (el.querySelector('.search-result-group-name')?.textContent ?? '').trim()
      })))()`
    )
    note(report, titleGroups.map((g) => `${g.tier}:${g.label}`).join('  |  '))
    const titleRows = (await rows()).filter((r) => r.kind === 'documentTitle')
    assert(report, titleRows.length > 0, `the chapter is found by its own name (${titleRows.length})`)
    assert(
      report,
      titleRows.every((r) => r.tier === '3'),
      `and renders in the Documents tier (${[...new Set(titleRows.map((r) => r.tier))].join('/')})`
    )
    assert(
      report,
      titleGroups.some((g) => g.tier === '3' && g.label.startsWith('Documents')),
      'which has its own labelled group'
    )
    const tierOrder = titleGroups.map((g) => Number(g.tier))
    assert(
      report,
      tierOrder.every((t, i) => i === 0 || tierOrder[i - 1] < t),
      `groups render in tier order (${tierOrder.join(' < ')})`
    )

    // ---- collapsing a group -----------------------------------------------
    section(report, 'a tier can be folded away, unmistakably')
    await search('harbour')
    const beforeCollapse = (await rows()).length
    const proseBefore = await cdp.evaluate<number>(
      `document.querySelectorAll('.search-result-group[data-tier="6"] .search-result').length`
    )
    assert(report, proseBefore > 0, `the manuscript group has rows to hide (${proseBefore})`)
    await cdp.evaluate(`document.querySelector('.search-result-group[data-tier="6"] .search-result-group-label').click()`)
    await sleep(300)
    const collapsed = await cdp.evaluate<{
      flag: string
      expanded: string
      caret: string
      state: string
      rows: number
      borderStyle: string
      background: string
      stateOpacity: string
    }>(`(() => {
      const group = document.querySelector('.search-result-group[data-tier="6"]')
      const label = group.querySelector('.search-result-group-label')
      const ls = getComputedStyle(label)
      return {
        flag: group.getAttribute('data-collapsed'),
        expanded: label.getAttribute('aria-expanded'),
        caret: group.querySelector('.search-result-group-caret').textContent.trim(),
        state: group.querySelector('.search-result-group-state').textContent.trim(),
        rows: group.querySelectorAll('.search-result').length,
        borderStyle: ls.borderTopStyle,
        background: ls.backgroundColor,
        stateOpacity: getComputedStyle(group.querySelector('.search-result-group-state')).opacity
      }
    })()`)
    note(report, `collapsed: caret "${collapsed.caret}", label "${collapsed.state}", border ${collapsed.borderStyle}`)
    assert(report, collapsed.rows === 0, `collapsing hides the rows (${collapsed.rows})`)
    assert(report, collapsed.flag === 'true' && collapsed.expanded === 'false', 'the group reports itself collapsed')
    assert(report, collapsed.caret === '▶', `the caret turns to point at the folded group ("${collapsed.caret}")`)
    assert(report, collapsed.state === 'Hidden', `and it says so in words ("${collapsed.state}")`)
    assert(report, parseFloat(collapsed.stateOpacity) === 1, 'that word is shown, not left to hover')
    assert(report, collapsed.borderStyle === 'dashed', `the header changes outline when shut (${collapsed.borderStyle})`)
    assert(
      report,
      collapsed.background !== 'rgba(0, 0, 0, 0)',
      `and takes a background it does not have when open (${collapsed.background})`
    )

    // It stays collapsed across a new query — a standing preference.
    await search('Wren Halloway')
    const stillCollapsed = await cdp.evaluate<string>(
      `document.querySelector('.search-result-group[data-tier="6"]')?.getAttribute('data-collapsed') ?? '(no group)'`
    )
    assert(report, stillCollapsed === 'true', `the group stays folded for the next search (${stillCollapsed})`)

    await cdp.evaluate(`document.querySelector('.search-result-group[data-tier="6"] .search-result-group-label').click()`)
    await sleep(300)
    const reopened = await cdp.evaluate<number>(
      `document.querySelectorAll('.search-result-group[data-tier="6"] .search-result').length`
    )
    assert(report, reopened > 0, `clicking again brings the rows back (${reopened})`)
    void beforeCollapse

    // ---- a name: its own sheet first, mentions far below -----------------
    section(report, 'a Story Bible name renders as a different kind of result from its mentions')
    await search('Wren Halloway')

    const groups = await cdp.evaluate<{ tier: string; label: string; count: number }[]>(
      `(() => [...document.querySelectorAll('.search-result-group')].map((el) => ({
        tier: el.getAttribute('data-tier'),
        label: (el.querySelector('.search-result-group-name')?.textContent ?? '').trim(),
        count: el.querySelectorAll('.search-result').length
      })))()`
    )
    note(report, groups.map((g) => `${g.label} (${g.count})`).join('  |  '))
    assert(report, groups.length >= 2, `results are split into labelled groups (${groups.length})`)
    assert(report, groups[0]?.tier === '1', `the first group is tier 1 (${groups[0]?.tier})`)
    assert(report, groups[0]?.label.startsWith('Exact match'), `and it is labelled for a reader ("${groups[0]?.label}")`)
    assert(
      report,
      groups.some((g) => g.tier === '6' && g.label.startsWith('In the manuscript')),
      'the prose mentions are in their own labelled group'
    )

    const wrenRows = await rows()
    assert(report, wrenRows[0]?.tier === '1', `the first row is tier 1 (${wrenRows[0]?.tier})`)
    assert(report, wrenRows[0]?.kind === 'storyBibleName', `and it is the item's own entry (${wrenRows[0]?.kind})`)
    assert(
      report,
      wrenRows[0]?.detail.startsWith('Character · '),
      `it shows the item's type and one identifying field ("${wrenRows[0]?.detail.slice(0, 40)}")`
    )
    assert(
      report,
      wrenRows.filter((r) => r.tier === '6').every((r) => r.kind === 'prose'),
      'nothing but prose is in the manuscript group'
    )

    // Visual distinctness, measured rather than assumed.
    section(report, 'the two kinds of result are visibly different, not merely ordered')
    const style = await cdp.evaluate<{
      topBorder: string
      topBorderWidth: string
      proseBorderWidth: string
      topFont: string
      proseFont: string
      topPadding: string
      prosePadding: string
      topBackground: string
      proseBackground: string
    }>(`(() => {
      const top = document.querySelector('.search-result[data-tier="1"]')
      const prose = document.querySelector('.search-result[data-tier="6"]')
      const ts = getComputedStyle(top), ps = getComputedStyle(prose)
      return {
        topBorder: ts.borderLeftColor,
        topBorderWidth: ts.borderLeftWidth,
        proseBorderWidth: ps.borderLeftWidth,
        topFont: getComputedStyle(top.querySelector('.search-result-heading')).fontFamily,
        proseFont: getComputedStyle(prose.querySelector('.search-result-heading')).fontFamily,
        topPadding: ts.paddingTop,
        prosePadding: ps.paddingTop,
        topBackground: ts.backgroundColor,
        proseBackground: ps.backgroundColor
      }
    })()`)
    note(report, `tier 1: ${style.topBorderWidth} ${style.topBorder}, ${style.topPadding} padding`)
    // Compared against the prose row rather than against a literal 2px: the
    // window runs at the display's scale factor, so computed widths are
    // device-snapped and a hard-coded pixel count would assert the machine's
    // DPI rather than the design.
    assert(
      report,
      parseFloat(style.topBorderWidth) > parseFloat(style.proseBorderWidth),
      `a tier-1 row draws an edge the prose rows do not (${style.topBorderWidth} vs ${style.proseBorderWidth})`
    )
    assert(
      report,
      style.topBorder.replace(/\s/g, '') === 'rgb(111,149,184)',
      `and it is the accent colour (${style.topBorder})`
    )
    assert(report, style.topFont !== style.proseFont, 'the two rows are set in different typefaces')
    assert(
      report,
      parseFloat(style.topPadding) > parseFloat(style.prosePadding),
      `a tier-1 row is given more room (${style.topPadding} vs ${style.prosePadding})`
    )
    assert(report, style.topBackground !== style.proseBackground, 'and sits on its own surface')

    // ---- a Lexicon word shows its meaning ---------------------------------
    section(report, 'a Lexicon word shows what it means')
    await search('bathylith')
    const lexRows = await rows()
    note(report, `${lexRows.length} row(s); first: ${lexRows[0]?.heading} — ${lexRows[0]?.detail.slice(0, 50)}`)
    assert(report, lexRows[0]?.kind === 'lexicon', `the Lexicon entry is first (${lexRows[0]?.kind})`)
    assert(report, lexRows[0]?.tier === '1', `in tier 1 (${lexRows[0]?.tier})`)
    assert(
      report,
      lexRows[0]?.detail.toLowerCase().includes('submerged shelf'),
      `its meaning is shown without opening it ("${lexRows[0]?.detail.slice(0, 50)}")`
    )
    assert(report, lexRows[0]?.heading.includes('Lexicon'), 'and the row says what kind of thing it is')

    // ---- a prose-only word from the vocabulary tail -----------------------
    section(report, 'a distinctive prose word is found, with a usable snippet')
    await search('wainscoted')
    const rareRows = await rows()
    note(report, `${rareRows.length} row(s); detail: ${rareRows[0]?.detail.slice(0, 80)}`)
    assert(report, rareRows.length >= 1, `a word used once in 20,000 is found (${rareRows.length})`)
    assert(report, rareRows.every((r) => r.tier === '6'), 'it is prose, with nothing ranked above it')
    assert(report, rareRows[0]?.detail.length > 30, `the snippet has real context around it (${rareRows[0]?.detail.length} chars)`)

    const marks = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.search-result-hit')].map((m) => m.textContent))()`
    )
    assert(report, marks.length > 0, `the query is highlighted inside the snippet (${marks.length} mark(s))`)
    assert(
      report,
      marks.every((m) => m.toLowerCase() === 'wainscoted'),
      `and only the query is highlighted (${[...new Set(marks)].join(', ')})`
    )
    const markStyled = await cdp.evaluate<boolean>(`(() => {
      const mark = document.querySelector('.search-result-hit')
      const detail = document.querySelector('.search-result-detail')
      return getComputedStyle(mark).color !== getComputedStyle(detail).color
    })()`)
    assert(report, markStyled, 'the highlight is visually distinct from the surrounding text')

    // ---- filters: a rail beside the results, always visible ---------------
    section(report, 'the kinds sit in a rail beside the results, always visible')
    assert(
      report,
      !(await cdp.evaluate<boolean>(`!!document.querySelector('.find-filters-toggle')`)),
      'there is no Filters button to find first'
    )
    const filterLabels = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.find-rail-item .nm')].map((b) => b.textContent.trim()))()`
    )
    note(report, filterLabels.join(', '))
    assert(
      report,
      ['Manuscript', 'Documents', 'Story Bible', 'Lexicon', 'Notes', 'Tracking'].every((l) =>
        filterLabels.includes(l)
      ),
      `all six kinds are on show without opening anything (${filterLabels.length})`
    )
    assert(
      report,
      filterLabels[0] === 'Everything',
      `and "Everything" leads them, as the way back (${filterLabels[0]})`
    )

    // The rail is a column beside the answers, not a row above them: what is
    // worth measuring now is that it takes a fixed narrow column and never
    // pushes the results down the panel.
    const railLayout = await cdp.evaluate<{
      railWidth: number
      railColumns: number
      resultsLeft: number
      railRight: number
      resultsTop: number
      railTop: number
    }>(`(() => {
      const rail = document.querySelector('.find-rail')
      const pane = document.querySelector('.find-results-pane')
      const items = [...document.querySelectorAll('.find-rail-item')]
      const lefts = new Set(items.map((i) => Math.round(i.getBoundingClientRect().left)))
      const railBox = rail.getBoundingClientRect()
      const paneBox = pane.getBoundingClientRect()
      return {
        railWidth: Math.round(railBox.width),
        railColumns: lefts.size,
        resultsLeft: Math.round(paneBox.left),
        railRight: Math.round(railBox.right),
        resultsTop: Math.round(paneBox.top),
        railTop: Math.round(railBox.top)
      }
    })()`)
    note(report, `rail ${railLayout.railWidth}px wide, results start at ${railLayout.resultsLeft}px`)
    assert(
      report,
      railLayout.railWidth > 0 && railLayout.railWidth <= 140,
      `the rail stays a narrow column (${railLayout.railWidth}px)`
    )
    assert(report, railLayout.railColumns === 1, `its kinds stack in one column (${railLayout.railColumns})`)
    assert(
      report,
      railLayout.resultsLeft >= railLayout.railRight - 1,
      `the results sit beside it rather than under it (${railLayout.resultsLeft} vs ${railLayout.railRight})`
    )
    assert(
      report,
      Math.abs(railLayout.resultsTop - railLayout.railTop) <= 2,
      `and start level with it, so no control row pushes them down (${railLayout.resultsTop} vs ${railLayout.railTop})`
    )

    // The rail has to actually narrow to document titles.
    await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('.find-rail-item')].find((x) => x.textContent.trim().startsWith('Documents'))
      b.click()
      return true
    })()`)
    await cdp.evaluate(`document.querySelector('.find-input').focus()`)
    await cdp.clearInput()
    await cdp.insertText('harbour')
    await settle()
    const docsOnly = await rows()
    assert(
      report,
      docsOnly.length > 0 && docsOnly.every((r) => r.kind === 'documentTitle'),
      `the Documents chip narrows to titles and synopses (${docsOnly.length} row(s), kinds ${[...new Set(docsOnly.map((r) => r.kind))].join('/')})`
    )
    await cdp.evaluate(`[...document.querySelectorAll('.find-rail-item')].find((x) => x.textContent.trim().startsWith('Everything'))?.click()`)
    await sleep(300)

    // Narrowing to Story Bible must actually drop the prose.
    await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('.find-rail-item')].find((x) => x.textContent.trim().startsWith('Story Bible'))
      b.click()
      return true
    })()`)
    await cdp.evaluate(`document.querySelector('.find-input').focus()`)
    await cdp.clearInput()
    await cdp.insertText('Wren Halloway')
    await settle()
    const filtered = await rows()
    assert(
      report,
      filtered.length > 0 && filtered.every((r) => r.kind !== 'prose'),
      `filtering to the Story Bible drops the prose (${filtered.length} row(s), kinds ${[...new Set(filtered.map((r) => r.kind))].join('/')})`
    )
    // Put it back, so history assertions below are not filtered.
    await cdp.evaluate(`(() => {
      const clear = [...document.querySelectorAll('.find-rail-item')].find((x) => x.textContent.trim().startsWith('Everything'))
      if (clear) clear.click()
      return true
    })()`)
    await sleep(300)

    // ---- recent searches ---------------------------------------------------
    section(report, 'recent searches are kept, listed and re-runnable')
    await cdp.evaluate(`document.querySelector('.find-input').focus()`)
    await cdp.clearInput()
    await cdp.insertText('spindrift')
    await settle()
    await cdp.pressEnter()
    await sleep(400)

    const persisted = JSON.parse(await readFile(join(projectDir, 'searchHistory.json'), 'utf-8')) as {
      searches: { query: string }[]
    }
    note(report, persisted.searches.map((s) => s.query).join(', '))
    assert(report, persisted.searches[0]?.query === 'spindrift', 'a committed search is written to the project')

    // Emptying the box shows the history in its place.
    await cdp.clearInput()
    await sleep(400)
    const historyItems = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.search-history-item')].map((b) => b.textContent.trim()))()`
    )
    note(report, `history list: ${historyItems.join(', ')}`)
    assert(report, historyItems.includes('spindrift'), 'an empty search box lists the recent searches')

    // Clicking one re-runs it.
    await cdp.evaluate(`(() => {
      const item = [...document.querySelectorAll('.search-history-item')].find((b) => b.textContent.trim() === 'spindrift')
      item.click()
      return true
    })()`)
    await settle()
    const rerun = await rows()
    const rerunValue = await cdp.evaluate<string>(`document.querySelector('.find-input').value`)
    assert(report, rerunValue === 'spindrift', `clicking a past search puts it back in the box ("${rerunValue}")`)
    assert(report, rerun.length > 0, `and re-runs it (${rerun.length} result(s))`)

    // And it survives a reload, which is what "persisted" has to mean.
    await cdp.evaluate(`location.reload()`)
    await sleep(4000)
    // Two round trips, not one: focusing the box is what renders the
    // drop-down, and the scope toggle inside it does not exist until React has
    // re-rendered.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await cdp.evaluate(`document.querySelector('.find-input')?.focus()`)
      await sleep(300)
      const toggled = await cdp.evaluate<boolean>(`(() => {
        const pill = document.querySelector('.find-scope-pill')
        if (!pill) return false
        if (pill.textContent.trim() !== 'The whole project') pill.click()
        return true
      })()`)
      if (toggled) break
    }
    await sleep(600)
    const afterReload = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.search-history-item')].map((b) => b.textContent.trim()))()`
    )
    assert(report, afterReload.includes('spindrift'), `history survives a reload (${afterReload.join(', ')})`)

    // ---- clicking a result goes somewhere ----------------------------------
    section(report, 'a result opens the thing it describes')
    await search('Wren Halloway')
    await cdp.evaluate(`document.querySelector('.search-result[data-tier="1"]').click()`)
    await sleep(1200)
    const wentToStoryBible = await cdp.evaluate<boolean>(`!!document.querySelector('.story-bible')`)
    assert(report, wentToStoryBible, 'clicking a Story Bible result opens the Story Bible')

    await search('wainscoted')
    const proseRows = await rows()
    assert(report, proseRows.length > 0, `the prose result is on screen to be clicked (${proseRows.length})`)
    const targetDoc = proseRows[0]?.heading ?? ''
    await cdp.evaluate(`document.querySelector('.search-result[data-tier="6"]')?.click()`)
    await sleep(1500)
    const inEditor = await cdp.evaluate<boolean>(`!!document.querySelector('.ProseMirror')`)
    assert(report, inEditor, `clicking a prose result opens the manuscript (${targetDoc})`)
    const highlighted = await cdp.evaluate<number>(
      `document.querySelectorAll('.ProseMirror .search-match, .ProseMirror .find-match').length`
    )
    note(report, `${highlighted} match decoration(s) in the opened document`)
    assert(report, highlighted > 0, 'and hands over to Find, which highlights the match in place')

    // ---- the bar keeps its shape as the scope changes --------------------
    section(report, 'controls are greyed out, never removed')

    const controls = (): Promise<{
      qualifiers: number
      qualifiersDisabled: number
      chips: number
      chipsDisabled: number
      replaceRow: boolean
      replaceToggle: boolean
    }> =>
      cdp.evaluate(`(() => {
        // Visible, not merely present: a control hidden with display:none is
        // still in the DOM, and "disabled rather than hidden" is a claim about
        // what is on screen.
        const shown = (el) => el.getClientRects().length > 0
        const q = [...document.querySelectorAll('.find-options button')].filter(shown)
        const c = [...document.querySelectorAll('.find-rail-item')].filter(shown)
        return {
          qualifiers: q.length, qualifiersDisabled: q.filter((b) => b.disabled).length,
          chips: c.length, chipsDisabled: c.filter((b) => b.disabled).length,
          replaceRow: !!document.querySelector('.find-replace-row'),
          replaceToggle: !!document.querySelector('.find-replace-toggle-btn')
        }
      })()`)

    const setScope = async (label: string): Promise<void> => {
      await cdp.evaluate(`document.querySelector('.find-input-wrap').click()`)
      await sleep(400)
      await cdp.evaluate(`(() => {
        const pill = document.querySelector('.find-scope-pill')
        if (pill && pill.textContent.trim() !== '${label}') pill.click()
        return true
      })()`)
      await sleep(400)
    }

    // A walk may still be docked from the section above, and the drop-down
    // does not open over its own dock — finish the walk first.
    await cdp.evaluate(`[...document.querySelectorAll('.find-navigator-text')].find((b) => b.textContent.trim() === 'Done')?.click()`)
    await sleep(400)
    await setScope('The whole project')
    assert(
      report,
      await cdp.evaluate<boolean>(`!!document.querySelector('.find-options-popover')`),
      'the bar is open before its controls are counted'
    )
    const inProject = await controls()
    note(report, `project: ${JSON.stringify(inProject)}`)
    const documentScopeLabel = await cdp.evaluate<string>(`(() => {
      const pill = document.querySelector('.find-scope-pill')
      if (pill && pill.textContent.trim() === 'The whole project') pill.click()
      return 'clicked'
    })()`)
    note(report, `scope pill ${documentScopeLabel}`)
    await sleep(400)
    const inDocument = await controls()
    note(report, `document: ${JSON.stringify(inDocument)}`)

    assert(
      report,
      inProject.qualifiers === inDocument.qualifiers && inProject.chips === inDocument.chips,
      `every control exists in both scopes (${inProject.qualifiers}/${inProject.chips} vs ${inDocument.qualifiers}/${inDocument.chips})`
    )
    // Replace used to hide behind a toggle. It is now simply there, in both
    // scopes, which is the point of the change.
    assert(
      report,
      inProject.replaceRow && inDocument.replaceRow && !inProject.replaceToggle,
      'replace is on screen in both scopes, with no toggle to find first'
    )
    assert(
      report,
      inProject.qualifiersDisabled === 3 && inDocument.qualifiersDisabled === 0,
      `case/whole-word/regex grey out for ranked search only (${inProject.qualifiersDisabled} vs ${inDocument.qualifiersDisabled})`
    )
    // Everything plus six kinds: all seven grey out when only one document is
    // being searched, since narrowing by kind has no meaning there.
    assert(
      report,
      inProject.chipsDisabled < inDocument.chipsDisabled && inDocument.chipsDisabled >= 6,
      `the kind rail greys out in a single document (${inProject.chipsDisabled} vs ${inDocument.chipsDisabled})`
    )
    const greyed = await cdp.evaluate<number>(`(() => {
      const item = [...document.querySelectorAll('.find-rail-item')].find((b) => b.disabled)
      return item ? parseFloat(getComputedStyle(item).opacity) : 1
    })()`)
    assert(report, greyed < 1, `and a disabled control looks disabled (opacity ${greyed.toFixed(2)})`)

    // ---- document scope gets the same list, not a counter ----------------
    section(report, 'searching this document lists its matches')
    const word = await cdp.evaluate<string>(`(() => {
      const text = document.querySelector('.ProseMirror')?.textContent ?? ''
      // A word that actually repeats, so the list has rows to choose between —
      // a single-match word silently skips the navigation assertions below.
      const words = text.split(/\\s+/).filter((w) => /^[A-Za-z]{5,9}$/.test(w))
      const counts = new Map()
      for (const w of words) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) ?? 0) + 1)
      const repeated = [...counts.entries()].filter((e) => e[1] >= 3).sort((x, y) => y[1] - x[1])
      return (repeated[0] && repeated[0][0]) || words[0] || 'the'
    })()`)
    note(report, `searching this document for "${word}"`)
    await cdp.evaluate(`document.querySelector('.find-input-wrap').click()`)
    await sleep(300)
    await cdp.clearInput()
    await cdp.insertText(word)
    await sleep(900)

    const docRows = await cdp.evaluate<{ rows: number; kind: string; label: string; count: string }>(`(() => {
      const rows = [...document.querySelectorAll('.search-result[data-kind="documentMatch"]')]
      return {
        rows: rows.length,
        kind: rows[0]?.getAttribute('data-kind') ?? '(none)',
        label: (document.querySelector('.search-result-group-name')?.textContent ?? '').trim(),
        count: (document.querySelector('.find-count')?.textContent ?? '').trim()
      }
    })()`)
    note(report, JSON.stringify(docRows))
    assert(report, docRows.rows > 0, `the matches in this document are listed (${docRows.rows})`)
    assert(report, docRows.label === 'In this document', `under their own heading ("${docRows.label}")`)
    assert(report, /^\d+ of \d+$/.test(docRows.count), `the counter still reads as before ("${docRows.count}")`)
    const docSnippet = await cdp.evaluate<string>(
      `(document.querySelector('.search-result[data-kind="documentMatch"] .search-result-detail')?.textContent ?? '').trim()`
    )
    assert(report, docSnippet.length > word.length + 10, `each row carries context, not just the word (${docSnippet.length} chars)`)
    const docMark = await cdp.evaluate<string>(
      `(document.querySelector('.search-result[data-kind="documentMatch"] .search-result-hit')?.textContent ?? '').trim()`
    )
    assert(report, docMark.toLowerCase() === word.toLowerCase(), `with the match highlighted ("${docMark}")`)

    // Choosing a row is the handover: the list moves beside the manuscript so
    // the page it is walking through is not underneath it.
    if (docRows.rows > 1) {
      await cdp.evaluate(`document.querySelectorAll('.search-result[data-kind="documentMatch"]')[1].click()`)
      await sleep(700)
      const afterClick = await cdp.evaluate<{ position: string; row: number; covered: boolean }>(`(() => ({
        position: (document.querySelector('.find-navigator-count')?.textContent ?? '').trim(),
        row: [...document.querySelectorAll('.search-dock-match')].findIndex((r) => r.classList.contains('is-current')),
        covered: !!document.querySelector('.find-options-popover')
      }))()`)
      note(report, `after choosing the second row: ${JSON.stringify(afterClick)}`)
      assert(report, afterClick.position.startsWith('Match 2 of'), `clicking the second row goes to it ("${afterClick.position}")`)
      assert(report, afterClick.row === 1, `and the docked list marks where you are (row ${afterClick.row})`)
      assert(report, !afterClick.covered, 'and the drop-down is no longer over the page')
      // Back to the list for the assertions that follow.
      await cdp.evaluate(`[...document.querySelectorAll('.find-navigator-text')].find((b) => b.textContent.trim() === 'All results')?.click()`)
      await sleep(500)
    }

    // The same collapse affordance as the project groups.
    await cdp.evaluate(`document.querySelector('.search-result-group[data-tier="document"] .search-result-group-label')?.click()`)
    await sleep(300)
    const docCollapsed = await cdp.evaluate<{ flag: string; rows: number; state: string }>(`(() => {
      const g = document.querySelector('.search-result-group[data-tier="document"]')
      return {
        flag: g.getAttribute('data-collapsed'),
        rows: g.querySelectorAll('.search-result').length,
        state: g.querySelector('.search-result-group-state').textContent.trim()
      }
    })()`)
    assert(
      report,
      docCollapsed.flag === 'true' && docCollapsed.rows === 0 && docCollapsed.state === 'Hidden',
      `this group collapses the same way the others do (${JSON.stringify(docCollapsed)})`
    )
    await cdp.evaluate(`document.querySelector('.search-result-group[data-tier="document"] .search-result-group-label').click()`)
    await sleep(300)

    // ---- nothing the three separate menus could do has been lost ---------
    section(report, 'every capability of the old separate menus survives')

    // The matches are still walked, and walking them now docks the list
    // beside the manuscript so the page is not covered while you read it.
    // Enter is handled by the search box, so it has to be the focused thing.
    await cdp.evaluate(`document.querySelector('.find-input').focus()`)
    await sleep(200)
    await cdp.pressEnter()
    await sleep(600)
    const walk = await cdp.evaluate<{ docked: boolean; sidePanel: boolean; position: string }>(`(() => ({
      docked: !!document.querySelector('.search-dock'),
      sidePanel: !!document.querySelector('.side-panel'),
      position: (document.querySelector('.find-navigator-count')?.textContent ?? '').trim()
    }))()`)
    note(report, `walking -> ${JSON.stringify(walk)}`)
    assert(report, walk.docked && !walk.sidePanel, 'walking the matches stands the side panel down for the dock')
    assert(report, /^Match \d+ of \d+$/.test(walk.position), `and the field says where you are ("${walk.position}")`)

    await cdp.evaluate(`[...document.querySelectorAll('.find-navigator-step')][1]?.click()`)
    await sleep(400)
    const afterArrow = await cdp.evaluate<string>(
      `(document.querySelector('.find-navigator-count')?.textContent ?? '').trim()`
    )
    assert(report, /^Match \d+ of \d+$/.test(afterArrow), `the next-match arrow still works ("${afterArrow}")`)

    // And the page is handed back when the walk is finished.
    await cdp.evaluate(`[...document.querySelectorAll('.find-navigator-text')].find((b) => b.textContent.trim() === 'Done')?.click()`)
    await sleep(500)
    const afterDone = await cdp.evaluate<boolean>(
      `!document.querySelector('.search-dock') && !!document.querySelector('.side-panel')`
    )
    assert(report, afterDone, 'and finishing gives the side panel back')

    // Regex, in document scope. Finishing the walk closed the drop-down, and
    // the match options live inside it.
    await cdp.evaluate(`document.querySelector('.find-input-wrap').click()`)
    await sleep(400)
    await cdp.evaluate(`document.querySelectorAll('.find-options button')[2].click()`)
    await sleep(300)
    await cdp.evaluate(`document.querySelector('.find-input-wrap').click()`)
    await sleep(300)
    await cdp.clearInput()
    await cdp.insertText('th[aeiou]')
    await sleep(900)
    const regexCount = await cdp.evaluate<string>(`(document.querySelector('.find-count')?.textContent ?? '').trim()`)
    assert(report, /^\d+ of [1-9]/.test(regexCount), `regular expressions still match ("${regexCount}")`)
    await cdp.evaluate(`document.querySelectorAll('.find-options button')[2].click()`)
    await sleep(300)

    // Replace, one at a time and all at once, in this document.
    await cdp.evaluate(`document.querySelector('.find-input-wrap').click()`)
    await sleep(300)
    await cdp.clearInput()
    await cdp.insertText(word)
    await sleep(800)
    const beforeReplace = await cdp.evaluate<number>(
      `document.querySelectorAll('.search-result[data-kind="documentMatch"]').length`
    )
    // Replace needs no revealing any more; it is already on screen.
    await sleep(400)
    const replaceRow = await cdp.evaluate<{ input: boolean; buttons: string[] }>(`(() => ({
      input: !!document.querySelector('.find-replace-input'),
      buttons: [...document.querySelectorAll('.find-replace-row button')].map((b) => b.textContent.trim())
    }))()`)
    assert(report, replaceRow.input, 'the replace field is on the same surface')
    assert(
      report,
      replaceRow.buttons.some((b) => b === 'Replace this one') &&
        replaceRow.buttons.some((b) => b.startsWith('Replace all')),
      `with both replace actions (${replaceRow.buttons.join(', ')})`
    )
    await cdp.evaluate(`document.querySelector('.find-replace-input').focus()`)
    await cdp.insertText('zzreplacedzz')
    await sleep(400)
    await cdp.evaluate(`[...document.querySelectorAll('.find-replace-row button')].find((b) => b.textContent.trim() === 'Replace this one')?.click()`)
    await sleep(800)
    const afterOne = await cdp.evaluate<boolean>(
      `(document.querySelector('.ProseMirror')?.textContent ?? '').includes('zzreplacedzz')`
    )
    assert(report, afterOne, `replacing one match still edits the document (was ${beforeReplace} matches)`)

    // Replace All in Project, with its confirmation.
    await setScope('The whole project')
    await sleep(600)
    const projectReplace = await cdp.evaluate<{ label: string; qualifiersDisabled: number }>(`(() => ({
      label: ([...document.querySelectorAll('.find-replace-row button')].pop()?.textContent ?? '').trim(),
      qualifiersDisabled: [...document.querySelectorAll('.find-options button')].filter((b) => b.disabled).length
    }))()`)
    note(report, JSON.stringify(projectReplace))
    assert(
      report,
      projectReplace.label.startsWith('Replace all'),
      `replacing across the project is reachable from the same bar ("${projectReplace.label}")`
    )
    assert(
      report,
      projectReplace.qualifiersDisabled === 0,
      `and case/whole-word/regex come back, because replace is literal (${projectReplace.qualifiersDisabled} disabled)`
    )
    await cdp.evaluate(`[...document.querySelectorAll('.find-replace-row button')].pop().click()`)
    await sleep(700)
    const confirmed = await cdp.evaluate<boolean>(
      `!!document.querySelector('.modal-overlay') && (document.body.textContent ?? '').includes('cannot be undone')`
    )
    assert(report, confirmed, 'and it still asks before rewriting several files at once')
    await cdp.evaluate(`(() => {
      const cancel = [...document.querySelectorAll('.modal-overlay button')].find((b) => /cancel/i.test(b.textContent))
      if (cancel) cancel.click()
      return true
    })()`)
    await sleep(400)

    cdp.close()
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  } finally {
    child.kill()
    await sleep(500)
    await cleanup().catch(() => undefined)
  }

  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

void main()
