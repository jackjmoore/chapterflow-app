// Where the native (non-JavaScript) main-thread time goes while typing:
// Chromium's own trace of layout, style, paint and event dispatch, aggregated
// by event name over a typing burst at the end of the 100k-word document.
//   node trace.mjs <base dir>
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createRequire } from 'node:module'

import { fileURLToPath } from 'node:url'
const APP = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const electronBinary = createRequire(join(APP, 'package.json'))('electron')
const PORT = 9381
const base = process.argv[2]
const fine = process.argv.includes('--fine')
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electronBinary, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${resolve(base, 'userdata')}`, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'], { cwd: APP, stdio: 'ignore', env })

let target
for (let i = 0; i < 100 && !target; i += 1) {
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = list.find((t) => t.type === 'page' && String(t.url).includes('index.html')) } catch {}
  if (!target) await sleep(400)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 1; const pending = new Map(); const events = []; let complete = null
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(String(ev.data))
  if (m.method === 'Tracing.dataCollected') { events.push(...m.params.value); return }
  if (m.method === 'Tracing.tracingComplete') { complete?.(); return }
  const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) }
})
const send = (method, params = {}) => new Promise((r) => { pending.set(id, r); ws.send(JSON.stringify({ id: id++, method, params })) })
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value

for (let i = 0; i < 80; i += 1) { if (await evaluate(`!!document.querySelector('.page-stack .ProseMirror')`)) break; await sleep(500) }
await sleep(4000)
await evaluate(`(() => {
  const pm = document.querySelector('.page-stack .ProseMirror'); pm.focus()
  const r = document.createRange(); r.selectNodeContents(pm); r.collapse(false)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  pm.lastElementChild?.scrollIntoView({ block: 'end' }); return true
})()`)
await sleep(600)

await send('Tracing.start', { categories: fine ? 'blink,blink_style,blink.debug,disabled-by-default-blink.debug,disabled-by-default-blink.debug.layout,devtools.timeline,disabled-by-default-devtools.timeline,input,renderer,cc,accessibility' : 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' })
const text = 'and then she kept writing without stopping to look back at the page, and the lamp held. '.repeat(2)
const keyTimes = []
for (const ch of text) {
  const upper = ch.toUpperCase(); const isLetter = /[a-z]/i.test(ch)
  const p = { key: ch, code: isLetter ? `Key${upper}` : ch === ' ' ? 'Space' : ch === '.' ? 'Period' : 'Comma', windowsVirtualKeyCode: isLetter ? upper.charCodeAt(0) : { ' ': 32, '.': 190, ',': 188 }[ch], text: ch }
  const t0 = performance.now()
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p, nativeVirtualKeyCode: p.windowsVirtualKeyCode })
  keyTimes.push(performance.now() - t0)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: p.key, code: p.code, windowsVirtualKeyCode: p.windowsVirtualKeyCode })
  await sleep(60)
}
await sleep(800)
const done = new Promise((r) => { complete = r })
await send('Tracing.end')
await done

// Aggregate complete events ('X') by name, main renderer thread only.
const byName = new Map()
const counts = new Map()
for (const e of events) {
  if (e.ph !== 'X' || typeof e.dur !== 'number') continue
  if (e.cat && e.cat.includes('blink.user_timing')) continue
  byName.set(e.name, (byName.get(e.name) ?? 0) + e.dur / 1000)
  counts.set(e.name, (counts.get(e.name) ?? 0) + 1)
}
const sorted = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, fine ? 60 : 25)
const keys = keyTimes.length
console.log(`keystrokes ${keys}: p50 ${[...keyTimes].sort((a, b) => a - b)[Math.floor(keys / 2)].toFixed(1)}ms`)
console.log('total ms by trace event (nested events overlap; per-keystroke = total / keystrokes):')
for (const [name, ms] of sorted) console.log(`  ${ms.toFixed(0).padStart(7)}ms  ${(ms / keys).toFixed(2).padStart(6)}ms/key  ×${counts.get(name)}  ${name}`)
// Layout events carry the dirty node count in args.
const layouts = events.filter((e) => e.name === 'Layout' && e.ph === 'X')
const dirty = layouts.map((e) => e.args?.beginData?.dirtyObjects ?? 0)
const total = layouts.map((e) => e.args?.beginData?.totalObjects ?? 0)
if (layouts.length) console.log(`Layout: ${layouts.length} events, mean dirty objects ${(dirty.reduce((a, b) => a + b, 0) / layouts.length).toFixed(0)} of ${(total.reduce((a, b) => a + b, 0) / layouts.length).toFixed(0)}, mean ${(byName.get('Layout') / layouts.length).toFixed(2)}ms`)
ws.close(); child.kill()
