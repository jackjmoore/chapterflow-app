/**
 * Corpus intake.
 *
 *   1. Drop a .scriv folder, or one of Scrivener's .zip backups, into
 *      tools/scriv-import/corpus/
 *   2. npm run intake
 *   3. A report per project appears in tools/scriv-import/reports/
 *
 * Both directories are gitignored: a real project is somebody's manuscript and
 * has no business in version control.
 *
 * The report is deliberately STRUCTURAL. It surveys the shape of the project —
 * element names, folder types, sidecar filenames, and a census of every RTF
 * control word the writer emitted — because that is what settles the format
 * questions, and none of it requires reading the prose. Text appears only as
 * short truncated samples, enough to prove the decoding is right.
 *
 * Pass --text to include longer excerpts if a specific decoding problem needs
 * chasing. It is off by default on purpose.
 */
import { mkdir, readdir, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import { openProject, type ProjectSource } from './src/projectSource'
import { rtfToBlocks } from './src/rtfToBlocks'
import { scrivxToTree, collectTextNodes, documentPaths, type ScrivNode } from './src/scrivxToTree'
import { parseStylesXml, resolveStyleNames, styleTreatment } from './src/scrivenerStyles'

// This file runs from .build/ after bundling, so __dirname points one level
// too deep. The corpus and reports belong beside the source, not beside the
// bundle — otherwise a project dropped where the README says to put it is
// silently not found.
const bundleDir = __dirname
const here = basename(bundleDir) === '.build' ? dirname(bundleDir) : bundleDir
const CORPUS = join(here, 'corpus')
const REPORTS = join(here, 'reports')
const WANT_TEXT = process.argv.includes('--text')

const out: string[] = []
const say = (line = ''): void => {
  out.push(line)
}

/** Truncated hard, and whitespace-collapsed, so a sample is a sample. */
function sample(text: string, max = WANT_TEXT ? 400 : 90): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return JSON.stringify(flat.length > max ? flat.slice(0, max) + '…' : flat)
}

// --------------------------------------------------------------- the .scrivx

interface XmlSurvey {
  elements: Map<string, number>
  attrs: Map<string, Set<string>>
  typeValues: Map<string, number>
}

function surveyXml(xml: string): XmlSurvey {
  const elements = new Map<string, number>()
  const attrs = new Map<string, Set<string>>()
  const typeValues = new Map<string, number>()

  const tagRe = /<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*\/?>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(xml))) {
    const [, name, blob] = m
    elements.set(name, (elements.get(name) ?? 0) + 1)
    const set = attrs.get(name) ?? new Set<string>()
    const attrRe = /([\w.:-]+)\s*=\s*"([^"]*)"/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(blob))) {
      set.add(a[1])
      if (/^type$/i.test(a[1])) typeValues.set(a[2], (typeValues.get(a[2]) ?? 0) + 1)
    }
    attrs.set(name, set)
  }
  return { elements, attrs, typeValues }
}

/**
 * The binder as a tree, by structure alone.
 *
 * Deliberately regex-driven rather than a real XML parse: the point is to see
 * what the file actually contains before committing to an interpretation of
 * it. The real parser (scrivxToTree) comes after this has been read.
 */
function outlineBinder(xml: string, maxRows: number): string[] {
  const rows: string[] = []
  const openRe = /<BinderItem\b([^>]*)>|<\/BinderItem>/g
  let depth = 0
  let m: RegExpExecArray | null
  let truncated = 0

  while ((m = openRe.exec(xml))) {
    if (m[0] === '</BinderItem>') {
      depth = Math.max(0, depth - 1)
      continue
    }
    const attrs = m[1]
    const id = /\b(?:UUID|ID)\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '?'
    const type = /\bType\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '?'
    // The title follows as a child element.
    const after = xml.slice(m.index, m.index + 600)
    const title = /<Title>([\s\S]*?)<\/Title>/i.exec(after)?.[1]?.trim() ?? ''
    if (rows.length < maxRows) {
      rows.push(`${'  '.repeat(depth)}- [${type}] ${title || '(untitled)'}   ${id.slice(0, 8)}`)
    } else {
      truncated++
    }
    if (!/\/\s*>$/.test(m[0])) depth++
  }
  if (truncated > 0) rows.push(`  … and ${truncated} more items`)
  return rows
}

