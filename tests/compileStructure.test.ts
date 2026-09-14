/**
 * Compile structure, for the three formats that need no Electron.
 *
 * `compileStore.test.ts` already proves a compile runs end to end and lands in
 * `compiles/`. What it does not ask is whether the thing that landed is the
 * manuscript: it compiles three short documents and looks at the record. This
 * suite asks the other question, against the generator's Realistic shape —
 * 48 chapters in four parts, 120,000 planted Draft words — and a truth file
 * that says what every document contains.
 *
 * Five properties, each of which a compile can break silently:
 *
 *   1. the output has one section per node in the compile scope, and no more —
 *      a dropped chapter and a chapter compiled twice both read as a plausible
 *      manuscript;
 *   2. the words that arrive are the words that were planted, to a stated
 *      tolerance;
 *   3. the last paragraph of the last document is there — truncation at the
 *      end of a long assembly is the failure nobody notices until an agent
 *      does;
 *   4. an empty document still gives its section, rather than vanishing and
 *      taking its heading with it;
 *   5. front matter precedes the Contents, back matter follows the manuscript,
 *      and neither is counted as manuscript words.
 *
 * Hosted in plain Node. Nothing on the txt/md/docx path opens a BrowserWindow;
 * the only thing that needed Electron was `projectRoot` reading `app.getPath`
 * at module load, and `tests/electronForNode.ts` stands in for that at bundle
 * time. The PDF path, which genuinely needs a window, is row 4B's.
 *
 * Everything happens inside a temp directory the suite makes and removes.
 */
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import JSZip from 'jszip'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import * as documentStore from '../src/main/documentStore'
import { renderProjectCompile } from '../src/main/export'
import { filterTreeByScope, type CompileScope } from '../src/shared/compile'
import { draftChildren, flattenBinderOutline, matterFolder, type BinderNode } from '../src/shared/binder'
import { countWords } from '../src/shared/wordCount'
import type { ExportOptions } from '../src/shared/export'
import { writeFixture, type FixtureTruth } from '../scripts/make-fixture-project.mjs'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

/**
 * Word parity, stated rather than discovered.
 *
 * The count a compile records is body words only — `blocksToPlainText` over
 * every non-matter document section — so it is compared against the planted
 * Draft total exactly: both sides are `countWords` over the same visible text,
 * and any difference at all is a renderer eating or inventing a word.
 *
 * The artifacts themselves carry scaffolding the manuscript does not: the
 * project title, the word "Contents", every Contents entry, and every section
 * heading, each of which is words on the page. That is bounded by the
 * structure, not by the prose, so it is allowed a percentage of the body
 * rather than being predicted: 2% is roughly four times what Realistic's 52
 * headings and 52 Contents entries actually cost, and still far below one
 * missing chapter (2.1% of the manuscript).
 */
const BODY_WORD_TOLERANCE = 0
const ARTIFACT_WORD_TOLERANCE = 0.02

const OPTIONS: ExportOptions = {
  preset: 'standard',
  pageSize: 'a4',
  marginMm: 20,
  authorName: 'Fixture Author',
  title: 'Fixture'
}

// ---- reading the three artifacts ------------------------------------------

interface DocxParagraph {
  /** 'Heading1'…'Heading3' for a heading paragraph, null for body. */
  style: string | null
  text: string
}

const XML_ENTITIES: Array<[RegExp, string]> = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&amp;/g, '&']
]

function decodeXml(text: string): string {
  let out = text
  for (const [pattern, replacement] of XML_ENTITIES) out = out.replace(pattern, replacement)
  return out
}

/**
 * The paragraphs of a .docx in document order, with their heading style.
 *
 * Read out of the real OOXML rather than trusted from the builder, for the
 * same reason `export.test.ts` unzips its packages: a heading that did not
 * make it into `word/document.xml` is a chapter Word will not show, and only
 * the XML says whether it is there.
 */
