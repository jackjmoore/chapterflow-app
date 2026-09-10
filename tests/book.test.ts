/**
 * The book preset's pure layer: chapter classification (planBook), the
 * chapter-number line, roman folios, and the pin that keeps the chapter-drop
 * measurement a single constant across every renderer that uses it.
 * Node-only — nothing here needs Electron.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BOOK_TRIMS,
  chapterNumberLine,
  planBook,
  toRomanLower,
  type BookChapterEntry,
  type BookPartPlan
} from '../src/shared/book'
import type { BinderNode, DocumentNode, FolderNode } from '../src/shared/binder'
import { assert, createReport, section, summarize } from './harness'

let nextId = 0
function doc(name: string, chapterNumber: number | null = null): DocumentNode {
  return {
    id: `doc-${(nextId += 1)}`,
    type: 'document',
    name,
    collapsed: false,
    synopsis: '',
    notes: '',
    statusId: null,
    tagIds: [],
    wordTarget: null,
    chapterNumber,
    children: []
  }
}
function folder(name: string, children: BinderNode[], isPart = false): FolderNode {
  return { id: `folder-${(nextId += 1)}`, type: 'folder', name, collapsed: false, ...(isPart ? { isPart } : {}), children }
}

function main(): void {
  const report = createReport()

  section(report, 'chapter classification')
  {
    const ch1 = doc('Chapter One', 1)
    const ch2 = doc('Chapter Two', 2)
    const plan = planBook([ch1, ch2], [], [])
    assert(report, plan.body.length === 2 && plan.body.every((e) => e.kind === 'chapter'), 'level-1 documents are chapters')
    assert(report, (plan.body[0] as BookChapterEntry).opensRecto, 'the first chapter of the book opens recto')
    assert(report, !(plan.body[1] as BookChapterEntry).opensRecto, 'later chapters start on either hand')
    assert(report, (plan.body[0] as BookChapterEntry).chapterNumber === 1, 'chapterNumber metadata rides along')
  }
  {
    const sceneA = doc('Scene A')
    const sceneB = doc('Scene B')
    const plan = planBook([folder('The Crossing', [sceneA, sceneB])], [], [])
    assert(
      report,
      plan.body.length === 2 && plan.body.every((e) => e.kind === 'chapter'),
      'an undesignated folder never merges — each document inside is its own chapter'
    )
    assert(
      report,
      (plan.body[0] as BookChapterEntry).title === 'Scene A' && (plan.body[1] as BookChapterEntry).title === 'Scene B',
      'chapters keep their own names; the folder name appears nowhere'
    )
    assert(report, plan.warnings.length === 0, 'a grouping folder raises no warning')
  }
  {
    const part = folder('Part One', [doc('Chapter One', 1), folder('The Storm', [doc('Scene A'), doc('Scene B')])], true)
    const plan = planBook([part, doc('Epilogue')], [], [])
    const p = plan.body[0] as BookPartPlan
    assert(report, p.kind === 'part' && p.chapters.length === 3, 'a designated Part folder yields a part with its chapters')
    assert(report, p.chapters[0].opensRecto, 'chapter 1 opens recto even inside a part')
    assert(
      report,
      p.chapters[1].title === 'Scene A' && p.chapters[1].documentId.length > 0,
      'a folder below a Part contributes its documents as individual chapters'
    )
    assert(report, (plan.body[1] as BookChapterEntry).kind === 'chapter', 'a document after the part is an ordinary chapter')
  }
  {
    const nested = folder('Inner Part', [doc('X')], true)
    const plan = planBook([folder('Part One', [nested], true)], [], [])
    const p = plan.body[0] as BookPartPlan
    assert(report, plan.warnings.length === 1 && plan.warnings[0].includes('Inner Part'), 'isPart below level 1 warns')
    assert(report, p.chapters.length === 1 && p.chapters[0].title === 'X', 'its contents still compile as ordinary chapters')
  }
  {
    const deep = folder('Chapter Folder', [folder('Deeper', [doc('Buried scene')])])
    const plan = planBook([deep], [], [])
    const chapter = plan.body[0] as BookChapterEntry
    assert(report, plan.warnings.length === 0, 'nested grouping folders raise no warning')
    assert(report, chapter.title === 'Buried scene', 'a document at any depth is its own chapter')
  }
  {
    const parent = doc('Chapter One', 1)
    parent.children = [doc('Nested scene')]
    const plan = planBook([parent, doc('Chapter Two', 2)], [], [])
    assert(
      report,
      plan.body.length === 3 && (plan.body[1] as BookChapterEntry).title === 'Nested scene',
      "a document's children compile as chapters after it, in binder order"
    )
  }

  section(report, 'plan is separation-agnostic')
  {
    // The documentSeparation compile setting is a render concern: the plan
    // carries one document per chapter and nothing else — there is no code
    // path by which any document could be planned differently from another.
    const grouped = folder('The Storm', [doc('Scene A'), doc('Scene B')])
    const plan = planBook([doc('Before'), grouped, doc('After')], [], [])
    assert(report, plan.body.length === 4, 'every document is its own chapter, foldered or not')
    assert(
      report,
      plan.body.every((e) => e.kind === 'chapter' && (e as BookChapterEntry).documentId.length > 0),
      'each chapter holds exactly one document'
    )
  }

  section(report, 'matter split')
  {
    const front = folder('Front Matter', [doc('Half Title'), doc('Title Page'), doc('Copyright'), doc('Dedication'), doc('Preface')])
    const back = folder('Back Matter', [doc('About the Author')])
    const plan = planBook([doc('Chapter One')], [front], [back])
    assert(report, plan.frontDisplayIds.length === 4, 'front-matter documents 1–4 are the blind display pages')
    assert(report, plan.frontTextIds.length === 1, 'the fifth (a preface) is a roman-folioed text page')
    assert(report, plan.backIds.length === 1, 'back matter documents are collected in order')
    assert(report, plan.body.length === 1, 'matter contents are never chapters')
  }

  section(report, 'chapter number line')
  assert(report, chapterNumberLine(3) === 'CHAPTER THREE', 'words up to twenty')
  assert(report, chapterNumberLine(20) === 'CHAPTER TWENTY', 'twenty is the last word')
  assert(report, chapterNumberLine(21) === 'CHAPTER 21', 'numerals beyond twenty')
  assert(report, chapterNumberLine(null) === null, 'unset metadata yields no line')

  section(report, 'roman folios')
  assert(report, toRomanLower(1) === 'i' && toRomanLower(4) === 'iv' && toRomanLower(9) === 'ix', 'small numerals')
  assert(report, toRomanLower(14) === 'xiv' && toRomanLower(40) === 'xl', 'compound numerals')

  section(report, 'one chapter-drop constant')
  // The measurement forked once (2in PDF vs 2.5in docx). Pin every consumer
  // to the shared constant so a literal can't quietly reappear.
  // process.cwd(), not __dirname: the bundled test runs out of the esbuild
  // cache directory, but npm always invokes it from the repo root.
  const srcDir = join(process.cwd(), 'src', 'main', 'export')
  const toPdfSrc = readFileSync(join(srcDir, 'toPdf.ts'), 'utf-8')
  const toDocxSrc = readFileSync(join(srcDir, 'toDocx.ts'), 'utf-8')
  const bookPdfSrc = readFileSync(join(srcDir, 'bookPdf.ts'), 'utf-8')
  assert(report, (toPdfSrc.match(/CHAPTER_DROP_INCHES/g) ?? []).length >= 2, 'manuscript PDF drop rules use the constant')
  assert(report, toDocxSrc.includes('convertInchesToTwip(CHAPTER_DROP_INCHES)'), 'docx spacer uses the constant')
  assert(report, (bookPdfSrc.match(/CHAPTER_DROP_INCHES/g) ?? []).length >= 2, 'book CSS uses the constant')
  assert(report, !/margin-top:\s*2(\.\d+)?in/.test(toPdfSrc), 'no literal drop measurement survives in toPdf.ts')
  assert(report, !/convertInchesToTwip\(2(\.\d+)?\)/.test(toDocxSrc), 'no literal drop measurement survives in toDocx.ts')

  section(report, 'trim table sanity')
  for (const [id, spec] of Object.entries(BOOK_TRIMS)) {
    assert(report, spec.innerIn > spec.outerIn, `${id}: the gutter is wider than the outer margin`)
  }

  console.log(summarize(report))
  if (report.failures > 0) process.exitCode = 1
}

main()
