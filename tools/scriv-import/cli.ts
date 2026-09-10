/**
 * The refinement harness.
 *
 *   node .build/cli.cjs <file.rtf>        parse one RTF and show what came out
 *   node .build/cli.cjs <project.scriv>   report what is actually inside a
 *                                         Scrivener project
 *
 * The second mode deliberately parses nothing. Every element name in the
 * .scrivx is inference until a real project turns up, so this reports the
 * shape it finds — element names, attributes, folder types, sidecar files —
 * rather than pretending to understand it. It is how the corpus gets turned
 * into facts.
 */
import { readFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, extname, join, relative } from 'path'
import { rtfToBlocks } from './src/rtfToBlocks'
import { blocksToHtml } from '../../src/main/export/blocksToHtml'

const target = process.argv[2]
const flags = new Set(process.argv.slice(3))

function bail(message: string): never {
  console.error(message)
  process.exit(1)
}

// ---------------------------------------------------------------- RTF mode

async function reportRtf(path: string): Promise<void> {
  const buffer = await readFile(path)
  const started = Date.now()
  const { blocks, warnings } = await rtfToBlocks(buffer)
  const ms = Date.now() - started

  console.log(`${basename(path)} — ${buffer.length.toLocaleString()} bytes, parsed in ${ms}ms`)
  console.log(`${blocks.length} block${blocks.length === 1 ? '' : 's'}`)

  const kinds = new Map<string, number>()
  for (const b of blocks) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1)
  console.log('  ' + [...kinds].map(([k, n]) => `${k} ${n}`).join(', '))

  const words = blocks
    .flatMap((b) => b.runs.map((r) => r.text))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
  console.log(`  ${words.toLocaleString()} words`)

  const warned = Object.entries(warnings)
  console.log('')
  if (warned.length === 0) {
    console.log('Nothing was dropped on the way in.')
  } else {
    console.log('What changed on the way in:')
    for (const [kind, count] of warned) console.log(`  ${count}  ${kind}`)
  }

  if (flags.has('--html')) {
    console.log('\n--- HTML ---')
    console.log(blocksToHtml(blocks, { paragraphWrappedNodes: true }))
  } else if (flags.has('--blocks')) {
    console.log('\n--- blocks ---')
    console.log(JSON.stringify(blocks, null, 1))
  } else {
    console.log('\n--- first 15 blocks ---')
    for (const b of blocks.slice(0, 15)) {
      const text = b.runs.map((r) => r.text).join('')
      const marks = b.runs.some((r) => r.bold || r.italic || r.underline) ? ' *' : '  '
      const align = b.align ? ` [${b.align}]` : ''
      console.log(`  ${b.kind.padEnd(10)}${marks}${align} ${JSON.stringify(text.slice(0, 90))}`)
    }
    if (blocks.length > 15) console.log(`  … and ${blocks.length - 15} more`)
    console.log('\n(--html or --blocks for the full output)')
  }
}

// ------------------------------------------------------------- .scriv mode

async function walk(dir: string, root: string, out: string[], depth = 0): Promise<void> {
  if (depth > 6) return
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const name of entries.sort()) {
    const full = join(dir, name)
    const info = await stat(full).catch(() => null)
    if (!info) continue
    if (info.isDirectory()) {
      out.push(relative(root, full) + '/')
      await walk(full, root, out, depth + 1)
    } else {
      out.push(`${relative(root, full)}  (${info.size.toLocaleString()} bytes)`)
    }
  }
}

/** Element names, their attribute names, and the values seen for Type. A
 *  frequency report, not a parse — this is what settles the VERIFY questions. */