// ------------------------------------------------------------------ the RTFs

/**
 * Which RTF control words this writer actually emits, and how often.
 *
 * This is the single most useful thing in the report and it reveals no prose:
 * it says exactly what the parser has to handle, and — more usefully — what it
 * is currently ignoring. Anything frequent and unrecognised is a gap.
 */
function censusControlWords(rtf: Buffer, into: Map<string, number>): void {
  const text = rtf.toString('latin1')
  const re = /\\([A-Za-z]+)(-?\d+)?|\\'([0-9a-fA-F]{2})|\\([^A-Za-z0-9])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const word = m[1] ?? (m[3] !== undefined ? "'" : '\\' + m[4])
    into.set(word, (into.get(word) ?? 0) + 1)
  }
}

/** Control words the parser handles today, so the census can flag the rest. */
const KNOWN = new Set([
  'rtf', 'ansi', 'ansicpg', 'mac', 'pc', 'pca', 'uc', 'u', "'", 'bin',
  'b', 'i', 'ul', 'ulnone', 'plain', 'v', 'cf', 'highlight',
  'pard', 'par', 'line', 'page', 'ql', 'qc', 'qr', 'qj', 'qd',
  'outlinelevel', 'ls', 'ilvl', 'pnlvl', 'pnlvlblt', 'pnlvlbody',
  'pndec', 'pnucltr', 'pnlcltr', 'pnucrm', 'pnlcrm',
  'intbl', 'cell', 'nestcell', 'row', 'nestrow', 'trowd',
  'red', 'green', 'blue', 'colortbl', 'fonttbl', 'stylesheet', 'info',
  'listtext', 'pntext', 'listtable', 'listoverridetable', 'pn',
  'fldrslt', 'fldinst', 'field', 'footnote', 'annotation', 'pict', 'shppict',
  'emdash', 'endash', 'bullet', 'lquote', 'rquote', 'ldblquote', 'rdblquote',
  'tab', 'enspace', 'emspace', 'qmspace', 'zwj', 'zwnj', 'ltrmark', 'rtlmark',
  'fs', 'f', 'cb', 'lang', 'langfe', 'langnp', 'langfenp', 'noproof',
  'kerning', 'expnd', 'expndtw', 'charscalex', 'li', 'fi', 'ri', 'sa', 'sb',
  'sl', 'slmult', 'sect', 'sectd', 'itap', 'nowidctlpar', 'widctlpar',
  'hyphpar', 'keep', 'keepn', 'rtlch', 'ltrch', 'rtlpar', 'ltrpar',
  'deff', 'deflang', 'deflangfe', 'viewkind', 'nouicompat', 'formshade',
  'strike', 'striked', 'sub', 'super', 'scaps', 'caps', 'outl', 'shad', 'embo',
  'impr', 'generator', 'themedata', 'datastore', 'latentstyles', 'rsidtbl',
  // Font-table vocabulary: inside {\fonttbl}, which is skipped wholesale, so
  // these are handled by not being read at all. Listed to keep the gap list signal.
  'fnil', 'froman', 'fswiss', 'fmodern', 'fscript', 'fdecor', 'ftech', 'fbidi',
  'fcharset', 'fprq', 'cpg', 'panose', 'falt', 'stshfdbch', 'stshfloch',
  'stshfhich', 'stshfbi', 'ftnbj', 'aenddoc', 'trackformatting', 'trackmoves',
  '\\*', '\\~', '\\-', '\\_', '\\\\', '\\{', '\\}', '\\:'
])

// -------------------------------------------------------------- the report

