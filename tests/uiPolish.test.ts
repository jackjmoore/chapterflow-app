/**
 * Drives the real app to check three pieces of interface behaviour that only
 * exist at runtime: the binder's status edge, word counts, and indent guides
 * holding steady at every panel width (and the tags card the edge raises),
 * the Story Bible hover card refusing to navigate unless you ask it to, and
 * the elevation steps actually being distinguishable from each other.
 *
 * All three are the kind of thing that looks right in the stylesheet and is
 * wrong on screen, which is why they are asserted against a running window
 * rather than against the CSS.
 */
import { execFileSync } from 'child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { assert, createReport, note, section, summarize } from './harness'
import { spawnApp, waitForDebugPort } from './cdpPort'


async function seedProject(): Promise<{ userDataDir: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'chapterflow-polish-'))
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
  return { userDataDir, cleanup: () => rm(base, { recursive: true, force: true }) }
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  const { userDataDir, cleanup } = await seedProject()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const electronBinary = (await import('electron')).default as unknown as string
  const child = spawnApp(electronBinary, userDataDir, env)

  let ws: WebSocket | null = null
  try {
    const port = await waitForDebugPort(child, userDataDir)
    let target: { webSocketDebuggerUrl: string } | undefined
    for (let i = 0; i < 80 && !target; i += 1) {
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
          type: string
          url: string
          webSocketDebuggerUrl: string
        }[]
        target = list.find((t) => t.type === 'page' && String(t.url).includes('index.html'))
      } catch {
        /* not listening yet */
      }
      if (!target) await sleep(400)
    }
    if (!target) throw new Error('the app never appeared on the devtools endpoint')

    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      ws!.addEventListener('open', () => resolve(), { once: true })
      ws!.addEventListener('error', () => reject(new Error('devtools socket failed')), { once: true })
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
        ws!.send(JSON.stringify({ id: id++, method, params }))
      })
    const evaluate = async <T,>(expression: string): Promise<T> =>
      (
        (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as {
          result?: { value: T }
        }
      ).result?.value as T

    for (let i = 0; i < 60; i += 1) {
      if (await evaluate<boolean>(`!!document.querySelector('.binder-list')`)) break
      await sleep(500)
    }
    await sleep(2500)

    /** Which section is on screen. The Story Bible view is always mounted, so
     *  querying for it proves nothing — the rail is the honest signal.
     *  aria-label, not title: the rail buttons dropped their native tooltip
     *  when the hover reveal took over showing the section's name. */
    const activeSection = (): Promise<string> =>
      evaluate(`(() => {
        const b = [...document.querySelectorAll('.nav-rail-button')].find((x) => x.classList.contains('is-active'))
        return (b?.getAttribute('aria-label') ?? '(none)').trim()
      })()`)

    const goToSection = async (pattern: string): Promise<void> => {
      await evaluate(`(() => {
        const b = [...document.querySelectorAll('.nav-rail-button')]
          .find((x) => new RegExp(${JSON.stringify(pattern)}, 'i').test(x.getAttribute('aria-label') ?? ''))
        if (b) b.click()
        return true
      })()`)
      await sleep(1400)
    }

    // Measured on a real card while the grid is on screen — the browse view is
    // not rendered at all from the manuscript, so this has to happen here.
    await goToSection('story bible')
    const cardShadow = await evaluate<string>(
      `(() => {
        const c = document.querySelector('.story-bible-card')
        return c ? getComputedStyle(c).boxShadow : '(no card)'
      })()`
    )
    await goToSection('manuscript')

    /** Drags the panel's own resize handle, which is what sets the width the
     *  badges read — not a stylesheet override, so this exercises the real
     *  path. */
    const setPanelWidth = async (x: number): Promise<void> => {
      const handle = await evaluate<{ x: number; y: number } | null>(`(() => {
        const el = document.querySelector('.sidebar-resize-handle')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      if (!handle) throw new Error('no resize handle')
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: handle.x, y: handle.y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: handle.y, button: 'left' })
      await sleep(250)
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: handle.y, button: 'left', clickCount: 1 })
      await sleep(450)
    }

    const binderAnatomy = (): Promise<{
      badges: number
      dots: number
      chipRows: number
      edges: number
      counts: number
      badCounts: number
      guides: boolean
      liveCounts: boolean
      rowHeights: number[]
      width: number
    }> =>
      evaluate(`(() => ({
        badges: document.querySelectorAll('.binder-row .status-badge').length,
        dots: document.querySelectorAll('.binder-row .status-dot').length,
        chipRows: document.querySelectorAll('.binder-row .row-chip-row').length,
        edges: document.querySelectorAll('.binder-status-edge').length,
        counts: document.querySelectorAll('.binder-row-count').length,
        badCounts: [...document.querySelectorAll('.binder-row-count')].filter((el) => !/^[\\d,]+$/.test(el.textContent.trim())).length,
        guides: (() => {
          const list = document.querySelector('.binder-node > .binder-list')
          if (!list) return false
          const s = getComputedStyle(list)
          // Display scaling can round 1px to 0.8px — presence, not magnitude.
          return s.borderLeftStyle === 'solid' && parseFloat(s.borderLeftWidth) > 0
        })(),
        liveCounts: [...document.querySelectorAll('.binder-row-count')].some((el) => el.textContent.trim() !== '0'),
        rowHeights: [...new Set([...document.querySelectorAll('.binder-row')].map((r) => Math.round(r.getBoundingClientRect().height)))],
        width: Math.round(document.querySelector('.side-panel').getBoundingClientRect().width)
      }))()`)

    // ---- 1. the edge, counts, and guides hold at every panel width --------
    section(report, 'the binder edge, counts, and guides hold at every panel width')

    await setPanelWidth(460)
    const wide = await binderAnatomy()
    note(report, `wide: ${JSON.stringify(wide)}`)
    assert(report, wide.width > 400, `the panel really is wide (${wide.width}px)`)
    assert(report, wide.edges > 0, `documents carry a status edge (${wide.edges})`)
    assert(
      report,
      wide.badges === 0 && wide.dots === 0 && wide.chipRows === 0,
      'no inline badge, dot, or chip row remains in the rows'
    )
    assert(report, wide.counts > 0 && wide.badCounts === 0, `Draft rows carry numeric word counts (${wide.counts})`)
    assert(report, wide.liveCounts, 'the counts loaded with the project rather than showing zeros')
    assert(report, wide.guides, 'nested lists draw an indent guide')

    await setPanelWidth(190)
    const narrow = await binderAnatomy()
    note(report, `narrow: ${JSON.stringify(narrow)}`)
    assert(report, narrow.width < 220, `the panel really is narrow (${narrow.width}px)`)
    assert(report, narrow.edges === wide.edges, `the edges are width-stable (${narrow.edges} at both widths)`)
    assert(
      report,
      narrow.badges === 0 && narrow.dots === 0 && narrow.chipRows === 0,
      'narrowing conjures no badge or chip back'
    )
    assert(report, narrow.counts === wide.counts, `no count is lost when the panel narrows (${narrow.counts})`)
    assert(
      report,
      narrow.rowHeights.length === 1 && wide.rowHeights.length === 1,
      `every row is the same height at both widths (${wide.rowHeights.join('/')} wide, ${narrow.rowHeights.join('/')} narrow)`
    )

    await setPanelWidth(260)

    // ---- 1b. hovering an edge raises the status/tags card -----------------
    section(report, 'hovering a status edge raises the card that names status and tags')

    const edgePoints = await evaluate<{ x: number; y: number }[]>(`
      [...document.querySelectorAll('.binder-status-edge')]
        .map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })
        .filter((p) => p.y > 60 && p.y < window.innerHeight - 60)
    `)
    assert(report, edgePoints.length > 0, `edges are on screen to hover (${edgePoints.length})`)

    // The demo project spreads status and tags across documents, so walk the
    // edges until both a status name and a chip have shown up in a card.
    let statusSeen = ''
    let chipsSeen = false
    for (const p of edgePoints) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
      await sleep(250)
      const card = await evaluate<{ status: string; chips: number } | null>(`(() => {
        const c = document.querySelector('.binder-edge-card')
        if (!c) return null
        return {
          status: c.querySelector('.binder-edge-card-status')?.textContent.trim() ?? '',
          chips: c.querySelectorAll('.tag-chip, .span-tag-rollup-chip').length
        }
      })()`)
      if (card?.status) statusSeen = card.status
      if (card && card.chips > 0) chipsSeen = true
      if (statusSeen && chipsSeen) break
    }
    note(report, `card status "${statusSeen}", chips seen: ${chipsSeen}`)
    assert(report, statusSeen !== '', `the card names the status ("${statusSeen}")`)
    assert(report, chipsSeen, 'a card carries tag chips')

    const editorPoint = await evaluate<{ x: number; y: number }>(`({ x: Math.round(window.innerWidth * 0.6), y: 300 })`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: editorPoint.x, y: editorPoint.y })
    await sleep(400)
    const cardGone = await evaluate<number>(`document.querySelectorAll('.binder-edge-card').length`)
    assert(report, cardGone === 0, 'leaving the edge dismisses the card')

    // ---- 2. the hover card reads without navigating -----------------------
    section(report, 'the Story Bible hover card only navigates when asked')

    const hovered = await evaluate<boolean>(`(() => {
      const el = document.querySelector('.ProseMirror .mention-highlight')
      if (!el) return false
      const r = el.getBoundingClientRect()
      window.__mentionPoint = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      return true
    })()`)
    assert(report, hovered, 'the manuscript contains a detected Story Bible mention')

    const point = await evaluate<{ x: number; y: number }>(`window.__mentionPoint`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    let cardUp = false
    for (let i = 0; i < 30 && !cardUp; i += 1) {
      await sleep(200)
      cardUp = await evaluate<boolean>(`!!document.querySelector('.mention-hover-card')`)
    }
    assert(report, cardUp, 'hovering a mention shows the card')

    const anatomy = await evaluate<{ cursor: string; hasOpen: boolean; openLabel: string; bodyClickable: boolean }>(`(() => {
      const card = document.querySelector('.mention-hover-card')
      const open = card.querySelector('.mention-hover-card-open')
      return {
        cursor: getComputedStyle(card).cursor,
        hasOpen: !!open,
        openLabel: open?.textContent?.trim() ?? '',
        bodyClickable: getComputedStyle(card).cursor === 'pointer'
      }
    })()`)
    assert(report, anatomy.hasOpen && anatomy.openLabel === 'Open', `the card carries an explicit Open action ("${anatomy.openLabel}")`)
    assert(report, !anatomy.bodyClickable, `and the body no longer advertises itself as clickable (cursor: ${anatomy.cursor})`)

    // Clicking the body must not throw the writer out of the editor.
    const bodyClicked = await evaluate<boolean>(`(() => {
      const body = document.querySelector('.mention-hover-card-summary, .mention-hover-card-text-preview, .mention-hover-card-name')
      if (!body) return false
      body.click()
      return true
    })()`)
    await sleep(900)
    const sectionAfterBodyClick = await activeSection()
    assert(report, bodyClicked, 'the card body is there to be clicked')
    assert(
      report,
      /manuscript/i.test(sectionAfterBodyClick),
      `clicking the card body leaves you in the manuscript (section: ${sectionAfterBodyClick})`
    )

    // Expanding shows more without leaving.
    const expandable = await evaluate<boolean>(`!!document.querySelector('.mention-hover-card-expand')`)
    if (expandable) {
      const before = await evaluate<number>(`document.querySelector('.mention-hover-card').textContent.length`)
      await evaluate(`document.querySelector('.mention-hover-card-expand').click()`)
      await sleep(500)
      const after = await evaluate<number>(`document.querySelector('.mention-hover-card')?.textContent.length ?? 0`)
      const sectionAfterExpand = await activeSection()
      note(report, `expanded card text ${before} -> ${after} chars`)
      assert(report, after > before, `expanding shows more in place (${before} -> ${after} chars)`)
      assert(report, /manuscript/i.test(sectionAfterExpand), `and still does not navigate (section: ${sectionAfterExpand})`)
    } else {
      note(report, 'no expandable content on this mention; expansion correctly not offered')
    }

    // Open is the one thing that leaves.
    await evaluate(`document.querySelector('.mention-hover-card-open').click()`)
    await sleep(1500)
    const sectionAfterOpen = await activeSection()
    assert(
      report,
      /story bible/i.test(sectionAfterOpen),
      `pressing Open does navigate to the Story Bible (section: ${sectionAfterOpen})`
    )

    // ---- 2b. the card dismisses on leaving, every way of leaving ----------
    // A Story Bible name is also a spellcheck-suppressed word, so one span
    // carries both classes. The old mouseout handler matched the suppressed
    // class first, scheduled a hide for the Lexicon card, and returned before
    // ever scheduling the mention card's — leaving it with no pending
    // dismissal at all. These walk the real cursor through each way out.
    // The section above ends in the Story Bible; the mentions live in the
    // manuscript.
    await goToSection('manuscript')
    await sleep(800)

    section(report, 'the hover card always dismisses when the cursor leaves')

    const move = (x: number, y: number): Promise<unknown> =>
      send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) })
    const cardCount = (): Promise<number> => evaluate(`document.querySelectorAll('.mention-hover-card').length`)
    const boxOf = (sel: string): Promise<{ x: number; y: number; top: number; bottom: number } | null> =>
      evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)})
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }
      })()`)

    const mentionPoints = await evaluate<{ x: number; y: number }[]>(
      `(() => [...document.querySelectorAll('.ProseMirror .mention-highlight')].slice(0, 6).map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }))()`
    )

    const openCard = async (pt: { x: number; y: number }): Promise<boolean> => {
      await move(pt.x, pt.y)
      for (let i = 0; i < 25; i += 1) {
        if ((await cardCount()) > 0) return true
        await sleep(150)
      }
      return false
    }
    /** Somewhere that is neither a trigger nor a card. */
    const moveAway = async (): Promise<void> => {
      await move(700, 20)
      await sleep(700)
    }

    assert(report, mentionPoints.length > 1, `several mentions to work with (${mentionPoints.length})`)

    await openCard(mentionPoints[0])
    assert(report, (await cardCount()) === 1, 'hovering a name opens exactly one card')
    await moveAway()
    assert(report, (await cardCount()) === 0, 'moving straight from the name to elsewhere dismisses it')

    // Onto the card, onto its buttons, then out.
    await openCard(mentionPoints[0])
    const body = await boxOf('.mention-hover-card')
    if (body) await move(body.x, body.y)
    await sleep(300)
    assert(report, (await cardCount()) === 1, 'moving onto the card keeps it open')
    const openBtn = await boxOf('.mention-hover-card-open')
    if (openBtn) {
      await move(openBtn.x, openBtn.y)
      await sleep(300)
      assert(report, (await cardCount()) === 1, 'moving onto the Open button counts as still interacting')
    }
    const moreBtn = await boxOf('.mention-hover-card-expand')
    if (moreBtn) {
      await move(moreBtn.x, moreBtn.y)
      await sleep(300)
      assert(report, (await cardCount()) === 1, 'moving onto the More button counts as still interacting')
      const before = await boxOf('.mention-hover-card')
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(moreBtn.x), y: Math.round(moreBtn.y), button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(moreBtn.x), y: Math.round(moreBtn.y), button: 'left', clickCount: 1 })
      await sleep(600)
      const after = await boxOf('.mention-hover-card')
      note(report, `card height ${Math.round((before?.bottom ?? 0) - (before?.top ?? 0))} -> ${Math.round((after?.bottom ?? 0) - (after?.top ?? 0))}px on expand`)
      assert(report, (await cardCount()) === 1, 'pressing More does not dismiss the card')
    }
    await moveAway()
    assert(report, (await cardCount()) === 0, 'leaving after using the buttons still dismisses')

    // The class-collision case: a suppressed word that is NOT a mention.
    await openCard(mentionPoints[0])
    // Must not sit underneath the open card: the cursor would then be over the
    // card, where staying open is the correct behaviour and proves nothing.
    const plainSuppressed = await evaluate<{ x: number; y: number } | null>(`(() => {
      const card = document.querySelector('.mention-hover-card')?.getBoundingClientRect()
      const pad = 40
      const cx = card ? (card.left + card.right) / 2 : 0
      const cy = card ? (card.top + card.bottom) / 2 : 0
      const candidates = [...document.querySelectorAll('.ProseMirror .chf-suppressed-word')]
        .filter((n) => !n.closest('[data-mention-item-id]'))
        .map((n) => {
          const r = n.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }
        })
        // On screen: an element scrolled out of view still reports a rect, and
        // a mouse move to a point outside the window delivers no event at all.
        .filter((c) => c.r.top > 8 && c.r.bottom < window.innerHeight - 8 && c.r.left > 8 && c.r.right < window.innerWidth - 8)
        .filter((c) => {
          if (!card) return true
          return (
            c.r.bottom < card.top - pad ||
            c.r.top > card.bottom + pad ||
            c.r.right < card.left - pad ||
            c.r.left > card.right + pad
          )
        })
        // Nearest qualifying candidate, so it stays comfortably in view.
        .sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy))
      const best = candidates[0]
      return best ? { x: best.x, y: best.y } : null
    })()`)
    if (plainSuppressed) {
      await move(plainSuppressed.x, plainSuppressed.y)
      await sleep(900)
      // The Lexicon card reuses .mention-hover-card, so the question is not
      // whether a card is showing but whether the mention's card handed over
      // cleanly rather than both being up at once.
      const handover = await evaluate<{ count: number; isLexicon: boolean }>(`(() => {
        const cards = [...document.querySelectorAll('.mention-hover-card')]
        return { count: cards.length, isLexicon: !!cards[0]?.querySelector('.lexicon-hover-pill') }
      })()`)
      const overCardNow = await evaluate<boolean>(
        `!!document.elementFromPoint(${Math.round(plainSuppressed.x)}, ${Math.round(plainSuppressed.y)})?.closest('.mention-hover-card')`
      )
      const diag = await evaluate<string>(`(() => {
        const c = document.querySelector('.mention-hover-card')
        const r = c ? c.getBoundingClientRect() : null
        const under = document.elementFromPoint(${Math.round(plainSuppressed.x)}, ${Math.round(plainSuppressed.y)})
        return JSON.stringify({
          card: c ? (c.querySelector('.lexicon-hover-pill') ? 'lexicon' : 'mention:' + (c.querySelector('.mention-hover-card-name')?.textContent ?? '')) : 'none',
          cardBox: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null,
          cursor: [${Math.round(plainSuppressed.x)}, ${Math.round(plainSuppressed.y)}],
          under: under ? (under.className || under.tagName) : 'none'
        })
      })()`)
      note(report, 'diag: ' + diag)
      assert(report, handover.count <= 1, `a Lexicon word never leaves two cards up (${handover.count})`)
      // Either the word has a Lexicon entry and its card takes over, or it has
      // none and nothing is left behind. What must never happen is the name's
      // card sitting there because a suppressed word cancelled its dismissal.
      assert(report, !overCardNow, 'the chosen word is clear of the card, so this actually tests the collision')
      assert(
        report,
        handover.count === 0 || handover.isLexicon,
        `the mention card does not linger over an unrelated suppressed word (${handover.count} card, lexicon: ${handover.isLexicon})`
      )
      await moveAway()
      assert(report, (await cardCount()) === 0, 'and nothing is left behind afterwards')
    } else {
      note(report, 'no non-mention suppressed word on screen; collision case not exercised')
    }

    // Rapid sweep: never more than one, never a leftover.
    let maxDuringSweep = 0
    for (const pt of mentionPoints) {
      await move(pt.x, pt.y)
      await sleep(60)
      maxDuringSweep = Math.max(maxDuringSweep, await cardCount())
    }
    await sleep(900)
    assert(report, maxDuringSweep <= 1, `sweeping across names never stacks cards (peak ${maxDuringSweep})`)
    await moveAway()
    assert(report, (await cardCount()) === 0, 'and the sweep leaves nothing stuck open')

    // ---- 2c. the compact card holds back its detail -----------------------
    section(report, 'the card is compact until asked to expand')
    await openCard(mentionPoints[0])
    const compact = await evaluate<{ height: number; stats: number; text: number; lists: number; width: number }>(`(() => {
      const c = document.querySelector('.mention-hover-card')
      const r = c.getBoundingClientRect()
      return {
        height: Math.round(r.height),
        width: Math.round(r.width),
        stats: c.querySelectorAll('.mention-hover-card-stat').length,
        text: c.querySelectorAll('.mention-hover-card-text-preview').length,
        lists: c.querySelectorAll('.mention-hover-card-list').length
      }
    })()`)
    note(report, `default: ${JSON.stringify(compact)}`)
    assert(
      report,
      compact.stats > 0 || compact.text > 0,
      `the default view carries real information, not just a name (${compact.stats} stats, ${compact.text} prose block)`
    )
    assert(report, compact.lists === 0, 'list blocks are held back for More')
    assert(report, compact.width <= 240, `and it stays narrow (${compact.width}px)`)
    assert(report, compact.height <= 260, `and bounded in height (${compact.height}px)`)

    const more = await boxOf('.mention-hover-card-expand')
    if (more) {
      await move(more.x, more.y)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(more.x), y: Math.round(more.y), button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(more.x), y: Math.round(more.y), button: 'left', clickCount: 1 })
      await sleep(600)
      const full = await evaluate<{ height: number; stats: number; text: number }>(`(() => {
        const c = document.querySelector('.mention-hover-card')
        const r = c.getBoundingClientRect()
        return {
          height: Math.round(r.height),
          stats: c.querySelectorAll('.mention-hover-card-stat').length,
          text: c.querySelectorAll('.mention-hover-card-text-preview').length
        }
      })()`)
      note(report, `expanded: ${JSON.stringify(full)}`)
      assert(report, full.height > compact.height, `expanding grows the card (${compact.height} -> ${full.height}px)`)
      assert(
        report,
        full.stats >= compact.stats && full.text >= compact.text,
        'and adds to what was already shown rather than replacing it'
      )
    }
    await moveAway()

    // ---- 2d. the hover card fades, and respects reduced motion ------------
    section(report, 'the hover card fades in and out, unless reduced motion is set')

    await openCard(mentionPoints[0])
    const justOpened = await evaluate<{ opacity: string; hasVisibleClass: boolean; transitionDuration: string }>(`(() => {
      const c = document.querySelector('.mention-hover-card')
      const s = getComputedStyle(c)
      return { opacity: s.opacity, hasVisibleClass: c.classList.contains('is-visible'), transitionDuration: s.transitionDuration }
    })()`)
    note(report, `right after opening: ${JSON.stringify(justOpened)}`)
    assert(
      report,
      justOpened.transitionDuration !== '0s',
      `the card actually declares an opacity transition (${justOpened.transitionDuration})`
    )
    await sleep(400)
    const settledOpen = await evaluate<{ opacity: string }>(
      `({ opacity: getComputedStyle(document.querySelector('.mention-hover-card')).opacity })`
    )
    assert(report, settledOpen.opacity === '1', `and settles fully opaque (opacity ${settledOpen.opacity})`)

    // Leaving: the card must still be in the DOM immediately (mid fade-out),
    // then gone shortly after — not instantly, not stuck. Deliberately does
    // NOT use moveAway() here: that helper sleeps 700ms before returning,
    // which is longer than the whole fade, so "immediately after" would
    // really mean "long after" and could never observe the transient state.
    await move(700, 20)
    const midFadeOut = await evaluate<{ present: boolean; opacity: string | null }>(`(() => {
      const c = document.querySelector('.mention-hover-card')
      return { present: !!c, opacity: c ? getComputedStyle(c).opacity : null }
    })()`)
    note(report, `immediately after leaving: ${JSON.stringify(midFadeOut)}`)
    assert(report, midFadeOut.present, 'the card is still mounted the instant the cursor leaves (fading out, not gone)')
    await sleep(500)
    assert(
      report,
      (await cardCount()) === 0,
      'and is fully removed shortly after — the fade does not leave it stuck'
    )

    // Reduced motion: same interaction, but the card must appear and vanish
    // synchronously, exactly like the pre-fade static behaviour — nothing
    // should linger in the DOM waiting out a fade the writer opted out of.
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await sleep(200)

    await openCard(mentionPoints[0])
    const reducedOpen = await evaluate<{ opacity: string }>(
      `({ opacity: getComputedStyle(document.querySelector('.mention-hover-card')).opacity })`
    )
    note(report, `reduced motion, right after opening: opacity ${reducedOpen.opacity}`)
    assert(
      report,
      reducedOpen.opacity === '1',
      `under reduced motion the card is fully visible immediately, no fade-in step (opacity ${reducedOpen.opacity})`
    )

    await moveAway()
    // No settling sleep here on purpose: under reduced motion the removal is
    // synchronous, so this has to already be true on the very next check.
    assert(
      report,
      (await cardCount()) === 0,
      'and under reduced motion, leaving removes it at once rather than after a fade delay'
    )

    await send('Emulation.setEmulatedMedia', { features: [] })
    await sleep(200)

    // ---- 3. elevation is present and stepped ------------------------------
    section(report, 'elevation reads as three distinct steps')
    const elevation: { one: string; two: string; three: string; card: string } = await evaluate(`(() => {
      const probe = (value) => {
        const el = document.createElement('div')
        el.style.boxShadow = value
        document.body.appendChild(el)
        const out = getComputedStyle(el).boxShadow
        el.remove()
        return out
      }
      return {
        one: probe('var(--elev-1)'),
        two: probe('var(--elev-2)'),
        three: probe('var(--elev-3)'),
        card: ''
      }
    })()`)
    elevation.card = cardShadow
    const alphaOf = (shadow: string): number => {
      const matches = [...shadow.matchAll(/rgba?\([^)]*?([\d.]+)\)/g)].map((m) => Number(m[1]))
      return matches.length ? Math.max(...matches) : 0
    }
    const spreadOf = (shadow: string): number => {
      const px = [...shadow.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]))
      return px.length ? Math.max(...px) : 0
    }
    note(report, `elev-1 ${elevation.one}`)
    note(report, `elev-2 ${elevation.two}`)
    note(report, `elev-3 ${elevation.three}`)
    assert(report, elevation.one !== 'none', 'elevation 1 draws something')
    assert(
      report,
      spreadOf(elevation.one) < spreadOf(elevation.two) && spreadOf(elevation.two) < spreadOf(elevation.three),
      `the three steps are ordered (${spreadOf(elevation.one)} < ${spreadOf(elevation.two)} < ${spreadOf(elevation.three)})`
    )
    assert(
      report,
      alphaOf(elevation.three) > alphaOf(elevation.one),
      `and get more present, not just larger (${alphaOf(elevation.one)} -> ${alphaOf(elevation.three)})`
    )
    // Restraint is still the rule: nothing here should be a drop shadow.
    assert(
      report,
      alphaOf(elevation.three) <= 0.45,
      `the deepest step stays soft rather than becoming a drop shadow (alpha ${alphaOf(elevation.three)})`
    )
    assert(report, elevation.card !== 'none' && elevation.card !== '(no card)', `cards now sit on a surface (${elevation.card})`)

    // ---- 4. the continuity board says which way a link reads --------------
    // The old map printed one label on the line between two names, which was
    // true in only one direction and never showed the stored reverse wording
    // at all. The board now reads one entry at a time and writes both.
    section(report, 'the continuity board reads its links in both directions')
    await goToSection('continuity')

    const chronology: {
      sidePanel: boolean
      rows: number
      cardShadow: string
      cardBorder: string
      dateOutside: boolean
      dates: string[]
      full: boolean
    } = await evaluate(`(() => {
      const board = document.querySelector('.timeline')
      const app = document.querySelector('.app')
      const body = document.querySelector('.timeline-body')
      const when = document.querySelector('.timeline-when')
      const style = body ? getComputedStyle(body) : null
      return {
        sidePanel: !!document.querySelector('.side-panel'),
        rows: document.querySelectorAll('.timeline-row').length,
        cardShadow: style?.boxShadow ?? '(no event)',
        cardBorder: style?.borderTopWidth ?? '(no event)',
        // The date and the spine belong to the board, not to the event, so
        // they read as continuous columns beside the cards.
        dateOutside: !!when && !!body && !body.contains(when),
        dates: [...document.querySelectorAll('.timeline-when')].slice(0, 3).map((el) => el.textContent),
        full: !!board && !!app && Math.round(board.getBoundingClientRect().width) === Math.round(app.getBoundingClientRect().width)
      }
    })()`)
    note(report, `chronology: ${chronology.rows} events, dates ${JSON.stringify(chronology.dates)}`)
    assert(report, chronology.rows > 0, `the chronology drew its events (${chronology.rows})`)
    assert(report, !chronology.sidePanel, 'the duplicate list panel is gone from this section')
    assert(report, chronology.full, 'and the board takes the width the panel used to hold')
    assert(
      report,
      chronology.cardShadow !== 'none' && parseFloat(chronology.cardBorder) > 0,
      `each event is a card rather than a run of text (${chronology.cardShadow})`
    )
    assert(report, chronology.dateOutside, 'and its date sits outside the card, in the board’s own column')
    assert(
      report,
      chronology.dates.every((d) => (d ?? '').trim().length > 0),
      'every event states its in-story date, or says plainly that it has none'
    )

    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.span-tag-filter-pill')].find((x) => /relationships/i.test(x.textContent ?? ''))
      if (b) b.click()
      return true
    })()`)
    await sleep(900)

    const readFor = async (name: string): Promise<{ head: string; lines: string[]; backs: string[] }> => {
      await evaluate(`(() => {
        const b = [...document.querySelectorAll('.relationship-picker-chip')]
          .find((x) => (x.textContent ?? '').includes(${JSON.stringify(name)}))
        if (b) b.click()
        return true
      })()`)
      await sleep(400)
      return evaluate(`(() => ({
        head: document.querySelector('.relationship-focus-head')?.textContent ?? '',
        lines: [...document.querySelectorAll('.relationship-reading-line')].map((el) => el.textContent),
        backs: [...document.querySelectorAll('.relationship-reading-back')].map((el) => el.textContent)
      }))()`)
    }

    const wren = await readFor('Wren Halloway')
    note(report, `reading Wren: ${JSON.stringify(wren.lines.slice(0, 3))}`)
    assert(report, wren.head.includes('Wren Halloway'), 'the board names the entry it is currently reading')
    assert(
      report,
      wren.lines.every((line) => line.trim().startsWith('Wren Halloway')),
      'every sentence is written outward from that entry, so the chosen name comes first'
    )

    // A directional link: the stored reverse wording is the other half of the
    // fact and has to be on screen, not merely on disk.
    const sister = wren.lines.findIndex((l) => l.includes('Tobias Wren-Hall'))
    assert(report, sister !== -1, 'the link to Tobias is listed')
    assert(
      report,
      (wren.backs[sister] ?? '').includes('brother of'),
      `the reverse wording is shown too (${wren.backs[sister] ?? '(none)'})`
    )

    // A mutual link (no reverse wording stored) must read with the same words
    // from either end. Reversing it produced "Maren and Tomas is the oldest
    // friend of", which is what this assertion exists to keep out.
    const mutual = wren.lines.findIndex((l) => l.includes('Serafine Okonkwo'))
    assert(report, mutual !== -1, 'the mutual link to Serafine is listed')
    assert(
      report,
      (wren.backs[mutual] ?? '').includes('both ways'),
      'a mutual link says outright that it reads the same both ways'
    )

    const serafine = await readFor('Serafine Okonkwo')
    const backAtWren = serafine.lines.find((l) => l.includes('Wren Halloway')) ?? ''
    note(report, `the same link, read from Serafine: ${backAtWren}`)
    assert(
      report,
      backAtWren.includes('colleague of'),
      'and it keeps that same wording when read from the other end, rather than flipping'
    )

    const focus: { dimEdges: number; litEdges: number; focused: number; box: string } = await evaluate(`(() => {
      const svg = document.querySelector('.relationship-map-svg')
      const r = svg?.getBoundingClientRect()
      return {
        dimEdges: document.querySelectorAll('.relationship-edge.is-dim').length,
        litEdges: document.querySelectorAll('.relationship-edge.is-lit').length,
        focused: document.querySelectorAll('.relationship-node.is-focus').length,
        box: r ? Math.round(r.width) + 'x' + Math.round(r.height) : '(no map)'
      }
    })()`)
    note(report, `web: ${focus.litEdges} lit, ${focus.dimEdges} dimmed`)
    assert(report, focus.focused === 1, 'exactly one name on the web is marked as the one being read')
    assert(report, focus.litEdges > 0 && focus.dimEdges > 0, 'its links are lit and the rest of the web recedes')

    // The web is a shape you learn, so it holds still: same size whichever
    // entry is being read, and nothing below it moves when the focus changes.
    const firstBox = focus.box
    await readFor('Ivo Marchetti')
    const secondBox = await evaluate<string>(`(() => {
      const r = document.querySelector('.relationship-map-svg')?.getBoundingClientRect()
      return r ? Math.round(r.width) + 'x' + Math.round(r.height) : '(no map)'
    })()`)
    note(report, `map size: ${firstBox} then ${secondBox}`)
    assert(report, firstBox === '640x360', `the map is drawn at a fixed size (${firstBox})`)
    assert(report, firstBox === secondBox, 'and stays that size when a different entry is read')

    // ---- 5. the query tracker measures the wait ---------------------------
    // The board that used to be here spread every query across seven columns
    // of status. What the record actually knows about all of them is how long
    // ago they went out, so that is what the screen is built on now.
    section(report, 'the query tracker is a waiting list')
    await goToSection('query tracker')

    const tracker: {
      sidePanel: boolean
      boards: number
      full: boolean
      lead: string
      bars: number
      fills: number[]
      days: string[]
      sections: string[]
      axis: string[]
      disclosure: string
      closedRows: number
    } = await evaluate(`(() => {
      const view = document.querySelector('.submissions')
      const app = document.querySelector('.app')
      return {
        sidePanel: !!document.querySelector('.side-panel'),
        boards: document.querySelectorAll('.submissions-board').length,
        full: !!view && !!app && Math.round(view.getBoundingClientRect().width) === Math.round(app.getBoundingClientRect().width),
        lead: document.querySelector('.submission-lead')?.textContent ?? '',
        bars: document.querySelectorAll('.submission-wait-row').length,
        fills: [...document.querySelectorAll('.submission-wait-fill')].map((f) => Math.round(f.getBoundingClientRect().width)),
        days: [...document.querySelectorAll('.submission-wait-days')].map((d) => d.textContent),
        sections: [...document.querySelectorAll('.submission-section-name')].map((s) => s.textContent),
        axis: [...document.querySelectorAll('.submission-axis span')].map((s) => s.textContent),
        disclosure: document.querySelector('.submission-disclosure')?.textContent ?? '',
        closedRows: document.querySelectorAll('.submission-closed-row').length
      }
    })()`)
    note(report, `tracker: ${tracker.bars} bars, sections ${JSON.stringify(tracker.sections)}`)
    note(report, `lead: ${tracker.lead}`)
    assert(report, !tracker.sidePanel, 'the status-filter panel is gone from this section')
    assert(report, tracker.full, 'and the tracker takes the width it used to hold')
    assert(report, tracker.boards === 0, 'the status board has been replaced')
    assert(report, tracker.bars > 0, `open queries are drawn as bars (${tracker.bars})`)
    assert(
      report,
      /waiting on a reply/.test(tracker.lead),
      'the page leads with how many are still waiting'
    )

    // Longest wait first, and every bar against the same scale — which is the
    // whole reason two of them can be compared by eye.
    const descending = tracker.fills.every((w, i) => i === 0 || tracker.fills[i - 1] >= w)
    note(report, `bar widths: ${JSON.stringify(tracker.fills.slice(0, 5))}`)
    assert(report, descending, 'they are ordered longest wait first')
    const dayNumbers = tracker.days.map((d) => parseInt(String(d), 10)).filter((n) => !Number.isNaN(n))
    const longest = Math.max(...dayNumbers)
    assert(
      report,
      tracker.axis.some((label) => String(label).includes(String(longest))),
      `and the scale they share is stated (${tracker.axis.join(' … ')})`
    )

    // The median reply comes from dated replies and from nothing else — there
    // is no field on the record that could stand in for one.
    const typical: { marks: number; markPct: string; axisMark: string; lead: string } = await evaluate(`(() => ({
      marks: document.querySelectorAll('.submission-wait-mark').length,
      markPct: document.querySelector('.submission-wait-mark')?.style.getPropertyValue('--mark-pct') ?? '',
      axisMark: document.querySelector('.submission-axis-mark')?.textContent ?? '',
      lead: document.querySelector('.submission-sub')?.textContent ?? ''
    }))()`)
    note(report, `median: ${typical.axisMark} at ${typical.markPct}`)
    assert(report, typical.marks === tracker.bars, `every bar carries the median marker (${typical.marks})`)
    assert(report, /median reply/.test(typical.axisMark), `and the axis says what it is ("${typical.axisMark}")`)
    assert(
      report,
      /dated replies, half came within about/.test(typical.lead),
      'the summary says the median comes from the replies that were dated'
    )

    assert(report, tracker.closedRows === 0, 'closed queries are not on the waiting list')
    assert(report, /^Show \d+ closed quer/.test(tracker.disclosure), `they sit behind a link ("${tracker.disclosure}")`)
    await evaluate(`document.querySelector('.submission-disclosure').click()`)
    await sleep(500)
    const opened: { rows: number; link: string } = await evaluate(`(() => ({
      rows: document.querySelectorAll('.submission-closed-row').length,
      link: document.querySelector('.submission-disclosure')?.textContent ?? ''
    }))()`)
    assert(report, opened.rows > 0, `which opens them (${opened.rows} rows)`)

    // The board's drag was the way to change a status. This is that.
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.submission-wait-row .submission-actions button')]
        .find((x) => /change status/i.test(x.textContent ?? ''))
      if (b) b.click()
      return true
    })()`)
    await sleep(400)
    const menu: { rows: string[]; onTop: boolean; before: string } = await evaluate(`(() => {
      const row = document.querySelector('.submission-wait-row.is-menu-open')
      return {
        rows: [...document.querySelectorAll('.submission-status-menu-row')].map((r) => r.textContent),
        onTop: !!row && getComputedStyle(row).zIndex !== 'auto',
        before: document.querySelector('.submission-wait-row .submission-wait-name')?.textContent ?? ''
      }
    })()`)
    note(report, `status menu: ${JSON.stringify(menu.rows)}`)
    assert(report, menu.rows.length > 0, 'a row offers every status as a menu')
    assert(report, menu.onTop, 'and the row it belongs to paints above the rows below it')

    await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.submission-status-menu-row')]
      const target = rows.find((r) => /requested full/i.test(r.textContent ?? '')) ?? rows[rows.length - 1]
      target.click()
      return true
    })()`)
    await sleep(1200)
    const after: { first: string; requests: string[]; menuOpen: boolean } = await evaluate(`(() => ({
      first: document.querySelector('.submission-wait-row .submission-wait-name')?.textContent ?? '',
      requests: [...document.querySelectorAll('.submission-request-line')].map((l) => l.textContent),
      menuOpen: !!document.querySelector('.submission-status-menu')
    }))()`)
    note(report, `moved ${menu.before} out of the waiting list`)
    assert(report, !after.menuOpen, 'choosing one closes the menu')
    assert(
      report,
      after.first !== menu.before && after.requests.some((line) => String(line).includes(menu.before)),
      `and the query moves to the group its new status belongs to (${menu.before})`
    )

    // ---- 6. the lexicon's alphabet moves the page -------------------------
    // Hovering a letter takes the glossary to it. A letter with no words under
    // it does nothing at all, which is the part that has to be asserted: a
    // control that silently does nothing is worse than no control.
    section(report, 'the lexicon is a glossary with an alphabet across the top')
    await goToSection('lexicon')

    const glossary: {
      sidePanel: boolean
      letters: number
      live: string
      dim: string
      groups: string
      current: string
      serif: string
    } = await evaluate(`(() => {
      const word = document.querySelector('.lexicon-word')
      return {
        sidePanel: !!document.querySelector('.side-panel'),
        letters: document.querySelectorAll('.lexicon-alphabet-letter').length,
        live: [...document.querySelectorAll('.lexicon-alphabet-letter:not(.is-empty)')].map((e) => e.textContent).join(''),
        dim: [...document.querySelectorAll('.lexicon-alphabet-letter.is-empty')].map((e) => e.textContent).join(''),
        groups: [...document.querySelectorAll('.lexicon-group')].map((g) => g.dataset.letter).join(''),
        current: document.querySelector('.lexicon-alphabet-letter.is-current')?.textContent ?? '',
        serif: word ? getComputedStyle(word).fontFamily : '(no word)'
      }
    })()`)
    note(report, `alphabet: ${glossary.live} live, ${glossary.dim} dimmed`)
    assert(report, !glossary.sidePanel, 'the duplicate word-list panel is gone from this section')
    assert(report, glossary.letters === 26, `the whole alphabet is shown (${glossary.letters})`)
    assert(
      report,
      glossary.live === glossary.groups,
      `the live letters are exactly the letters with words (${glossary.live} / ${glossary.groups})`
    )
    assert(report, glossary.dim.length > 0, `and the rest are dimmed (${glossary.dim})`)
    assert(report, /Iowan|Palatino|Georgia|serif/i.test(glossary.serif), 'the words are set in the page serif')

    const hoverLetter = async (letter: string): Promise<{ before: number; after: number; fromTop: number | null }> =>
      evaluate(`(() => {
        const scroll = document.querySelector('.lexicon-scroll')
        const before = scroll.scrollTop
        const el = [...document.querySelectorAll('.lexicon-alphabet-letter')]
          .find((e) => e.textContent === ${JSON.stringify(letter)})
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
        const group = document.querySelector('.lexicon-group[data-letter="' + ${JSON.stringify(letter)} + '"]')
        return {
          before,
          after: scroll.scrollTop,
          fromTop: group ? Math.round(group.getBoundingClientRect().top - scroll.getBoundingClientRect().top) : null
        }
      })()`)

    const lastLive = glossary.live[glossary.live.length - 1]
    const jumped = await hoverLetter(lastLive)
    await sleep(300)
    const nowCurrent = await evaluate<string>(
      `document.querySelector('.lexicon-alphabet-letter.is-current')?.textContent ?? ''`
    )
    note(report, `hovering ${lastLive}: ${jumped.before} -> ${jumped.after}, group ${jumped.fromTop}px from the top`)
    assert(report, jumped.after !== jumped.before, `hovering ${lastLive} moves the page`)
    // Trailing space is what lets even the last letter reach the top; without
    // it the strip would mark a letter you did not ask for.
    assert(
      report,
      jumped.fromTop !== null && Math.abs(jumped.fromTop) <= 24,
      `and puts that letter at the top (${jumped.fromTop}px)`
    )
    assert(report, nowCurrent === lastLive, `so the strip marks it as where you are (${nowCurrent})`)

    const deadLetter = glossary.dim[0]
    const inert = await hoverLetter(deadLetter)
    assert(
      report,
      inert.after === inert.before,
      `hovering ${deadLetter}, which has no words, does nothing (${inert.before} -> ${inert.after})`
    )

    // ---- 7. one page frame across every panel-less section ----------------
    // Seven sections took the side panel's width one at a time, and each
    // picked its own padding and measure as it was built: four paddings and
    // six measures between them, so stepping down the nav rail moved the
    // content sideways on every click.
    section(report, 'every section without a side panel lays out on the same page column')

    const PAGES: [string, string][] = [
      ['story bible', '.story-bible-browse, .story-bible-detail'],
      // Either face of the board — the relationship section above leaves it
      // showing the web rather than the chronology.
      ['continuity', '.timeline-scroll, .relationship-board'],
      ['compile', '.compile-assembly'],
      ['query tracker', '.submissions-scroll'],
      ['lexicon', '.lexicon-scroll'],
      ['progress', '.progress-view'],
      ['appearance', '.appearance-view']
    ]

    const frames: { name: string; left: number | null; right: number | null; pad: string; panel: boolean }[] = []
    for (const [title, selector] of PAGES) {
      await goToSection(title)
      const box: { left: number | null; right: number | null; pad: string; panel: boolean } = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return { left: null, right: null, pad: '(missing)', panel: false }
        const style = getComputedStyle(el)
        const boxes = [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
        // Where the page's content starts, and how far its column reaches.
        // The widest block is the column; a narrower one is prose capping
        // itself inside it, which is not a difference between pages.
        const left = boxes.length ? Math.round(Math.min(...boxes.map((r) => r.left))) : null
        const right = boxes.length ? Math.round(Math.max(...boxes.map((r) => r.right))) : null
        return {
          left,
          right,
          // Top and side only: the Lexicon grows its own bottom padding so
          // that its last letter can reach the top of the view.
          pad: style.paddingTop + '/' + style.paddingLeft,
          panel: !!document.querySelector('.side-panel')
        }
      })()`)
      frames.push({ name: title, ...box })
    }

    for (const frame of frames) note(report, `${frame.name}: ${frame.left}–${frame.right}, padding ${frame.pad}`)
    assert(report, frames.every((f) => !f.panel), 'none of these sections shows a side panel')
    assert(report, frames.every((f) => f.left !== null), 'every one of them rendered its page')

    const lefts = [...new Set(frames.map((f) => f.left))]
    const rights = [...new Set(frames.map((f) => f.right))]
    const pads = [...new Set(frames.map((f) => f.pad))]
    assert(report, lefts.length === 1, `they all start at the same left edge (${JSON.stringify(lefts)})`)
    assert(report, rights.length === 1, `and end at the same right edge (${JSON.stringify(rights)})`)
    assert(report, pads.length === 1, `on one set of paddings (${JSON.stringify(pads)})`)

    // Reserved on every page, or a page that scrolls sits half a scrollbar
    // left of one that does not.
    const gutters: string[] = await evaluate(`(() => {
      const sels = ['.story-bible-browse', '.timeline-scroll', '.compile-assembly', '.submissions-scroll',
        '.lexicon-scroll', '.progress-view', '.appearance-view']
      const probe = document.createElement('div')
      document.body.appendChild(probe)
      const out = sels.map((s) => {
        probe.className = s.slice(1)
        return getComputedStyle(probe).scrollbarGutter
      })
      probe.remove()
      return [...new Set(out)]
    })()`)
    assert(
      report,
      gutters.length === 1 && gutters[0] === 'stable',
      `every page reserves its scrollbar (${JSON.stringify(gutters)})`
    )

    // ---- 8. a theme is chosen by wearing it -------------------------------
    // The wall shows each theme as the app wearing it, and hovering one puts
    // the whole window into it. The part that has to hold is that trying is
    // free: nothing is written until a click, and leaving puts it back.
    section(report, 'a theme can be tried on before it is kept')
    await goToSection('appearance')

    const wall: { cards: number; specimens: number; hint: boolean; pageColour: string } = await evaluate(`(() => {
      const spec = document.querySelector('.appearance-spec')
      return {
        cards: document.querySelectorAll('.appearance-theme').length,
        specimens: document.querySelectorAll('.appearance-spec').length,
        // The cards say what a line under the heading would have said.
        hint: !!document.querySelector('.appearance-themes-title + .progress-hint'),
        pageColour: spec ? getComputedStyle(spec.querySelector('.appearance-spec-page')).backgroundColor : ''
      }
    })()`)
    note(report, `wall: ${wall.cards} themes, first page ${wall.pageColour}`)
    assert(report, wall.cards > 0, `every theme is on the wall (${wall.cards})`)
    assert(report, wall.specimens === wall.cards, 'each one is drawn as the app wearing it')
    assert(report, !wall.hint, 'with no line of copy under the heading')

    /** The root's own custom property, which is what a preset actually sets. */
    const rootBg = (): Promise<string> =>
      evaluate(`document.documentElement.style.getPropertyValue('--chrome-bg') || '(unset)'`)

    const before = await rootBg()
    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.appearance-theme')].find((c) => c.textContent.includes('Terminal Green'))
      card.scrollIntoView({ block: 'center' })
      card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
      return true
    })()`)
    await sleep(500)
    const during = await rootBg()
    const storedWhileHovering = await evaluate<string | null>(`window.api.getColorPresetId()`)
    note(report, `hovering: ${before} -> ${during}, stored ${JSON.stringify(storedWhileHovering)}`)
    assert(report, during !== before, `hovering a theme repaints the whole window (${during})`)
    assert(report, storedWhileHovering === null, 'and writes nothing while it is only being tried')

    // React derives leave from a native mouseout carrying a relatedTarget.
    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.appearance-theme')].find((c) => c.textContent.includes('Terminal Green'))
      card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
      return true
    })()`)
    await sleep(500)
    assert(report, (await rootBg()) === before, 'moving away puts the window back')

    await evaluate(`[...document.querySelectorAll('.appearance-theme')]
      .find((c) => c.textContent.includes('Terminal Green')).click()`)
    await sleep(900)
    const kept: { bg: string; border: string; stored: string | null; marked: boolean } = await evaluate(`(async () => ({
      bg: document.documentElement.style.getPropertyValue('--chrome-bg'),
      border: document.documentElement.style.getPropertyValue('--chrome-border'),
      stored: await window.api.getColorPresetId(),
      marked: !!document.querySelector('.appearance-theme.is-active')
    }))()`)
    note(report, `kept: bg ${kept.bg}, border ${kept.border}, stored ${kept.stored}`)
    assert(report, kept.stored === 'terminal-green', `clicking keeps it (${kept.stored})`)
    assert(report, kept.marked, 'and the wall marks which one is in use')
    // Hairlines follow the palette rather than staying on the base theme's
    // warm browns, or a cool theme reads as two themes at once.
    assert(report, kept.border !== '', `the borders follow the theme too (${kept.border})`)

    // A preview left up when the section changes must not survive it.
    await evaluate(`(() => {
      const card = [...document.querySelectorAll('.appearance-theme')].find((c) => c.textContent.includes('Vellum'))
      card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
      return true
    })()`)
    await sleep(400)
    const strayPreview = await rootBg()
    await goToSection('manuscript')
    await sleep(700)
    const afterLeaving = await rootBg()
    note(report, `left the page mid-preview: ${strayPreview} -> ${afterLeaving}`)
    assert(
      report,
      strayPreview !== kept.bg && afterLeaving === kept.bg,
      'leaving the page mid-preview goes back to the theme that was chosen'
    )
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  } finally {
    ws?.close()
    child.kill()
    await sleep(500)
    await cleanup().catch(() => undefined)
  }

  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

void main()