function surveyXml(xml: string): void {
  const elements = new Map<string, number>()
  const attrsByElement = new Map<string, Set<string>>()
  const typeValues = new Map<string, number>()

  const tagRe = /<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*\/?>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(xml))) {
    const [, name, attrBlob] = m
    elements.set(name, (elements.get(name) ?? 0) + 1)
    const set = attrsByElement.get(name) ?? new Set<string>()
    const attrRe = /([\w.:-]+)\s*=\s*"([^"]*)"/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(attrBlob))) {
      set.add(a[1])
      if (/^type$/i.test(a[1])) typeValues.set(a[2], (typeValues.get(a[2]) ?? 0) + 1)
    }
    attrsByElement.set(name, set)
  }

  console.log('\n--- elements in the .scrivx ---')
  for (const [name, count] of [...elements].sort((x, y) => y[1] - x[1])) {
    const attrs = [...(attrsByElement.get(name) ?? [])]
    console.log(`  ${String(count).padStart(5)}  <${name}>${attrs.length ? '  attrs: ' + attrs.join(', ') : ''}`)
  }

  if (typeValues.size > 0) {
    console.log('\n--- Type= values ---')
    for (const [value, count] of [...typeValues].sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(count).padStart(5)}  ${value}`)
    }
  }

  const idAttr = [...(attrsByElement.get('BinderItem') ?? [])].filter((a) => /^(uuid|id)$/i.test(a))
  console.log('\n--- the VERIFY questions ---')
  console.log(`  BinderItem identity attribute: ${idAttr.length ? idAttr.join(' / ') : 'NOT FOUND — check the element name'}`)
  console.log(`  <Title> as an element: ${/<Title>/.test(xml) ? 'yes' : 'no'}`)
  console.log(`  Title= as an attribute: ${/\bTitle\s*=\s*"/.test(xml) ? 'yes' : 'no'}`)
}

async function reportScriv(root: string): Promise<void> {
  console.log(`${basename(root)} — reconnaissance only, nothing is parsed or written\n`)

  const files: string[] = []
  await walk(root, root, files)

  const scrivx = files.find((f) => f.toLowerCase().endsWith('.scrivx'))
  console.log(`--- layout (${files.length} entries) ---`)
  for (const f of files.slice(0, 60)) console.log('  ' + f)
  if (files.length > 60) console.log(`  … and ${files.length - 60} more`)

  // Scrivener 2 kept content at Files/Docs/<int>.rtf; 3 uses
  // Files/Data/<UUID>/content.rtf. Telling them apart matters because V1
  // targets 3 and should refuse 2 rather than half-import it.
  const looksV3 = files.some((f) => /^Files[\\/]Data[\\/]/i.test(f))
  const looksV2 = files.some((f) => /^Files[\\/]Docs[\\/]/i.test(f))
  console.log('\n--- version ---')
  console.log(`  Files/Data/ present (Scrivener 3): ${looksV3}`)
  console.log(`  Files/Docs/ present (Scrivener 2): ${looksV2}`)

  const sidecars = new Map<string, number>()
  for (const f of files) {
    const m = /Files[\\/]Data[\\/][^\\/]+[\\/](.+)$/i.exec(f)
    if (m) {
      const name = m[1].replace(/\s+\(.*$/, '')
      sidecars.set(name, (sidecars.get(name) ?? 0) + 1)
    }
  }
  if (sidecars.size > 0) {
    console.log('\n--- per-document files (the sidecar VERIFY question) ---')
    for (const [name, count] of [...sidecars].sort((x, y) => y[1] - x[1])) {
      console.log(`  ${String(count).padStart(5)}  ${name}`)
    }
  }

  if (!scrivx) {
    console.log('\nNo .scrivx found at the root — is this really a project bundle?')
    return
  }
  const xml = await readFile(join(root, scrivx), 'utf-8')
  console.log(`\n.scrivx: ${scrivx} (${xml.length.toLocaleString()} chars)`)
  surveyXml(xml)

  // One real content.rtf, run through the parser, as a smoke test.
  const firstRtf = files.find((f) => f.toLowerCase().endsWith('content.rtf'))
  if (firstRtf) {
    console.log(`\n--- parsing one real content.rtf: ${firstRtf} ---`)
    await reportRtf(join(root, firstRtf))
  }
}

// ---------------------------------------------------------------- dispatch

async function main(): Promise<void> {
  if (!target) {
    bail('usage: cli.cjs <file.rtf | project.scriv> [--html | --blocks]')
  }
  if (!existsSync(target)) bail(`not found: ${target}`)

  const info = await stat(target)
  if (info.isDirectory()) return reportScriv(target)
  if (extname(target).toLowerCase() === '.rtf') return reportRtf(target)
  bail(`don't know what to do with ${extname(target) || 'that'} — expected .rtf or a .scriv folder`)
}

main().catch((error) => {
  console.error('failed: ' + ((error as Error)?.stack ?? error))
  process.exit(1)
})
