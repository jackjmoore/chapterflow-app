// Drives the built app over the DevTools protocol against the seeded 100k-word
// project and records what typing actually costs.
//
//   node measure.mjs <base dir> [--label name] [--profile out.json] [--shots dir]
//
// Metrics per scenario:
//   key     main-thread time to process one keystroke (CDP round trip of the
//           keyDown dispatch — the renderer acks after handling the event)
//   frame   requestAnimationFrame gaps while typing (16.7ms = one frame)
//   long    PerformanceObserver 'longtask' entries (>50ms main-thread blocks)
//   paginate / apply-breaks   the app's own performance.measure entries
import { spawn } from 'node:child_process'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createRequire } from 'node:module'

import { fileURLToPath } from 'node:url'
const APP = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const require = createRequire(join(APP, 'package.json'))
const electronBinary = require('electron')
const PORT = 9377

const args = process.argv.slice(2)
const base = args[0]
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const label = opt('--label') ?? 'run'
const profileOut = opt('--profile')
const shotsDir = opt('--shots')
if (!base) { console.error('usage: node measure.mjs <base dir>'); process.exit(2) }

const userDataDir = resolve(base, 'userdata')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
// Chromium stops painting and throttles timers in a window another window
// covers; on a busy desktop that turned one run into nonsense (zero frames,
// keystrokes queued behind a compositor that never woke). These switches keep
// the renderer running as if visible whatever is in front of it.
const child = spawn(electronBinary, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'], {
  cwd: APP, stdio: 'ignore', env
})

async function connect() {
  let target
  for (let i = 0; i < 100 && !target; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && String(t.url).includes('index.html'))
    } catch { /* not yet */ }
    if (!target) await sleep(400)
  }
  if (!target) throw new Error('app window never appeared')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws failed')), { once: true }) })
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (!msg.id || !pending.has(msg.id)) return
    const p = pending.get(msg.id); pending.delete(msg.id)
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
    else if (msg.result?.exceptionDetails) p.reject(new Error(JSON.stringify(msg.result.exceptionDetails)))
    else p.resolve(msg.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
  return { send, evaluate, close: () => ws.close() }
}

const VK = { ' ': 32, '.': 190, ',': 188 }
function keyParams(ch) {
  const upper = ch.toUpperCase()
  const isLetter = /[a-z]/i.test(ch)
  return {
    key: ch,
    code: isLetter ? `Key${upper}` : ch === ' ' ? 'Space' : ch === '.' ? 'Period' : 'Comma',
    windowsVirtualKeyCode: isLetter ? upper.charCodeAt(0) : VK[ch],
    text: ch
  }
}

/** Types text one keystroke at a time; returns each keyDown's round-trip ms. */
async function typeText(cdp, text, gapMs) {
  const times = []
  for (const ch of text) {
    const p = keyParams(ch)
    const t0 = performance.now()
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p, nativeVirtualKeyCode: p.windowsVirtualKeyCode })
    times.push(performance.now() - t0)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: p.key, code: p.code, windowsVirtualKeyCode: p.windowsVirtualKeyCode })
    await sleep(gapMs)
  }
  return times
}

const INSTRUMENT = `(() => {
  const P = (window.__perf = { frames: [], longTasks: [], measures: [], running: true })
  let last = performance.now()
  const loop = (t) => { P.frames.push(t - last); last = t; if (P.running) requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  P.lt = new PerformanceObserver((list) => { for (const e of list.getEntries()) P.longTasks.push(e.duration) })
  P.lt.observe({ type: 'longtask' })
  P.ms = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name.startsWith('chf:')) P.measures.push({ name: e.name, start: e.startTime, duration: e.duration }) })
  P.ms.observe({ type: 'measure' })
  return true
})()`

