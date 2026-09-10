/**
 * The dashboard, driven in the real app across two projects.
 *
 * The point of interest is architectural rather than visual: the lifetime
 * totals must be maintained by the save and session paths as a side effect of
 * normal work, so this writes into a project, closes a session, and checks the
 * number moved — without restarting anything.
 */
import { execFileSync, type ChildProcess } from 'child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { assert, createReport, note, section, summarize } from './harness'
import { spawnApp, waitForDebugPort } from './cdpPort'


interface Cdp {
  evaluate: <T = unknown>(expression: string) => Promise<T>
  send: (method: string, params?: unknown) => Promise<unknown>
  close: () => void
}

async function connect(child: ChildProcess, userDataDir: string): Promise<Cdp> {
  const port = await waitForDebugPort(child, userDataDir)
  let target: { webSocketDebuggerUrl: string } | undefined
  for (let i = 0; i < 90 && !target; i += 1) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
        type: string
        url: string
        webSocketDebuggerUrl: string
      }[]
      target = list.find((t) => t.type === 'page' && String(t.url).includes('index.html'))
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(400)
  }
  if (!target) {
    if (child.exitCode !== null) throw new Error(`app exited early (code ${child.exitCode})`)
    throw new Error('app never appeared on the devtools endpoint')
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error('devtools socket failed')), { once: true })
  })
  let id = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String((event as MessageEvent).data))
    if (!msg.id || !pending.has(msg.id)) return
    const entry = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) entry?.reject(new Error(JSON.stringify(msg.error)))
    else entry?.resolve(msg.result)
  })
  const send = (method: string, params: unknown = {}): Promise<unknown> =>
    new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id: id++, method, params }))
    })
  return {
    send,
    evaluate: async <T,>(expression: string) =>
      ((await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as {
        result?: { value: T }
      }).result?.value as T,
    close: () => ws.close()
  }
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  const base = await mkdtemp(join(tmpdir(), 'chapterflow-dash-'))
  const userDataDir = join(base, 'userdata')
  const projectA = join(base, 'project-a')
  const projectB = join(base, 'project-b')
  await mkdir(userDataDir, { recursive: true })

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const electronBinary = (await import('electron')).default as unknown as string
  let child: ChildProcess | null = null
  let cdp: Cdp | null = null

  const launch = async (): Promise<Cdp> => {
    child = spawnApp(electronBinary, userDataDir, env)
    const connected = await connect(child, userDataDir)
    for (let i = 0; i < 60; i += 1) {
      if (await connected.evaluate<boolean>(`!!document.querySelector('.welcome-card, .ProseMirror')`)) break
      await sleep(500)
    }
    await sleep(1800)
    return connected
  }
  const shutdown = async (): Promise<void> => {
    cdp?.close()
    child?.kill()
    await sleep(1200)
  }

  try {
    for (const dir of [projectA, projectB]) {
      execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'make-demo-project.mjs'), dir], {
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
    }
    // Start pointed at A, with no dashboard preference recorded yet.
    await writeFile(
      join(userDataDir, 'preferences.json'),
      JSON.stringify({ theme: 'dark', sidebarWidth: 260, projectRoot: projectA })
    )

    // ---- 1. a launch lands on the dashboard ------------------------------
    section(report, 'a launch lands on the dashboard, not the editor')
    cdp = await launch()
    assert(
      report,
      await cdp.evaluate<boolean>(`!!document.querySelector('.welcome-card')`),
      'the dashboard is what a launch shows'
    )
    // The app shell is what carries the editor, binder and chrome. The
    // pagination engine's hidden measuring host is appended to the body
    // imperatively and is not part of it — matching on .ProseMirror alone
    // finds that instead, which says nothing about what is on screen.
    assert(
      report,
      !(await cdp.evaluate<boolean>(`!!document.querySelector('.app-shell')`)),
      'the app shell is not mounted behind it'
    )

    // Open project A from the dashboard so it enters the registry, then come
    // back and open B, so the registry genuinely spans two projects.
    const openFirst = await cdp.evaluate<boolean>(`(() => {
      const b = document.querySelector('.welcome-project-open')
      if (b) { b.click(); return true }
      return false
    })()`)
    note(report, `recent projects on first launch: ${await cdp.evaluate<number>(`document.querySelectorAll('.welcome-project').length`)}`)
    void openFirst
    await sleep(2500)

    // ---- 2. write, seal a session, and watch the total move --------------
    section(report, 'the lifetime total is maintained by the save and session paths')
    const lifetimePath = join(userDataDir, 'lifetime.json')
    const readLifetime = async (): Promise<{ words: number; sessionMs: number; sessions: number; projects: number }> => {
      if (!existsSync(lifetimePath)) return { words: 0, sessionMs: 0, sessions: 0, projects: 0 }
      const file = JSON.parse(await readFile(lifetimePath, 'utf-8')) as {
        stats: { words: number; sessionMs: number; sessions: number }
        projects: unknown[]
      }
      return { ...file.stats, projects: file.projects.length }
    }

    const before = await readLifetime()
    note(report, `before writing: ${JSON.stringify(before)}`)
    assert(report, before.projects >= 1, `the opened project is registered (${before.projects})`)

    // Type into the manuscript, then seal the session the way quitting does.
    const inEditor = await cdp.evaluate<boolean>(`!!document.querySelector('.ProseMirror')`)
    assert(report, inEditor, 'opening a recent project reaches the editor')
    await cdp.evaluate(`(() => {
      const pm = document.querySelector('.ProseMirror')
      pm.focus()
      const r = document.createRange()
      r.selectNodeContents(pm)
      r.collapse(false)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
      return true
    })()`)
    await cdp.send('Input.insertText', { text: ' Wren counted the buoys again and again. ' })
    await sleep(1400)
    await cdp.send('Input.insertText', { text: ' Then she counted them once more, and wrote the number down. ' })
    await sleep(1400)

    // The same flush the window close performs.
    await cdp.evaluate(`window.api.notifyFlushComplete ? true : false`)
    await cdp.evaluate(`(() => {
      const item = [...document.querySelectorAll('.menubar-top-button')].find((b) => b.textContent.trim() === 'File')
      if (item) item.click()
      return true
    })()`)
    await sleep(500)
    const returned = await cdp.evaluate<boolean>(`(() => {
      const entry = [...document.querySelectorAll('.menubar-dropdown .menubar-item-label')]
        .find((l) => l.textContent.trim() === 'Return to Dashboard')
      if (!entry) return false
      entry.closest('.menubar-item').click()
      return true
    })()`)
    assert(report, returned, 'File carries a Return to Dashboard entry')
    await sleep(2500)

    assert(
      report,
      await cdp.evaluate<boolean>(`!!document.querySelector('.welcome-card')`),
      'it returns to the dashboard without quitting'
    )

    const after = await readLifetime()
    note(report, `after a writing session: ${JSON.stringify(after)}`)
    assert(report, after.words > before.words, `words written accumulated (${before.words} -> ${after.words})`)
    assert(report, after.sessions > before.sessions, `the session was sealed and counted (${after.sessions})`)
    assert(
      report,
      await cdp.evaluate<boolean>(`document.querySelectorAll('.welcome-stat').length === 1`),
      'and the dashboard shows a lifetime stat line'
    )
    const line = await cdp.evaluate<string>(`document.querySelector('.welcome-stat')?.textContent ?? ''`)
    note(report, `stat line: "${line}"`)
    assert(report, /\d/.test(line), 'carrying a real number, not a placeholder')

    // ---- 2b. returning saves everything, not just the manuscript ---------
    // The distinguishing property of the shared flush: it also drains the
    // split pane's and the Story Bible's pending saves. A one-off save of the
    // manuscript would lose a sheet edit made seconds earlier, and the session
    // seals on unmount either way — so the sheet is what actually proves the
    // shared path is being used.
    section(report, 'returning to the dashboard drains every pending save')

    await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('.welcome-project-open')][0]
      if (b) b.click()
      return true
    })()`)
    await sleep(2500)

    const openedSheet = await cdp.evaluate<boolean>(`(() => {
      const rail = [...document.querySelectorAll('.nav-rail-button')]
        .find((x) => /story bible/i.test(x.getAttribute('aria-label') ?? ''))
      if (!rail) return false
      rail.click()
      return true
    })()`)
    await sleep(1600)
    await cdp.evaluate(`(() => {
      const row = document.querySelector('.panel-nav-row, .story-bible-nav-row, .story-bible-card')
      if (row) row.click()
      return true
    })()`)
    await sleep(1600)

    const MARKER = 'zzsheetflushzz'
    const typedIntoSheet = await cdp.evaluate<boolean>(`(() => {
      const pm = document.querySelector('.story-bible-text-block-content .ProseMirror')
      if (!pm) return false
      pm.focus()
      const r = document.createRange()
      r.selectNodeContents(pm)
      r.collapse(false)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
      return true
    })()`)
    assert(report, openedSheet && typedIntoSheet, 'a Story Bible sheet is open and editable')
    if (typedIntoSheet) {
      await cdp.send('Input.insertText', { text: ` ${MARKER} ` })
      // Deliberately no wait: the point is that the sheet's own debounced save
      // has *not* fired, so only the shared flush can have written it.
      await cdp.evaluate(`(() => {
        const item = [...document.querySelectorAll('.menubar-top-button')].find((b) => b.textContent.trim() === 'File')
        if (item) item.click()
        return true
      })()`)
      await sleep(400)
      await cdp.evaluate(`(() => {
        const entry = [...document.querySelectorAll('.menubar-dropdown .menubar-item-label')]
          .find((l) => l.textContent.trim() === 'Return to Dashboard')
        if (entry) entry.closest('.menubar-item').click()
        return true
      })()`)
      await sleep(2500)

      const sheetsDir = join(projectA, 'storybible', 'sheets')
      let found = false
      if (existsSync(sheetsDir)) {
        const { readdir } = await import('fs/promises')
        for (const name of await readdir(sheetsDir)) {
          if ((await readFile(join(sheetsDir, name), 'utf-8')).includes(MARKER)) {
            found = true
            break
          }
        }
      }
      assert(report, found, 'a Story Bible edit is on disk after returning, not only the manuscript')
    }

    // ---- 3. a second project joins the totals ----------------------------
    section(report, 'the totals span more than one project')
    await cdp.evaluate(`window.api.openProjectAt(${JSON.stringify(projectB)})`)
    await sleep(2000)
    const spanning = await readLifetime()
    note(report, `after opening a second project: ${JSON.stringify(spanning)}`)
    assert(report, spanning.projects >= 2, `both projects are registered (${spanning.projects})`)
    assert(
      report,
      spanning.words >= after.words,
      'and the lifetime word total is carried across, not reset per project'
    )

    // ---- 3b. the registry repairs itself ---------------------------------
    // Related to, but weaker than, the bug that prompted it: a writer who had
    // only ever used the default project folder was never registered, because
    // registration keyed off a saved projectRoot preference and the default
    // folder is applied by projectRoot.ts instead. They met an empty Recent
    // list with nothing to open.
    //
    // That exact path cannot be automated here without reading the real
    // Documents folder on this machine, which would make the result depend on
    // what happens to be in it — it is covered by reproduction rather than by
    // this suite. What this does assert is the safety net around it: delete
    // the registry from under a running app and the project in use comes back,
    // through the read guarantee or the save path, rather than staying lost.
    section(report, 'the registry repairs itself if it is lost')

    await rm(join(userDataDir, 'lifetime.json'), { force: true })
    assert(report, !existsSync(join(userDataDir, 'lifetime.json')), 'the registry is gone, after startup already ran')

    await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('.welcome-project-open')][0]
      if (b) b.click()
      return true
    })()`)
    await sleep(3000)
    cdp.close()
    cdp = await connect(child!, userDataDir)
    await sleep(2000)

    await cdp.evaluate(`(() => {
      const item = [...document.querySelectorAll('.menubar-top-button')].find((b) => b.textContent.trim() === 'File')
      if (item) item.click()
      return true
    })()`)
    await sleep(400)
    await cdp.evaluate(`(() => {
      const entry = [...document.querySelectorAll('.menubar-dropdown .menubar-item-label')]
        .find((l) => l.textContent.trim() === 'Return to Dashboard')
      if (entry) entry.closest('.menubar-item').click()
      return true
    })()`)
    await sleep(2500)

    const recovered = await cdp.evaluate<string[]>(
      `(() => [...document.querySelectorAll('.welcome-project-open')].map((b) => b.getAttribute('title') ?? ''))()`
    )
    note(report, `recent list after the registry was removed mid-run: ${JSON.stringify(recovered)}`)
    assert(
      report,
      recovered.length > 0,
      `the project in use is listed again without a registry (${recovered.length} row(s))`
    )

    // ---- 3c. a recent row opens the project it names ----------------------
    section(report, 'clicking a recent project opens that project')

    // Both demo projects are identical, so B is renamed to tell them apart —
    // and the registry is seeded directly, because the only in-app route to a
    // second project is a folder dialog this cannot drive.
    await shutdown()
    const binderB = JSON.parse(await readFile(join(projectB, 'binder.json'), 'utf-8')) as { projectName: string }
    binderB.projectName = 'Second Project'
    await writeFile(join(projectB, 'binder.json'), JSON.stringify(binderB, null, 2))
    await writeFile(
      join(userDataDir, 'lifetime.json'),
      JSON.stringify({
        version: 1,
        stats: { words: 0, sessionMs: 0, sessions: 0 },
        projects: [
          { path: projectA, name: 'First Project', lastOpenedAt: new Date().toISOString(), words: 0 },
          { path: projectB, name: 'Second Project', lastOpenedAt: new Date(Date.now() - 86_400_000).toISOString(), words: 0 }
        ]
      })
    )
    await writeFile(
      join(userDataDir, 'preferences.json'),
      JSON.stringify({ theme: 'dark', sidebarWidth: 260, projectRoot: projectA })
    )
    cdp = await launch()

    const twoRows = await cdp.evaluate<{ name: string; path: string }[]>(
      `(() => [...document.querySelectorAll('.welcome-project-open')].map((b) => ({
        name: b.querySelector('.welcome-project-name')?.textContent?.trim() ?? '',
        path: b.getAttribute('title') ?? ''
      })))()`
    )
    note(report, `recent list: ${JSON.stringify(twoRows.map((r) => r.name))}`)
    assert(report, twoRows.length >= 2, `both projects are offered (${twoRows.length})`)

    // The one that is NOT already loaded — clicking the row for the project
    // already open cannot tell opening from doing nothing.
    const clicked = await cdp.evaluate<boolean>(`(() => {
      const other = [...document.querySelectorAll('.welcome-project-open')]
        .find((b) => (b.getAttribute('title') ?? '') === ${JSON.stringify(projectB)})
      if (!other) return false
      other.click()
      return true
    })()`)
    assert(report, clicked, 'the row for the other project is there to click')

    // Opening a different project reloads the window to resync every store.
    await sleep(4000)
    cdp.close()
    cdp = await connect(child!, userDataDir)
    await sleep(2500)

    assert(
      report,
      await cdp.evaluate<boolean>(`!!document.querySelector('.app-shell')`),
      'clicking it leaves the dashboard for the editor'
    )
    // It must still be there a moment later. The bug this guards against
    // reached the editor and then reverted to the dashboard a beat afterwards,
    // so an assertion taken the instant the reload finishes would have passed
    // while the writer watched it bounce back.
    await sleep(3000)
    assert(
      report,
      await cdp.evaluate<boolean>(`!!document.querySelector('.app-shell')`),
      'and is still there a few seconds later, not bounced back to the dashboard'
    )

    const nowOpen = JSON.parse(await readFile(join(userDataDir, 'preferences.json'), 'utf-8')) as {
      projectRoot: string
    }
    assert(
      report,
      nowOpen.projectRoot === projectB,
      `and the project it named is the one now open (${nowOpen.projectRoot === projectB ? 'B' : nowOpen.projectRoot})`
    )

    // ---- 4. skip on launch ------------------------------------------------
    section(report, 'skipping the dashboard, and getting back to it')
    await cdp.evaluate(`window.api.setSkipDashboardOnLaunch(true)`)
    await sleep(600)
    await shutdown()

    cdp = await launch()
    const skipped = await cdp.evaluate<{ editor: boolean; dashboard: boolean }>(
      `({ editor: !!document.querySelector('.ProseMirror'), dashboard: !!document.querySelector('.welcome-card') })`
    )
    note(report, `with skip on: ${JSON.stringify(skipped)}`)
    assert(report, skipped.editor && !skipped.dashboard, 'with skip enabled a launch goes straight to the editor')

    // The menu route has to work precisely because it is now the only one.
    await cdp.evaluate(`(() => {
      const item = [...document.querySelectorAll('.menubar-top-button')].find((b) => b.textContent.trim() === 'File')
      if (item) item.click()
      return true
    })()`)
    await sleep(500)
    await cdp.evaluate(`(() => {
      const entry = [...document.querySelectorAll('.menubar-dropdown .menubar-item-label')]
        .find((l) => l.textContent.trim() === 'Return to Dashboard')
      if (entry) entry.closest('.menubar-item').click()
      return true
    })()`)
    await sleep(2500)
    assert(
      report,
      await cdp.evaluate<boolean>(`!!document.querySelector('.welcome-card')`),
      'Return to Dashboard still reaches it with skip enabled'
    )
    assert(
      report,
      await cdp.evaluate<boolean>(`document.querySelector('.welcome-skip input')?.checked === true`),
      'and the skip toggle reflects the saved preference'
    )

    // ---- 5. the rest of the dashboard ------------------------------------
    section(report, 'the dashboard carries its other pieces')
    const pieces = await cdp.evaluate<{ actions: string[]; changelog: boolean; version: string }>(`(() => ({
      actions: [...document.querySelectorAll('.welcome-actions button')].map((b) => b.textContent.trim()),
      changelog: !!document.querySelector('.welcome-changelog-toggle'),
      version: document.querySelector('.welcome-version')?.textContent?.trim() ?? ''
    }))()`)
    note(report, JSON.stringify(pieces))
    assert(
      report,
      pieces.actions.some((a) => /New Project/.test(a)) &&
        pieces.actions.some((a) => /Open Project/.test(a)) &&
        pieces.actions.some((a) => /Import/.test(a)),
      `create, open and import are all offered (${pieces.actions.join(', ')})`
    )
    assert(report, pieces.changelog, 'the change log lives here')
    await cdp.evaluate(`document.querySelector('.welcome-changelog-toggle').click()`)
    await sleep(400)
    assert(
      report,
      (await cdp.evaluate<number>(`document.querySelectorAll('.welcome-changelog li').length`)) > 0,
      'and opens onto real entries'
    )

    // The reserved slot: hidden until asked for, and never named.
    assert(
      report,
      !(await cdp.evaluate<boolean>(`!!document.querySelector('.welcome-advanced')`)),
      'the reserved mode is not on show'
    )
    await cdp.evaluate(`(() => {
      const v = document.querySelector('.welcome-version')
      v.click(); v.click(); v.click()
      return true
    })()`)
    await sleep(400)
    const advanced = await cdp.evaluate<string>(`document.querySelector('.welcome-advanced')?.textContent ?? ''`)
    assert(report, advanced.length > 0, 'but is reachable by a deliberate gesture')
    assert(report, !/wordstar/i.test(advanced), `and is not named after its inspiration ("${advanced.slice(0, 40)}")`)
    assert(
      report,
      !/wordstar/i.test(await cdp.evaluate<string>(`document.body.textContent ?? ''`)),
      'nor is it named anywhere else on the dashboard'
    )

    // ---- 5b. the two totals are different questions -----------------------
    //
    // "how much manuscript exists" and "how much was typed here" are separate
    // numbers and must not be conflated: a project imported or generated
    // outside the app contributes to the first and not the second. This is
    // exactly the confusion that made the headline stat look broken — every
    // project on this machine had been generated, so the effort figure was
    // honestly near zero while the manuscripts held tens of thousands.
    section(report, 'the dashboard separates manuscript size from words typed here')
    // Read from the registry the dashboard itself is built from, rather than
    // scraped off the rows: a project's size is stamped on save, so a row can
    // legitimately read zero for a project not yet saved in this run while the
    // registry already carries the figure the headline sums.
    const registry = JSON.parse(await readFile(join(userDataDir, 'lifetime.json'), 'utf-8')) as {
      stats: { words: number }
      projects: { words: number }[]
    }
    const heldByProjects = registry.projects.reduce((sum, p) => sum + Math.max(0, p.words), 0)
    const shownLine = await cdp.evaluate<string>(
      `(() => { const el = document.querySelector('.welcome-stat'); return el ? el.textContent.trim() : '' })()`
    )
    note(report, `dashboard line: "${shownLine}"`)
    note(report, `registry: ${heldByProjects} words held, ${registry.stats.words} typed here`)

    assert(report, heldByProjects > 0, `the projects report a real size of their own (${heldByProjects} words)`)
    assert(
      report,
      heldByProjects !== registry.stats.words,
      `and it is a different number from the words typed here (${heldByProjects} vs ${registry.stats.words})`
    )
    assert(
      report,
      /\d/.test(shownLine),
      `the headline stat carries a number rather than a placeholder ("${shownLine.slice(0, 70)}")`
    )

    // ---- 6. a recovered session reaches the lifetime total ----------------
    //
    // Sessions are sealed by two different paths and only one of them was
    // wired to the lifetime total:
    //
    //   session:close      — the ordinary idle-gap / flush route. Records.
    //   session:recoverOpen — a session left open by a crash, a force-quit, or
    //                        File > Open Project (which reloads without
    //                        flushing). Seals into the project's sessions.json
    //                        and returned nothing to the lifetime store.
    //
    // The visible symptom is that the two systems disagree: the per-project
    // Progress page and the session analytics count a recovered session, and
    // the dashboard's "You have written X words" does not — so the lifetime
    // figure reads lower than the work behind it, permanently, because a
    // sealed session's delta is never recomputed.
    //
    // Crafting the crash state directly rather than force-killing mid-type:
    // the open session is only checkpointed to disk every 30s (TICK_MS), so
    // reproducing it by typing would mean a 30-second wait for the same
    // arrangement of bytes this writes in one step.
    section(report, 'a session recovered after a crash still reaches the lifetime total')
    await shutdown()

    const RECOVERED_WORDS = 500
    const startedAt = new Date(Date.now() - 40 * 60_000).toISOString()
    const lastActivityAt = new Date(Date.now() - 30 * 60_000).toISOString()
    const sessionsPathA = join(projectA, 'sessions.json')
    const priorSessions = existsSync(sessionsPathA)
      ? (JSON.parse(await readFile(sessionsPathA, 'utf-8')) as { sessions: unknown[] })
      : { sessions: [] }
    await writeFile(
      sessionsPathA,
      JSON.stringify(
        {
          version: 1,
          sessions: priorSessions.sessions,
          openSession: {
            id: 'crashed-session-for-lifetime',
            startedAt,
            lastActivityAt,
            startWordCount: 1_000,
            lastWordCount: 1_000 + RECOVERED_WORDS,
            documentIds: []
          }
        },
        null,
        2
      )
    )
    // Point the next launch at A, straight into the editor so the renderer's
    // recovery call actually runs.
    await writeFile(
      join(userDataDir, 'preferences.json'),
      JSON.stringify({ theme: 'dark', sidebarWidth: 260, projectRoot: projectA, skipDashboardOnLaunch: true })
    )

    const beforeRecovery = await readLifetime()
    note(report, `before recovery: ${JSON.stringify(beforeRecovery)}`)
    const sealedBeforeRecovery = await (async (): Promise<Map<string, number>> => {
      const out = new Map<string, number>()
      for (const dir of [projectA, projectB]) {
        const path = join(dir, 'sessions.json')
        if (!existsSync(path)) continue
        const file = JSON.parse(await readFile(path, 'utf-8')) as {
          sessions: { id: string; netWords: number }[]
        }
        for (const s of file.sessions) out.set(s.id, Math.max(0, s.netWords))
      }
      return out
    })()

    cdp = await launch()
    await sleep(2500)

    const sealedIntoProject = await cdp.evaluate<boolean>(`true`).then(async () => {
      const file = JSON.parse(await readFile(sessionsPathA, 'utf-8')) as {
        sessions: { id: string; netWords: number }[]
        openSession: unknown
      }
      return (
        file.openSession === null &&
        file.sessions.some((s) => s.id === 'crashed-session-for-lifetime' && s.netWords === RECOVERED_WORDS)
      )
    })
    assert(report, sealedIntoProject, 'the crashed session is recovered into the project’s own session record')

    const afterRecovery = await readLifetime()
    note(report, `after recovery:  ${JSON.stringify(afterRecovery)}`)
    assert(
      report,
      afterRecovery.words === beforeRecovery.words + RECOVERED_WORDS,
      `its words reach the lifetime total (${beforeRecovery.words} + ${RECOVERED_WORDS} expected, got ${afterRecovery.words})`
    )
    assert(
      report,
      afterRecovery.sessions === beforeRecovery.sessions + 1,
      `and it counts as a session (${beforeRecovery.sessions} + 1 expected, got ${afterRecovery.sessions})`
    )

    // The invariant behind both, stated as a delta rather than an absolute:
    // every session sealed between the two readings must be accounted for in
    // the movement of the lifetime total, whichever path sealed it. A delta
    // because section 3b deliberately deletes the registry mid-suite, so the
    // absolute total legitimately no longer matches the whole history — that
    // is a different question from whether the two systems agree from here.
    const sealedWordsById = async (): Promise<Map<string, number>> => {
      const out = new Map<string, number>()
      for (const dir of [projectA, projectB]) {
        const path = join(dir, 'sessions.json')
        if (!existsSync(path)) continue
        const file = JSON.parse(await readFile(path, 'utf-8')) as {
          sessions: { id: string; netWords: number }[]
        }
        for (const s of file.sessions) out.set(s.id, Math.max(0, s.netWords))
      }
      return out
    }
    const newlySealed = await sealedWordsById()
    for (const id of sealedBeforeRecovery.keys()) newlySealed.delete(id)
    const newlySealedWords = [...newlySealed.values()].reduce((sum, w) => sum + w, 0)
    note(
      report,
      `sessions sealed since the reading: ${newlySealed.size} worth ${newlySealedWords} words`
    )
    assert(
      report,
      afterRecovery.words - beforeRecovery.words === newlySealedWords,
      `the lifetime total moved by exactly what was sealed (${newlySealedWords} expected, got ${afterRecovery.words - beforeRecovery.words})`
    )
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  } finally {
    await shutdown().catch(() => undefined)
    await rm(base, { recursive: true, force: true }).catch(() => undefined)
  }

  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

void main()
