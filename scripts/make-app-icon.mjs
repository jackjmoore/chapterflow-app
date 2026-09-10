// Generates the OS app icon — build/icon.ico (Windows), build/icon.png
// (Linux/mac fallback, 512px), resources/icon.png (dev BrowserWindow icon).
//
// The artwork is the heron mark from src/renderer/src/icons.tsx (HERON_*
// path constants — change one side, regenerate the other), rasterized on a
// fixed paper-and-ink tile. Fixed rather than theme-tinted, deliberately: an
// OS icon renders on the taskbar/Start menu against arbitrary wallpapers and
// never re-renders when the in-app theme changes, so it carries the brand's
// paper-and-ink identity instead of chasing a live preset.
//
// Rasterization needs a browser engine, so this connects to the running dev
// app (npm run dev with --remote-debugging-port=9222) and renders in its
// page — the same CDP channel the live checks use. Run it, then commit the
// regenerated binaries.
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const INK = '#2A2620'
const PAPER = '#F3EEE4'
// Keep in sync with icons.tsx (HERON_BODY / HERON_LEG / HERON_WATER).
const BODY =
  'M2.5,12 L17,9.8 C19,9.4 23,9 25.5,9.2 L31,10.8 L26.6,12.6 ' +
  'C28.6,15.5 28.2,18 27.4,21 C26.6,24.8 27.2,28.5 31,31.8 ' +
  'C34,34.4 38,35.8 42,36.4 C49,37.5 54.5,40 58,44 ' +
  'C56,45.5 54,46.2 52,46.5 C46,48.5 38,48 33,45.5 ' +
  'C28.5,43 26,39 25.5,34 C25.2,29.5 23.8,24.5 22.4,20.4 ' +
  'C21.6,17.8 22.8,15.4 24.6,13.8 L17.5,12.6 Z'
const LEG = 'M42,47.5 L43,53 L41.5,58'
const WATER = 'M12,58 L54,58'

// The tile: paper rounded square, glyph inset 8% and lifted 2% so the
// waterline keeps clear of the corner radius.
function tileSvg(px) {
  const r = Math.round(px * 0.17)
  const inset = px * 0.08
  const glyph = px * 0.84
  const scale = glyph / 64
  // Size-specific hinting: the glyph renders at px*0.84/64 scale, so a
  // 2.4-unit stroke is under one device pixel below ~48px and antialiases to
  // a grey smudge. Thicken so leg and waterline hold ≥1.2 rendered px.
  const sw = Math.max(2.4, 1.2 / ((px * 0.84) / 64))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
    <rect width="${px}" height="${px}" rx="${r}" fill="${PAPER}"/>
    <g transform="translate(${inset},${inset - px * 0.02}) scale(${scale})" fill="none">
      <path d="${BODY}" fill="${INK}"/>
      <g stroke="${INK}" stroke-width="${sw}" stroke-linecap="round">
        <path d="${LEG}"/><path d="${WATER}"/>
      </g>
    </g>
  </svg>`
}

async function cdp() {
  const list = await fetch('http://127.0.0.1:9222/json').then((r) => r.json())
  const page = list.find((t) => t.type === 'page' && t.title !== 'DevTools')
  if (!page) throw new Error('dev app not reachable on :9222 — start it first')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  }
  await new Promise((r) => (ws.onopen = r))
  return {
    close: () => ws.close(),
    evaluate: (expression) =>
      new Promise((resolve, reject) => {
        const m = ++id
        pending.set(m, { resolve, reject })
        ws.send(
          JSON.stringify({
            id: m,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true }
          })
        )
      })
  }
}

// Render one SVG string to a PNG buffer at its declared size, in the page.
async function renderPng(session, svg, px) {
  const expr = `
    (async () => {
      const img = new Image()
      const url = 'data:image/svg+xml;base64,' + btoa(${JSON.stringify(svg)})
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
      const canvas = new OffscreenCanvas(${px}, ${px})
      canvas.getContext('2d').drawImage(img, 0, 0, ${px}, ${px})
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const buf = await blob.arrayBuffer()
      return btoa(String.fromCharCode(...new Uint8Array(buf)))
    })()
  `
  const result = await session.evaluate(expr)
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return Buffer.from(result.result.value, 'base64')
}

// Modern ICO: a directory of PNG-compressed entries (supported since Vista).
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(({ px, png }, i) => {
    const base = i * 16
    dir.writeUInt8(px >= 256 ? 0 : px, base) // width (0 = 256)
    dir.writeUInt8(px >= 256 ? 0 : px, base + 1) // height
    dir.writeUInt8(0, base + 2) // palette
    dir.writeUInt8(0, base + 3) // reserved
    dir.writeUInt16LE(1, base + 4) // planes
    dir.writeUInt16LE(32, base + 6) // bpp
    dir.writeUInt32LE(png.length, base + 8)
    dir.writeUInt32LE(offset, base + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

const session = await cdp()
try {
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const entries = []
  for (const px of icoSizes) {
    entries.push({ px, png: await renderPng(session, tileSvg(px), px) })
  }
  mkdirSync(join(root, 'build'), { recursive: true })
  mkdirSync(join(root, 'resources'), { recursive: true })
  writeFileSync(join(root, 'build', 'icon.ico'), buildIco(entries))
  writeFileSync(join(root, 'build', 'icon.png'), await renderPng(session, tileSvg(512), 512))
  writeFileSync(join(root, 'resources', 'icon.png'), entries.find((e) => e.px === 256).png)
  console.log('wrote build/icon.ico (' + icoSizes.join(',') + '), build/icon.png (512), resources/icon.png (256)')
} finally {
  session.close()
}