const COLLECT = `(() => {
  const P = window.__perf; P.running = false; P.lt.disconnect(); P.ms.disconnect()
  return { frames: P.frames, longTasks: P.longTasks, measures: P.measures, now: performance.now(), visibility: document.visibilityState }
})()`

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] }
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1)
const sum = (arr) => arr.reduce((a, b) => a + b, 0)
function summarize(name, keys, page) {
  const lines = []
  const frames = page.frames.slice(1)
  const pag = page.measures.filter((m) => m.name === 'chf:paginate').map((m) => m.duration)
  const brk = page.measures.filter((m) => m.name === 'chf:apply-breaks').map((m) => m.duration)
  lines.push(`  ${name}`)
  if (frames.length < 50) lines.push(`    WARNING: only ${frames.length} animation frames observed (visibility ${page.visibility}) — the window was probably hidden; discard this run`)
  lines.push(`    keystrokes ${keys.length}: p50 ${fmt(pct(keys, 50))}ms  p95 ${fmt(pct(keys, 95))}ms  max ${fmt(Math.max(...keys))}ms`)
  lines.push(`    frames ${frames.length}: p50 ${fmt(pct(frames, 50))}ms  p95 ${fmt(pct(frames, 95))}ms  max ${fmt(Math.max(...frames))}ms  >33ms: ${frames.filter((f) => f > 33).length}  >100ms: ${frames.filter((f) => f > 100).length}`)
  lines.push(`    long tasks ${page.longTasks.length}: total ${fmt(sum(page.longTasks))}ms  max ${fmt(page.longTasks.length ? Math.max(...page.longTasks) : 0)}ms`)
  lines.push(`    paginate ${pag.length}: mean ${fmt(sum(pag) / (pag.length || 1))}ms  max ${fmt(pag.length ? Math.max(...pag) : 0)}ms`)
  lines.push(`    apply-breaks ${brk.length}: mean ${fmt(sum(brk) / (brk.length || 1))}ms  max ${fmt(brk.length ? Math.max(...brk) : 0)}ms`)
  return lines.join('\n')
}

