/**
 * Drives the real app to check three pieces of interface behaviour that only
 * exist at runtime: the binder's status badge compacting with the panel's
 * width, the Story Bible hover card refusing to navigate unless you ask it
 * to, and the elevation steps actually being distinguishable from each other.
 *
 * All three are the kind of thing that looks right in the stylesheet and is
 * wrong on screen, which is why they are asserted against a running window
 * rather than against the CSS.
 */
import { execFileSync, spawn } from 'child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { assert, createReport, note, section, summarize } from './harness'

const PORT = 9359

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
      projectRoot: projectDir
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
  const child = spawn(electronBinary, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env
  })

  let ws: WebSocket | null = null
  try {
    let target: { webSocketDebuggerUrl: string } | undefined
    for (let i = 0; i < 80 && !target; i += 1) {
      try {
        const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
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
     *  querying for it proves nothing — the rail is the honest signal. */
    const activeSection = (): Promise<string> =>
      evaluate(`(() => {
        const b = [...document.querySelectorAll('.nav-rail-button')].find((x) => x.classList.contains('is-active'))
        return (b?.getAttribute('title') ?? '(none)').trim()
      })()`)

    const goToSection = async (pattern: string): Promise<void> => {
      await evaluate(`(() => {
        const b = [...document.querySelectorAll('.nav-rail-button')]
          .find((x) => new RegExp(${JSON.stringify(pattern)}, 'i').test(x.getAttribute('title') ?? ''))
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

    const badges = (): Promise<{
      full: number
      dots: number
      chips: number
      chipTotal: number
      rowHeights: number[]
      width: number
      dotTitle: string
    }> =>
      evaluate(`(() => ({
        full: document.querySelectorAll('.binder-list .status-badge').length,
        dots: document.querySelectorAll('.binder-list .status-dot').length,
        chips: document.querySelectorAll('.binder-list .row-chip-row > .tag-chip, .binder-list .row-chip-row > .span-tag-rollup-chip').length,
        // Shown chips plus everything counted in a +N.
        chipTotal: [...document.querySelectorAll('.binder-list .row-chip-row')].reduce((sum, row) => {
          const shown = row.querySelectorAll(':scope > .tag-chip, :scope > .span-tag-rollup-chip').length
          const more = Number((row.querySelector('.row-chip-overflow')?.textContent ?? '+0').replace('+', ''))
          return sum + shown + more
        }, 0),
        rowHeights: [...new Set([...document.querySelectorAll('.binder-row')].map((r) => Math.round(r.getBoundingClientRect().height)))],
        width: Math.round(document.querySelector('.side-panel').getBoundingClientRect().width),
        dotTitle: document.querySelector('.binder-list .status-dot')?.getAttribute('title') ?? ''
      }))()`)

    // ---- 1. the status badge follows the panel width ----------------------
    section(report, 'the binder status badge compacts with the panel, and expands again')

    await setPanelWidth(460)
    const wide = await badges()
    note(report, `wide: ${JSON.stringify(wide)}`)
    assert(report, wide.width > 400, `the panel really is wide (${wide.width}px)`)
    assert(report, wide.full > 0, `statuses show their name when there is room (${wide.full})`)
    assert(report, wide.dots === 0, `and no dots are used (${wide.dots})`)

    await setPanelWidth(190)
    const narrow = await badges()
    note(report, `narrow: ${JSON.stringify(narrow)}`)
    assert(report, narrow.width < 220, `the panel really is narrow (${narrow.width}px)`)
    assert(report, narrow.dots > 0, `statuses collapse to a dot when the title needs the room (${narrow.dots})`)
    assert(report, narrow.full === 0, `and no full badge survives (${narrow.full})`)
    assert(
      report,
      ['Draft', 'Revising', 'Final'].includes(narrow.dotTitle),
      `the dot still names its status on hover ("${narrow.dotTitle}")`
    )

    // Chips have their own cap, so the number *rendered* differs by width on
    // purpose. What must hold is that none are lost: whatever is not shown is
    // counted in a +N beside them.
    assert(report, wide.chips > 0 && narrow.chips > 0, `chips render at both widths (${wide.chips} / ${narrow.chips})`)
    assert(
      report,
      wide.chipTotal === narrow.chipTotal && wide.chipTotal > 0,
      `no chip is lost when the panel narrows (${wide.chipTotal} accounted for at both widths)`
    )
    assert(
      report,
      narrow.rowHeights.length === 1 && wide.rowHeights.length === 1,
      `every row is the same height regardless of its chips (${wide.rowHeights.join('/')} wide, ${narrow.rowHeights.join('/')} narrow)`
    )

    // Guarded: if no dot rendered the assertions above already said so, and
    // throwing here would hide every check that follows.
    const dotGeometry = await evaluate<{ w: number; h: number; round: boolean; colored: boolean } | null>(`(() => {
      const el = document.querySelector('.binder-list .status-dot')
      if (!el) return null
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        round: parseFloat(s.borderRadius) >= r.width / 2 - 0.5,
        colored: s.backgroundColor !== 'rgba(0, 0, 0, 0)'
      }
    })()`)
    assert(report, !!dotGeometry && dotGeometry.round && dotGeometry.w === dotGeometry.h, `the dot is a circle (${dotGeometry?.w}x${dotGeometry?.h})`)
    assert(report, !!dotGeometry?.colored, 'and carries the status colour')

    // Widening again has to bring the labels back — this is live, not one-way.
    await setPanelWidth(460)
    const reopened = await badges()
    assert(report, reopened.full > 0 && reopened.dots === 0, `widening restores the labels (${reopened.full} labels)`)

    await setPanelWidth(260)

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