async function surveyProject(source: ProjectSource): Promise<void> {
  say('='.repeat(72))
  say(`PROJECT: ${source.label}   (opened as a ${source.kind})`)
  say('='.repeat(72))

  const files = await source.list()
  say('')
  say(`${files.length} files.`)

  // --- version --------------------------------------------------------
  const hasData = files.some((f) => /^Files\/Data\//i.test(f))
  const hasDocs = files.some((f) => /^Files\/Docs\//i.test(f))
  say('')
  say('--- version ---')
  say(`  Files/Data/ present (Scrivener 3): ${hasData}`)
  say(`  Files/Docs/ present (Scrivener 2): ${hasDocs}`)
  if (hasDocs && !hasData) say('  >>> This looks like a Scrivener 2 project. V1 targets 3.')

  // --- top-level layout ------------------------------------------------
  const tops = new Map<string, number>()
  for (const f of files) {
    const head = f.split('/')[0]
    tops.set(head, (tops.get(head) ?? 0) + 1)
  }
  say('')
  say('--- top level ---')
  for (const [name, count] of [...tops].sort((a, b) => b[1] - a[1])) {
    say(`  ${String(count).padStart(6)}  ${name}`)
  }

  // --- per-document sidecars ------------------------------------------
  const sidecars = new Map<string, number>()
  for (const f of files) {
    const m = /^Files\/(?:Data|Docs)\/[^/]+\/(.+)$/i.exec(f)
    if (m) sidecars.set(m[1], (sidecars.get(m[1]) ?? 0) + 1)
  }
  if (sidecars.size > 0) {
    say('')
    say('--- per-document files (settles the sidecar naming question) ---')
    for (const [name, count] of [...sidecars].sort((a, b) => b[1] - a[1])) {
      say(`  ${String(count).padStart(6)}  ${name}`)
    }
  }

  // --- the manifest -----------------------------------------------------
  const manifestPath = files.find((f) => f.toLowerCase().endsWith('.scrivx'))
  if (!manifestPath) {
    say('')
    say('  >>> No .scrivx found. Is this a project bundle?')
  } else {
    const xml = await source.readText(manifestPath)
    const survey = surveyXml(xml)
    say('')
    say(`--- ${manifestPath} (${xml.length.toLocaleString()} chars) ---`)
    say('')
    say('  elements:')
    for (const [name, count] of [...survey.elements].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      const attrs = [...(survey.attrs.get(name) ?? [])]
      say(`  ${String(count).padStart(6)}  <${name}>${attrs.length ? '   attrs: ' + attrs.join(', ') : ''}`)
    }
    if (survey.typeValues.size > 0) {
      say('')
      say('  Type= values:')
      for (const [v, c] of [...survey.typeValues].sort((a, b) => b[1] - a[1])) {
        say(`  ${String(c).padStart(6)}  ${v}`)
      }
    }

    say('')
    say('  the VERIFY questions from the plan:')
    const binderAttrs = [...(survey.attrs.get('BinderItem') ?? [])]
    say(`    BinderItem exists:            ${survey.elements.has('BinderItem')}`)
    say(`    BinderItem attributes:        ${binderAttrs.join(', ') || '(none)'}`)
    say(`    <Title> as an element:        ${/<Title>/.test(xml)}`)
    say(`    Title= as an attribute:       ${/\bTitle\s*=\s*"/.test(xml)}`)
    say(`    <Children> wrapper element:   ${/<Children>/.test(xml)}`)
    say(`    <MetaData> present:           ${/<MetaData>/i.test(xml)}`)
    say(`    IncludeInCompile present:     ${/IncludeInCompile/i.test(xml)}`)
    say(`    LabelID / StatusID present:   ${/LabelID|StatusID/i.test(xml)}`)
    say(`    Keywords present:             ${/<Keywords>/i.test(xml)}`)

    say('')
    say('  binder outline (structure and titles only):')
    for (const row of outlineBinder(xml, 120)) say('    ' + row)
  }

  // --- the RTF bodies ---------------------------------------------------
  const rtfFiles = files.filter((f) => f.toLowerCase().endsWith('.rtf'))
  say('')
  say(`--- RTF bodies (${rtfFiles.length} files) ---`)

  const census = new Map<string, number>()
  const warningTotals = new Map<string, number>()
  let parsed = 0
  let failedFiles: string[] = []
  let totalBlocks = 0
  let totalWords = 0
  let biggest = { path: '', bytes: 0 }
  const samples: string[] = []

  for (const path of rtfFiles) {
    let buffer: Buffer
    try {
      buffer = await source.read(path)
    } catch {
      failedFiles.push(path + ' (unreadable)')
      continue
    }
    if (buffer.length > biggest.bytes) biggest = { path, bytes: buffer.length }
    censusControlWords(buffer, census)

    try {
      const { blocks, warnings } = await rtfToBlocks(buffer)
      parsed++
      totalBlocks += blocks.length
      for (const b of blocks) totalWords += b.runs.map((r) => r.text).join(' ').split(/\s+/).filter(Boolean).length
      for (const [k, v] of Object.entries(warnings)) {
        warningTotals.set(k, (warningTotals.get(k) ?? 0) + (v as number))
      }
      if (samples.length < 6 && blocks.length > 0) {
        const text = blocks.map((b) => b.runs.map((r) => r.text).join('')).join(' ')
        if (text.trim().length > 30) samples.push(`  ${path}\n    ${sample(text)}`)
      }
    } catch (error) {
      failedFiles.push(`${path} — ${(error as Error).message}`)
    }
  }

  say(`  parsed without throwing: ${parsed} of ${rtfFiles.length}`)
  say(`  total blocks: ${totalBlocks.toLocaleString()}   total words: ${totalWords.toLocaleString()}`)
  if (biggest.path) say(`  largest: ${biggest.path} (${biggest.bytes.toLocaleString()} bytes)`)

  if (failedFiles.length > 0) {
    say('')
    say('  >>> FAILURES:')
    for (const f of failedFiles.slice(0, 20)) say('      ' + f)
  }

  if (warningTotals.size > 0) {
    say('')
    say('  what the parser reported dropping, across every document:')
    for (const [k, v] of [...warningTotals].sort((a, b) => b[1] - a[1])) {
      say(`  ${String(v).padStart(6)}  ${k}`)
    }
  }

  // The gap list: what this writer emits that the parser has no case for.
  const unknown = [...census].filter(([w]) => !KNOWN.has(w)).sort((a, b) => b[1] - a[1])
  say('')
  say(`--- control words this writer emits that the parser does NOT handle (${unknown.length}) ---`)
  if (unknown.length === 0) say('  none — every control word in this project is accounted for.')
  for (const [word, count] of unknown.slice(0, 60)) {
    say(`  ${String(count).padStart(8)}  \\${word}`)
  }
  if (unknown.length > 60) say(`  … and ${unknown.length - 60} more`)

  say('')
  say('--- full control-word census (top 60) ---')
  for (const [word, count] of [...census].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
    say(`  ${String(count).padStart(8)}  \\${word}${KNOWN.has(word) ? '' : '   <-- unhandled'}`)
  }

  if (samples.length > 0) {
    say('')
    say(`--- decoding spot-checks (truncated${WANT_TEXT ? ', --text' : '; pass --text for longer'}) ---`)
    for (const s of samples) say(s)
  }

  // --- the real thing: parse the binder and resolve every document --------
  if (manifestPath) await dryRunImport(source, manifestPath, files)

  say('')
}

/**
 * A dry run of the actual import: parse the binder, resolve each document to
 * its files, apply its own style table, and report what would be produced.
 *
 * Writes nothing. This is what turns the survey from reconnaissance into a
 * verification that the importer would work on this project.
 */
async function dryRunImport(source: ProjectSource, manifestPath: string, files: string[]): Promise<void> {
  say('')
  say('='.repeat(72))
  say('DRY RUN — what the importer would produce (nothing is written)')
  say('='.repeat(72))

  const project = scrivxToTree(await source.readText(manifestPath))
  say('')
  say(`binder roots: ${project.roots.map((r) => `${r.title || '(untitled)'} [${r.kind}]`).join(', ')}`)
  if (project.problems.length > 0) {
    say('')
    say('  >>> problems parsing the binder:')
    for (const p of project.problems) say('      ' + p)
  }

  // Where each Scrivener root would land in ChapterFlow.
  say('')
  say('--- binder mapping ---')
  const CHAPTERFLOW_STRUCTURAL = ['draft', 'notes', 'matter', 'archive', 'trash']
  const notes: string[] = []
  for (const root of project.roots) {
    let destination: string
    if (root.kind === 'draft') destination = 'Draft'
    else if (root.kind === 'research') destination = 'Notes'
    else if (root.kind === 'trash') destination = 'Trash'
    else if (root.kind === 'text') {
      // ChapterFlow refuses a document at the binder root outright — moveNode
      // rejects it, and a stray root node is swept into Draft on next load.
      // So a root-level Scrivener document has to be wrapped.
      destination = 'a custom top-level folder WRAPPING it (see note)'
      notes.push(
        `"${root.title || '(untitled)'}" is a Type="Text" item at the binder root — a document, not a folder. ` +
          'ChapterFlow does not allow a document at the root, so it needs a folder of its own to live in.'
      )
    } else destination = 'a custom top-level folder'

    if (CHAPTERFLOW_STRUCTURAL.includes(root.title.trim().toLowerCase()) && root.kind !== 'draft' && root.kind !== 'research' && root.kind !== 'trash') {
      notes.push(
        `"${root.title}" collides by name with one of ChapterFlow's own protected folders. ` +
          'It would become a separate custom folder with the same name, which reads confusingly — worth a decision.'
      )
    }

    const docs = collectTextNodes([root]).length
    say(`  ${(root.title || '(untitled)').padEnd(28)} [${root.rawType}] -> ${destination}   (${docs} documents)`)
  }
  if (notes.length > 0) {
    say('')
    say('  >>> needs a decision:')
    for (const n of notes) say('      - ' + n)
  }

  // The project-wide style table.
  const stylesXmlPath = files.find((f) => /^Files\/styles\.xml$/i.test(f))
  const namesByUuid = stylesXmlPath ? parseStylesXml(await source.readText(stylesXmlPath)) : new Map<string, string>()
  say('')
  say(`--- named styles (${namesByUuid.size} defined in ${stylesXmlPath ?? 'nothing'}) ---`)
  for (const [, name] of namesByUuid) {
    const t = styleTreatment(name)
    const effect = !t
      ? 'no block-level effect'
      : t.kind === 'heading'
        ? `heading level ${t.level}`
        : t.kind === 'blockquote'
          ? 'blockquote'
          : t.kind === 'paragraph'
            ? `paragraph${t.align ? ', ' + t.align : ''}`
            : 'no schema equivalent — reported as dropped'
    say(`  ${name.padEnd(20)} -> ${effect}`)
  }

  // Every text document, through the real pipeline.
  const textNodes = collectTextNodes(project.roots)
  let withContent = 0
  let missingContent = 0
  let withStyles = 0
  let withSynopsis = 0
  let withNotes = 0
  const kinds = new Map<string, number>()
  const warnings = new Map<string, number>()
  const headingsSeen: string[] = []
  let words = 0
  let failures = 0

  for (const node of textNodes) {
    const paths = documentPaths(node.uuid)
    if (!(await source.exists(paths.content))) {
      missingContent++
      continue
    }
    withContent++
    if (await source.exists(paths.synopsis)) withSynopsis++
    if (await source.exists(paths.notes)) withNotes++

    let styleNames = new Map<number, string>()
    if (await source.exists(paths.styles)) {
      withStyles++
      styleNames = resolveStyleNames(await source.readText(paths.styles), namesByUuid)
    }

    try {
      const { blocks, warnings: w } = await rtfToBlocks(await source.read(paths.content), { styleNames })
      for (const b of blocks) {
        const key = b.kind === 'heading' ? `heading${b.level ?? '?'}` : b.kind
        kinds.set(key, (kinds.get(key) ?? 0) + 1)
        words += b.runs.map((r) => r.text).join(' ').split(/\s+/).filter(Boolean).length
        if (b.kind === 'heading' && headingsSeen.length < 8) {
          headingsSeen.push(sample(b.runs.map((r) => r.text).join(''), 60))
        }
      }
      for (const [k, v] of Object.entries(w)) warnings.set(k, (warnings.get(k) ?? 0) + (v as number))
    } catch (error) {
      failures++
      say(`  >>> ${node.title} (${node.uuid.slice(0, 8)}) threw: ${(error as Error).message}`)
    }
  }

  say('')
  say('--- documents ---')
  say(`  text items in the binder:      ${textNodes.length}`)
  say(`  with a content.rtf:            ${withContent}`)
  say(`  with no content.rtf:           ${missingContent}`)
  say(`  with a content.styles:         ${withStyles}`)
  say(`  with a synopsis.txt:           ${withSynopsis}`)
  say(`  with a notes.rtf:              ${withNotes}`)
  say(`  threw while parsing:           ${failures}`)
  say(`  words that would be imported:  ${words.toLocaleString()}`)

  say('')
  say('--- blocks that would be produced ---')
  for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) {
    say(`  ${String(count).padStart(7)}  ${kind}`)
  }

  if (headingsSeen.length > 0) {
    say('')
    say('--- headings recovered from named styles ---')
    for (const h of headingsSeen) say('  ' + h)
  }

  say('')
  if (warnings.size === 0) {
    say('--- nothing would be dropped ---')
  } else {
    say('--- what would be reported as dropped ---')
    for (const [k, v] of [...warnings].sort((a, b) => b[1] - a[1])) {
      say(`  ${String(v).padStart(7)}  ${k}`)
    }
  }

  // The marker leak, checked explicitly: it is the one defect a real project
  // found, so the report should never stop looking for it.
  say('')
  const leaked = await checkForMarkerLeak(source, textNodes)
  say(leaked === 0 ? '--- no Scrivener markers leaked into the prose ---' : `  >>> ${leaked} documents still leak a <$Scr_...> marker`)
}

async function checkForMarkerLeak(source: ProjectSource, nodes: ScrivNode[]): Promise<number> {
  let leaked = 0
  for (const node of nodes) {
    const path = documentPaths(node.uuid).content
    if (!(await source.exists(path))) continue
    try {
      const { blocks } = await rtfToBlocks(await source.read(path))
      const text = blocks.map((b) => b.runs.map((r) => r.text).join('')).join(' ')
      if (/<!?\$Scr_/.test(text)) leaked++
    } catch {
      // A throw is already reported by the dry run.
    }
  }
  return leaked
}

// ------------------------------------------------------------------- driver

async function main(): Promise<void> {
  await mkdir(CORPUS, { recursive: true })
  await mkdir(REPORTS, { recursive: true })

  const explicit = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  let targets: string[]

  if (explicit.length > 0) {
    targets = explicit
  } else {
    const entries = await readdir(CORPUS).catch(() => [] as string[])
    targets = entries
      .filter((n) => !n.startsWith('.') && n !== 'README.md')
      .map((n) => join(CORPUS, n))
      .filter((p) => p.toLowerCase().endsWith('.scriv') || p.toLowerCase().endsWith('.zip') || existsSync(p))
  }

  if (targets.length === 0) {
    console.log('Nothing to survey.')
    console.log('')
    console.log('Drop a .scriv folder or a Scrivener .zip backup into:')
    console.log('  ' + CORPUS)
    console.log('then run: npm run intake')
    console.log('')
    console.log('Or point it straight at one: npm run intake -- "D:/path/My Novel.scriv"')
    return
  }

  for (const target of targets) {
    const info = await stat(target).catch(() => null)
    if (!info) {
      console.log('skipping (not found): ' + target)
      continue
    }
    if (info.isDirectory() && !target.toLowerCase().endsWith('.scriv')) {
      // A plain folder someone dropped a project inside — look one level in.
      const inner = (await readdir(target)).map((n) => join(target, n))
      const candidate = inner.find((p) => p.toLowerCase().endsWith('.scriv'))
      if (!candidate) {
        console.log(`skipping ${basename(target)}: no .scriv inside`)
        continue
      }
      targets.push(candidate)
      continue
    }

    out.length = 0
    const label = basename(target)
    console.log('surveying ' + label + ' …')
    try {
      const source = await openProject(target, label)
      await surveyProject(source)
    } catch (error) {
      say('SURVEY FAILED: ' + ((error as Error)?.stack ?? error))
    }

    const reportPath = join(REPORTS, label.replace(/[^\w.-]+/g, '_') + '.survey.txt')
    await writeFile(reportPath, out.join('\n'), 'utf-8')
    console.log('  -> ' + reportPath)
  }

  console.log('')
  console.log('Done. The reports contain structure, a control-word census and short')
  console.log('decoding samples — not the manuscript.')
}

main().catch((error) => {
  console.error('intake failed: ' + ((error as Error)?.stack ?? error))
  process.exit(1)
})