const out = [`# ${label} — ${new Date().toISOString()}`]
try {
  const cdp = await connect()
  let ready = false
  for (let i = 0; i < 80 && !ready; i += 1) {
    await sleep(500)
    ready = Boolean(await cdp.evaluate(`!!document.querySelector('.page-stack .ProseMirror')`))
  }
  if (!ready) throw new Error('editor never rendered a page stack')
  await sleep(4000)

  const state = await cdp.evaluate(`(() => ({
    sheets: document.querySelectorAll('.page-sheet').length,
    gaps: document.querySelectorAll('.chf-page-gap').length,
    paragraphs: document.querySelectorAll('.page-stack .ProseMirror > p').length,
    footer: document.querySelector('.footer-page-count')?.textContent ?? ''
  }))()`)
  out.push(`document on screen: ${state.paragraphs} paragraphs, ${state.sheets} sheets, ${state.gaps} gap decorations, footer "${state.footer}"`)

  const initial = await cdp.evaluate(`performance.getEntriesByName('chf:paginate').map((e) => Math.round(e.duration * 10) / 10)`)
  out.push(`initial pagination passes: ${JSON.stringify(initial)} ms`)

  if (profileOut) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 })
  }

  // ---- Scenario A: appending at the end of the document -------------------
  await cdp.evaluate(`(() => {
    const pm = document.querySelector('.page-stack .ProseMirror'); pm.focus()
    const r = document.createRange(); r.selectNodeContents(pm); r.collapse(false)
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    pm.lastElementChild?.scrollIntoView({ block: 'end' }); return true
  })()`)
  await sleep(600)
  const sentence = 'and then she kept writing without stopping to look back at the page, and the lamp held. '
  await cdp.evaluate(INSTRUMENT)
  if (profileOut) await cdp.send('Profiler.start')
  const keysA = await typeText(cdp, sentence.repeat(2), 60)
  let profile = null
  if (profileOut) profile = (await cdp.send('Profiler.stop')).profile
  await sleep(1200)
  const pageA = await cdp.evaluate(COLLECT)
  out.push(summarize('A. appending at the end of the document (180 keystrokes at 60ms)', keysA, pageA))

  // ---- Scenario B: typing mid-document so a page break shifts -------------
  await cdp.evaluate(`(() => {
    const p = document.querySelectorAll('.page-stack .ProseMirror > p')[40]
    p.scrollIntoView({ block: 'center' })
    const pm = document.querySelector('.page-stack .ProseMirror'); pm.focus()
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false)
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true
  })()`)
  await sleep(1500)
  const beforeB = await cdp.evaluate(`document.querySelectorAll('.chf-page-gap').length`)
  await cdp.evaluate(INSTRUMENT)
  const keysB = await typeText(cdp, ' ' + sentence.repeat(2).trim(), 60)
  const tB1 = await cdp.evaluate(`performance.now()`)
  await sleep(1500)
  const pageB = await cdp.evaluate(COLLECT)
  const lastPag = pageB.measures.filter((m) => m.name === 'chf:paginate').at(-1)
  out.push(summarize('B. typing a line into paragraph 40 so later breaks shift (170 keystrokes at 60ms)', keysB, pageB))
  const afterB = await cdp.evaluate(`document.querySelectorAll('.chf-page-gap').length`)
  out.push(`    settled pagination after the last keystroke: ${lastPag ? `${fmt(lastPag.duration)}ms pass, landed ${fmt(lastPag.start + lastPag.duration - tB1)}ms after typing stopped` : 'none recorded'}; gap decorations ${beforeB} -> ${afterB}`)

  // ---- Scenario C: one keystroke, then wait — the isolated debounce path ---
  await cdp.evaluate(INSTRUMENT)
  const keysC = await typeText(cdp, 'x', 60)
  await sleep(1500)
  const pageC = await cdp.evaluate(COLLECT)
  const pagC = pageC.measures.filter((m) => m.name === 'chf:paginate')
  const brkC = pageC.measures.filter((m) => m.name === 'chf:apply-breaks')
  out.push(`  C. one keystroke mid-document, then a pause: paginate ${pagC.map((m) => fmt(m.duration) + 'ms').join(', ') || 'none'}; apply-breaks ${brkC.map((m) => fmt(m.duration) + 'ms').join(', ') || 'none'}; keystroke ${fmt(keysC[0])}ms`)

  if (shotsDir) {
    await mkdir(shotsDir, { recursive: true })
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(shotsDir, `${label}-editor.png`), Buffer.from(shot.data, 'base64'))
  }

  if (profileOut && profile) {
    const byNode = new Map(profile.nodes.map((n) => [n.id, n]))
    const self = new Map()
    const deltas = profile.timeDeltas
    for (let i = 0; i < profile.samples.length; i += 1) {
      const node = byNode.get(profile.samples[i])
      const cf = node.callFrame
      const key = `${cf.functionName || '(anonymous)'} @ ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`
      self.set(key, (self.get(key) ?? 0) + (deltas[i] ?? 0) / 1000)
    }
    const total = sum([...self.values()])
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
    out.push(`\n  CPU profile over scenario A (self time, ${fmt(total)}ms sampled):`)
    for (const [k, v] of top) out.push(`    ${fmt(v).padStart(7)}ms  ${(100 * v / total).toFixed(1).padStart(5)}%  ${k}`)
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const inclusive = new Map()
    for (let i = 0; i < profile.samples.length; i += 1) {
      const seen = new Set()
      let id = profile.samples[i]
      while (id !== undefined) {
        const cf = byNode.get(id).callFrame
        const name = cf.functionName || '(anonymous)'
        if (!seen.has(name)) { seen.add(name); inclusive.set(name, (inclusive.get(name) ?? 0) + (deltas[i] ?? 0) / 1000) }
        id = parent.get(id)
      }
    }
    const interest = ['paginate', 'lineSplit', 'getHTML', 'getHTMLFromFragment', 'serializeFragment', 'decorations', 'buildDecorations', 'descendants', 'forceRender', 'renderRootSync', 'performSyncWorkOnRoot', 'performWorkOnRoot', 'performConcurrentWorkOnRoot', 'dispatchTransaction', 'updateState', 'setPageBreaks', 'runTailCheck', 'countWords', 'performSave', 'applyPagination', 'updateStateInner', 'create', 'App', 'renderWithHooks', 'flushSyncCallbacks', 'flushSync', 'handleKeyDown', 'endComposition', 'readDOMChange']
    out.push(`  inclusive time (functions of interest):`)
    for (const name of interest) if (inclusive.has(name)) out.push(`    ${fmt(inclusive.get(name)).padStart(7)}ms  ${name}`)
    await writeFile(profileOut, JSON.stringify(profile))
  }

  cdp.close()
} catch (e) {
  out.push(`FAILED: ${e.stack ?? e}`)
} finally {
  child.kill()
}
const text = out.join('\n')
console.log(text)
await writeFile(join(resolve(base), `${label}.txt`), text)