async function docxParagraphs(buffer: Buffer): Promise<DocxParagraph[]> {
  const zip = await JSZip.loadAsync(buffer)
  const entry = zip.file('word/document.xml')
  if (!entry) return []
  const xml = await entry.async('string')
  return [...xml.matchAll(/<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match) => {
    const body = match[1]
    const style = /<w:pStyle w:val="([^"]+)"/.exec(body)?.[1] ?? null
    const text = [...body.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((run) => decodeXml(run[1]))
      .join('')
    return { style, text }
  })
}

/** Every ATX heading in a Markdown artifact, structural and body alike. */
function mdHeadings(md: string): Array<{ level: number; text: string }> {
  return md
    .split('\n')
    .map((line) => /^(#{1,6}) (.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ level: match[1].length, text: match[2] }))
}

/** The `-----` rules a plain-text artifact puts under each section title. */
function txtSectionRules(txt: string): number {
  return txt.split('\n').filter((line) => /^-+$/.test(line)).length
}

/** The Contents block of a plain-text artifact: the `- ` lines before the
 *  first section rule. */
function txtContentsEntries(txt: string): string[] {
  const lines = txt.split('\n')
  const firstRule = lines.findIndex((line) => /^-+$/.test(line))
  const end = firstRule === -1 ? lines.length : firstRule
  return lines
    .slice(0, end)
    .filter((line) => /^ *- /.test(line))
    .map((line) => line.replace(/^ *- /, ''))
}

/** The same block in a Markdown artifact: the `- ` lines between the
 *  `## Contents` heading and the heading after it. */
function mdContentsEntries(md: string): string[] {
  const lines = md.split('\n')
  const start = lines.findIndex((line) => line === '## Contents')
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const next = rest.findIndex((line) => /^#{1,6} /.test(line))
  return (next === -1 ? rest : rest.slice(0, next))
    .filter((line) => /^ *- /.test(line))
    .map((line) => line.replace(/^ *- /, ''))
}

// ---- rendering -------------------------------------------------------------

interface Rendered {
  txt: string
  md: string
  docx: DocxParagraph[]
  /** The body word count the compile record would store, per format. */
  wordCount: number
}

/** One compile per format, through the same call the compile:run handler
 *  makes — scope already applied, matter passed as its own groups. */
async function renderThree(
  tree: BinderNode[],
  matter: { front: BinderNode[]; back: BinderNode[] } = { front: [], back: [] },
  projectName = 'Fixture'
): Promise<Rendered> {
  const options = { ...OPTIONS, title: projectName }
  const txt = await renderProjectCompile(tree, projectName, 'txt', options, matter)
  const md = await renderProjectCompile(tree, projectName, 'md', options, matter)
  const docx = await renderProjectCompile(tree, projectName, 'docx', options, matter)
  return {
    txt: txt.output.toString('utf-8'),
    md: md.output.toString('utf-8'),
    docx: await docxParagraphs(docx.output),
    wordCount: txt.wordCount
  }
}

// ---- small helpers ---------------------------------------------------------

/** Flattens without throwing on a shape it did not expect, so a defect
 *  arrives as a failed assertion rather than abandoning the sections after
 *  it — the lesson of 2026-09-11, 2026-09-12 and 2026-09-13. */
function nodesOf(tree: BinderNode[] | undefined): BinderNode[] {
  const out: BinderNode[] = []
  const walk = (list: BinderNode[] | undefined): void => {
    if (!Array.isArray(list)) return
    for (const node of list) {
      if (!node) continue
      out.push(node)
      walk(node.children)
    }
  }
  walk(tree)
  return out
}

function titlesOf(tree: BinderNode[]): string[] {
  return flattenBinderOutline(tree).map((entry) => entry.title)
}

/** Heading paragraphs whose text is one of the binder titles in scope —
 *  the structural headings, as opposed to a document's own `<h1>`. */
function structuralDocxHeadings(paragraphs: DocxParagraph[], titles: Set<string>): DocxParagraph[] {
  return paragraphs.filter((p) => p.style?.startsWith('Heading') === true && titles.has(p.text))
}

function structuralMdHeadings(md: string, titles: Set<string>): Array<{ level: number; text: string }> {
  return mdHeadings(md).filter((heading) => titles.has(heading.text))
}

/** The visible text of the last `<p>` in a document's saved HTML. */
function lastParagraphOf(html: string): string {
  const paragraphs = [...html.matchAll(/<p(?: [^>]*)?>([\s\S]*?)<\/p>/g)].map((m) => m[1])
  const last = paragraphs[paragraphs.length - 1] ?? ''
  return last.replace(/<[^>]*>/g, '').trim()
}

function within(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= Math.max(1, expected * tolerance)
}

// ---- 1. section count against scope ---------------------------------------

async function sectionCounts(report: TestReport, tree: BinderNode[], truth: FixtureTruth): Promise<void> {
  section(report, 'one section per node in scope')

  const draft = draftChildren(tree)
  const allTitles = titlesOf(draft)
  const expected = allTitles.length
  const full = await renderThree(draft, undefined, truth.projectName)
  const titleSet = new Set(allTitles)

  assert(
    report,
    expected === 52 && truth.totals.draftDocuments === 48,
    `the Realistic shape is 4 parts and 48 chapters, 52 nodes in all (got ${expected} nodes, ${truth.totals.draftDocuments} documents)`
  )
  assert(report, full.txt.length > 0 && full.md.length > 0 && full.docx.length > 0, 'all three formats produced output')

  assert(
    report,
    txtSectionRules(full.txt) === expected,
    `txt: one underlined section title per node (${txtSectionRules(full.txt)} of ${expected})`
  )
  const fullMd = structuralMdHeadings(full.md, titleSet)
  assert(report, fullMd.length === expected, `md: one heading per node (${fullMd.length} of ${expected})`)
  const fullDocx = structuralDocxHeadings(full.docx, titleSet)
  assert(report, fullDocx.length === expected, `docx: one heading paragraph per node (${fullDocx.length} of ${expected})`)

  assert(
    report,
    txtContentsEntries(full.txt).length === expected && mdContentsEntries(full.md).length === expected,
    `the Contents lists every node once (txt ${txtContentsEntries(full.txt).length}, md ${mdContentsEntries(full.md).length} of ${expected})`
  )

  // Depth survives: a part is a level-1 heading and its chapters level 2, in
  // every format that can express a level.
  const partTitles = new Set(draft.filter((node) => node.type === 'folder').map((node) => node.name))
  assert(
    report,
    fullMd.filter((h) => partTitles.has(h.text)).every((h) => h.level === 1) &&
      fullMd.filter((h) => !partTitles.has(h.text)).every((h) => h.level === 2),
    'md: parts are level 1 and chapters level 2'
  )
  assert(
    report,
    structuralDocxHeadings(full.docx, partTitles).every((p) => p.style === 'Heading1') &&
      fullDocx.filter((p) => !partTitles.has(p.text)).every((p) => p.style === 'Heading2'),
    'docx: parts are Heading1 and chapters Heading2'
  )

  // Every heading is accounted for: the structural ones, plus each included
  // document's own <h1>. A chapter rendered twice, or a heading invented from
  // somewhere else, shows up here and nowhere else.
  const bodyHeadings = full.docx.filter((p) => p.style?.startsWith('Heading') === true).length - fullDocx.length
  assert(
    report,
    bodyHeadings === truth.totals.draftDocuments,
    `docx: the remaining headings are exactly the documents' own <h1> (${bodyHeadings} of ${truth.totals.draftDocuments})`
  )
  // The same accounting for Markdown, where a heading is a line rather than a
  // style: the project title, the Contents caption, one per node, and one
  // <h1> per document. Nothing else may be a heading.
  const expectedMd = 2 + expected + truth.totals.draftDocuments
  assert(
    report,
    mdHeadings(full.md).length === expectedMd,
    `md: every heading in the file is accounted for — title, Contents, ${expected} sections, ${truth.totals.draftDocuments} document headings (${mdHeadings(full.md).length} of ${expectedMd})`
  )

  section(report, 'a partial scope compiles exactly its scope')

  // Parts One and Three and their chapters: 2 folders, 24 documents.
  const parts = draft.filter((node) => node.type === 'folder')
  const chosen = [parts[0], parts[2]].filter(Boolean)
  const scope: CompileScope = {
    mode: 'selection',
    nodeIds: chosen.flatMap((part) => nodesOf([part]).map((node) => node.id))
  }
  const scoped = filterTreeByScope(draft, scope)
  const scopedTitles = titlesOf(scoped)
  const scopedSet = new Set(scopedTitles)
  const partial = await renderThree(scoped, undefined, truth.projectName)

  assert(
    report,
    scopedTitles.length === 26,
    `the scope is 2 parts and 24 chapters, 26 nodes (got ${scopedTitles.length})`
  )
  assert(
    report,
    txtSectionRules(partial.txt) === 26,
    `txt: the partial compile has 26 sections (got ${txtSectionRules(partial.txt)})`
  )
  assert(
    report,
    structuralMdHeadings(partial.md, scopedSet).length === 26,
    `md: the partial compile has 26 headings (got ${structuralMdHeadings(partial.md, scopedSet).length})`
  )
  assert(
    report,
    structuralDocxHeadings(partial.docx, scopedSet).length === 26,
    `docx: the partial compile has 26 headings (got ${structuralDocxHeadings(partial.docx, scopedSet).length})`
  )
  assert(
    report,
    txtContentsEntries(partial.txt).length === 26 && mdContentsEntries(partial.md).length === 26,
    'the Contents shrinks with the scope rather than listing what was excluded'
  )

  // The excluded halves are gone from the body as well as from the Contents:
  // a heading can be dropped while its prose stays, and that reads as a
  // chapter merged into the one before it.
  const excludedTitle = parts[1]?.children?.[0]?.name ?? ''
  const excludedHtml = await documentStore.loadDocument(parts[1]?.children?.[0]?.id ?? '')
  const excludedSentence = lastParagraphOf(excludedHtml)
  const includedTitle = parts[2]?.children?.[0]?.name ?? ''
  assert(
    report,
    excludedTitle.length > 0 && ![partial.txt, partial.md].some((out) => out.includes(excludedTitle)),
    `an excluded chapter's title is absent ("${excludedTitle}")`
  )
  assert(
    report,
    excludedSentence.length > 0 && ![partial.txt, partial.md].some((out) => out.includes(excludedSentence)),
    'an excluded chapter’s prose is absent too, not just its heading'
  )
  assert(
    report,
    includedTitle.length > 0 && [partial.txt, partial.md].every((out) => out.includes(includedTitle)),
    `an included chapter from the same compile is present ("${includedTitle}")`
  )
  assert(
    report,
    partial.txt.length < full.txt.length,
    'a partial compile is shorter than the whole (the scope did something)'
  )

  note(report, `full compile: ${full.txt.length} txt bytes, ${full.docx.length} docx paragraphs`)
}

// ---- 2. word parity --------------------------------------------------------

async function wordParity(report: TestReport, tree: BinderNode[], truth: FixtureTruth): Promise<void> {
  section(report, 'word parity against the planted counts')

  const draft = draftChildren(tree)
  const planted = truth.totals.draftWords
  const full = await renderThree(draft, undefined, truth.projectName)

  assert(
    report,
    within(full.wordCount, planted, BODY_WORD_TOLERANCE),
    `the recorded body count is the planted Draft total, exactly (${full.wordCount} against ${planted})`
  )
  note(report, `recorded body words ${full.wordCount}, planted ${planted}, difference ${full.wordCount - planted}`)

  const txtWords = countWords(full.txt)
  const mdWords = countWords(full.md)
  const docxWords = full.docx.reduce((sum, p) => sum + countWords(p.text), 0)
  assert(
    report,
    within(txtWords, planted, ARTIFACT_WORD_TOLERANCE),
    `txt carries the manuscript within ${ARTIFACT_WORD_TOLERANCE * 100}% (${txtWords} against ${planted})`
  )
  assert(
    report,
    within(mdWords, planted, ARTIFACT_WORD_TOLERANCE),
    `md carries the manuscript within ${ARTIFACT_WORD_TOLERANCE * 100}% (${mdWords} against ${planted})`
  )
  assert(
    report,
    within(docxWords, planted, ARTIFACT_WORD_TOLERANCE),
    `docx carries the manuscript within ${ARTIFACT_WORD_TOLERANCE * 100}% (${docxWords} against ${planted})`
  )
  // Every artifact is longer than the manuscript, never shorter: the excess is
  // the scaffolding, and a shortfall inside the tolerance would be prose gone
  // missing rather than headings added.
  assert(
    report,
    txtWords >= planted && mdWords >= planted && docxWords >= planted,
    `each artifact is the manuscript plus its scaffolding, never less (txt +${txtWords - planted}, md +${mdWords - planted}, docx +${docxWords - planted})`
  )
  note(report, `scaffolding: txt +${txtWords - planted}, md +${mdWords - planted}, docx +${docxWords - planted} words`)

  // The same parity has to hold for a scope, computed from the truth file's
  // per-document counts rather than from the project total.
  const parts = draft.filter((node) => node.type === 'folder')
  const first = parts[0]
  const scope: CompileScope = { mode: 'selection', nodeIds: nodesOf([first]).map((node) => node.id) }
  const scoped = filterTreeByScope(draft, scope)
  const scopedIds = new Set(nodesOf(scoped).filter((node) => node.type === 'document').map((node) => node.id))
  const expected = truth.documents
    .filter((entry) => scopedIds.has(entry.id))
    .reduce((sum, entry) => sum + entry.words, 0)
  const partialTxt = await renderProjectCompile(scoped, truth.projectName, 'txt', OPTIONS)

  assert(
    report,
    scopedIds.size === 12 && expected > 0,
    `the scope is one part of 12 chapters, ${expected} planted words (got ${scopedIds.size} documents)`
  )
  assert(
    report,
    within(partialTxt.wordCount, expected, BODY_WORD_TOLERANCE),
    `a scoped compile records exactly its own documents' planted words (${partialTxt.wordCount} against ${expected})`
  )
  assert(
    report,
    partialTxt.wordCount < planted,
    'and that is less than the whole manuscript (the scope reached the count, not just the structure)'
  )
}

// ---- 3. the last paragraph of the last document ----------------------------

async function lastParagraph(report: TestReport, tree: BinderNode[], truth: FixtureTruth): Promise<void> {
  section(report, 'the last paragraph of the last document')

  const draft = draftChildren(tree)
  const documents = nodesOf(draft).filter((node) => node.type === 'document')
  const last = documents[documents.length - 1]
  const html = last ? await documentStore.loadDocument(last.id) : ''
  const tail = lastParagraphOf(html)
  const full = await renderThree(draft, undefined, truth.projectName)

  assert(
    report,
    tail.length > 40,
    `the last document has a last paragraph to look for (${tail.length} characters of "${last?.name ?? '—'}")`
  )
  assert(report, full.txt.includes(tail), 'txt ends with the manuscript’s last paragraph, not before it')
  assert(report, full.md.includes(tail), 'md carries it too')
  assert(
    report,
    full.docx.some((p) => p.text === tail),
    'docx carries it as its own paragraph'
  )
  assert(
    report,
    full.txt.trimEnd().endsWith(tail),
    'in txt it is the very last thing in the file — nothing is appended after the manuscript'
  )
  assert(
    report,
    full.docx.filter((p) => p.text.trim().length > 0).pop()?.text === tail,
    'in docx it is the last paragraph with any text in it'
  )
  // A control: an assertion that a string is present has to be able to fail.
  assert(
    report,
    !full.txt.includes('A sentence no generated manuscript contains.'),
    'a sentence that was never planted is absent (the search can fail)'
  )
  note(report, `last document "${last?.name ?? '—'}", ${truth.documents.find((d) => d.id === last?.id)?.words ?? 0} words`)
}

// ---- 4. an empty document still gives a section ----------------------------

async function emptyDocument(report: TestReport, parent: string): Promise<void> {
  section(report, 'an empty document gives an empty section')

  const root = join(parent, 'empty-section')
  setProjectRoot(root)
  binderStore.invalidateCache()

  await binderStore.setProjectName('Empty Section')
  const act = await binderStore.createFolder(null, 'Act One')
  const first = await binderStore.createDocument(act.id, 'Chapter 1')
  const blank = await binderStore.createDocument(act.id, 'Chapter 2')
  const third = await binderStore.createDocument(act.id, 'Chapter 3')
  // Prose only, no heading of their own: the section headings in the output
  // are then the binder's alone, and an assertion counting them cannot be
  // satisfied by a document's own <h1> standing in for a missing one.
  const firstHtml = '<p>The lamp guttered and went out.</p>'
  const thirdHtml = '<p>Morning came grey.</p>'
  await documentStore.saveDocument(first.id, firstHtml)
  // Chapter 2 is left with no content file at all — the state a document is in
  // between being created in the binder and being typed into for the first
  // time, which is exactly when a writer compiles to see the shape of it.
  await documentStore.saveDocument(third.id, thirdHtml)

  const state = await binderStore.getState()
  const draft = draftChildren(state.tree)
  const titles = titlesOf(draft)
  const rendered = await renderThree(draft, undefined, 'Empty Section')

  assert(
    report,
    titles.join('|') === 'Act One|Chapter 1|Chapter 2|Chapter 3',
    `the project is a folder and three documents (got ${titles.join('|')})`
  )
  assert(
    report,
    (await documentStore.loadDocument(blank.id)) === '',
    'the empty document has no content file at all, not an empty one'
  )
  assert(
    report,
    txtSectionRules(rendered.txt) === 4,
    `txt: the empty document keeps its section (${txtSectionRules(rendered.txt)} of 4)`
  )
  assert(
    report,
    structuralMdHeadings(rendered.md, new Set(titles)).length === 4,
    'md: the empty document keeps its heading'
  )
  assert(
    report,
    structuralDocxHeadings(rendered.docx, new Set(titles)).length === 4,
    'docx: the empty document keeps its heading paragraph'
  )
  assert(
    report,
    txtContentsEntries(rendered.txt).includes('Chapter 2') && mdContentsEntries(rendered.md).includes('Chapter 2'),
    'the Contents still lists it — a writer can see the chapter exists and is empty'
  )

  // Empty, not merely present: nothing of Chapter 1's or Chapter 3's body may
  // land under Chapter 2's heading.
  const mdLines = rendered.md.split('\n').filter((line) => line.trim().length > 0)
  const secondIndex = mdLines.indexOf('## Chapter 2')
  assert(
    report,
    secondIndex !== -1 && mdLines[secondIndex + 1] === '## Chapter 3',
    `md: the heading after the empty section is the next section, with nothing between (got "${mdLines[secondIndex + 1] ?? '—'}")`
  )
  const docxTexts = rendered.docx.map((p) => p.text)
  const docxIndex = docxTexts.indexOf('Chapter 2')
  assert(
    report,
    docxIndex !== -1 &&
      docxTexts.slice(docxIndex + 1).find((text) => text.trim().length > 0) === 'Chapter 3',
    'docx: the next paragraph with text in it is the next section'
  )
  const txtLines = rendered.txt.split('\n').filter((line) => line.trim().length > 0)
  const txtIndex = txtLines.indexOf('Chapter 2')
  assert(
    report,
    txtIndex !== -1 && /^-+$/.test(txtLines[txtIndex + 1] ?? '') && txtLines[txtIndex + 2] === 'Chapter 3',
    'txt: title, rule, then the next title — no body between'
  )
  assert(
    report,
    rendered.wordCount === countWords(firstHtml) + countWords(thirdHtml),
    `the empty document contributes no words (${rendered.wordCount} against ${countWords(firstHtml) + countWords(thirdHtml)})`
  )
  // Control: the two documents that do have content are in the output.
  assert(
    report,
    rendered.txt.includes('The lamp guttered and went out.') && rendered.txt.includes('Morning came grey.'),
    'the documents that do have content still compile (the emptiness is the document’s, not the compile’s)'
  )
}

// ---- 5. matter order -------------------------------------------------------

async function matterOrder(report: TestReport, tree: BinderNode[], truth: FixtureTruth): Promise<void> {
  section(report, 'front matter, manuscript, back matter')

  const draft = draftChildren(tree)
  const matter = matterFolder(tree)
  const items = matter?.children ?? []
  const back = items.slice(-1)
  const front = items.slice(0, -1)
  const rendered = await renderThree(draft, { front, back }, truth.projectName)
  const bare = await renderThree(draft, undefined, truth.projectName)

  const frontHtml = front[0] ? await documentStore.loadDocument(front[0].id) : ''
  const backHtml = back[0] ? await documentStore.loadDocument(back[0].id) : ''
  const frontTail = lastParagraphOf(frontHtml)
  const backTail = lastParagraphOf(backHtml)
  const firstChapter = nodesOf(draft).find((node) => node.type === 'document')
  const chapterTail = firstChapter ? lastParagraphOf(await documentStore.loadDocument(firstChapter.id)) : ''
  const lastDocuments = nodesOf(draft).filter((node) => node.type === 'document')
  const lastChapter = lastDocuments[lastDocuments.length - 1]
  const lastTail = lastChapter ? lastParagraphOf(await documentStore.loadDocument(lastChapter.id)) : ''

  assert(
    report,
    items.length === 3 && front.length === 2 && back.length === 1,
    `Matter holds three documents, two front and one back (got ${items.length})`
  )
  assert(
    report,
    frontTail.length > 0 && backTail.length > 0 && chapterTail.length > 0 && lastTail.length > 0,
    'every document used for the ordering has text to find'
  )

  const bodies: Array<[string, string]> = [
    ['txt', rendered.txt],
    ['md', rendered.md],
    ['docx', rendered.docx.map((p) => p.text).join('\n')]
  ]
  const at = (body: string): Record<string, number> => ({
    front: body.indexOf(frontTail),
    contents: body.indexOf('Contents'),
    first: body.indexOf(chapterTail),
    last: body.indexOf(lastTail),
    back: body.indexOf(backTail)
  })

  for (const [name, body] of bodies) {
    const where = at(body)
    assert(
      report,
      Object.values(where).every((index) => index !== -1),
      `${name}: front matter, Contents, first chapter, last chapter and back matter are all present`
    )
    assert(
      report,
      where.front < where.first,
      `${name}: front matter comes before the manuscript`
    )
    assert(report, where.last < where.back, `${name}: back matter comes after the last chapter`)
    assert(report, where.contents < where.first, `${name}: the Contents comes before the manuscript`)
  }

  // Where the three formats disagree, pinned rather than assumed. The docx and
  // PDF paths deliberately put front matter ahead of the Contents — the
  // comment in projectToPdfHtml says a title page after a Contents page reads
  // backwards — and the txt and Markdown paths build the Contents first and
  // emit every section, matter included, after it. Both are recorded here so a
  // change to either shows up as a failure; which one is right is a decision
  // for the project, and is in FINDINGS/2026-09-14-compile-structure.md.
  assert(
    report,
    at(rendered.docx.map((p) => p.text).join('\n')).front < at(rendered.docx.map((p) => p.text).join('\n')).contents,
    'docx: front matter precedes the Contents'
  )
  assert(
    report,
    at(rendered.txt).contents < at(rendered.txt).front && at(rendered.md).contents < at(rendered.md).front,
    'txt and md: the Contents precedes the front matter — the two formats disagree with docx about this'
  )
  note(report, 'front matter sits before the Contents in docx and after it in txt and md; recorded, not judged')

  // Matter is content, not structure: its binder names are navigation. The
  // only headings it may add are its own documents' <h1>, which are the
  // matter page's own text — so the comparison is against the same compile
  // without matter, not against the names, which a title page's own heading
  // legitimately repeats.
  const matterHtml = await Promise.all(items.map((node) => documentStore.loadDocument(node.id)))
  const matterOwnHeadings = matterHtml.reduce((sum, html) => sum + (html.match(/<h1[\s>]/g)?.length ?? 0), 0)
  const docxHeadings = (paragraphs: DocxParagraph[]): number =>
    paragraphs.filter((p) => p.style?.startsWith('Heading') === true).length
  assert(
    report,
    mdHeadings(rendered.md).length === mdHeadings(bare.md).length + matterOwnHeadings,
    `md: matter adds only its own documents' headings, never a section heading for its binder name (${mdHeadings(rendered.md).length} against ${mdHeadings(bare.md).length} + ${matterOwnHeadings})`
  )
  assert(
    report,
    docxHeadings(rendered.docx) === docxHeadings(bare.docx) + matterOwnHeadings,
    `docx: the same (${docxHeadings(rendered.docx)} against ${docxHeadings(bare.docx)} + ${matterOwnHeadings})`
  )
  const matterNames = new Set(items.map((node) => node.name))
  assert(
    report,
    txtContentsEntries(rendered.txt).every((entry) => !matterNames.has(entry)) &&
      mdContentsEntries(rendered.md).every((entry) => !matterNames.has(entry)) &&
      txtContentsEntries(rendered.txt).length === txtContentsEntries(bare.txt).length,
    'and none is listed in the Contents, which is the manuscript’s alone'
  )
  assert(
    report,
    rendered.wordCount === bare.wordCount && rendered.wordCount === truth.totals.draftWords,
    `matter words are outside the recorded count (${rendered.wordCount} with matter, ${bare.wordCount} without)`
  )
  assert(
    report,
    rendered.txt.length > bare.txt.length,
    'though the matter is genuinely in the file (it is longer than the same compile without it)'
  )

  const matterWords = truth.documents
    .filter((entry) => entry.folderPath[0] === 'Matter')
    .reduce((sum, entry) => sum + entry.words, 0)
  note(report, `matter: ${items.length} documents, ${matterWords} words, none of them counted`)
}

// ---- driver ----------------------------------------------------------------

async function run(report: TestReport): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'chapterflow-compile-structure-'))
  try {
    const root = join(parent, 'realistic')
    const { truth } = await writeFixture({
      shape: 'realistic',
      target: root,
      truthPath: join(parent, 'realistic.truth.json')
    })
    setProjectRoot(root)
    binderStore.invalidateCache()
    const tree = (await binderStore.getState()).tree

    // Each section is wrapped on its own: a compile that throws inside one
    // format must not carry off the four sections after it.
    const parts: Array<[string, () => Promise<void>]> = [
      ['section counts', () => sectionCounts(report, tree, truth)],
      ['word parity', () => wordParity(report, tree, truth)],
      ['the last paragraph', () => lastParagraph(report, tree, truth)],
      ['matter order', () => matterOrder(report, tree, truth)],
      ['the empty document', () => emptyDocument(report, parent)]
    ]
    for (const [name, body] of parts) {
      try {
        await body()
      } catch (error) {
        section(report, name)
        assert(report, false, `${name} threw: ${String((error as Error)?.message ?? error)}`)
      }
    }
    note(report, `temp root: ${parent}`)
  } finally {
    await rm(parent, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  try {
    await run(report)
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }
  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

void main()
