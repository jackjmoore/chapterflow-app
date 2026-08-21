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

    const badges = (): Promise<{ full: number; dots: number; chips: number; width: number; dotTitle: string }> =>
      evaluate(`(() => ({
        full: document.querySelectorAll('.binder-list .status-badge').length,
        dots: document.querySelectorAll('.binder-list .status-dot').length,
        chips: document.querySelectorAll('.binder-list .span-tag-rollup-chip').length,
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

    // The chips are explicitly out of scope for this behaviour.
    assert(
      report,
      narrow.chips === wide.chips && wide.chips > 0,
      `character chips are untouched by the compaction (${wide.chips} wide, ${narrow.chips} narrow)`
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
